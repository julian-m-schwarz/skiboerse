import React from 'react';
import { Link } from 'react-router-dom';

function InventoryHub() {
  return (
    <div className="inventory-hub">
      <div className="page-header">
        <h2 className="page-title">Artikelübersicht</h2>
        <Link to="/" className="btn btn-secondary">← Landing Page</Link>
      </div>

      <div className="hub-cards">
        <Link to="/inventory/sellers" className="hub-card">
          <div className="hub-card-icon">👥</div>
          <h3>Verkäufer verwalten</h3>
        </Link>

        <Link to="/inventory/items" className="hub-card">
          <div className="hub-card-icon">⛷️</div>
          <h3>Artikel verwalten</h3>
        </Link>
      </div>
    </div>
  );
}

export default InventoryHub;
