import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BatteryCharging, LogIn } from 'lucide-react';
import { apiRequest } from '../api.js';

export function LoginPage({ onAuth, demoAccounts }) {
  const [form, setForm] = useState({
    email: 'user@chargeup.test',
    password: 'StrongPass123'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loginWith(credentials) {
    setError('');
    setLoading(true);

    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: credentials
      });
      onAuth(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    loginWith(form);
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark"><BatteryCharging size={24} /></span>
          <span>ChargeUp</span>
        </div>

        <h1>Find and book EV charging in Mumbai.</h1>
        <p>Use a demo account or sign in with your own local backend account.</p>

        <div className="demo-grid">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              className="secondary-button"
              type="button"
              onClick={() => loginWith(account)}
              disabled={loading}
            >
              Login as {account.label}
            </button>
          ))}
        </div>
      </section>

      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={loading}>
          <LogIn size={17} />
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="muted">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
