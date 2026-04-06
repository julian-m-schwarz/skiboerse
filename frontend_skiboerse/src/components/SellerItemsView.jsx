import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api';

function SellerItemsView() {
  const { id } = useParams();
  const [seller, setSeller] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feeUpdating, setFeeUpdating] = useState(false);
  const [printingId, setPrintingId] = useState(null);

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
      const response = await apiFetch(`/api/items/${itemId}/print_label/`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert('Druckfehler: ' + data.error);
        return;
      }
      const printWindow = window.open('', '_blank', 'width=600,height=400');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Label ${data.barcode}</title>
            <style>
              @page { margin: 0; size: auto; }
              body { margin: 0; padding: 10px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
              img { max-width: 100%; height: auto; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <img src="data:image/png;base64,${data.image}" alt="Label 1" />
            <img src="data:image/png;base64,${data.image}" alt="Label 2" />
            <script>
              window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 300); };
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        alert('Popup-Blocker aktiv. Bitte Popups für diese Seite erlauben.');
      }
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
              {items.map((item) => (
                <tr key={item.id} className={item.is_sold ? 'sold-row' : ''}>
                  <td className="barcode-cell">{item.barcode}</td>
                  <td>{item.category}</td>
                  <td>{item.brand || '-'}</td>
                  <td>{item.color || '-'}</td>
                  <td>{item.size || '-'}</td>
                  <td className="price-cell">{item.price} €</td>
                  <td>
                    <span className={`status-badge ${item.is_sold ? 'status-sold' : 'status-available'}`}>
                      {item.is_sold ? 'Verkauft' : 'Verfügbar'}
                    </span>
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
                    <button
                      onClick={() => printLabel(item.id)}
                      className="btn btn-primary btn-small"
                      disabled={printingId === item.id}
                    >
                      {printingId === item.id ? 'Druckt…' : 'Label drucken'}
                    </button>
                    <Link
                      to={`/inventory/items/${item.id}/edit`}
                      className="btn btn-secondary btn-small"
                    >
                      Bearbeiten
                    </Link>
                  </td>
                </tr>
              ))}
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
