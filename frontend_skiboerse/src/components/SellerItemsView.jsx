import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { printItemLabel } from '../printLabel';
import useMajorAcceptance from '../hooks/useMajorAcceptance';

function SellerItemsView() {
  const { id } = useParams();
  const [seller, setSeller] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feeUpdating, setFeeUpdating] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const { open: acceptanceOpen } = useMajorAcceptance();

  useEffect(() => {
    fetchSellerAndItems();
  }, [id]);

  const fetchSellerAndItems = async () => {
    try {
      // Fetch seller details
      const sellerResponse = await apiFetch(`/api/sellers/${id}/`);
      if (!sellerResponse.ok) throw new Error('Verkäufer konnte nicht geladen werden');
      const sellerData = await sellerResponse.json();
      setSeller(sellerData);

      // Fetch items for this seller only
      const itemsResponse = await apiFetch(`/api/items/?seller=${id}`);
      if (!itemsResponse.ok) throw new Error('Artikel konnten nicht geladen werden');
      const sellerItems = await itemsResponse.json();
      setItems(sellerItems);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const acceptItems = async (itemIds) => {
    setAcceptingAll(true);
    try {
      const response = await apiFetch('/api/items/accept/', {
        method: 'POST',
        body: JSON.stringify({ items: itemIds })
      });
      if (!response.ok) throw new Error('Artikel konnten nicht angenommen werden');
      await fetchSellerAndItems();
    } catch (err) {
      alert('Fehler: ' + err.message);
    } finally {
      setAcceptingAll(false);
    }
  };

  const toggleFeePaid = async () => {
    setFeeUpdating(true);
    try {
      const newValue = !seller.acceptance_fee_paid;
      const response = await apiFetch(`/api/sellers/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ acceptance_fee_paid: newValue })
      });
      if (response.ok) {
        setSeller(prev => ({ ...prev, acceptance_fee_paid: newValue }));
      }
    } catch (err) {
      console.error('Error updating fee status:', err);
    } finally {
      setFeeUpdating(false);
    }
  };

  const printLabel = async (itemId) => {
    setPrintingId(itemId);
    try {
      await printItemLabel(itemId);
    } catch (err) {
      alert('Druckfehler: ' + err.message);
    } finally {
      setPrintingId(null);
    }
  };

  if (loading) {
    return <div className="loading">Artikel laden…</div>;
  }

  if (error) {
    return <div className="error">Fehler: {error}</div>;
  }

  const pendingItemIds = items.filter((item) => !item.accepted_at).map((item) => item.id);

  return (
    <div className="seller-items-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Artikel — {seller?.full_name}</h2>
          <div className="seller-info-header">
            <p><strong>Verkäufer-Nr.:</strong> {seller?.seller_number}</p>
            <p><strong>Telefon:</strong> {seller?.mobile_number}</p>
            {seller?.is_member && <span className="badge badge-member">Mitglied</span>}
          </div>
          {seller && !seller.is_member && (
            <div className="fee-checkbox-row" style={{marginTop: '0.5rem'}}>
              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                <input
                  type="checkbox"
                  checked={seller.acceptance_fee_paid || false}
                  onChange={toggleFeePaid}
                  disabled={feeUpdating}
                  className="form-checkbox"
                />
                <span>Annahmegebühr bezahlt ({seller.acceptance_fee?.toFixed(2) || '0.00'} €)</span>
              </label>
            </div>
          )}
          <div style={{marginTop: '1rem'}}>
            <Link to="/inventory/sellers" className="btn btn-secondary">
              ← Zurück
            </Link>
            <Link to={`/inventory/sellers/${id}/edit`} className="btn btn-secondary" style={{marginLeft: '0.5rem'}}>
              Verkäufer bearbeiten
            </Link>
            {pendingItemIds.length > 0 && acceptanceOpen && (
              <button
                onClick={() => acceptItems(pendingItemIds)}
                className="btn btn-success"
                style={{marginLeft: '0.5rem'}}
                disabled={acceptingAll}
              >
                {acceptingAll
                  ? 'Nimmt an…'
                  : `Alle ${pendingItemIds.length} Artikel annehmen`}
              </button>
            )}
          </div>
        </div>
        <Link to={`/inventory/items/new?seller=${id}`} className="btn btn-primary">
          + Artikel hinzufügen
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <p className="empty-state-text">Noch keine Artikel für diesen Verkäufer.</p>
          <Link to={`/inventory/items/new?seller=${id}`} className="btn btn-primary">
            Ersten Artikel anlegen
          </Link>
        </div>
      ) : (
        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Artikel-Nr.</th>
                <th>Kategorie</th>
                <th>Marke</th>
                <th>Farbe</th>
                <th>Größe</th>
                <th>Preis</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                // A sold or picked-up article is done: it must not be edited
                // and a fresh label for it would be meaningless.
                const isLocked = Boolean(item.is_sold || item.picked_up_at);
                const isPending = !item.accepted_at;
                return (
                <tr key={item.id} className={isLocked ? 'sold-row' : ''}>
                  <td className="barcode-cell">{item.barcode}</td>
                  <td>{item.category}</td>
                  <td>{item.brand || '-'}</td>
                  <td>{item.color || '-'}</td>
                  <td>{item.size || '-'}</td>
                  <td className="price-cell">{item.price} €</td>
                  <td>
                    {item.is_sold ? (
                      <span className="status-badge status-sold">Verkauft</span>
                    ) : item.picked_up_at ? (
                      <span className="status-badge status-picked-up">
                        Abgeholt
                        <span className="returned-timestamp">
                          {new Date(item.picked_up_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    ) : isPending ? (
                      <span className="status-badge status-pending">Nicht angenommen</span>
                    ) : (
                      <span className="status-badge status-available">Verfügbar</span>
                    )}
                    {item.returned_at && (
                      <span className="status-returned">
                        Rückgemeldet
                        <span className="returned-timestamp">
                          {new Date(item.returned_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="actions-cell">
                    {isPending && acceptanceOpen && (
                      <button
                        onClick={() => acceptItems([item.id])}
                        className="btn btn-success btn-small"
                        disabled={acceptingAll}
                      >
                        Angenommen
                      </button>
                    )}
                    <button
                      onClick={() => printLabel(item.id)}
                      className="btn btn-primary btn-small"
                      disabled={isLocked || printingId === item.id}
                    >
                      {printingId === item.id ? 'Druckt…' : 'Label drucken'}
                    </button>
                    {isLocked ? (
                      <button className="btn btn-secondary btn-small" disabled>
                        Bearbeiten
                      </button>
                    ) : (
                      <Link
                        to={`/inventory/items/${item.id}/edit`}
                        className="btn btn-secondary btn-small"
                      >
                        Bearbeiten
                      </Link>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="items-summary">
            <p><strong>Artikel gesamt:</strong> {items.length}</p>
            <p><strong>Verfügbar:</strong> {items.filter(i => !i.is_sold).length}</p>
            <p><strong>Verkauft:</strong> {items.filter(i => i.is_sold).length}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SellerItemsView;
