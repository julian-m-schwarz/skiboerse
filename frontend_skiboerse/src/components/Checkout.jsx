import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DeviceStatus from './DeviceStatus';
import './Checkout.css';
import { apiFetch } from '../api';

function Checkout() {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus barcode input
    inputRef.current?.focus();
  }, []);

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `/api/items/by_barcode/?barcode=${barcodeInput}`
      );

      if (!response.ok) {
        throw new Error('Artikel nicht gefunden');
      }

      const item = await response.json();

      // Check if already in cart
      if (cart.find((i) => i.id === item.id)) {
        setError('Artikel bereits im Warenkorb');
      } else if (item.is_sold) {
        setError('Artikel bereits verkauft');
      } else {
        setCart([...cart, item]);
        setBarcodeInput('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter((item) => item.id !== itemId));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + parseFloat(item.price), 0).toFixed(2);
  };

  const handleCompleteSaleClick = () => {
    if (cart.length === 0) {
      setError('Warenkorb ist leer');
      return;
    }
    setShowConfirmPopup(true);
  };

  const completeSale = async () => {
    setShowConfirmPopup(false);
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/sales/', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((item) => item.id),
          total_amount: calculateTotal(),
          notes: '',
          payment_method: paymentMethod,
        }),
      });

      if (!response.ok) throw new Error('Verkauf konnte nicht abgeschlossen werden');

      setSuccess(`Verkauf abgeschlossen! Gesamt: ${calculateTotal()} €`);
      setCart([]);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="checkout-container">
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Verkaufsmaske</h2>
          <DeviceStatus deviceType="scanner" label="Barcode-Scanner" />
        </div>
        <Link to="/" className="btn btn-secondary">
          ← Zurück
        </Link>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="checkout-layout">
        <div className="barcode-scanner">
          <form onSubmit={handleBarcodeSubmit}>
            <label htmlFor="barcode" className="form-label">
              Barcode scannen oder eingeben
            </label>
            <div className="barcode-input-group">
              <input
                ref={inputRef}
                type="text"
                id="barcode"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="form-input barcode-input"
                placeholder="S001-001"
                disabled={loading}
              />
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Hinzufügen
              </button>
            </div>
          </form>
        </div>

        <div className="cart-section">
          <h3 className="cart-title">Warenkorb ({cart.length} Artikel)</h3>

          {cart.length === 0 ? (
            <div className="empty-cart">
              <p>Warenkorb leer. Artikel scannen um zu starten.</p>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cart.map((item) => (
                  <div key={item.id} className="cart-item">
                    <div className="cart-item-info">
                      <h4>
                        {item.category}{item.brand && ` - ${item.brand}`}
                        {item.size && ` (${item.size})`}
                      </h4>
                      <p className="cart-item-barcode">Artikel-Nr.: {item.barcode}</p>
                      {item.color && <p className="cart-item-detail">Farbe: {item.color}</p>}
                      <p className="cart-item-seller">Verkäufer: {item.seller_name}</p>
                    </div>
                    <div className="cart-item-actions">
                      <span className="cart-item-price">{item.price} €</span>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="btn btn-danger btn-small"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="cart-total">
                <h3>Gesamt: {calculateTotal()} €</h3>
                <button
                  onClick={handleCompleteSaleClick}
                  className="btn btn-primary btn-large"
                  disabled={loading}
                >
                  {loading ? 'Verarbeite...' : 'Verkauf abschließen'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Popup */}
      {showConfirmPopup && (
        <div className="popup-overlay" onClick={() => setShowConfirmPopup(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>Verkauf bestätigen</h3>
            </div>
            <div className="popup-body">
              <p className="confirm-message">
                Folgende <strong>{cart.length}</strong> Artikel werden verkauft:
              </p>
              <div className="confirm-items-list">
                {cart.map((item) => (
                  <div key={item.id} className="confirm-item">
                    <span className="item-barcode">{item.barcode}</span>
                    <span className="item-details">
                      {item.category}{item.brand && ` - ${item.brand}`}
                      {item.size && ` (${item.size})`}
                    </span>
                    <span className="item-price">{item.price} €</span>
                  </div>
                ))}
              </div>
              <div className="confirm-total">
                <strong>Gesamtbetrag: {calculateTotal()} €</strong>
              </div>
              <div className="payment-method-select">
                <span className="payment-method-label">Zahlungsart:</span>
                <div className="payment-method-buttons">
                  <button
                    type="button"
                    className={`payment-method-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    💵 Bar
                  </button>
                  <button
                    type="button"
                    className={`payment-method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('card')}
                  >
                    💳 Karte
                  </button>
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
                onClick={completeSale}
                className="btn btn-success"
              >
                Verkauf bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checkout;
