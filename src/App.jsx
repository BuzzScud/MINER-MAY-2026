import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { PublicSettingsProvider } from './contexts/PublicSettingsContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Trading from './pages/Trading';
import Projection from './pages/Projection';
import Checklist from './pages/Checklist';
import Settings from './pages/Settings';
import EconomicCalendar from './pages/EconomicCalendar';
import BudgetTracker from './pages/BudgetTracker';
import Miner from './pages/Miner';
import { ApiMonitorView } from './features/api-monitor/ApiMonitorView';
import { SentimentView } from './features/sentiment/SentimentView';
import AdminRoute from './components/common/AdminRoute';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsersActivity from './pages/admin/AdminUsersActivity';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  },
});

function App() {
  // Detect base path from current location for subdirectory deployment
  // If deployed to /trading/, the basename will be /trading
  const getBasename = () => {
    if (typeof window === 'undefined') return '/';
    
    const path = window.location.pathname;
    const pathParts = path.split('/').filter(Boolean);
    
    // Explicit check for /trading subdirectory - must be first segment
    // This handles: /trading, /trading/, etc.
    if (pathParts.length > 0 && pathParts[0] === 'trading') {
      return '/trading';
    }
    
    // Also check the full path for exact matches
    if (path.startsWith('/trading')) {
      return '/trading';
    }
    
    // Auto-detect subdirectory: if path has multiple segments and first isn't a known route
    const knownRoutes = ['trading', 'projection', 'settings', 'calendar', 'dashboard', 'fib-stuff', 'budget-tracker', 'miner', 'api-monitor', 'trading-bot', 'sentiment', 'cme', 'checklist', 'login', 'register', 'admin'];
    
    // If first part is not a known route, it's likely a subdirectory
    if (pathParts.length > 0 && !knownRoutes.includes(pathParts[0]) && pathParts[0] !== 'index.html') {
      return `/${pathParts[0]}`;
    }
    
    // Default to root
    return '/';
  };

  const basename = getBasename();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}>
          <PublicSettingsProvider>
          <AuthProvider>
          <SettingsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsersActivity />} />
              <Route path="activity" element={<Navigate to="/admin/users?tab=activity" replace />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="trading" element={<Trading />} />
              <Route path="checklist" element={<Checklist />} />
              <Route path="projection" element={<Projection />} />
              <Route path="calendar" element={<EconomicCalendar />} />
              <Route path="fib-stuff" element={<Navigate to="/trading?tab=fib" replace />} />
              <Route path="budget-tracker" element={<BudgetTracker />} />
              <Route path="miner" element={<Miner />} />
              <Route path="api-monitor" element={<ApiMonitorView />} />
              <Route path="trading-bot" element={<Navigate to="/trading?tab=bot" replace />} />
              <Route path="sentiment" element={<ErrorBoundary><SentimentView /></ErrorBoundary>} />
              <Route path="cme" element={<Navigate to="/sentiment?tab=cme" replace />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </SettingsProvider>
          </AuthProvider>
          </PublicSettingsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
