import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';

function ReturnCheckPrintList() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState(null);
  const [printAllLoading, setPrintAllLoading] = useState(false);
  const [printedIds, setPrintedIds] = useState(new Set());

  useEffect(() => {
    fetchSellers();
  }, []);

  const fetchSellers = async () => {
    try {
      const res = await apiFetch('/api/sellers/');
      if (!res.ok) throw new Error('Fehler beim Laden der Verkäufer');
      const data = await res.json();
      setSellers(data.slice().sort((a, b) => a.seller_number - b.seller_number));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchItemsForSeller = async (seller) => {
    const res = await apiFetch(`/api/items/?seller=${seller.id}`);
    if (!res.ok) throw new Error(`Fehler beim Laden der Artikel für Verkäufer #${seller.seller_number}`);
    const items = await res.json();
    return items.slice().sort((a, b) => {
      const aNum = parseInt(a.barcode.split('-')[1]) || 0;
      const bNum = parseInt(b.barcode.split('-')[1]) || 0;
      return aNum - bNum;
    });
  };

  const triggerPrint = (data, onAfterPrint) => {
    setPrintData(data);
    setTimeout(() => {
      window.print();
      if (onAfterPrint) onAfterPrint();
    }, 150);
  };

  const handleTestPrint = () => {
    triggerPrint({ test: true });
  };

  const handlePrintSeller = async (seller) => {
    setPrintLoadingId(seller.id);
    setError(null);
    try {
      const items = await fetchItemsForSeller(seller);
      triggerPrint({ pages: [{ seller, items }] }, () => {
        setPrintedIds(prev => new Set([...prev, seller.id]));
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPrintLoadingId(null);
    }
  };

  const handlePrintAll = async () => {
    setPrintAllLoading(true);
    setError(null);
    try {
      const pages = await Promise.all(
        sellers.map(async (seller) => {
          const items = await fetchItemsForSeller(seller);
          return { seller, items };
        })
      );
      triggerPrint({ pages }, () => {
        setPrintedIds(new Set(sellers.map(s => s.id)));
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPrintAllLoading(false);
    }
  };

  const formatDate = () =>
    new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const printedCount = sellers.filter(s => printedIds.has(s.id)).length;

  return (
    <div className="rcpl-container">

      {/* ── PRINT-ONLY CONTENT (hidden on screen) ─────────────────────── */}
      <div className="rcpl-print-area">
        {printData?.test && (
          <div className="rcpl-test-page">
            <h1>Testdruck — Skibörse Renningen</h1>
            <p>Datum: {formatDate()}</p>
            <p>Dieser Testdruck bestätigt die Druckerverbindung vom Laptop.</p>
          </div>
        )}

        {printData?.pages?.map((page, i) => (
          <div key={page.seller.id} className={`rcpl-seller-page${i > 0 ? ' rcpl-page-break' : ''}`}>
            <div className="rcpl-print-header">
              <div>
                <div className="rcpl-print-title">Skibörse Renningen — Artikelrückmeldung</div>
                <div className="rcpl-print-subtitle">Druckdatum: {formatDate()}</div>
              </div>
              <div className="rcpl-print-seller-box">
                <div className="rcpl-print-seller-num">
                  #{page.seller.seller_number} — {page.seller.first_name} {page.seller.last_name}
                </div>
                <div>{page.seller.mobile_number}</div>
              </div>
            </div>

            <table className="rcpl-print-table">
              <thead>
                <tr>
                  <th className="rcpl-col-check">Abh.</th>
                  <th className="rcpl-col-barcode">Artikel-Nr.</th>
                  <th>Kategorie</th>
                  <th>Marke</th>
                  <th>Größe</th>
                  <th>Farbe</th>
                  <th className="rcpl-col-price">Preis</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map(item => (
                  <tr key={item.id} className={item.is_sold ? 'rcpl-row-sold' : ''}>
                    <td className="rcpl-col-check">
                      {!item.is_sold && <span className="rcpl-checkbox">☐</span>}
                    </td>
                    <td className="rcpl-col-barcode">{item.barcode}</td>
                    <td>{item.category}</td>
                    <td>{item.brand || '—'}</td>
                    <td>{item.size || '—'}</td>
                    <td>{item.color || '—'}</td>
                    <td className="rcpl-col-price">{parseFloat(item.price).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="rcpl-print-footer">
              <span>Gesamt: {page.items.length} Artikel</span>
              <span>Verkauft: {page.items.filter(i => i.is_sold).length}</span>
              <span>Noch vorhanden: {page.items.filter(i => !i.is_sold).length}</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#999' }}>
                Fallback-Liste für manuelle Artikelrückmeldung
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── SCREEN CONTENT ────────────────────────────────────────────── */}
      <div className="rcpl-screen">
        <div className="page-header">
          <div>
            <h2 className="page-title">Drucklisten</h2>
            <p className="page-subtitle">Papierlisten für manuelle Artikelrückmeldung</p>
          </div>
          <Link to="/" className="btn btn-secondary">← Zurück</Link>
        </div>

        {/* Printer info card */}
        <div className="card rcpl-printer-card">
          <div className="rcpl-printer-top">
            <h3 className="rcpl-printer-heading">Drucker</h3>
          </div>
          <p className="rcpl-printer-hint">
            Der Druck läuft direkt über diesen Laptop — nicht über den Raspberry Pi.
            Stellen Sie sicher, dass Ihr Drucker angeschlossen und im System verfügbar ist.
          </p>
          <div className="rcpl-printer-actions">
            <button className="btn btn-secondary" onClick={handleTestPrint}>
              Testdruck starten
            </button>
          </div>
        </div>

        {error && <div className="error" style={{ marginTop: '1rem' }}>{error}</div>}

        {/* Sellers list */}
        {loading ? (
          <div className="loading" style={{ marginTop: '2rem' }}>Verkäufer laden…</div>
        ) : (
          <div style={{ marginTop: '2rem' }}>
            <div className="rcpl-list-header">
              <h3 className="rcpl-sellers-heading">
                Verkäufer ({sellers.length})
                {printedCount > 0 && (
                  <span className="rcpl-printed-counter">
                    {printedCount}/{sellers.length} gedruckt
                  </span>
                )}
              </h3>
              <button
                className="btn btn-primary"
                onClick={handlePrintAll}
                disabled={printAllLoading}
              >
                {printAllLoading ? 'Laden…' : 'Alle drucken'}
              </button>
            </div>

            <div className="rcpl-sellers-list">
              {sellers.map(seller => {
                const printed = printedIds.has(seller.id);
                return (
                  <div key={seller.id} className={`card rcpl-seller-row${printed ? ' rcpl-seller-row--printed' : ''}`}>
                    <div className="rcpl-seller-info">
                      {printed && <span className="rcpl-printed-badge">✓ Gedruckt</span>}
                      <span className="rcpl-seller-num">#{seller.seller_number}</span>
                      <span className="rcpl-seller-name">
                        {seller.first_name} {seller.last_name}
                      </span>
                      <span className="rcpl-seller-count">{seller.item_count} Artikel</span>
                    </div>
                    <button
                      className={`btn btn-small ${printed ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => handlePrintSeller(seller)}
                      disabled={printLoadingId === seller.id || printAllLoading}
                    >
                      {printLoadingId === seller.id ? 'Laden…' : printed ? 'Erneut drucken' : 'Drucken'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReturnCheckPrintList;
