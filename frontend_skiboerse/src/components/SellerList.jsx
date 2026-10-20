import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, downloadFile } from '../api';
import { useAuth } from '../AuthContext';

function SellerList() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchSellers();
  }, []);

  const fetchSellers = async () => {
    try {
      const response = await apiFetch('/api/sellers/');
      if (!response.ok) throw new Error('Verkäufer konnten nicht geladen werden');
      const data = await response.json();
      setSellers(data.sort((a, b) => a.seller_number - b.seller_number));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteSeller = async (id, event) => {
    event.stopPropagation(); // Prevent card click when deleting
    if (!window.confirm('Verkäufer wirklich löschen?')) return;

    try {
      const response = await apiFetch(`/api/sellers/${id}/`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Verkäufer konnte nicht gelöscht werden');
      fetchSellers();
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    }
  };

  const exportSellers = async () => {
    setExporting(true);
    try {
      await downloadFile('/api/sellers/export/', 'Verkaeufer.xlsx');
    } catch (err) {
      alert('Fehler beim Export: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleCardClick = (sellerId) => {
    navigate(`/inventory/sellers/${sellerId}`);
  };

  const handleEditClick = (sellerId, event) => {
    event.stopPropagation(); // Prevent card click when clicking edit
    navigate(`/inventory/sellers/${sellerId}/edit`);
  };

  if (loading) {
    return <div className="loading">Verkäufer laden…</div>;
  }

  return (
    <div className="seller-list-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Verkäufer</h2>
          <Link to="/inventory" className="btn btn-secondary">
            ← Zurück
          </Link>
        </div>
        <div>
          {isAdmin && (
            <button
              onClick={exportSellers}
              className="btn btn-secondary"
              style={{marginRight: '0.5rem'}}
              disabled={exporting}
            >
              {exporting ? 'Exportiert…' : 'Excel-Export'}
            </button>
          )}
          <Link to="/inventory/sellers/new" className="btn btn-primary">
            + Neuer Verkäufer
          </Link>
        </div>
      </div>

      {error && <div className="error">Fehler: {error}</div>}

      {sellers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎿</div>
          <p className="empty-state-text">Noch keine Verkäufer. Ersten Verkäufer anlegen!</p>
          <Link to="/inventory/sellers/new" className="btn btn-primary">
            Ersten Verkäufer anlegen
          </Link>
        </div>
      ) : (
        <table className="seller-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Name</th>
              <th>Telefon</th>
              <th>Artikel</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((seller) => (
              <tr
                key={seller.id}
                className="seller-table-row"
                onClick={() => handleCardClick(seller.id)}
              >
                <td className="seller-table-nr">#{seller.seller_number}</td>
                <td className="seller-table-name">{seller.full_name}</td>
                <td>{seller.mobile_number}</td>
                <td>{seller.item_count}</td>
                <td>
                  {seller.is_member && <span className="badge badge-member">Aktive</span>}
                  {!seller.is_member && seller.acceptance_fee_paid && <span className="badge badge-paid">Gebühr bezahlt</span>}
                  {!seller.is_member && !seller.acceptance_fee_paid && (
                    <span className="badge badge-fee-open">⚠️ {seller.acceptance_fee?.toFixed(2) || '0.00'} €</span>
                  )}
                </td>
                <td className="seller-table-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleEditClick(seller.id, e)}
                    className="btn btn-secondary btn-small"
                  >
                    Bearbeiten
                  </button>
                  {isAdmin && (
                    <button
                      onClick={(e) => deleteSeller(seller.id, e)}
                      className="btn btn-danger btn-small"
                    >
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SellerList;
