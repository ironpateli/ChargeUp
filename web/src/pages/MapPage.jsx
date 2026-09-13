import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Calendar, CheckCircle2, IndianRupee, LocateFixed, RefreshCw, Search, Zap } from 'lucide-react';
import { apiRequest } from '../api.js';

const MUMBAI_CENTER = [19.076, 72.8777];

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const DEFAULT_DATE = toDateInputValue();

const chargerIcon = L.divIcon({
  className: 'charger-marker',
  html: '<span>EV</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

function formatConnectorTypes(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'string') {
    return value.replace(/[{}"]/g, '').replaceAll(',', ', ');
  }

  return 'Not specified';
}

function RecenterMap({ center }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

function normalizeCharger(charger) {
  return {
    id: Number(charger.id),
    name: charger.name,
    addressLine1: charger.address_line_1,
    city: charger.city,
    state: charger.state,
    latitude: Number(charger.latitude),
    longitude: Number(charger.longitude),
    connectorTypes: formatConnectorTypes(charger.connector_types),
    powerKw: charger.power_kw,
    pricePerHour: charger.price_per_hour,
    status: charger.status,
    distanceMeters: charger.distance_meters ? Math.round(Number(charger.distance_meters)) : null
  };
}

export function MapPage() {
  const [center, setCenter] = useState(MUMBAI_CENTER);
  const [chargers, setChargers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    q: '',
    connectorType: '',
    minPowerKw: ''
  });
  const [date, setDate] = useState(DEFAULT_DATE);
  const [availability, setAvailability] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [message, setMessage] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  const selectedPosition = useMemo(() => (
    selected ? [selected.latitude, selected.longitude] : center
  ), [selected, center]);

  function buildSearchQuery(searchCenter = center) {
    const params = new URLSearchParams({
      lat: String(searchCenter[0]),
      lng: String(searchCenter[1]),
      radiusMeters: '50000'
    });

    if (filters.q.trim()) {
      params.set('q', filters.q.trim());
    }

    if (filters.connectorType) {
      params.set('connectorType', filters.connectorType);
    }

    if (filters.minPowerKw) {
      params.set('minPowerKw', filters.minPowerKw);
    }

    return params.toString();
  }

  async function loadChargers(searchCenter = center, options = {}) {
    setLoading(true);
    setError('');
    setSearchMessage(options.quiet ? '' : 'Refreshing stations...');

    try {
      const data = await apiRequest(`/chargers?${buildSearchQuery(searchCenter)}`);
      const nextChargers = data.map(normalizeCharger);
      setChargers(nextChargers);

      if (selected && !nextChargers.some((charger) => charger.id === selected.id)) {
        setSelected(null);
        setAvailability(null);
      }

      setSearchMessage(`Up to date. ${nextChargers.length} active station${nextChargers.length === 1 ? '' : 's'} found.`);
    } catch (err) {
      setError(err.message);
      setSearchMessage('');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailability(chargerId = selected?.id) {
    if (!chargerId) return;
    setError('');
    setMessage('');
    setAvailabilityLoading(true);

    try {
      const data = await apiRequest(`/chargers/${chargerId}/availability?date=${date}`);
      setAvailability(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  useEffect(() => {
    loadChargers(MUMBAI_CENTER, { quiet: true });
  }, []);

  useEffect(() => {
    if (selected) {
      loadAvailability(selected.id);
    }
  }, [date, selected?.id]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = [position.coords.latitude, position.coords.longitude];
        setCenter(nextCenter);
        loadChargers(nextCenter);
      },
      () => setError('Could not access your location.')
    );
  }

  function applySearch(event) {
    event.preventDefault();
    loadChargers();
  }

  async function bookSlot() {
    if (!pendingSlot) return;
    if (!selected) return;
    setError('');
    setMessage('');
    setBookingLoading(true);

    try {
      await apiRequest('/bookings', {
        method: 'POST',
        body: {
          chargerId: selected.id,
          startsAt: pendingSlot.startsAt,
          endsAt: pendingSlot.endsAt
        }
      });
      setMessage('Booking confirmed.');
      setPendingSlot(null);
      await loadAvailability(selected.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  }

  function formatSlotTime(slot) {
    return `${new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(slot.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return (
    <div className="map-page">
      <section className="map-toolbar">
        <div>
          <h1>Charging map</h1>
          <p>Mumbai default search with live backend availability.</p>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" type="button" onClick={() => loadChargers()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin-icon' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="icon-button" type="button" onClick={useCurrentLocation} title="Use my location">
            <LocateFixed size={18} />
          </button>
        </div>
      </section>

      <form className="map-filter-bar" onSubmit={applySearch}>
        <label>
          Search
          <div className="input-with-icon">
            <Search size={16} />
            <input
              placeholder="Name, area, city, address"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </div>
        </label>
        <label>
          Connector
          <select
            value={filters.connectorType}
            onChange={(event) => setFilters({ ...filters, connectorType: event.target.value })}
          >
            <option value="">Any connector</option>
            <option value="CCS2">CCS2</option>
            <option value="TYPE_2">TYPE_2</option>
            <option value="CHADEMO">CHADEMO</option>
            <option value="GB_T">GB_T</option>
            <option value="TESLA_NACS">TESLA_NACS</option>
          </select>
        </label>
        <label>
          Minimum power
          <select
            value={filters.minPowerKw}
            onChange={(event) => setFilters({ ...filters, minPowerKw: event.target.value })}
          >
            <option value="">Any speed</option>
            <option value="7">7 kW+</option>
            <option value="22">22 kW+</option>
            <option value="50">50 kW+</option>
            <option value="100">100 kW+</option>
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {searchMessage && <div className="inline-notice"><CheckCircle2 size={16} /> {searchMessage}</div>}

      <div className="map-workspace">
        <MapContainer center={MUMBAI_CENTER} zoom={12} className="map-canvas">
          <RecenterMap center={selected ? selectedPosition : center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {chargers.map((charger) => (
            <Marker
              key={charger.id}
              position={[charger.latitude, charger.longitude]}
              icon={chargerIcon}
              eventHandlers={{ click: () => setSelected(charger) }}
            >
              <Popup>{charger.name}</Popup>
            </Marker>
          ))}
        </MapContainer>

        <aside className="side-panel">
          {!selected ? (
            <div className="empty-state">
              <Zap size={30} />
              <h2>Select a charger</h2>
              <p>{loading ? 'Loading stations...' : 'Click a map marker to check availability and book a slot.'}</p>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <h2>{selected.name}</h2>
                <span className="status-pill">{selected.status}</span>
              </div>
              <p className="muted">{selected.addressLine1}, {selected.city}</p>
              <div className="metric-grid">
                <span><Zap size={16} /> {selected.powerKw} kW</span>
                <span><IndianRupee size={16} /> {selected.pricePerHour}/hr</span>
              </div>
              <p className="muted">Connectors: {selected.connectorTypes}</p>
              {selected.distanceMeters !== null && <p className="muted">{selected.distanceMeters} m away</p>}

              <label className="date-field">
                <Calendar size={16} />
                <input
                  type="date"
                  min={DEFAULT_DATE}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>

              {error && <div className="form-error">{error}</div>}
              {message && <div className="form-success">{message}</div>}

              <h3>Available slots</h3>
              <div className="slot-list">
                {availabilityLoading ? <p className="muted">Checking slots...</p> : availability?.availableSlots?.length ? availability.availableSlots.map((slot) => (
                  <button key={slot.startsAt} className="slot-button" type="button" onClick={() => setPendingSlot(slot)}>
                    <span>{formatSlotTime(slot)}</span>
                    <small>Book</small>
                  </button>
                )) : <p className="muted">No slots available for this date.</p>}
              </div>
            </>
          )}
        </aside>
      </div>

      {pendingSlot && selected && (
        <div className="modal-backdrop">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="booking-confirm-title">
            <h2 id="booking-confirm-title">Confirm booking</h2>
            <p className="muted">{selected.name}</p>
            <div className="confirmation-summary">
              <span>Date</span>
              <strong>{new Date(pendingSlot.startsAt).toLocaleDateString()}</strong>
              <span>Time</span>
              <strong>{formatSlotTime(pendingSlot)}</strong>
              <span>Estimated price</span>
              <strong>Rs. {selected.pricePerHour}</strong>
            </div>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setPendingSlot(null)} disabled={bookingLoading}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={bookSlot} disabled={bookingLoading}>
                {bookingLoading ? 'Confirming...' : 'Confirm booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
