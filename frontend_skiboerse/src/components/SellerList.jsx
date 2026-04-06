import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';

function SellerList() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSellers();
  }, []);

  const fetchSellers = async () => {
    try {
      const response = await apiFetch('/api/sellers/');
      if (!response.ok) throw new Error('Verkäufer konnten nicht geladen werden');
      const data = await response.json();
      setSellers(data);
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
        <Link to="/inventory/sellers/new" className="btn btn-primary">
          + Neuer Verkäufer
        </Link>
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
        <div className="seller-grid">
          {sellers.map((seller) => (
            <div
              key={seller.id}
              className="seller-card-compact"
              onClick={() => handleCardClick(seller.id)}
            >
              <div className="seller-card-header">
                <h3 className="seller-name">{seller.full_name}</h3>
                <span className="seller-number">#{seller.seller_number}</span>
              </div>

              <div className="seller-card-info">
                <div className="info-item">
                  <span className="info-icon">📱</span>
                  <span>{seller.mobile_number}</span>
                </div>
                <div className="info-item">
                  <span className="info-icon">📦</span>
                  <span>{seller.item_count} {seller.item_count === 1 ? 'Artikel' : 'Artikel'}</span>
                </div>
                {!seller.is_member && seller.acceptance_fee && (
                  <div className="info-item">
                    <span className="info-icon">💶</span>
                    <span>Gebühr: {seller.acceptance_fee.toFixed(2)} €</span>
                  </div>
                )}
              </div>

              {(seller.is_member || seller.acceptance_fee_paid) && (
                <div className="seller-badges">
                  {seller.is_member && <span className="badge badge-member">Mitglied</span>}
                  {seller.acceptance_fee_paid && <span className="badge badge-paid">Gebühr bezahlt</span>}
                </div>
              )}

              {!seller.is_member && !seller.acceptance_fee_paid && (
                <div className="fee-warning">
                  ⚠️ Annahmegebühr: {seller.acceptance_fee?.toFixed(2) || '0.00'} €
                </div>
              )}

              <div className="seller-card-actions">
                <button
                  onClick={(e) => handleEditClick(seller.id, e)}
                  className="btn btn-secondary btn-small btn-full"
                >
                  Bearbeiten
                </button>
                <button
                  onClick={(e) => deleteSeller(seller.id, e)}
                  className="btn btn-danger btn-small btn-full"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SellerList;
