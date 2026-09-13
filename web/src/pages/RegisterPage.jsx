import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api.js';

export function RegisterPage({ onAuth }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await apiRequest('/auth/register', {
        method: 'POST',
        body: form
      });
      onAuth(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <h1>Create a ChargeUp account.</h1>
        <p>Book nearby chargers, manage your slots, and upgrade into an owner profile when you are ready.</p>
      </section>

      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Register</h2>
        <label>
          Full name
          <input
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
        </label>
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
          {loading ? 'Creating...' : 'Create account'}
        </button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
