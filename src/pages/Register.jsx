import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <main className="login-auth-card">
        <p className="login-auth-path">/auth</p>
        <h1 className="login-auth-title">Create Account</h1>
        {error && (
          <div className="login-flash-messages">
            <div className="login-flash-message login-flash-error">{error}</div>
          </div>
        )}
        <div className={`login-auth-form-wrapper ${submitting ? 'submitting' : ''}`}>
          <div className={`login-loading-indicator ${submitting ? 'visible' : ''}`} aria-hidden={!submitting}>
            <div className="login-loading-spinner" />
            <p className="login-loading-text">Creating account...</p>
            <div className="login-loading-progress">
              <div className="login-loading-progress-bar" />
            </div>
          </div>
          <form onSubmit={handleSubmit} className="login-auth-form">
            <div className="login-form-group">
              <label htmlFor="reg-username">Username</label>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                placeholder="At least 3 characters"
              />
            </div>
            <div className="login-form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
              />
            </div>
            <button type="submit" className="login-btn-primary" disabled={submitting}>
              Register
            </button>
          </form>
        </div>
        <p className="login-auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </main>
    </div>
  );
}
