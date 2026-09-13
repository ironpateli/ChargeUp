import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

const initialOwnerForm = {
  fullName: '',
  email: '',
  password: '',
  displayName: '',
  payoutAccountReference: ''
};

export function AdminPage({ user }) {
  const [ownerProfiles, setOwnerProfiles] = useState([]);
  const [allOwners, setAllOwners] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [allChargers, setAllChargers] = useState([]);
  const [ownerForm, setOwnerForm] = useState(initialOwnerForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingOwner, setCreatingOwner] = useState(false);

  async function loadAdminData() {
    setError('');
    setLoading(true);

    try {
      const [pendingOwnerData, ownerData, pendingChargerData, chargerData] = await Promise.all([
        apiRequest('/admin/owner-profiles/pending'),
        apiRequest('/admin/owner-profiles'),
        apiRequest('/admin/chargers/pending'),
        apiRequest('/admin/chargers')
      ]);
      setOwnerProfiles(pendingOwnerData.ownerProfiles);
      setAllOwners(ownerData.ownerProfiles);
      setChargers(pendingChargerData.chargers);
      setAllChargers(chargerData.chargers);
    } catch (err) {
      setError(err.message);
      setOwnerProfiles([]);
      setAllOwners([]);
      setChargers([]);
      setAllChargers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  async function updateOwnerProfile(ownerProfileId, action) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/admin/owner-profiles/${ownerProfileId}/${action}`, { method: 'PATCH' });
      setMessage(action === 'approve' ? 'Owner profile approved.' : 'Owner profile rejected.');
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createOwner(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setCreatingOwner(true);

    try {
      await apiRequest('/admin/owner-profiles', {
        method: 'POST',
        body: {
          ...ownerForm,
          payoutAccountReference: ownerForm.payoutAccountReference || undefined
        }
      });
      setOwnerForm(initialOwnerForm);
      setMessage('Owner account created and verified.');
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingOwner(false);
    }
  }

  async function updateOwnerAccess(ownerProfileId, action) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/admin/owner-profiles/${ownerProfileId}/${action}`, { method: 'PATCH' });
      setMessage(action === 'suspend' ? 'Owner access removed.' : 'Owner access restored.');
      await loadAdminData();
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
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateChargerStatus(chargerId, status) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/admin/chargers/${chargerId}/status`, {
        method: 'PATCH',
        body: { status }
      });
      setMessage(`Charger set to ${status}.`);
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <h1>Admin dashboard</h1>
          <p>Review owners, manage charger access, and keep the marketplace clean.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadAdminData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {user?.role !== 'ADMIN' && <div className="form-error">Admin role is required.</div>}
      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      <form className="form-card admin-owner-form" onSubmit={createOwner}>
        <h2>Add owner</h2>
        <p className="muted">Creates a verified owner account. Use a different email for each owner.</p>
        <div className="field-row">
          <label>
            Full name
            <input
              value={ownerForm.fullName}
              onChange={(event) => setOwnerForm({ ...ownerForm, fullName: event.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={ownerForm.email}
              onChange={(event) => setOwnerForm({ ...ownerForm, email: event.target.value })}
            />
          </label>
        </div>
        <div className="field-row">
          <label>
            Business name
            <input
              value={ownerForm.displayName}
              onChange={(event) => setOwnerForm({ ...ownerForm, displayName: event.target.value })}
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={ownerForm.password}
              onChange={(event) => setOwnerForm({ ...ownerForm, password: event.target.value })}
            />
          </label>
        </div>
        <label>
          Payout reference
          <input
            value={ownerForm.payoutAccountReference}
            onChange={(event) => setOwnerForm({ ...ownerForm, payoutAccountReference: event.target.value })}
          />
        </label>
        <button className="primary-button" type="submit" disabled={creatingOwner}>
          {creatingOwner ? 'Creating owner...' : 'Create verified owner'}
        </button>
      </form>

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
        <h2>All owners</h2>
        <table>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Business</th>
              <th>Chargers</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allOwners.map((ownerProfile) => (
              <tr key={ownerProfile.id}>
                <td>
                  {ownerProfile.fullName}
                  <br />
                  <span className="muted">{ownerProfile.email}</span>
                </td>
                <td>{ownerProfile.displayName}</td>
                <td>
                  {ownerProfile.activeChargerCount} active
                  <br />
                  <span className="muted">{ownerProfile.chargerCount} total</span>
                </td>
                <td><span className="status-pill">{ownerProfile.verificationStatus}</span></td>
                <td className="action-cell">
                  {ownerProfile.verificationStatus !== 'SUSPENDED' ? (
                    <button className="danger-button" type="button" onClick={() => updateOwnerAccess(ownerProfile.id, 'suspend')}>
                      Remove access
                    </button>
                  ) : (
                    <button className="primary-button" type="button" onClick={() => updateOwnerAccess(ownerProfile.id, 'restore')}>
                      Restore owner
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!allOwners.length && <tr><td colSpan="5">No owner profiles yet.</td></tr>}
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

      <div className="table-card">
        <h2>All chargers</h2>
        <table>
          <thead>
            <tr>
              <th>Charger</th>
              <th>Owner</th>
              <th>Location</th>
              <th>Pricing</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allChargers.map((charger) => (
              <tr key={charger.id}>
                <td>
                  {charger.name}
                  <br />
                  <span className="muted">{charger.powerKw} kW</span>
                </td>
                <td>
                  {charger.ownerName}
                  <br />
                  <span className="muted">{charger.ownerEmail}</span>
                </td>
                <td>{charger.city}, {charger.state}</td>
                <td>Rs. {charger.pricePerHour}/hr</td>
                <td><span className="status-pill">{charger.status}</span></td>
                <td className="action-cell">
                  {charger.status !== 'ACTIVE' && (
                    <button className="primary-button" type="button" onClick={() => updateChargerStatus(charger.id, 'ACTIVE')}>
                      Activate
                    </button>
                  )}
                  {charger.status !== 'INACTIVE' && (
                    <button className="secondary-button" type="button" onClick={() => updateChargerStatus(charger.id, 'INACTIVE')}>
                      Deactivate
                    </button>
                  )}
                  {charger.status !== 'SUSPENDED' && (
                    <button className="danger-button" type="button" onClick={() => updateChargerStatus(charger.id, 'SUSPENDED')}>
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!allChargers.length && <tr><td colSpan="6">No chargers listed yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
