import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';

function Payout() {
  const [sellerNumber, setSellerNumber] = useState('');
  const [payoutData, setPayoutData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payoutCompleted, setPayoutCompleted] = useState(false);
  const [pendingItems, setPendingItems] = useState(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [showWarningPopup, setShowWarningPopup] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);

  const fetchPendingItems = async () => {
    setPendingLoading(true);
    try {
      const response = await apiFetch('/api/items/pending/');
      if (!response.ok) throw new Error('Fehler beim Laden');
      const data = await response.json();
      setPendingItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingLoading(false);
    }
  };

  const closePendingItems = () => {
    setPendingItems(null);
  };

  const fetchPayout = async (e) => {
    e.preventDefault();
    setError(null);
    setPayoutCompleted(false);
    setPayoutData(null);

    if (!sellerNumber) {
      setError('Bitte eine Verkäufernummer eingeben');
      return;
    }

    try {
      setLoading(true);

      // Find the seller directly by seller_number
      const sellersResponse = await apiFetch(`/api/sellers/?seller_number=${parseInt(sellerNumber)}`);
      if (!sellersResponse.ok) throw new Error('Verkäufer konnten nicht geladen werden');
      const sellers = await sellersResponse.json();

      if (!sellers.length) {
        setError(`Verkäufer #${sellerNumber} nicht gefunden`);
        setLoading(false);
        return;
      }
      const seller = sellers[0];

      // Fetch payout data
      const payoutResponse = await apiFetch(`/api/sellers/${seller.id}/payout/`);
      if (!payoutResponse.ok) throw new Error('Auszahlungsdaten konnten nicht geladen werden');
      const data = await payoutResponse.json();

      setPayoutData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayoutButtonClick = () => {
    if (!payoutData.seller_all_done) {
      setShowWarningPopup(true);
      return;
    }
    setShowConfirmPopup(true);
  };

  const handleCompletePayout = async () => {
    setShowConfirmPopup(false);
    try {
      // Mark all items as picked up
      const response = await apiFetch(`/api/sellers/${payoutData.seller.id}/pickup/`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Fehler beim Abschließen der Auszahlung');
        return;
      }

      setPayoutCompleted(true);
    } catch (err) {
      alert('Fehler: ' + err.message);
    }
  };

  const handleReset = () => {
    setSellerNumber('');
    setPayoutData(null);
    setError(null);
    setPayoutCompleted(false);
  };

  return (
    <div className="payout-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Artikelrückgabe</h2>
        </div>
        <Link to="/" className="btn btn-secondary">
          ← Zurück
        </Link>
      </div>

      {!payoutData && !pendingItems && (
        <div className="payout-search-row">
          <div className="payout-search">
            <form onSubmit={fetchPayout} className="payout-form">
              <div className="form-group">
                <label htmlFor="sellerNumber" className="form-label">
                  Verkäufernummer eingeben
                </label>
                <input
                  type="number"
                  id="sellerNumber"
                  value={sellerNumber}
                  onChange={(e) => setSellerNumber(e.target.value)}
                  className="form-input payout-input"
                  placeholder="z. B. 1, 2, 3 …"
                  min="1"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={loading}
              >
                {loading ? 'Laden…' : 'Auszahlung berechnen'}
              </button>
            </form>
          </div>
          <button
            onClick={fetchPendingItems}
            className="btn btn-pending-items"
            disabled={pendingLoading}
          >
            {pendingLoading ? 'Laden...' : 'Offene Artikel anzeigen'}
          </button>
        </div>
      )}

      {pendingItems && (
        <div className="pending-items-view">
          <div className="pending-items-header">
            <h3 className="section-title">Offene Artikel ({pendingItems.length})</h3>
            <button onClick={closePendingItems} className="btn btn-secondary">
              Zurück
            </button>
          </div>
          {pendingItems.length === 0 ? (
            <div className="success">Keine offenen Artikel vorhanden.</div>
          ) : (
            <div className="pending-items-list">
              {Object.entries(
                pendingItems.reduce((groups, item) => {
                  const key = `${item.seller_number} - ${item.seller_name}`;
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(item);
                  return groups;
                }, {})
              ).map(([sellerLabel, items]) => (
                <div key={sellerLabel} className="pending-seller-group">
                  <h4 className="pending-seller-label">Verkäufer #{sellerLabel} ({items.length})</h4>
                  <div className="sold-items-list">
                    {items.map((item) => (
                      <div key={item.id} className="sold-item">
                        <span className="item-barcode">{item.barcode}</span>
                        <span className="item-details">
                          {item.category} {item.brand && `- ${item.brand}`}
                          {item.size && ` (${item.size})`}
                        </span>
                        <span className="item-price">{item.price} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-box">
          <p>{error}</p>
          <button onClick={handleReset} className="btn btn-secondary">
            Erneut versuchen
          </button>
        </div>
      )}

      {payoutData && (
        <div className="payout-result">
          {payoutCompleted && (
            <div className="success-banner">
              ✓ Auszahlung abgeschlossen! Betrag wurde an den Verkäufer übergeben.
            </div>
          )}

          <div className="seller-payout-header">
            <div className="seller-payout-info">
              <h3>Verkäufer #{payoutData.seller.seller_number}</h3>
              <h2>{payoutData.seller.full_name}</h2>
              <p>📱 {payoutData.seller.mobile_number}</p>
              {payoutData.seller.is_member && (
                <span className="badge badge-member">Mitglied</span>
              )}
            </div>
            <div className={`seller-status-indicator ${payoutData.seller_all_done ? 'status-complete' : 'status-incomplete'}`}>
              <div className="seller-status-icon">
                {payoutData.seller_all_done ? '\u2713' : '\u2717'}
              </div>
              <p className="seller-status-text">
                {payoutData.seller_all_done
                  ? 'Alle Artikel verkauft oder zurückgemeldet'
                  : 'Offene Artikel vorhanden'}
              </p>
            </div>
          </div>

          <div className="payout-summary-grid">
            <div className="payout-stat">
              <span className="payout-stat-label">Artikel gesamt</span>
              <span className="payout-stat-value">{payoutData.total_items_count}</span>
            </div>
            <div className="payout-stat">
              <span className="payout-stat-label">Verkauft</span>
              <span className="payout-stat-value success">{payoutData.sold_items_count}</span>
            </div>
            <div className="payout-stat">
              <span className="payout-stat-label">Nicht verkauft</span>
              <span className="payout-stat-value">
                {payoutData.total_items_count - payoutData.sold_items_count}
              </span>
            </div>
          </div>

          <div className="payout-calculation">
            <h3 className="section-title">Auszahlungsberechnung</h3>

            <div className="calculation-row">
              <span className="calc-label">Gesamtverkauf</span>
              <span className="calc-value positive">{payoutData.total_sales.toFixed(2)} €</span>
            </div>

            <div className="calculation-row deduction">
              <span className="calc-label">
                - Provision (10%)
              </span>
              <span className="calc-value negative">-{payoutData.commission.toFixed(2)} €</span>
            </div>

            {!payoutData.acceptance_fee_paid && (
              <div className="calculation-row deduction">
                <span className="calc-label">
                  - Annahmegebühr (nicht bezahlt)
                  <span className="calc-note">
                    {payoutData.total_items_count < 20 ? '< 20 Artikel' : '≥ 20 Artikel'}
                  </span>
                </span>
                <span className="calc-value negative">
                  -{payoutData.fee_deducted.toFixed(2)} €
                </span>
              </div>
            )}

            {payoutData.acceptance_fee_paid && (
              <div className="calculation-row info-row">
                <span className="calc-label">
                  ✓ Annahmegebühr (bereits bezahlt)
                </span>
                <span className="calc-value">0,00 €</span>
              </div>
            )}

            <div className="calculation-row total">
              <span className="calc-label">Auszahlungsbetrag</span>
              <span className="calc-value final">{payoutData.final_payout.toFixed(2)} €</span>
            </div>
          </div>

          {payoutData.sold_items && payoutData.sold_items.length > 0 && (
            <div className="sold-items-section">
              <h3 className="section-title">Verkauft ({payoutData.sold_items.length})</h3>
              <div className="sold-items-list">
                {payoutData.sold_items.map((item) => (
                  <div key={item.id} className="sold-item">
                    <span className="item-barcode">{item.barcode}</span>
                    <span className="item-details">
                      {item.category} {item.brand && `- ${item.brand}`}
                      {item.size && ` (${item.size})`}
                    </span>
                    <span className="item-price">{item.price} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(payoutData.unsold_returned?.length > 0 || payoutData.unsold_not_returned?.length > 0) && (
            <div className="unsold-items-section">
              <h3 className="section-title">
                Nicht verkauft ({(payoutData.unsold_returned?.length || 0) + (payoutData.unsold_not_returned?.length || 0)})
              </h3>

              {payoutData.unsold_returned?.length > 0 && (
                <div className="unsold-subsection">
                  <h4 className="unsold-subtitle returned">Bereits rückgemeldet ({payoutData.unsold_returned.length})</h4>
                  <div className="sold-items-list">
                    {payoutData.unsold_returned.map((item) => (
                      <div key={item.id} className="sold-item">
                        <span className="item-barcode">{item.barcode}</span>
                        <span className="item-details">
                          {item.category} {item.brand && `- ${item.brand}`}
                          {item.size && ` (${item.size})`}
                        </span>
                        <span className="item-price">{item.price} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {payoutData.unsold_not_returned?.length > 0 && (
                <div className="unsold-subsection">
                  <h4 className="unsold-subtitle not-returned">Nicht rückgemeldet ({payoutData.unsold_not_returned.length})</h4>
                  <div className="sold-items-list">
                    {payoutData.unsold_not_returned.map((item) => (
                      <div key={item.id} className="sold-item">
                        <span className="item-barcode">{item.barcode}</span>
                        <span className="item-details">
                          {item.category} {item.brand && `- ${item.brand}`}
                          {item.size && ` (${item.size})`}
                        </span>
                        <span className="item-price">{item.price} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="payout-actions">
            {!payoutCompleted ? (
              <>
                <button
                  onClick={handlePayoutButtonClick}
                  className="btn btn-success btn-large"
                >
                  ✓ Auszahlung abschließen ({payoutData.final_payout.toFixed(2)} € an Verkäufer)
                </button>
                <button onClick={handleReset} className="btn btn-secondary">
                  Abbrechen
                </button>
              </>
            ) : (
              <button onClick={handleReset} className="btn btn-primary btn-large">
                Nächster Verkäufer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Warning Popup - Items not returned */}
      {showWarningPopup && (
        <div className="popup-overlay" onClick={() => setShowWarningPopup(false)}>
          <div className="popup-card warning-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header warning">
              <h3>⚠️ Achtung</h3>
            </div>
            <div className="popup-body">
              <p className="warning-message">
                Es wurden noch nicht alle Artikel zurückgemeldet!
              </p>
              <p className="warning-count">
                <strong>{payoutData?.unsold_not_returned?.length || 0}</strong> Artikel sind noch offen
              </p>
              <div className="warning-items-list">
                {payoutData?.unsold_not_returned?.slice(0, 5).map((item) => (
                  <div key={item.id} className="warning-item">
                    <span className="item-barcode">{item.barcode}</span>
                    <span>{item.category}</span>
                  </div>
                ))}
                {payoutData?.unsold_not_returned?.length > 5 && (
                  <p className="warning-more">
                    ... und {payoutData.unsold_not_returned.length - 5} weitere
                  </p>
                )}
              </div>
            </div>
            <div className="popup-actions">
              <button
                onClick={() => setShowWarningPopup(false)}
                className="btn btn-primary"
              >
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Popup - Payout amount */}
      {showConfirmPopup && (
        <div className="popup-overlay" onClick={() => setShowConfirmPopup(false)}>
          <div className="popup-card popup-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className={`popup-header ${payoutData?.final_payout < 0 ? 'negative' : ''}`}>
              <h3>{payoutData?.final_payout < 0 ? 'Zahlung erforderlich' : 'Auszahlung bestätigen'}</h3>
            </div>
            <div className="popup-body">
              <div className="payout-confirm-seller">
                <p className="confirm-seller-name">{payoutData?.seller?.full_name}</p>
                <p className="confirm-seller-number">Verkäufer #{payoutData?.seller?.seller_number}</p>
              </div>
              <div className="payout-confirm-row">
                <div className={`payout-confirm-amount ${payoutData?.final_payout < 0 ? 'negative' : ''}`}>
                  <span className="confirm-amount-label">
                    {payoutData?.final_payout < 0 ? 'Noch zu zahlen' : 'Auszahlungsbetrag'}
                  </span>
                  <span className="confirm-amount-value">
                    {payoutData?.final_payout < 0
                      ? `${Math.abs(payoutData?.final_payout)?.toFixed(2)} €`
                      : `${payoutData?.final_payout?.toFixed(2)} €`
                    }
                  </span>
                </div>
                <div className="payout-confirm-details">
                  <div className="confirm-detail-row">
                    <span>Verkaufte Artikel:</span>
                    <span>{payoutData?.sold_items_count}</span>
                  </div>
                  <div className="confirm-detail-row">
                    <span>Gesamtverkauf:</span>
                    <span>{payoutData?.total_sales?.toFixed(2)} €</span>
                  </div>
                  <div className="confirm-detail-row">
                    <span>Provision (10%):</span>
                    <span>-{payoutData?.commission?.toFixed(2)} €</span>
                  </div>
                  {!payoutData?.acceptance_fee_paid && payoutData?.fee_deducted > 0 && (
                    <div className="confirm-detail-row">
                      <span>Annahmegebühr:</span>
                      <span>-{payoutData?.fee_deducted?.toFixed(2)} €</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="popup-actions">
              <button
                onClick={() => setShowConfirmPopup(false)}
                className="btn btn-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCompletePayout}
                className={`btn ${payoutData?.final_payout < 0 ? 'btn-danger' : 'btn-success'}`}
              >
                {payoutData?.final_payout < 0 ? 'Zahlung erhalten' : 'Auszahlung bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Payout;
