import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Calendar, IndianRupee, LocateFixed, Zap } from 'lucide-react';
import { apiRequest } from '../api.js';

const MUMBAI_CENTER = [19.076, 72.8777];
const DEFAULT_DATE = '2026-10-20';

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
  const [date, setDate] = useState(DEFAULT_DATE);
  const [availability, setAvailability] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedPosition = useMemo(() => (
    selected ? [selected.latitude, selected.longitude] : center
  ), [selected, center]);

  async function loadChargers(searchCenter = center) {
    setLoading(true);
    setError('');

    try {
      const data = await apiRequest(`/chargers?lat=${searchCenter[0]}&lng=${searchCenter[1]}&radiusMeters=50000`);
      setChargers(data.map(normalizeCharger));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailability(chargerId = selected?.id) {
    if (!chargerId) return;
    setError('');
    setMessage('');

    try {
      const data = await apiRequest(`/chargers/${chargerId}/availability?date=${date}`);
      setAvailability(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadChargers(MUMBAI_CENTER);
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

  async function bookSlot(slot) {
    if (!selected) return;
    setError('');
    setMessage('');

    try {
      await apiRequest('/bookings', {
        method: 'POST',
        body: {
          chargerId: selected.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt
        }
      });
      setMessage('Booking confirmed.');
      await loadAvailability(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="map-page">
      <section className="map-toolbar">
        <div>
          <h1>Charging map</h1>
          <p>Mumbai default search with live backend availability.</p>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" type="button" onClick={() => loadChargers()}>
            Refresh stations
          </button>
          <button className="icon-button" type="button" onClick={useCurrentLocation} title="Use my location">
            <LocateFixed size={18} />
          </button>
        </div>
      </section>

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
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>

              {error && <div className="form-error">{error}</div>}
              {message && <div className="form-success">{message}</div>}

              <h3>Available slots</h3>
              <div className="slot-list">
                {availability?.availableSlots?.length ? availability.availableSlots.map((slot) => (
                  <button key={slot.startsAt} className="slot-button" type="button" onClick={() => bookSlot(slot)}>
                    {new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {new Date(slot.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </button>
                )) : <p className="muted">No slots available for this date.</p>}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
