import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { apiFetch } from '../api';
import { useAuth } from '../AuthContext';

function ReturnCheckToggle() {
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    apiFetch('/api/return-check/status/')
      .then(r => r.json())
      .then(d => setOpen(d.open))
      .catch(() => {});
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await apiFetch('/api/return-check/toggle/', { method: 'POST' });
      const data = await res.json();
      setOpen(data.open);
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="landing-return-check-control">
      <div className="return-check-control-inner">
        <div className="return-check-control-label">
          <span className={`return-check-dot ${open ? 'open' : 'closed'}`} />
          <span>Artikelrückmeldung</span>
          <span className="return-check-status-text">
            {open ? 'Freigegeben' : 'Gesperrt'}
          </span>
        </div>
        <button
          className={`btn ${open ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleToggle}
          disabled={toggling}
        >
          {toggling ? '...' : open ? 'Sperren' : 'Freigeben'}
        </button>
      </div>
    </div>
  );
}

function ReturnCheck() {
  const { user, logout } = useAuth();
  const isReporter = user?.role === 'reporter';
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanMode, setScanMode] = useState(null);
  const [foundItem, setFoundItem] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [returnCompleted, setReturnCompleted] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const scannerInstanceRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    // Poll return-check status every 15 seconds (only for reporters)
    if (!isReporter) return;
    const checkStatus = async () => {
      try {
        const res = await apiFetch('/api/return-check/status/');
        const data = await res.json();
        if (!data.open) {
          setLockedOut(true);
          clearInterval(pollRef.current);
        }
      } catch {
        // ignore network errors
      }
    };
    checkStatus();
    pollRef.current = setInterval(checkStatus, 15000);
    return () => {
      clearInterval(pollRef.current);
      stopCamera();
    };
  }, []);

  const handleLockedOutConfirm = async () => {
    await apiFetch('/api/auth/logout/', { method: 'POST' });
    logout();
  };

  const stopCamera = async () => {
    if (scannerInstanceRef.current) {
      try {
        await scannerInstanceRef.current.stop();
      } catch (err) {
        // ignore
      }
      scannerInstanceRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setScanMode('camera');
    setError(null);
    setSuccessMessage(null);

    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('barcode-scanner');
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 300, height: 150 },
          },
          (decodedText) => {
            handleBarcodeLookup(decodedText);
            stopCamera();
            setScanMode(null);
          },
          () => {}
        );
        setCameraActive(true);
      } catch (err) {
        setError('Kamera konnte nicht gestartet werden: ' + err.message);
        setScanMode(null);
      }
    }, 100);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    handleBarcodeLookup(barcodeInput.trim());
    setBarcodeInput('');
  };

  const handleBarcodeLookup = async (barcode) => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const response = await apiFetch(`/api/items/by_barcode/?barcode=${encodeURIComponent(barcode)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Artikel nicht gefunden');
        setFoundItem(null);
      } else {
        setFoundItem(data);
      }
    } catch (err) {
      setError('Fehler beim Suchen: ' + err.message);
      setFoundItem(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!foundItem) return;
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/items/verify_return/', {
        method: 'POST',
        body: JSON.stringify({ barcode: foundItem.barcode })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Fehler bei der Rückmeldung');
      } else {
        setFoundItem(prev => ({ ...prev, seller_all_done: data.seller_all_done }));
        setReturnCompleted(true);
      }
    } catch (err) {
      setError('Fehler: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFoundItem(null);
    setReturnCompleted(false);
    setError(null);
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="return-check-container">

      {lockedOut && (
        <div className="lockout-overlay">
          <div className="lockout-popup">
            <h3>Artikelrückmeldung gesperrt</h3>
            <p>Die Artikelrückmeldung wurde vom Administrator gesperrt. Sie werden abgemeldet.</p>
            <button className="btn btn-primary" onClick={handleLockedOutConfirm}>
              OK
            </button>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h2 className="page-title">Rückmeldung</h2>
          <p className="page-subtitle">Artikel per Kamera oder Artikelnummer rückmelden</p>
        </div>
        <Link to="/" className="btn btn-secondary">
          ← Zurück
        </Link>
      </div>

      {!isReporter && <ReturnCheckToggle />}

      {error && <div className="error">{error}</div>}
      {successMessage && <div className="success">{successMessage}</div>}

      {!foundItem && (
        <div className="return-scan-options">
          <div className="scan-option-cards">
            <button
              onClick={startCamera}
              className={`scan-option-card ${scanMode === 'camera' ? 'active' : ''}`}
              disabled={cameraActive}
            >
              <div className="scan-option-icon">📷</div>
              <h3>Kamera Scan</h3>
              <p>Barcode mit Kamera scannen</p>
            </button>

            <button
              onClick={() => { stopCamera(); setScanMode('manual'); setError(null); setSuccessMessage(null); }}
              className={`scan-option-card ${scanMode === 'manual' ? 'active' : ''}`}
            >
              <div className="scan-option-icon">⌨️</div>
              <h3>Manuelle Eingabe</h3>
              <p>Artikelnummer eingeben</p>
            </button>
          </div>

          {scanMode === 'camera' && (
            <div className="camera-scanner-wrapper">
              <div id="barcode-scanner" className="camera-scanner"></div>
              <button onClick={() => { stopCamera(); setScanMode(null); }} className="btn btn-secondary" style={{marginTop: '1rem'}}>
                Kamera stoppen
              </button>
            </div>
          )}

          {scanMode === 'manual' && (
            <div className="manual-input-wrapper">
              <form onSubmit={handleManualSubmit} className="manual-barcode-form">
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="form-input barcode-input-large"
                  placeholder="z.B. S001-001"
                  autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Suche...' : 'Suchen'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {foundItem && (
        <div className="popup-overlay">
          <div className="popup-card return-popup">
            {!returnCompleted ? (
              <>
                <div className="popup-header">
                  <h3>Artikel gefunden</h3>
                </div>
                <div className="popup-body">
                  <div className="return-item-detail">
                    <div className="return-item-barcode">{foundItem.barcode}</div>
                    <div className="return-item-info">
                      <p className="return-item-category">{foundItem.category}</p>
                      {foundItem.brand && <p>Marke: {foundItem.brand}</p>}
                      {foundItem.color && <p>Farbe: {foundItem.color}</p>}
                      {foundItem.size && <p>Größe: {foundItem.size}</p>}
                      <p className="return-item-price">{foundItem.price} €</p>
                      <p className="return-item-seller">Verkäufer: {foundItem.seller_name}</p>
                    </div>

                    {foundItem.is_sold && (
                      <div className="return-item-warning">
                        Dieser Artikel wurde verkauft.
                      </div>
                    )}

                    {foundItem.returned_at && (
                      <div className="return-item-warning">
                        Bereits rückgemeldet am {formatDateTime(foundItem.returned_at)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="popup-actions">
                  {!foundItem.is_sold ? (
                    <>
                      <button
                        onClick={handleReturn}
                        className="btn btn-success btn-full"
                        disabled={loading}
                      >
                        {loading ? 'Wird rückgemeldet...' : (foundItem.returned_at ? 'Erneut rückmelden' : 'Rückmeldung')}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="btn btn-secondary btn-full"
                      >
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCancel}
                      className="btn btn-secondary btn-full"
                    >
                      Schließen
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="popup-header">
                  <h3>Rückmeldung erfolgreich</h3>
                </div>
                <div className="popup-body">
                  <p style={{textAlign: 'center', marginBottom: '1rem'}}>
                    Artikel <strong>{foundItem.barcode}</strong> wurde rückgemeldet.
                  </p>
                </div>
                <div className="popup-actions">
                  <button
                    onClick={handleCancel}
                    className="btn btn-primary btn-full"
                  >
                    Weiter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReturnCheck;
