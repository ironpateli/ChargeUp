import { query, withTransaction } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';

const BOOKING_TIME_ZONE_OFFSET_MINUTES = 330;
const BOOKING_SLOT_MINUTES = 60;
const BOOKING_START_HOUR = 6;
const BOOKING_END_HOUR = 22;

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

function toBookingLocalParts(date) {
  const localDate = new Date(date.getTime() + BOOKING_TIME_ZONE_OFFSET_MINUTES * 60 * 1000);

  return {
    hour: localDate.getUTCHours(),
    minute: localDate.getUTCMinutes(),
    second: localDate.getUTCSeconds(),
    millisecond: localDate.getUTCMilliseconds()
  };
}

function assertBookableSlot(startsAt, endsAt, now = new Date()) {
  if (startsAt <= now) {
    throw new AppError('Booking start time must be in the future.', 409, 'BOOKING_SLOT_IN_PAST');
  }

  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / (60 * 1000);

  if (durationMinutes !== BOOKING_SLOT_MINUTES) {
    throw new AppError('Bookings must use a 60-minute slot.', 422, 'INVALID_BOOKING_SLOT_DURATION');
  }

  const startsAtLocal = toBookingLocalParts(startsAt);
  const endsAtLocal = toBookingLocalParts(endsAt);

  const startsOnHour = startsAtLocal.minute === 0
    && startsAtLocal.second === 0
    && startsAtLocal.millisecond === 0;
  const endsOnHour = endsAtLocal.minute === 0
    && endsAtLocal.second === 0
    && endsAtLocal.millisecond === 0;

  if (!startsOnHour || !endsOnHour) {
    throw new AppError('Bookings must start and end on an hourly slot boundary.', 422, 'INVALID_BOOKING_SLOT_BOUNDARY');
  }

  if (startsAtLocal.hour < BOOKING_START_HOUR || endsAtLocal.hour > BOOKING_END_HOUR) {
    throw new AppError('Booking slot is outside charger operating hours.', 422, 'BOOKING_OUTSIDE_OPERATING_HOURS');
  }
}

export async function markExpiredConfirmedBookingsCompleted() {
  const result = await query(
    `
      UPDATE bookings
      SET status = 'COMPLETED',
          updated_at = now()
      WHERE status = 'CONFIRMED'
        AND ends_at <= now()
      RETURNING id
    `
  );

  return result.rowCount;
}

export async function getMyBookings(userId) {
  await markExpiredConfirmedBookingsCompleted();

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

export async function clearMyCancelledBookings(userId) {
  const result = await query(
    `
      DELETE FROM bookings
      WHERE user_id = $1
        AND status = 'CANCELLED'
      RETURNING id
    `,
    [userId]
  );

  return result.rowCount;
}

export async function clearMyCompletedBookings(userId) {
  return withTransaction(async (client) => {
    await client.query(
      `
        DELETE FROM reviews
        WHERE booking_id IN (
          SELECT id
          FROM bookings
          WHERE user_id = $1
            AND status = 'COMPLETED'
        )
      `,
      [userId]
    );

    const result = await client.query(
      `
        DELETE FROM bookings
        WHERE user_id = $1
          AND status = 'COMPLETED'
        RETURNING id
      `,
      [userId]
    );

    return result.rowCount;
  });
}

export async function createBooking(userId, input) {
  return withTransaction(async (client) => {
    assertBookableSlot(input.startsAt, input.endsAt);

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
