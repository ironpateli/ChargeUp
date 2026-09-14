import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle2, IndianRupee, LocateFixed, MapPin, RefreshCw, Search, X, Zap } from 'lucide-react';
import { apiRequest } from '../api.js';
import { formatConnectorTypes, formatDistanceKm } from '../formatters.js';
import { startPaymentCheckout } from '../payments.js';

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

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: '<span>You</span>',
  iconSize: [42, 42],
  iconAnchor: [21, 21]
});

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
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
    chargerCount: charger.charger_count ?? 1,
    status: charger.status,
    distanceMeters: charger.distance_meters ? Math.round(Number(charger.distance_meters)) : null
  };
}

function formatSlotAction(slot) {
  if (slot.status === 'AVAILABLE') {
    return `${slot.availableCount ?? 1} available`;
  }

  if (slot.status === 'BOOKED') {
    return 'Fully booked';
  }

  if (slot.status === 'PASSED') {
    return 'Passed';
  }

  return 'Unavailable';
}

export function MapPage() {
  const [center, setCenter] = useState(MUMBAI_CENTER);
  const [myLocation, setMyLocation] = useState(null);
  const [chargers, setChargers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    q: '',
    connectorType: '',
    minPowerKw: '',
    sortBy: 'nearest'
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
  const [isResultsOpen, setIsResultsOpen] = useState(true);

  const selectedPosition = useMemo(() => (
    selected ? [selected.latitude, selected.longitude] : center
  ), [selected, center]);

  const slots = useMemo(() => {
    if (availability?.slots) {
      return availability.slots;
    }

    if (!availability?.operatingHours) {
      return [];
    }

    const slotMinutes = availability.slotMinutes ?? 60;
    const bookedRanges = (availability.bookedSlots ?? []).map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt)
    }));
    const availableStarts = new Set((availability.availableSlots ?? []).map((slot) => (
      new Date(slot.startsAt).getTime()
    )));
    const operatingStart = new Date(availability.operatingHours.startsAt);
    const operatingEnd = new Date(availability.operatingHours.endsAt);
    const now = new Date();
    const nextSlots = [];

    for (
      let startsAt = new Date(operatingStart);
      startsAt < operatingEnd;
      startsAt = new Date(startsAt.getTime() + slotMinutes * 60 * 1000)
    ) {
      const endsAt = new Date(startsAt.getTime() + slotMinutes * 60 * 1000);
      const isBooked = bookedRanges.some((slot) => (
        rangesOverlap(startsAt, endsAt, slot.startsAt, slot.endsAt)
      ));
      const isPassed = startsAt <= now;
      const isAvailable = availableStarts.has(startsAt.getTime()) && !isBooked && !isPassed;

      nextSlots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: isBooked ? 'BOOKED' : isPassed ? 'PASSED' : isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'
      });
    }

    return nextSlots;
  }, [availability]);

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

    params.set('sortBy', filters.sortBy);

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
    requestCurrentLocation({ quiet: true });
  }, []);

  useEffect(() => {
    if (selected) {
      loadAvailability(selected.id);
    }
  }, [date, selected?.id]);

  function requestCurrentLocation(options = {}) {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = [position.coords.latitude, position.coords.longitude];
        setCenter(nextCenter);
        setMyLocation(nextCenter);
        loadChargers(nextCenter, options);
      },
      () => {
        if (!options.quiet) {
          setError('Could not access your location.');
        }
      }
    );
  }

  function applySearch(event) {
    event.preventDefault();
    loadChargers();
  }

  function selectCharger(charger) {
    setSelected(charger);
    setCenter([charger.latitude, charger.longitude]);
  }

  async function bookSlot() {
    if (!pendingSlot) return;
    if (!selected) return;
    setError('');
    setMessage('');
    setBookingLoading(true);

    try {
      const result = await startPaymentCheckout({
        chargerId: selected.id,
        startsAt: pendingSlot.startsAt,
        endsAt: pendingSlot.endsAt
      });
      setMessage(result.payment.provider === 'MOCK' ? 'Mock payment complete. Booking confirmed.' : 'Payment complete. Booking confirmed.');
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
          <button className="icon-button" type="button" onClick={() => requestCurrentLocation()} title="Use my location">
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
        <label>
          Sort
          <select
            value={filters.sortBy}
            onChange={(event) => setFilters({ ...filters, sortBy: event.target.value })}
          >
            <option value="nearest">Nearest first</option>
            <option value="fastest">Fastest first</option>
            <option value="cheapest">Cheapest first</option>
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {searchMessage && <div className="inline-notice"><CheckCircle2 size={16} /> {searchMessage}</div>}

      <div className="map-workspace">
        <button
          className="results-toggle"
          type="button"
          onClick={() => setIsResultsOpen((isOpen) => !isOpen)}
        >
          <MapPin size={16} />
          Stations
          <span>{chargers.length}</span>
        </button>

        <aside className={`search-results-panel ${isResultsOpen ? 'is-open' : 'is-collapsed'}`}>
          <div className="panel-heading">
            <h2>Stations</h2>
            <button
              className="icon-button panel-close-button"
              type="button"
              aria-label="Hide station list"
              onClick={() => setIsResultsOpen(false)}
              title="Hide station list"
            >
              <X size={16} />
            </button>
          </div>
          <label className="station-picker">
            Choose station
            <select
              value={selected?.id ?? ''}
              onChange={(event) => {
                const charger = chargers.find((item) => item.id === Number(event.target.value));

                if (charger) {
                  selectCharger(charger);
                }
              }}
            >
              <option value="">Select from results</option>
              {chargers.map((charger) => (
                <option key={charger.id} value={charger.id}>
                  {charger.name}
                </option>
              ))}
            </select>
          </label>
          <div className="charger-result-list">
            {chargers.map((charger) => (
              <button
                key={charger.id}
                className={`charger-result ${selected?.id === charger.id ? 'active' : ''}`}
                type="button"
                onClick={() => selectCharger(charger)}
              >
                <span className="charger-result-title">{charger.name}</span>
                <span className="muted">{charger.addressLine1}, {charger.city}</span>
                <span className="charger-result-meta">
                  <span>{charger.powerKw} kW</span>
                  <span>{charger.chargerCount} charger{Number(charger.chargerCount) === 1 ? '' : 's'}</span>
                  <span>{charger.connectorTypes}</span>
                  {charger.distanceMeters !== null && <span>{formatDistanceKm(charger.distanceMeters)}</span>}
                </span>
              </button>
            ))}
            {!chargers.length && (
              <div className="empty-mini">
                <MapPin size={20} />
                <span>No active chargers found.</span>
              </div>
            )}
          </div>
        </aside>

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
              <Popup>
                <strong>{charger.name}</strong>
                <br />
                <Link to={`/stations/${charger.id}`}>Open overview</Link>
              </Popup>
            </Marker>
          ))}
          {myLocation && (
            <Marker position={myLocation} icon={userLocationIcon}>
              <Popup>Your location</Popup>
            </Marker>
          )}
        </MapContainer>

        {!selected ? (
          <div className="map-empty-hint">
            <Zap size={18} />
            <span>{loading ? 'Loading stations...' : 'Select a marker or station to check slots.'}</span>
          </div>
        ) : (
          <aside className="side-panel map-details-drawer">
            <>
              <div className="panel-heading">
                <h2>{selected.name}</h2>
                <div className="panel-heading-actions">
                  <span className="status-pill">{selected.status}</span>
                  <button
                    className="icon-button panel-close-button"
                    type="button"
                    aria-label="Close charger details"
                    onClick={() => setSelected(null)}
                    title="Close charger details"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <p className="muted">{selected.addressLine1}, {selected.city}</p>
              <div className="metric-grid">
                <span><Zap size={16} /> {selected.powerKw} kW</span>
                <span><IndianRupee size={16} /> {selected.pricePerHour}/hr</span>
              </div>
              <p className="muted">{selected.chargerCount} charger{Number(selected.chargerCount) === 1 ? '' : 's'} at this station</p>
              <p className="muted">Connectors: {selected.connectorTypes}</p>
              {selected.distanceMeters !== null && <p className="muted">{formatDistanceKm(selected.distanceMeters)} away</p>}
              <Link className="secondary-button full-width-button" to={`/stations/${selected.id}`}>
                Open station overview
              </Link>

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
                {availabilityLoading ? <p className="muted">Checking slots...</p> : slots.length ? slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    className={`slot-button ${slot.status !== 'AVAILABLE' ? 'disabled-slot' : ''}`}
                    type="button"
                    onClick={() => slot.status === 'AVAILABLE' && setPendingSlot(slot)}
                    disabled={slot.status !== 'AVAILABLE'}
                  >
                    <span>{formatSlotTime(slot)}</span>
                    <small>{formatSlotAction(slot)}</small>
                  </button>
                )) : <p className="muted">No slots available for this date.</p>}
              </div>
            </>
          </aside>
        )}
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
                {bookingLoading ? 'Processing...' : 'Pay and book'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
