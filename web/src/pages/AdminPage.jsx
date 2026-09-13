import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

export function AdminPage({ user }) {
  const [chargers, setChargers] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadPending() {
    setError('');

    try {
      const data = await apiRequest('/admin/chargers/pending');
      setChargers(data.chargers);
    } catch (err) {
      setError(err.message);
      setChargers([]);
    }
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function verify(chargerId) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/admin/chargers/${chargerId}/verify`, { method: 'PATCH' });
      setMessage('Charger verified.');
      await loadPending();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <h1>Admin dashboard</h1>
          <p>Verify pending charger listings.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPending}>Refresh</button>
      </div>

      {user?.role !== 'ADMIN' && <div className="form-error">Admin role is required.</div>}
      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Charger</th>
              <th>Location</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargers.map((charger) => (
              <tr key={charger.id}>
                <td>{charger.name}</td>
                <td>{charger.city}, {charger.state}</td>
                <td><span className="status-pill">{charger.status}</span></td>
                <td>
                  <button className="primary-button" type="button" onClick={() => verify(charger.id)}>
                    Verify
                  </button>
                </td>
              </tr>
            ))}
            {!chargers.length && <tr><td colSpan="4">No pending chargers.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
