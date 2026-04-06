import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import './LandingPage.css';

function LandingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

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

    </div>
  );
}

export default LandingPage;
