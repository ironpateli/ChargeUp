import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  IndianRupee,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { apiRequest } from '../api.js';
import { formatConnectorTypes } from '../formatters.js';

const DEFAULT_DATE = toDateInputValue();

const stationIcon = L.divIcon({
  className: 'charger-marker',
  html: '<span>EV</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeStation(charger) {
  return {
    id: Number(charger.id),
    ownerProfileId: Number(charger.owner_profile_id),
    ownerDisplayName: charger.owner_display_name,
    name: charger.name,
    description: charger.description,
    addressLine1: charger.address_line_1,
    city: charger.city,
    state: charger.state,
    postalCode: charger.postal_code,
    country: charger.country,
    latitude: Number(charger.latitude),
    longitude: Number(charger.longitude),
    connectorTypes: formatConnectorTypes(charger.connector_types),
    powerKw: charger.power_kw,
    pricePerHour: charger.price_per_hour,
    chargerCount: charger.charger_count ?? 1,
    status: charger.status,
    createdAt: charger.created_at
  };
}

function formatSlotTime(slot) {
  return `${new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(slot.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatReviewDate(value) {
  return new Date(value).toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
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

export function StationPage() {
  const { chargerId } = useParams();
  const [station, setStation] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [date, setDate] = useState(DEFAULT_DATE);
  const [availability, setAvailability] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const position = useMemo(() => (
    station ? [station.latitude, station.longitude] : [19.076, 72.8777]
  ), [station]);

  const slots = availability?.slots ?? [];
  const availableCount = slots.reduce((total, slot) => total + (slot.status === 'AVAILABLE' ? Number(slot.availableCount ?? 1) : 0), 0);
  const bookedCount = slots.reduce((total, slot) => total + Number(slot.bookedCount ?? (slot.status === 'BOOKED' ? 1 : 0)), 0);

  useEffect(() => {
    let isMounted = true;

    async function loadStation() {
      setLoading(true);
      setError('');

      try {
        const [chargerData, reviewData] = await Promise.all([
          apiRequest(`/chargers/${chargerId}`),
          apiRequest(`/reviews/chargers/${chargerId}`)
        ]);

        if (!isMounted) return;

        setStation(normalizeStation(chargerData));
        setReviews(reviewData.reviews ?? []);
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadStation();

    return () => {
      isMounted = false;
    };
  }, [chargerId]);

  useEffect(() => {
    if (!station) return;

    let isMounted = true;

    async function loadAvailability() {
      setAvailabilityLoading(true);
      setError('');
      setMessage('');

      try {
        const data = await apiRequest(`/chargers/${station.id}/availability?date=${date}`);

        if (isMounted) {
          setAvailability(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setAvailabilityLoading(false);
        }
      }
    }

    loadAvailability();

    return () => {
      isMounted = false;
    };
  }, [date, station?.id]);

  async function bookSlot() {
    if (!pendingSlot || !station) return;

    setBookingLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/bookings', {
        method: 'POST',
        body: {
          chargerId: station.id,
          startsAt: pendingSlot.startsAt,
          endsAt: pendingSlot.endsAt
        }
      });

      setMessage('Booking confirmed.');
      setPendingSlot(null);
      const data = await apiRequest(`/chargers/${station.id}/availability?date=${date}`);
      setAvailability(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  }

  if (loading) {
    return <div className="page-section"><div className="loading-screen">Loading station...</div></div>;
  }

  if (!station) {
    return (
      <div className="page-section">
        <Link className="ghost-button inline-link-button" to="/map">
          <ArrowLeft size={16} />
          Back to map
        </Link>
        <div className="empty-state">{error || 'Station not found.'}</div>
      </div>
    );
  }

  return (
    <div className="page-section station-page">
      <div className="station-hero">
        <div>
          <Link className="ghost-button inline-link-button" to="/map">
            <ArrowLeft size={16} />
            Back to map
          </Link>
          <h1>{station.name}</h1>
          <p>{station.addressLine1}, {station.city}, {station.state} {station.postalCode}</p>
          <div className="hero-chip-row">
            <span><ShieldCheck size={15} /> {station.status}</span>
            <span><Zap size={15} /> {station.powerKw} kW</span>
            <span>{station.chargerCount} charger{Number(station.chargerCount) === 1 ? '' : 's'}</span>
            <span><IndianRupee size={15} /> Rs. {station.pricePerHour}/hr</span>
          </div>
        </div>
        <div className="station-map-card">
          <MapContainer center={position} zoom={15} className="station-map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={position} icon={stationIcon} />
          </MapContainer>
        </div>
      </div>

      <div className="station-layout">
        <section className="station-main">
          <div className="overview-grid">
            <div className="overview-tile">
              <MapPin size={18} />
              <span>Location</span>
              <strong>{station.city}, {station.country}</strong>
            </div>
            <div className="overview-tile">
              <Zap size={18} />
              <span>Connectors</span>
              <strong>{station.connectorTypes}</strong>
            </div>
            <div className="overview-tile">
              <Calendar size={18} />
              <span>Available today</span>
              <strong>{availableCount} unit slot{availableCount === 1 ? '' : 's'}</strong>
            </div>
            <div className="overview-tile">
              <MessageSquareText size={18} />
              <span>Reviews</span>
              <strong>{reviews.length}</strong>
            </div>
          </div>

          <section className="table-card station-section">
            <h2>Station overview</h2>
            <p className="muted">
              {station.description || 'No station description has been added yet.'}
            </p>
            <dl className="detail-list">
              <div>
                <dt>Owner</dt>
                <dd>{station.ownerDisplayName || 'Owner profile'}</dd>
              </div>
              <div>
                <dt>Full address</dt>
                <dd>{station.addressLine1}, {station.city}, {station.state}, {station.country}</dd>
              </div>
              <div>
                <dt>Charging units</dt>
                <dd>{station.chargerCount} charger{Number(station.chargerCount) === 1 ? '' : 's'} at this station</dd>
              </div>
              <div>
                <dt>Connector types</dt>
                <dd>{station.connectorTypes}</dd>
              </div>
              <div>
                <dt>Pricing</dt>
                <dd>Rs. {station.pricePerHour} per hour</dd>
              </div>
            </dl>
          </section>

          <section className="table-card station-section">
            <div className="section-heading-row">
              <div>
                <h2>Reviews</h2>
                <p>{reviews.length ? 'Recent charger feedback.' : 'No reviews yet.'}</p>
              </div>
            </div>
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <strong>Rating {review.rating}/5</strong>
                  <p>{review.comment || 'No written comment.'}</p>
                  <span>{formatReviewDate(review.createdAt)}</span>
                </article>
              ))}
              {!reviews.length && <p className="muted">Completed bookings can be reviewed from the bookings flow later.</p>}
            </div>
          </section>
        </section>

        <aside className="table-card booking-panel">
          <h2>Book a slot</h2>
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

          <div className="booking-summary-row">
            <span>{availableCount} available</span>
            <span>{bookedCount} booked</span>
          </div>

          <div className="slot-list station-slot-list">
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
        </aside>
      </div>

      {pendingSlot && (
        <div className="modal-backdrop">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="station-booking-confirm-title">
            <h2 id="station-booking-confirm-title">Confirm booking</h2>
            <p className="muted">{station.name}</p>
            <div className="confirmation-summary">
              <span>Date</span>
              <strong>{new Date(pendingSlot.startsAt).toLocaleDateString()}</strong>
              <span>Time</span>
              <strong>{formatSlotTime(pendingSlot)}</strong>
              <span>Estimated price</span>
              <strong>Rs. {station.pricePerHour}</strong>
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
