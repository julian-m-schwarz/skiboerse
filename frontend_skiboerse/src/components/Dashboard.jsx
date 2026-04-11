import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import './Dashboard.css';

// Simple SVG bar chart
function BarChart({ data, valueKey, labelKey, colorFn, maxLabel }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-row">
          <span className="bar-label">{d[labelKey]}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(d[valueKey] / max) * 100}%`, background: colorFn(i) }}
            />
          </div>
          <span className="bar-value">{maxLabel ? `${d[valueKey].toFixed(0)} €` : d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

// Simple SVG donut chart
function DonutChart({ sold, unsold, returned, pending }) {
  const total = sold + unsold;
  if (total === 0) return <div className="donut-empty">Keine Daten</div>;

  const r = 54;
  const cx = 70;
  const cy = 70;
  const circ = 2 * Math.PI * r;

  const segments = [
    { value: sold, color: '#27AE60', label: 'Verkauft' },
    { value: returned, color: '#4EBDC4', label: 'Rückgemeldet' },
    { value: pending, color: '#E0E0E0', label: 'Offen' },
  ];

  let offset = 0;
  const rendered = segments.map((seg, i) => {
    const pct = seg.value / total;
    const dash = pct * circ;
    const el = (
      <circle
        key={i}
        r={r} cx={cx} cy={cy}
        fill="none"
        stroke={seg.color}
        strokeWidth="20"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <div className="donut-wrapper">
      <svg viewBox="0 0 140 140" className="donut-svg">
        {rendered}
        <text x={cx} y={cy - 6} textAnchor="middle" className="donut-center-pct">
          {total > 0 ? Math.round((sold / total) * 100) : 0}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="donut-center-label">
          verkauft
        </text>
      </svg>
      <div className="donut-legend">
        {segments.map((s, i) => (
          <div key={i} className="donut-legend-item">
            <span className="donut-legend-dot" style={{ background: s.color }} />
            <span>{s.label}: <strong>{s.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const COLORS = ['#4EBDC4', '#3A9DA3', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD', '#2980B9', '#16A085'];

const CATEGORIES = [
  'Ski','Snowboard','Skischuhe','Snowboardboots','Skibindung',
  'Snowboardbindung','Skistoecke','Helm','Skibrille','Bekleidung','Zubehoer','Sonstiges'
];

function PriceHistogram() {
  const [category, setCategory] = useState('Ski');
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/analytics/price-histogram/?category=${encodeURIComponent(category)}`)
      .then(r => r.json())
      .then(d => setBuckets(d.buckets || []))
      .catch(() => setBuckets([]))
      .finally(() => setLoading(false));
  }, [category]);

  const maxTotal = Math.max(...buckets.map(b => b.total), 1);
  const chartH = 180;

  // Sell rate for recommendation
  const totalOffered = buckets.reduce((s, b) => s + b.total, 0);
  const totalSold = buckets.reduce((s, b) => s + b.sold, 0);
  const bestBucket = buckets.length
    ? buckets.reduce((best, b) => (b.total > 0 && b.sold / b.total > (best.sold / (best.total || 1)) ? b : best), buckets[0])
    : null;

  return (
    <div className="dash-card" style={{ marginBottom: '1rem' }}>
      <div className="histogram-header">
        <h3 className="dash-card-title" style={{ margin: 0 }}>Preisverteilung nach Kategorie</h3>
        <select
          className="histogram-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading && <p className="dash-empty">Lade...</p>}

      {!loading && buckets.length === 0 && (
        <p className="dash-empty">Keine Artikel in dieser Kategorie</p>
      )}

      {!loading && buckets.length > 0 && (
        <>
          <div className="histogram-legend">
            <span className="histogram-legend-item">
              <span className="histogram-legend-dot" style={{ background: '#CBD5E0' }} />
              Angeboten ({totalOffered})
            </span>
            <span className="histogram-legend-item">
              <span className="histogram-legend-dot" style={{ background: '#27AE60' }} />
              Verkauft ({totalSold})
            </span>
          </div>

          <div className="histogram-chart">
            {buckets.map((b, i) => {
              const totalH = Math.round((b.total / maxTotal) * chartH);
              const soldH = Math.round((b.sold / maxTotal) * chartH);
              const rate = b.total > 0 ? Math.round((b.sold / b.total) * 100) : 0;
              return (
                <div key={i} className="histogram-bucket" title={`${b.label}\nAngeboten: ${b.total}\nVerkauft: ${b.sold} (${rate}%)`}>
                  <div className="histogram-bars" style={{ height: chartH }}>
                    <div className="histogram-bar-total" style={{ height: totalH }} />
                    <div className="histogram-bar-sold" style={{ height: soldH }} />
                  </div>
                  <div className="histogram-rate">{rate > 0 ? `${rate}%` : '–'}</div>
                  <div className="histogram-label">{b.label}</div>
                </div>
              );
            })}
          </div>

          {bestBucket && bestBucket.total > 0 && (
            <div className="histogram-recommendation">
              <span className="histogram-rec-icon">💡</span>
              <span>
                <strong>Empfehlung:</strong> In der Kategorie <em>{category}</em> erzielen Artikel im Preisbereich{' '}
                <strong>{bestBucket.label}</strong> die höchste Verkaufsquote
                ({Math.round((bestBucket.sold / bestBucket.total) * 100)}% — {bestBucket.sold} von {bestBucket.total} verkauft).
                Verkäufer sollten ihre Artikel in diesem Bereich anbieten.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/analytics/')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Lade Analyse...</div>;
  if (error) return <div className="error">{error}</div>;

  const sellRate = data.total_items > 0
    ? Math.round((data.sold_count / data.total_items) * 100)
    : 0;

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Analyse</h2>
          <p className="page-subtitle">Übersicht über die Skibörse</p>
        </div>
        <Link to="/inventory" className="btn btn-secondary">← Zurück</Link>
      </div>

      {/* KPI Cards */}
      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <span className="dash-kpi-value">{data.total_items}</span>
          <span className="dash-kpi-label">Artikel gesamt</span>
        </div>
        <div className="dash-kpi dash-kpi-green">
          <span className="dash-kpi-value">{data.sold_count}</span>
          <span className="dash-kpi-label">Verkauft</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-value">{data.pending_count}</span>
          <span className="dash-kpi-label">Noch offen</span>
        </div>
        <div className="dash-kpi dash-kpi-teal">
          <span className="dash-kpi-value">{data.total_revenue.toFixed(2)} €</span>
          <span className="dash-kpi-label">Gesamtumsatz</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-value">{data.commission.toFixed(2)} €</span>
          <span className="dash-kpi-label">Provision (10%)</span>
        </div>
        <div className="dash-kpi dash-kpi-green">
          <span className="dash-kpi-value">{sellRate}%</span>
          <span className="dash-kpi-label">Verkaufsquote</span>
        </div>
        <div className="dash-kpi dash-kpi-profit">
          <span className="dash-kpi-value">{data.club_profit.toFixed(2)} €</span>
          <span className="dash-kpi-label">Vereinsgewinn</span>
          <span className="dash-kpi-sublabel">Provision + Annahmegebühren</span>
        </div>
      </div>

      {/* Payment methods */}
      <div className="dash-card dash-payment-card">
        <h3 className="dash-card-title">Zahlungsarten</h3>
        <div className="payment-split">
          <div className="payment-split-item">
            <span className="payment-split-icon">💵</span>
            <span className="payment-split-label">Bar</span>
            <span className="payment-split-count">{data.payment.cash_count} Artikel</span>
            <span className="payment-split-amount">{data.payment.cash_revenue.toFixed(2)} €</span>
            <div className="payment-split-bar-track">
              <div
                className="payment-split-bar cash"
                style={{
                  width: data.payment.cash_revenue + data.payment.card_revenue > 0
                    ? `${(data.payment.cash_revenue / (data.payment.cash_revenue + data.payment.card_revenue)) * 100}%`
                    : '0%'
                }}
              />
            </div>
          </div>
          <div className="payment-split-divider" />
          <div className="payment-split-item">
            <span className="payment-split-icon">💳</span>
            <span className="payment-split-label">Karte</span>
            <span className="payment-split-count">{data.payment.card_count} Artikel</span>
            <span className="payment-split-amount">{data.payment.card_revenue.toFixed(2)} €</span>
            <div className="payment-split-bar-track">
              <div
                className="payment-split-bar card"
                style={{
                  width: data.payment.cash_revenue + data.payment.card_revenue > 0
                    ? `${(data.payment.card_revenue / (data.payment.cash_revenue + data.payment.card_revenue)) * 100}%`
                    : '0%'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="dash-charts-row">
        {/* Donut */}
        <div className="dash-card">
          <h3 className="dash-card-title">Artikelstatus</h3>
          <DonutChart
            sold={data.sold_count}
            unsold={data.unsold_count}
            returned={data.returned_count}
            pending={data.pending_count}
          />
        </div>

        {/* Category revenue */}
        <div className="dash-card dash-card-wide">
          <h3 className="dash-card-title">Umsatz nach Kategorie</h3>
          {data.by_category.filter(c => c.revenue > 0).length === 0 ? (
            <p className="dash-empty">Noch keine Verkäufe</p>
          ) : (
            <BarChart
              data={data.by_category.filter(c => c.revenue > 0)}
              valueKey="revenue"
              labelKey="category"
              colorFn={i => COLORS[i % COLORS.length]}
              maxLabel
            />
          )}
        </div>
      </div>

      {/* Price histogram */}
      <PriceHistogram />

      {/* Second row */}
      <div className="dash-charts-row">
        {/* Price distribution */}
        <div className="dash-card">
          <h3 className="dash-card-title">Preisverteilung (alle Artikel)</h3>
          <BarChart
            data={data.price_ranges}
            valueKey="count"
            labelKey="label"
            colorFn={i => COLORS[i % COLORS.length]}
          />
        </div>

        {/* Top sellers */}
        <div className="dash-card dash-card-wide">
          <h3 className="dash-card-title">Top Verkäufer nach Umsatz</h3>
          {data.top_sellers.length === 0 ? (
            <p className="dash-empty">Noch keine Verkäufe</p>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Verkäufer</th>
                  <th>Artikel verk.</th>
                  <th>Umsatz</th>
                  <th>Auszahlung</th>
                </tr>
              </thead>
              <tbody>
                {data.top_sellers.map((s, i) => (
                  <tr key={i}>
                    <td className="dash-rank">{i + 1}</td>
                    <td><strong>#{s.number}</strong> {s.name}</td>
                    <td>{s.sold}</td>
                    <td>{s.revenue.toFixed(2)} €</td>
                    <td>{(s.revenue * 0.9).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
