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
import Miner from './pages/Miner';
import Checklist from './pages/Checklist';
import { ApiMonitorView } from './features/api-monitor/ApiMonitorView';
import { AppModalsProvider } from './contexts/AppModalsContext';
import { SettingsModalOpener, AdminModalOpener } from './components/common/ModalRouteOpener';

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
    
    // Auto-detect subdirectory: if first segment isn't a known app route,
    // treat it as a deployment subdirectory (e.g. /trading/ on production).
    const knownRoutes = ['trading', 'settings', 'dashboard', 'fib-stuff', 'miner', 'api-monitor', 'trading-bot', 'checklist', 'login', 'register', 'admin'];
    
    if (pathParts.length > 0 && !knownRoutes.includes(pathParts[0]) && pathParts[0] !== 'index.html') {
      return `/${pathParts[0]}`;
    }
    
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
          <AppModalsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="trading" element={<Trading />} />
              <Route path="checklist" element={<Checklist />} />
              <Route path="fib-stuff" element={<Navigate to="/trading?tab=fib" replace />} />
              <Route path="miner" element={<Miner />} />
              <Route path="api-monitor" element={<ApiMonitorView />} />
              <Route path="trading-bot" element={<Navigate to="/trading?tab=bot" replace />} />
              <Route path="settings" element={<SettingsModalOpener />} />
              <Route path="admin/*" element={<AdminModalOpener />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </AppModalsProvider>
          </SettingsProvider>
          </AuthProvider>
          </PublicSettingsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
