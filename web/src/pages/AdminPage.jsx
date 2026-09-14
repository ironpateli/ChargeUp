import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';

const initialOwnerForm = {
  fullName: '',
  email: '',
  password: '',
  displayName: '',
  payoutAccountReference: ''
};

const initialListControls = {
  search: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'newest'
};

function normalizeSearchValue(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looselyMatches(value, query) {
  const source = normalizeSearchValue(value);
  const target = normalizeSearchValue(query);

  if (!target) return true;
  if (source.includes(target)) return true;

  const targetWords = target.split(' ').filter(Boolean);
  if (targetWords.every((word) => source.includes(word))) return true;

  let sourceIndex = 0;
  for (const letter of target.replace(/\s/g, '')) {
    sourceIndex = source.indexOf(letter, sourceIndex);
    if (sourceIndex === -1) return false;
    sourceIndex += 1;
  }

  return true;
}

function isWithinDateRange(createdAt, dateFrom, dateTo) {
  const createdDate = new Date(createdAt);

  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`);
    if (createdDate < from) return false;
  }

  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`);
    if (createdDate > to) return false;
  }

  return true;
}

function compareText(first, second) {
  return String(first ?? '').localeCompare(String(second ?? ''), undefined, { sensitivity: 'base' });
}

function sortAdminRows(rows, sortBy, getName) {
  return [...rows].sort((first, second) => {
    if (sortBy === 'oldest') {
      return new Date(first.createdAt) - new Date(second.createdAt);
    }

    if (sortBy === 'name') {
      return compareText(getName(first), getName(second));
    }

    if (sortBy === 'status') {
      return compareText(first.verificationStatus ?? first.status, second.verificationStatus ?? second.status);
    }

    return new Date(second.createdAt) - new Date(first.createdAt);
  });
}

function filterOwnerRows(rows, controls) {
  return sortAdminRows(
    rows.filter((ownerProfile) => {
      const searchable = [
        ownerProfile.fullName,
        ownerProfile.email,
        ownerProfile.displayName,
        ownerProfile.verificationStatus,
        ownerProfile.chargerCount,
        ownerProfile.activeChargerCount
      ].join(' ');

      return looselyMatches(searchable, controls.search)
        && (!controls.status || ownerProfile.verificationStatus === controls.status)
        && isWithinDateRange(ownerProfile.createdAt, controls.dateFrom, controls.dateTo);
    }),
    controls.sortBy,
    (ownerProfile) => ownerProfile.fullName
  );
}

function filterChargerRows(rows, controls) {
  return sortAdminRows(
    rows.filter((charger) => {
      const searchable = [
        charger.name,
        charger.ownerName,
        charger.ownerEmail,
        charger.addressLine1,
        charger.city,
        charger.state,
        charger.status,
        charger.powerKw,
        charger.pricePerHour
      ].join(' ');

      return looselyMatches(searchable, controls.search)
        && (!controls.status || charger.status === controls.status)
        && isWithinDateRange(charger.createdAt, controls.dateFrom, controls.dateTo);
    }),
    controls.sortBy,
    (charger) => charger.name
  );
}

function AdminListControls({ controls, onChange, statusOptions, searchPlaceholder }) {
  return (
    <div className="admin-list-controls">
      <label>
        Search
        <input
          placeholder={searchPlaceholder}
          value={controls.search}
          onChange={(event) => onChange({ ...controls, search: event.target.value })}
        />
      </label>
      <label>
        Status
        <select value={controls.status} onChange={(event) => onChange({ ...controls, status: event.target.value })}>
          <option value="">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </label>
      <label>
        From
        <input type="date" value={controls.dateFrom} onChange={(event) => onChange({ ...controls, dateFrom: event.target.value })} />
      </label>
      <label>
        To
        <input type="date" value={controls.dateTo} onChange={(event) => onChange({ ...controls, dateTo: event.target.value })} />
      </label>
      <label>
        Sort
        <select value={controls.sortBy} onChange={(event) => onChange({ ...controls, sortBy: event.target.value })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A-Z</option>
          <option value="status">Status A-Z</option>
        </select>
      </label>
    </div>
  );
}

export function AdminPage({ user }) {
  const [ownerProfiles, setOwnerProfiles] = useState([]);
  const [allOwners, setAllOwners] = useState([]);
  const [allChargers, setAllChargers] = useState([]);
  const [ownerForm, setOwnerForm] = useState(initialOwnerForm);
  const [pendingOwnerControls, setPendingOwnerControls] = useState({ ...initialListControls, status: 'PENDING_VERIFICATION' });
  const [ownerControls, setOwnerControls] = useState(initialListControls);
  const [chargerControls, setChargerControls] = useState(initialListControls);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingOwner, setCreatingOwner] = useState(false);

  const filteredPendingOwners = useMemo(
    () => filterOwnerRows(ownerProfiles, pendingOwnerControls),
    [ownerProfiles, pendingOwnerControls]
  );
  const filteredOwners = useMemo(
    () => filterOwnerRows(allOwners, ownerControls),
    [allOwners, ownerControls]
  );
  const filteredChargers = useMemo(
    () => filterChargerRows(allChargers, chargerControls),
    [allChargers, chargerControls]
  );

  async function loadAdminData() {
    setError('');
    setLoading(true);

    try {
      const [pendingOwnerData, ownerData, chargerData] = await Promise.all([
        apiRequest('/admin/owner-profiles/pending'),
        apiRequest('/admin/owner-profiles'),
        apiRequest('/admin/chargers')
      ]);
      setOwnerProfiles(pendingOwnerData.ownerProfiles);
      setAllOwners(ownerData.ownerProfiles);
      setAllChargers(chargerData.chargers);
    } catch (err) {
      setError(err.message);
      setOwnerProfiles([]);
      setAllOwners([]);
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
            <input value={ownerForm.fullName} onChange={(event) => setOwnerForm({ ...ownerForm, fullName: event.target.value })} />
          </label>
          <label>
            Email
            <input type="email" value={ownerForm.email} onChange={(event) => setOwnerForm({ ...ownerForm, email: event.target.value })} />
          </label>
        </div>
        <div className="field-row">
          <label>
            Business name
            <input value={ownerForm.displayName} onChange={(event) => setOwnerForm({ ...ownerForm, displayName: event.target.value })} />
          </label>
          <label>
            Temporary password
            <input type="password" value={ownerForm.password} onChange={(event) => setOwnerForm({ ...ownerForm, password: event.target.value })} />
          </label>
        </div>
        <label>
          Payout reference
          <input value={ownerForm.payoutAccountReference} onChange={(event) => setOwnerForm({ ...ownerForm, payoutAccountReference: event.target.value })} />
        </label>
        <button className="primary-button" type="submit" disabled={creatingOwner}>
          {creatingOwner ? 'Creating owner...' : 'Create verified owner'}
        </button>
      </form>

      <div className="admin-lists-grid">
        <div className="table-card admin-list-card">
          <div className="section-heading-row">
            <div>
              <h2>Pending owner requests</h2>
              <p>{filteredPendingOwners.length} of {ownerProfiles.length} shown</p>
            </div>
          </div>
          <AdminListControls
            controls={pendingOwnerControls}
            onChange={setPendingOwnerControls}
            statusOptions={['PENDING_VERIFICATION', 'REJECTED', 'SUSPENDED', 'VERIFIED']}
            searchPlaceholder="Owner, email, business"
          />
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Business</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredPendingOwners.map((ownerProfile) => (
                  <tr key={ownerProfile.id}>
                    <td>
                      {ownerProfile.fullName}
                      <br />
                      <span className="muted">{ownerProfile.email}</span>
                    </td>
                    <td>{ownerProfile.displayName}</td>
                    <td>{new Date(ownerProfile.createdAt).toLocaleDateString()}</td>
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
                {!filteredPendingOwners.length && <tr><td colSpan="5">No matching owner requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-card admin-list-card">
          <div className="section-heading-row">
            <div>
              <h2>All owners</h2>
              <p>{filteredOwners.length} of {allOwners.length} shown</p>
            </div>
          </div>
          <AdminListControls
            controls={ownerControls}
            onChange={setOwnerControls}
            statusOptions={['VERIFIED', 'PENDING_VERIFICATION', 'REJECTED', 'SUSPENDED']}
            searchPlaceholder="Owner, email, business"
          />
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Business</th>
                  <th>Chargers</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredOwners.map((ownerProfile) => (
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
                    <td>{new Date(ownerProfile.createdAt).toLocaleDateString()}</td>
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
                {!filteredOwners.length && <tr><td colSpan="6">No matching owners.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-card admin-list-card admin-list-card-wide">
          <div className="section-heading-row">
            <div>
              <h2>All chargers</h2>
              <p>{filteredChargers.length} of {allChargers.length} shown</p>
            </div>
          </div>
          <AdminListControls
            controls={chargerControls}
            onChange={setChargerControls}
            statusOptions={['PENDING_VERIFICATION', 'ACTIVE', 'INACTIVE', 'SUSPENDED']}
            searchPlaceholder="Charger, owner, city, price"
          />
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Charger</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th>Pricing</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredChargers.map((charger) => (
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
                    <td>{new Date(charger.createdAt).toLocaleDateString()}</td>
                    <td><span className="status-pill">{charger.status}</span></td>
                    <td className="action-cell">
                      {charger.status === 'PENDING_VERIFICATION' && (
                        <button className="primary-button" type="button" onClick={() => verify(charger.id)}>
                          Verify
                        </button>
                      )}
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
                {!filteredChargers.length && <tr><td colSpan="7">No matching chargers.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
