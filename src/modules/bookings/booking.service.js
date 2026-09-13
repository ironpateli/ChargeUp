import { query, withTransaction } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';

function toBookingSummary(row) {
  return {
    id: Number(row.id),
    chargerId: Number(row.charger_id),
    chargerName: row.charger_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at
  };
}

function toBooking(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    chargerId: Number(row.charger_id),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getMyBookings(userId) {
  const result = await query(
    `
      SELECT
        b.id,
        b.charger_id,
        c.name AS charger_name,
        b.starts_at,
        b.ends_at,
        b.status,
        b.created_at
      FROM bookings b
      JOIN chargers c ON c.id = b.charger_id
      WHERE b.user_id = $1
      ORDER BY b.starts_at DESC
    `,
    [userId]
  );

  return result.rows.map(toBookingSummary);
}

export async function createBooking(userId, input) {
  return withTransaction(async (client) => {
    const chargerResult = await client.query(
      `
        SELECT id, status
        FROM chargers
        WHERE id = $1
      `,
      [input.chargerId]
    );

    const charger = chargerResult.rows[0];

    if (!charger) {
      throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
    }

    if (charger.status !== 'ACTIVE') {
      throw new AppError('Charger is not available for booking.', 409, 'CHARGER_NOT_BOOKABLE');
    }

    const bookingResult = await client.query(
      `
        INSERT INTO bookings (
          user_id,
          charger_id,
          starts_at,
          ends_at,
          status
        )
        VALUES ($1, $2, $3, $4, 'CONFIRMED')
        RETURNING *
      `,
      [userId, input.chargerId, input.startsAt, input.endsAt]
    );

    return bookingResult.rows[0];
  });
}

export async function cancelBooking(userId, bookingId) {
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `
        SELECT id, status
        FROM bookings
        WHERE id = $1
          AND user_id = $2
      `,
      [bookingId, userId]
    );

    const existingBooking = existingResult.rows[0];

    if (!existingBooking) {
      throw new AppError('Booking not found.', 404, 'BOOKING_NOT_FOUND');
    }

    if (existingBooking.status !== 'CONFIRMED') {
      throw new AppError('Only confirmed bookings can be cancelled.', 409, 'BOOKING_NOT_CANCELLABLE');
    }

    const result = await client.query(
      `
        UPDATE bookings
        SET status = 'CANCELLED',
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [bookingId]
    );

    return toBooking(result.rows[0]);
  });
}
