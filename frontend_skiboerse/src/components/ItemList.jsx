import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';

function ItemList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await apiFetch('/api/items/');
      if (!response.ok) throw new Error('Artikel konnten nicht geladen werden');
      const data = await response.json();
      // Sort by barcode (e.g., S001-001, S001-002, S002-001)
      const sortedData = data.sort((a, b) => {
        const [aSellerNum, aItemNum] = a.barcode.replace('S', '').split('-').map(Number);
        const [bSellerNum, bItemNum] = b.barcode.replace('S', '').split('-').map(Number);
        if (aSellerNum !== bSellerNum) {
          return aSellerNum - bSellerNum;
        }
        return aItemNum - bItemNum;
      });
      setItems(sortedData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Artikel wirklich löschen?')) return;

    try {
      const response = await apiFetch(`/api/items/${id}/`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Artikel konnte nicht gelöscht werden');
      fetchItems();
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    }
  };

  const printLabel = async (itemId) => {
    setPrintingId(itemId);
    try {
      const response = await apiFetch(`/api/items/${itemId}/print_label/`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!data.success) {
        alert('Druckfehler: ' + data.error);
        return;
      }

      // Open print window with label image (2 copies side by side)
      const printWindow = window.open('', '_blank', 'width=600,height=400');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Label ${data.barcode}</title>
            <style>
              @page { margin: 0; size: auto; }
              body {
                margin: 0;
                padding: 10px;
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                justify-content: center;
              }
              img {
                max-width: 100%;
                height: auto;
              }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <img src="data:image/png;base64,${data.image}" alt="Label 1" />
            <img src="data:image/png;base64,${data.image}" alt="Label 2" />
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 300);
              };
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

  return (
    <div className="item-list-container">
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Artikelliste</h2>
        </div>
        <div>
          <Link to="/inventory" className="btn btn-secondary" style={{marginRight: '0.5rem'}}>
            ← Zurück
          </Link>
          <Link to="/inventory/items/new" className="btn btn-primary">
            + Neuer Artikel
          </Link>
        </div>
      </div>

      {error && <div className="error">Fehler: {error}</div>}

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⛷️</div>
          <p className="empty-state-text">Noch keine Artikel vorhanden. Ersten Artikel anlegen!</p>
          <Link to="/inventory/items/new" className="btn btn-primary">
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
                <th>Verkäufer</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.is_sold || item.picked_up_at ? 'sold-row' : ''}>
                  <td className="barcode-cell">{item.barcode}</td>
                  <td>{item.category}</td>
                  <td>{item.brand || '-'}</td>
                  <td>{item.color || '-'}</td>
                  <td>{item.size || '-'}</td>
                  <td className="price-cell">{item.price} €</td>
                  <td>{item.seller_name}</td>
                  <td>
                    {item.is_sold ? (
                      <span className="status-badge status-sold">
                        Verkauft
                        {item.sold_at && (
                          <span className="returned-timestamp">
                            {new Date(item.sold_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {item.payment_method && (
                          <span className="payment-icon" title={item.payment_method === 'cash' ? 'Bar' : 'Karte'}>
                            {item.payment_method === 'cash' ? '💵' : '💳'}
                          </span>
                        )}
                      </span>
                    ) : item.picked_up_at ? (
                      <span className="status-badge status-picked-up">
                        Abgeholt
                        <span className="returned-timestamp">
                          {new Date(item.picked_up_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    ) : item.is_stolen ? (
                      <span className="status-badge status-stolen">🚨 Gestohlen</span>
                    ) : item.returned_at ? (
                      <>
                        <span className="status-badge status-available">Verfügbar</span>
                        <span className="status-returned">
                          Rückgemeldet
                          <span className="returned-timestamp">
                            {new Date(item.returned_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="status-badge status-available">Verfügbar</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      onClick={() => printLabel(item.id)}
                      className="btn btn-primary btn-small"
                      disabled={printingId === item.id}
                    >
                      {printingId === item.id ? 'Druckt...' : 'Label drucken'}
                    </button>
                    <Link
                      to={`/inventory/items/${item.id}/edit`}
                      className="btn btn-secondary btn-small"
                    >
                      Bearbeiten
                    </Link>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="btn btn-danger btn-small"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ItemList;
