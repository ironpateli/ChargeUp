import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

export function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [clearingCancelled, setClearingCancelled] = useState(false);

  const confirmedBookings = bookings.filter((booking) => booking.status !== 'CANCELLED');
  const cancelledBookings = bookings.filter((booking) => booking.status === 'CANCELLED');

  async function loadBookings() {
    setError('');
    try {
      const data = await apiRequest('/bookings/me');
      setBookings(data.bookings);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function cancelBooking(bookingId) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/bookings/${bookingId}/cancel`, { method: 'PATCH' });
      setMessage('Booking cancelled.');
      await loadBookings();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearCancelledBookings() {
    setError('');
    setMessage('');
    setClearingCancelled(true);

    try {
      const data = await apiRequest('/bookings/me/cancelled', { method: 'DELETE' });
      setMessage(`Cleared ${data.deletedCount} cancelled booking${data.deletedCount === 1 ? '' : 's'}.`);
      await loadBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingCancelled(false);
    }
  }

  function renderBookingRows(sectionBookings, emptyMessage) {
    if (!sectionBookings.length) {
      return (
        <tr>
          <td colSpan="5">{emptyMessage}</td>
        </tr>
      );
    }

    return sectionBookings.map((booking) => (
      <tr key={booking.id}>
        <td>{booking.chargerName}</td>
        <td>{new Date(booking.startsAt).toLocaleString()}</td>
        <td>{new Date(booking.endsAt).toLocaleString()}</td>
        <td><span className="status-pill">{booking.status}</span></td>
        <td>
          {booking.status === 'CONFIRMED' && (
            <button className="danger-button" type="button" onClick={() => cancelBooking(booking.id)}>
              Cancel
            </button>
          )}
        </td>
      </tr>
    ));
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <h1>My bookings</h1>
          <p>Track upcoming and completed charging sessions.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadBookings}>Refresh</button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      <div className="booking-section-grid">
        <div className="table-card booking-history-card">
          <div className="section-heading-row">
            <div>
              <h2>Confirmed</h2>
              <p>{confirmedBookings.length} non-cancelled booking{confirmedBookings.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Charger</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {renderBookingRows(confirmedBookings, 'No confirmed or completed bookings.')}
            </tbody>
          </table>
        </div>

        <div className="table-card booking-history-card">
          <div className="section-heading-row">
            <div>
              <h2>Cancelled</h2>
              <p>{cancelledBookings.length} cancelled booking{cancelledBookings.length === 1 ? '' : 's'}</p>
            </div>
            <button
              className="danger-button"
              type="button"
              onClick={clearCancelledBookings}
              disabled={!cancelledBookings.length || clearingCancelled}
            >
              {clearingCancelled ? 'Clearing...' : 'Clear cancelled'}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Charger</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {renderBookingRows(cancelledBookings, 'No cancelled bookings.')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
