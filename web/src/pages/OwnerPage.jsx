import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

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
  pricePerHour: 150
};

export function OwnerPage({ user, refreshUser }) {
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [chargers, setChargers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState(initialChargerForm);
  const [profileName, setProfileName] = useState('My Charging Business');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadOwnerData() {
    setError('');

    try {
      const profile = await apiRequest('/owner-profiles/me');
      setOwnerProfile(profile.ownerProfile);
    } catch {
      setOwnerProfile(null);
    }

    try {
      const chargerData = await apiRequest('/owner/chargers');
      setChargers(chargerData.chargers);
      const bookingData = await apiRequest('/owner/bookings');
      setBookings(bookingData.bookings);
    } catch {
      setChargers([]);
      setBookings([]);
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
      setMessage('Owner profile created.');
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
          pricePerHour: Number(form.pricePerHour)
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

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <h1>Owner dashboard</h1>
          <p>Create chargers, manage status, and view bookings.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadOwnerData}>Refresh</button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      {!ownerProfile && user?.role !== 'CHARGER_OWNER' ? (
        <form className="form-card" onSubmit={createOwnerProfile}>
          <h2>Become a charger owner</h2>
          <label>
            Display name
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Create owner profile</button>
        </form>
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
                      <td><span className="status-pill">{charger.status}</span></td>
                      <td>
                        {charger.status === 'ACTIVE'
                          ? <button className="secondary-button" type="button" onClick={() => updateStatus(charger.id, 'INACTIVE')}>Deactivate</button>
                          : <button className="secondary-button" type="button" onClick={() => updateStatus(charger.id, 'ACTIVE')}>Activate</button>}
                      </td>
                    </tr>
                  ))}
                  {!chargers.length && <tr><td>No chargers yet.</td></tr>}
                </tbody>
              </table>
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
