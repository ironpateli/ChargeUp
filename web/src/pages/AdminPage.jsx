import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

export function AdminPage({ user }) {
  const [ownerProfiles, setOwnerProfiles] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadPending() {
    setError('');
    setLoading(true);

    try {
      const ownerProfileData = await apiRequest('/admin/owner-profiles/pending');
      const data = await apiRequest('/admin/chargers/pending');
      setOwnerProfiles(ownerProfileData.ownerProfiles);
      setChargers(data.chargers);
    } catch (err) {
      setError(err.message);
      setOwnerProfiles([]);
      setChargers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function updateOwnerProfile(ownerProfileId, action) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/admin/owner-profiles/${ownerProfileId}/${action}`, { method: 'PATCH' });
      setMessage(action === 'approve' ? 'Owner profile approved.' : 'Owner profile rejected.');
      await loadPending();
    } catch (err) {
      setError(err.message);
    }
  }

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
          <p>Review owner requests and pending charger listings.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPending} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {user?.role !== 'ADMIN' && <div className="form-error">Admin role is required.</div>}
      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      <div className="table-card">
        <h2>Pending owner requests</h2>
        <table>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Business</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ownerProfiles.map((ownerProfile) => (
              <tr key={ownerProfile.id}>
                <td>
                  {ownerProfile.fullName}
                  <br />
                  <span className="muted">{ownerProfile.email}</span>
                </td>
                <td>{ownerProfile.displayName}</td>
                <td><span className="status-pill">{ownerProfile.verificationStatus}</span></td>
                <td className="action-cell">
                  <button className="primary-button" type="button" onClick={() => updateOwnerProfile(ownerProfile.id, 'approve')}>
                    Approve
                  </button>
                  <button className="danger-button" type="button" onClick={() => updateOwnerProfile(ownerProfile.id, 'reject')}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
            {!ownerProfiles.length && <tr><td colSpan="4">No pending owner requests.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <h2>Pending chargers</h2>
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
