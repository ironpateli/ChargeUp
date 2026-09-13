import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

export function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

      <div className="table-card">
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
            {bookings.map((booking) => (
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
            ))}
            {!bookings.length && (
              <tr>
                <td colSpan="5">No bookings yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
