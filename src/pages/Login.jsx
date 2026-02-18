import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password.trim());
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <main className="login-auth-card">
        <p className="login-auth-path">/auth</p>
        <h1 className="login-auth-title">Secure Login</h1>
        {error && (
          <div className="login-flash-messages">
            <div className="login-flash-message login-flash-error">{error}</div>
          </div>
        )}
        <div className={`login-auth-form-wrapper ${submitting ? 'submitting' : ''}`}>
          <div className={`login-loading-indicator ${submitting ? 'visible' : ''}`} aria-hidden={!submitting}>
            <div className="login-loading-spinner" />
            <p className="login-loading-text">Logging in...</p>
            <div className="login-loading-progress">
              <div className="login-loading-progress-bar" />
            </div>
          </div>
          <form onSubmit={handleSubmit} className="login-auth-form">
            <div className="login-form-group">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Enter username"
              />
            </div>
            <div className="login-form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Enter password"
              />
            </div>
            <button type="submit" className="login-btn-primary" disabled={submitting}>
              Login
            </button>
          </form>
        </div>
        <p className="login-auth-switch">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </main>
    </div>
  );
}
