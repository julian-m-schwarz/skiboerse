import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { apiFetch } from '../api';
import './LandingPage.css';

function LandingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [returnCheckOpen, setReturnCheckOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch('/api/return-check/status/')
      .then(r => r.json())
      .then(d => setReturnCheckOpen(d.open))
      .catch(() => {});
  }, [isAdmin]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await apiFetch('/api/return-check/toggle/', { method: 'POST' });
      const data = await res.json();
      setReturnCheckOpen(data.open);
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <h1 className="landing-title">
          <span className="landing-icon">⛷</span>
          Skibörse<span className="landing-accent"> Renningen</span>
        </h1>
      </div>

      <div className="landing-actions">
        <Link to="/inventory" className="landing-card landing-card-inventory">
          <div className="landing-card-icon">🎿</div>
          <h2 className="landing-card-title">Verkäufer und Artikel</h2>
        </Link>

        <Link to="/checkout" className="landing-card landing-card-sales">
          <div className="landing-card-icon">💸</div>
          <h2 className="landing-card-title">Verkaufsmaske</h2>
        </Link>

        {isAdmin && (
          <Link to="/return-check-print" className="landing-card landing-card-print">
            <div className="landing-card-icon">🖨️</div>
            <h2 className="landing-card-title">Drucklisten</h2>
          </Link>
        )}
      </div>

      {isAdmin && (
        <div className="landing-return-check-control">
          <div className="return-check-control-inner">
            <div className="return-check-control-label">
              <span className={`return-check-dot ${returnCheckOpen ? 'open' : 'closed'}`} />
              <span>Artikelrückmeldung</span>
              <span className="return-check-status-text">
                {returnCheckOpen ? 'Freigegeben' : 'Gesperrt'}
              </span>
            </div>
            <button
              className={`btn ${returnCheckOpen ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggle}
              disabled={toggling}
            >
              {toggling ? '...' : returnCheckOpen ? 'Sperren' : 'Freigeben'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LandingPage;
