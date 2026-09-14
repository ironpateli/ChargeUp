import React, { useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate
} from 'react-router-dom';
import {
  BatteryCharging,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  MapPinned,
  ShieldCheck,
  UserCircle,
  Warehouse
} from 'lucide-react';
import {
  apiRequest,
  clearToken,
  demoAccounts,
  getToken,
  setToken
} from './api.js';
import { MapPage } from './pages/MapPage.jsx';
import { BookingsPage } from './pages/BookingsPage.jsx';
import { OwnerPage } from './pages/OwnerPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { StationPage } from './pages/StationPage.jsx';

function AppShell({ user, onLogout, refreshUser }) {
  const navItems = useMemo(() => ([
    { to: '/map', label: 'Map', icon: MapPinned },
    { to: '/bookings', label: 'My Bookings', icon: CalendarClock },
    ...(user?.role !== 'ADMIN' ? [{ to: '/owner', label: 'Owner', icon: Warehouse }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : [])
  ]), [user?.role]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/map">
          <span className="brand-mark"><BatteryCharging size={22} /></span>
          <span>ChargeUp</span>
        </Link>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="nav-link">
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="user-card">
          <UserCircle size={28} />
          <div>
            <strong>{user?.fullName ?? 'Guest'}</strong>
            <span>{user?.role ?? 'Signed out'}</span>
          </div>
        </div>

        <button className="ghost-button" type="button" onClick={onLogout}>
          <LogOut size={17} />
          Logout
        </button>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/map" element={<MapPage />} />
          <Route path="/stations/:chargerId" element={<StationPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/owner" element={user?.role === 'ADMIN' ? <Navigate to="/admin" replace /> : <OwnerPage user={user} refreshUser={refreshUser} />} />
          <Route path="/admin" element={<AdminPage user={user} />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AppRoutes() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const navigate = useNavigate();

  async function refreshUser() {
    const data = await apiRequest('/auth/me');
    setUser(data.user);
    return data.user;
  }

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    refreshUser()
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleAuth(result) {
    setToken(result.accessToken);
    setUser(result.user);
    navigate('/map');
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate('/login');
  }

  if (loading) {
    return <div className="loading-screen">Loading ChargeUp...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/map" replace /> : <LoginPage onAuth={handleAuth} demoAccounts={demoAccounts} />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/map" replace /> : <RegisterPage onAuth={handleAuth} />}
      />
      <Route
        path="/*"
        element={
          user
            ? <AppShell user={user} onLogout={handleLogout} refreshUser={refreshUser} />
            : <Navigate to="/login" replace />
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
