import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

const weekDays = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const initialChargerForm = {
  name: '',
  addressLine1: '',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: '',
  country: 'India',
  latitude: 19.076,
  longitude: 72.8777,
  connectorTypes: ['CCS2'],
  powerKw: 22,
  pricePerHour: 150,
  chargerCount: 1
};

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function defaultAvailabilityRules() {
  return weekDays.map((day) => ({
    dayOfWeek: day.value,
    startsAt: '06:00',
    endsAt: '22:00',
    slotMinutes: 60,
    isActive: true
  }));
}

function formatSlotTime(slot) {
  return `${new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(slot.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function OwnerPage({ user, refreshUser }) {
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [chargers, setChargers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState(initialChargerForm);
  const [profileName, setProfileName] = useState('My Charging Business');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedChargerId, setSelectedChargerId] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState(toDateInputValue());
  const [availabilityRules, setAvailabilityRules] = useState(defaultAvailabilityRules);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const isApprovedOwner = ownerProfile?.verificationStatus === 'VERIFIED' && user?.role === 'CHARGER_OWNER';

  async function loadOwnerData() {
    setError('');
    setLoading(true);

    try {
      const profile = await apiRequest('/owner-profiles/me');
      setOwnerProfile(profile.ownerProfile);
    } catch {
      setOwnerProfile(null);
    }

    try {
      const chargerData = await apiRequest('/owner/chargers');
      setChargers(chargerData.chargers);
      setSelectedChargerId((current) => current || String(chargerData.chargers[0]?.id ?? ''));
      const bookingData = await apiRequest('/owner/bookings');
      setBookings(bookingData.bookings);
    } catch {
      setChargers([]);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOwnerData();
  }, []);

  async function createOwnerProfile(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await apiRequest('/owner-profiles', {
        method: 'POST',
        body: { displayName: profileName }
      });
      setOwnerProfile(data.ownerProfile);
      await refreshUser();
      setMessage('Owner request submitted. An admin must approve it before you can list chargers.');
      await loadOwnerData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createCharger(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiRequest('/chargers', {
        method: 'POST',
        body: {
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          powerKw: Number(form.powerKw),
          pricePerHour: Number(form.pricePerHour),
          chargerCount: Number(form.chargerCount)
        }
      });
      setMessage('Charger created and sent for verification.');
      setForm(initialChargerForm);
      await loadOwnerData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateStatus(chargerId, status) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/chargers/${chargerId}/status`, {
        method: 'PATCH',
        body: { status }
      });
      setMessage('Charger status updated.');
      await loadOwnerData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAvailabilityManager(chargerId = selectedChargerId, date = availabilityDate) {
    if (!chargerId) return;

    setAvailabilityLoading(true);
    setError('');

    try {
      const [settings, availability] = await Promise.all([
        apiRequest(`/chargers/${chargerId}/availability-settings?date=${date}`),
        apiRequest(`/chargers/${chargerId}/availability?date=${date}`)
      ]);
      const rulesByDay = new Map((settings.rules ?? []).map((rule) => [rule.dayOfWeek, rule]));
      const mergedRules = defaultAvailabilityRules().map((rule) => rulesByDay.get(rule.dayOfWeek) ?? rule);

      setAvailabilityRules(mergedRules);
      setAvailabilitySlots(availability.slots ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  useEffect(() => {
    if (isApprovedOwner && selectedChargerId) {
      loadAvailabilityManager(selectedChargerId, availabilityDate);
    }
  }, [isApprovedOwner, selectedChargerId, availabilityDate]);

  function updateAvailabilityRule(dayOfWeek, changes) {
    setAvailabilityRules((rules) => rules.map((rule) => (
      rule.dayOfWeek === dayOfWeek ? { ...rule, ...changes } : rule
    )));
  }

  async function saveAvailabilityRules(event) {
    event.preventDefault();
    if (!selectedChargerId) return;

    setError('');
    setMessage('');
    setAvailabilityLoading(true);

    try {
      await apiRequest(`/chargers/${selectedChargerId}/availability-rules`, {
        method: 'PUT',
        body: { rules: availabilityRules }
      });
      setMessage('Availability rules saved.');
      await loadAvailabilityManager(selectedChargerId, availabilityDate);
    } catch (err) {
      setError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function disableSlot(slot) {
    if (!selectedChargerId) return;

    setError('');
    setMessage('');
    setAvailabilityLoading(true);

    try {
      await apiRequest(`/chargers/${selectedChargerId}/availability-overrides`, {
        method: 'PUT',
        body: {
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          status: 'UNAVAILABLE',
          reason: 'Owner disabled slot'
        }
      });
      setMessage('Slot disabled.');
      await loadAvailabilityManager(selectedChargerId, availabilityDate);
    } catch (err) {
      setError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function enableSlot(slot) {
    if (!selectedChargerId || !slot.overrideId) return;

    setError('');
    setMessage('');
    setAvailabilityLoading(true);

    try {
      await apiRequest(`/chargers/${selectedChargerId}/availability-overrides/${slot.overrideId}`, {
        method: 'DELETE'
      });
      setMessage('Slot enabled.');
      await loadAvailabilityManager(selectedChargerId, availabilityDate);
    } catch (err) {
      setError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <h1>Owner dashboard</h1>
          <p>Create chargers, manage status, and view bookings.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadOwnerData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      {user?.role === 'ADMIN' ? (
        <div className="form-card">
          <h2>Admin owner management</h2>
          <p className="muted">Admins can create and manage multiple owner accounts from the Admin dashboard. This page is for a single charger owner managing their own chargers.</p>
        </div>
      ) : !ownerProfile ? (
        <form className="form-card" onSubmit={createOwnerProfile}>
          <h2>Request owner approval</h2>
          <p className="muted">An admin must approve your owner profile before you can list chargers.</p>
          <label>
            Display name
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Submit request</button>
        </form>
      ) : !isApprovedOwner ? (
        <div className="form-card">
          <h2>Owner request status</h2>
          <p><span className="status-pill">{ownerProfile.verificationStatus}</span></p>
          {ownerProfile.verificationStatus === 'PENDING_VERIFICATION' && (
            <p className="muted">Your request is waiting for admin approval. You can create chargers after approval.</p>
          )}
          {ownerProfile.verificationStatus === 'REJECTED' && (
            <p className="muted">Your owner request was rejected. We can add a reapply flow later if you want.</p>
          )}
          {ownerProfile.verificationStatus === 'SUSPENDED' && (
            <p className="muted">This owner profile is suspended, so charger management is disabled.</p>
          )}
        </div>
      ) : (
        <div className="two-column">
          <form className="form-card" onSubmit={createCharger}>
            <h2>Create charger</h2>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Address<input value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} /></label>
            <div className="field-row">
              <label>City<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
              <label>Postal code<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} /></label>
            </div>
            <div className="field-row">
              <label>Latitude<input type="number" step="0.000001" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
              <label>Longitude<input type="number" step="0.000001" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
            </div>
            <div className="field-row">
              <label>Power kW<input type="number" value={form.powerKw} onChange={(event) => setForm({ ...form, powerKw: event.target.value })} /></label>
              <label>Price/hour<input type="number" value={form.pricePerHour} onChange={(event) => setForm({ ...form, pricePerHour: event.target.value })} /></label>
            </div>
            <label>Number of chargers<input type="number" min="1" value={form.chargerCount} onChange={(event) => setForm({ ...form, chargerCount: event.target.value })} /></label>
            <label>
              Connector
              <select value={form.connectorTypes[0]} onChange={(event) => setForm({ ...form, connectorTypes: [event.target.value] })}>
                <option value="CCS2">CCS2</option>
                <option value="TYPE_2">TYPE_2</option>
                <option value="CHADEMO">CHADEMO</option>
                <option value="GB_T">GB_T</option>
                <option value="TESLA_NACS">TESLA_NACS</option>
              </select>
            </label>
            <button className="primary-button" type="submit">Create charger</button>
          </form>

          <div className="stack">
            <div className="table-card">
              <h2>My chargers</h2>
              <table>
                <tbody>
                  {chargers.map((charger) => (
                    <tr key={charger.id}>
                      <td>{charger.name}<br /><span className="muted">{charger.city}</span></td>
                      <td>{charger.chargerCount} charger{Number(charger.chargerCount) === 1 ? '' : 's'}</td>
                      <td><span className="status-pill">{charger.status}</span></td>
                      <td>
                        {charger.status === 'ACTIVE'
                          ? <button className="secondary-button" type="button" onClick={() => updateStatus(charger.id, 'INACTIVE')}>Deactivate</button>
                          : <button className="secondary-button" type="button" onClick={() => updateStatus(charger.id, 'ACTIVE')}>Activate</button>}
                      </td>
                      <td>
                        <button className="ghost-button" type="button" onClick={() => setSelectedChargerId(String(charger.id))}>Manage slots</button>
                      </td>
                    </tr>
                  ))}
                  {!chargers.length && <tr><td>No chargers yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="table-card availability-card">
              <div className="section-heading-row">
                <div>
                  <h2>Availability</h2>
                  <p>Choose active weekly hours and disable individual slots when needed.</p>
                </div>
              </div>
              {!chargers.length ? (
                <p className="muted">Create a charger before managing availability.</p>
              ) : (
                <>
                  <div className="field-row">
                    <label>
                      Charger
                      <select value={selectedChargerId} onChange={(event) => setSelectedChargerId(event.target.value)}>
                        {chargers.map((charger) => (
                          <option key={charger.id} value={charger.id}>{charger.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Date
                      <input
                        type="date"
                        min={toDateInputValue()}
                        value={availabilityDate}
                        onChange={(event) => setAvailabilityDate(event.target.value)}
                      />
                    </label>
                  </div>

                  <form className="availability-rules-grid" onSubmit={saveAvailabilityRules}>
                    {availabilityRules.map((rule) => (
                      <div className="availability-rule-row" key={rule.dayOfWeek}>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={rule.isActive}
                            onChange={(event) => updateAvailabilityRule(rule.dayOfWeek, { isActive: event.target.checked })}
                          />
                          {weekDays.find((day) => day.value === rule.dayOfWeek)?.label}
                        </label>
                        <input
                          type="time"
                          value={rule.startsAt}
                          disabled={!rule.isActive}
                          onChange={(event) => updateAvailabilityRule(rule.dayOfWeek, { startsAt: event.target.value })}
                        />
                        <input
                          type="time"
                          value={rule.endsAt}
                          disabled={!rule.isActive}
                          onChange={(event) => updateAvailabilityRule(rule.dayOfWeek, { endsAt: event.target.value })}
                        />
                        <select
                          value={rule.slotMinutes}
                          disabled={!rule.isActive}
                          onChange={(event) => updateAvailabilityRule(rule.dayOfWeek, { slotMinutes: Number(event.target.value) })}
                        >
                          <option value={30}>30 min</option>
                          <option value={60}>60 min</option>
                          <option value={120}>120 min</option>
                        </select>
                      </div>
                    ))}
                    <button className="primary-button" type="submit" disabled={availabilityLoading}>
                      {availabilityLoading ? 'Saving...' : 'Save weekly hours'}
                    </button>
                  </form>

                  <h3>Slots for selected date</h3>
                  <div className="owner-slot-list">
                    {availabilityLoading ? <p className="muted">Refreshing slots...</p> : availabilitySlots.length ? availabilitySlots.map((slot) => (
                      <div className="owner-slot-row" key={slot.startsAt}>
                        <span>{formatSlotTime(slot)}</span>
                        <strong>{slot.status}</strong>
                        {slot.status === 'AVAILABLE' && (
                          <button className="secondary-button" type="button" onClick={() => disableSlot(slot)}>Disable</button>
                        )}
                        {slot.status === 'UNAVAILABLE' && slot.overrideId && (
                          <button className="secondary-button" type="button" onClick={() => enableSlot(slot)}>Enable</button>
                        )}
                      </div>
                    )) : <p className="muted">No slots generated for this date.</p>}
                  </div>
                </>
              )}
            </div>

            <div className="table-card">
              <h2>Owner bookings</h2>
              <table>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.chargerName}<br /><span className="muted">{new Date(booking.startsAt).toLocaleString()}</span></td>
                      <td><span className="status-pill">{booking.status}</span></td>
                    </tr>
                  ))}
                  {!bookings.length && <tr><td>No owner bookings yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
