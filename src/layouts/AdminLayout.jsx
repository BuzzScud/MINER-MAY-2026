import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/admin', end: true, label: 'Dashboard' },
  { to: '/admin/users', end: false, label: 'Users' },
  { to: '/admin/activity', end: false, label: 'Activity' },
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <aside className="w-[220px] min-w-[220px] flex flex-col fixed top-0 left-0 h-full bg-[#121212] border-r border-white/10 z-50">
        <div className="p-6 border-b border-white/10">
          <span className="text-xl font-bold text-gray-100">Admin</span>
        </div>
        <nav className="flex-1 py-4">
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
        <div className="p-4 border-t border-white/10">
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
      <main className="flex-1 ml-[220px] min-h-screen p-8">
        <div className="w-full max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
