import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import useDeviceType from './hooks/useDeviceType';
import './App.css';

// Lazy load all components for code-splitting (reduces initial bundle size)
const LoginPage = lazy(() => import('./components/LoginPage'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const InventoryHub = lazy(() => import('./components/InventoryHub'));
const SellerList = lazy(() => import('./components/SellerList'));
const SellerForm = lazy(() => import('./components/SellerForm'));
const SellerItemsView = lazy(() => import('./components/SellerItemsView'));
const ItemList = lazy(() => import('./components/ItemList'));
const ItemForm = lazy(() => import('./components/ItemForm'));
const Checkout = lazy(() => import('./components/Checkout'));
const Payout = lazy(() => import('./components/Payout'));
const ReturnCheck = lazy(() => import('./components/ReturnCheck'));
const ReturnCheckPrintList = lazy(() => import('./components/ReturnCheckPrintList'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const Dashboard = lazy(() => import('./components/Dashboard'));

// Konami Code Easter Egg
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

function KonamiEasterEgg() {
  const [active, setActive] = useState(false);
  const [flakes, setFlakes] = useState([]);
  const progress = useState([])[0];
  const progressRef = { current: [] };

  useEffect(() => {
    const handleKey = (e) => {
      progressRef.current = [...progressRef.current, e.key];
      if (progressRef.current.length > KONAMI.length) {
        progressRef.current = progressRef.current.slice(-KONAMI.length);
      }
      if (progressRef.current.join(',') === KONAMI.join(',')) {
        progressRef.current = [];
        triggerSnow();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const triggerSnow = () => {
    const newFlakes = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 0.8 + Math.random() * 1.4,
      emoji: Math.random() > 0.7 ? '⛷' : '❄️',
    }));
    setFlakes(newFlakes);
    setActive(true);
    setTimeout(() => { setActive(false); setFlakes([]); }, 5000);
  };

  if (!active) return null;

  return (
    <div className="konami-overlay">
      {flakes.map(f => (
        <span
          key={f.id}
          className="konami-flake"
          style={{
            left: `${f.left}%`,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.duration}s`,
            fontSize: `${f.size}rem`,
          }}
        >
          {f.emoji}
        </span>
      ))}
      <div className="konami-message">⛷ KONAMI CODE! ⛷</div>
    </div>
  );
}

// Loading fallback component
const LoadingSpinner = () => (
  <div className="loading-spinner">
    <div className="spinner"></div>
    <p>Laden...</p>
  </div>
);

// Mobile bottom navigation for reporter role
function MobileNavReporter({ logout }) {
  return (
    <nav className="mobile-nav">
      <NavLink to="/return-check" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
        <span className="mobile-nav-icon">✅</span>
        <span className="mobile-nav-label">Rückmeldung</span>
      </NavLink>
      <button onClick={logout} className="mobile-nav-item mobile-nav-btn">
        <span className="mobile-nav-icon">🚪</span>
        <span className="mobile-nav-label">Abmelden</span>
      </button>
    </nav>
  );
}

// Mobile bottom navigation for regular/admin users
function MobileNavMain({ isAdmin, logout }) {
  return (
    <nav className="mobile-nav">
      <NavLink to="/inventory" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
        <span className="mobile-nav-icon">🎿</span>
        <span className="mobile-nav-label">Artikel</span>
      </NavLink>
      <NavLink to="/checkout" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
        <span className="mobile-nav-icon">💸</span>
        <span className="mobile-nav-label">Kasse</span>
      </NavLink>
      <NavLink to="/return-check" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
        <span className="mobile-nav-icon">✅</span>
        <span className="mobile-nav-label">Rückm.</span>
      </NavLink>
      <NavLink to="/payout" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
        <span className="mobile-nav-icon">💰</span>
        <span className="mobile-nav-label">Auszahl.</span>
      </NavLink>
      {isAdmin && (
        <NavLink to="/users" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
          <span className="mobile-nav-icon">👥</span>
          <span className="mobile-nav-label">Nutzer</span>
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/return-check-print" className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-active' : ''}`}>
          <span className="mobile-nav-icon">🖨️</span>
          <span className="mobile-nav-label">Drucken</span>
        </NavLink>
      )}
      <button onClick={logout} className="mobile-nav-item mobile-nav-btn">
        <span className="mobile-nav-icon">🚪</span>
        <span className="mobile-nav-label">Abmeld.</span>
      </button>
    </nav>
  );
}

function AppContent() {
  const { user, loading, logout } = useAuth();
  // Easter egg — always mounted so keydown listener is active
  const isMobile = useDeviceType();

  if (loading) {
    return (
      <div className="login-page">
        <div className="loading">Laden...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <KonamiEasterEgg />
        <Suspense fallback={<LoadingSpinner />}>
          <LoginPage />
        </Suspense>
      </>
    );
  }

  const isAdmin = user.role === 'admin';
  const isReporter = user.role === 'reporter';
  const deviceClass = isMobile ? 'app-mobile' : 'app-desktop';

  // Reporter can only see ReturnCheck
  if (isReporter) {
    return (
      <Router>
        <KonamiEasterEgg />
        <div className={`app ${deviceClass}`}>
          <header className="app-header">
            <div className="header-content">
              <Link to="/" style={{ textDecoration: 'none' }}>
                <h1 className="logo">
                  <img src="/SCR_Logo_2019_RGB.svg" alt="Ski Club Renningen" className="logo-img" />
                  {!isMobile && <span className="logo-club">Ski Club</span>}
                  Skibörse{!isMobile && <span className="logo-accent"> Renningen</span>}
                </h1>
              </Link>
              {!isMobile && (
                <nav className="main-nav">
                  <Link to="/return-check" className="nav-link">Artikelrückmeldung</Link>
                  <button onClick={logout} className="nav-link logout-btn">
                    Abmelden ({user.username})
                  </button>
                </nav>
              )}
              {isMobile && (
                <span className="mobile-user-badge">{user.username}</span>
              )}
            </div>
          </header>

          <main className="app-main">
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<ReturnCheck />} />
                <Route path="/return-check" element={<ReturnCheck />} />
                <Route path="*" element={<ReturnCheck />} />
              </Routes>
            </Suspense>
          </main>

          {isMobile && <MobileNavReporter logout={logout} />}

          {!isMobile && (
            <footer className="app-footer">
              <p>Skibörse Renningen - Created with 🩵 by Julian & Claude</p>
            </footer>
          )}
        </div>
      </Router>
    );
  }

  return (
    <Router>
      <KonamiEasterEgg />
      <div className={`app ${deviceClass}`}>
        <header className="app-header">
          <div className="header-content">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <h1 className="logo">
                <span className="logo-icon">⛷</span>
                {!isMobile && <span className="logo-club">Ski Club</span>}
                Skibörse{!isMobile && <span className="logo-accent"> Renningen</span>}
              </h1>
            </Link>
            {!isMobile && (
              <nav className="main-nav">
                <Link to="/inventory" className="nav-link">Verkäufer/Artikel</Link>
                <Link to="/checkout" className="nav-link">Verkaufsmaske</Link>
                <Link to="/return-check" className="nav-link">Artikelrückmeldung</Link>
                <Link to="/payout" className="nav-link">Artikelrückgabe</Link>
                {isAdmin && (
                  <Link to="/users" className="nav-link">Benutzerverwaltung</Link>
                )}
                {isAdmin && (
                  <Link to="/return-check-print" className="nav-link">Drucklisten</Link>
                )}
                <button onClick={logout} className="nav-link logout-btn">
                  Abmelden ({user.username})
                </button>
              </nav>
            )}
            {isMobile && (
              <span className="mobile-user-badge">{user.username}</span>
            )}
          </div>
        </header>

        <main className="app-main">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Landing page */}
              <Route path="/" element={<LandingPage />} />

              {/* Inventory management */}
              <Route path="/inventory" element={<InventoryHub />} />
              <Route path="/inventory/sellers" element={<SellerList />} />
              <Route path="/inventory/sellers/new" element={<SellerForm />} />
              <Route path="/inventory/sellers/:id/edit" element={<SellerForm />} />
              <Route path="/inventory/sellers/:id" element={<SellerItemsView />} />
              <Route path="/inventory/items" element={<ItemList />} />
              <Route path="/inventory/items/new" element={<ItemForm />} />
              <Route path="/inventory/items/:id/edit" element={<ItemForm />} />

              {/* Checkout/Sales */}
              <Route path="/checkout" element={<Checkout />} />

              {/* Return Check */}
              <Route path="/return-check" element={<ReturnCheck />} />

              {/* Payout/Settlement */}
              <Route path="/payout" element={<Payout />} />

              {/* Dashboard/Analytics (Admin only) */}
              {isAdmin && (
                <Route path="/inventory/dashboard" element={<Dashboard />} />
              )}

              {/* User Management (Admin only) */}
              {isAdmin && (
                <Route path="/users" element={<UserManagement />} />
              )}

              {/* Print Lists (Admin only) */}
              {isAdmin && (
                <Route path="/return-check-print" element={<ReturnCheckPrintList />} />
              )}
            </Routes>
          </Suspense>
        </main>

        {isMobile && <MobileNavMain isAdmin={isAdmin} logout={logout} />}

        {!isMobile && (
          <footer className="app-footer">
            <p>Skibörse Renningen - Created with 🩵 by Julian & Claude</p>
          </footer>
        )}
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
