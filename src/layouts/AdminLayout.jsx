import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/admin', end: true, label: 'Overview' },
  { to: '/admin/users', end: false, label: 'Users & Activity' },
];

function Breadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/admin';
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab');
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = [{ label: 'Admin', to: '/admin' }];
  if (segments[1] === 'users') {
    crumbs.push({ label: 'Users & Activity', to: '/admin/users' });
    if (tab === 'activity') crumbs.push({ label: 'Activity', to: null });
    else crumbs.push({ label: 'Users', to: null });
  } else {
    crumbs.push({ label: 'Overview', to: null });
  }
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
      {crumbs.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1">›</span>}
          {c.to ? <Link to={c.to} className="hover:text-gray-300">{c.label}</Link> : <span className="text-gray-400">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sessionStartedAt] = useState(() => new Date());

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <aside className="w-[220px] min-w-[220px] flex flex-col shrink-0 bg-[#121212] border-r border-white/10 z-50">
        <div className="p-6 border-b border-white/10">
          <span className="text-xl font-bold text-gray-100">Admin</span>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto min-h-0">
          {nav.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `block px-6 py-3 text-sm text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-colors ${
                  isActive ? 'text-sky-400 bg-white/5' : ''
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 shrink-0">
          <p className="px-6 py-2 text-xs text-gray-500" title={sessionStartedAt.toISOString()}>
            Session started at {sessionStartedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <Link
            to="/"
            className="block py-3 px-6 text-sm text-gray-500 hover:text-sky-400 transition-colors"
          >
            Back to App
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full text-left py-3 px-6 text-sm text-gray-500 hover:text-sky-400 transition-colors"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center p-6 sm:p-8">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col space-y-6">
          <Breadcrumbs />
          <div className="w-full min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
