import { query, withTransaction } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';

const BOOKING_TIME_ZONE_OFFSET_MINUTES = 330;
const BOOKING_START_HOUR = 6;
const BOOKING_END_HOUR = 22;

function toIsoAtLocalHour(date, hour) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00+05:30`;
}

function toIsoAtLocalTime(date, time) {
  const [hour, minute] = time.slice(0, 5).split(':');

  return `${date}T${hour}:${minute}:00+05:30`;
}

function toBookingLocalDate(date) {
  const localDate = new Date(date.getTime() + BOOKING_TIME_ZONE_OFFSET_MINUTES * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDayOfWeek(date) {
  const localDate = toBookingLocalDate(date);
  const utcNoon = new Date(`${localDate}T12:00:00Z`);

  return utcNoon.getUTCDay();
}

function defaultAvailabilityRule(date) {
  return {
    starts_at: `${String(BOOKING_START_HOUR).padStart(2, '0')}:00`,
    ends_at: `${String(BOOKING_END_HOUR).padStart(2, '0')}:00`,
    slot_minutes: 60,
    is_active: true,
    date: toBookingLocalDate(date)
  };
}

function toBookingSummary(row) {
  return {
    id: Number(row.id),
    chargerId: Number(row.charger_id),
    chargerUnitId: Number(row.charger_unit_id),
    unitNumber: row.unit_number === undefined ? undefined : Number(row.unit_number),
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
    chargerUnitId: Number(row.charger_unit_id),
    unitNumber: row.unit_number === undefined ? undefined : Number(row.unit_number),
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

function assertBookableSlot(startsAt, endsAt, rule, now = new Date()) {
  if (startsAt <= now) {
    throw new AppError('Booking start time must be in the future.', 409, 'BOOKING_SLOT_IN_PAST');
  }

  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / (60 * 1000);
  const slotMinutes = Number(rule.slot_minutes);

  if (!rule.is_active) {
    throw new AppError('This charger is not open on the selected day.', 409, 'CHARGER_CLOSED');
  }

  if (durationMinutes !== slotMinutes) {
    throw new AppError(`Bookings must use a ${slotMinutes}-minute slot.`, 422, 'INVALID_BOOKING_SLOT_DURATION');
  }

  const startsAtLocal = toBookingLocalParts(startsAt);
  const endsAtLocal = toBookingLocalParts(endsAt);
  const operatingStart = new Date(toIsoAtLocalTime(rule.date, rule.starts_at));
  const operatingEnd = new Date(toIsoAtLocalTime(rule.date, rule.ends_at));
  const minutesFromOpen = (startsAt.getTime() - operatingStart.getTime()) / (60 * 1000);
  const endMinutesFromOpen = (endsAt.getTime() - operatingStart.getTime()) / (60 * 1000);

  const startsOnBoundary = minutesFromOpen >= 0
    && minutesFromOpen % slotMinutes === 0
    && startsAtLocal.second === 0
    && startsAtLocal.millisecond === 0;
  const endsOnBoundary = endMinutesFromOpen > 0
    && endMinutesFromOpen % slotMinutes === 0
    && endsAtLocal.second === 0
    && endsAtLocal.millisecond === 0;

  if (!startsOnBoundary || !endsOnBoundary) {
    throw new AppError('Booking must match an available slot boundary.', 422, 'INVALID_BOOKING_SLOT_BOUNDARY');
  }

  if (startsAt < operatingStart || endsAt > operatingEnd) {
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
        b.charger_unit_id,
        cu.unit_number,
        c.name AS charger_name,
        b.starts_at,
        b.ends_at,
        b.status,
        b.created_at
      FROM bookings b
      JOIN chargers c ON c.id = b.charger_id
      JOIN charger_units cu ON cu.id = b.charger_unit_id
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

    const bookingDate = toBookingLocalDate(input.startsAt);
    const dayOfWeek = getDayOfWeek(input.startsAt);
    const ruleResult = await client.query(
      `
        SELECT starts_at::text, ends_at::text, slot_minutes, is_active
        FROM charger_availability_rules
        WHERE charger_id = $1
          AND day_of_week = $2
      `,
      [input.chargerId, dayOfWeek]
    );
    const rule = {
      ...(ruleResult.rows[0] ?? defaultAvailabilityRule(input.startsAt)),
      date: bookingDate
    };

    assertBookableSlot(input.startsAt, input.endsAt, rule);

    const unavailableOverrideResult = await client.query(
      `
        SELECT id
        FROM charger_availability_overrides
        WHERE charger_id = $1
          AND status = 'UNAVAILABLE'
          AND starts_at < $3
          AND ends_at > $2
        LIMIT 1
      `,
      [input.chargerId, input.startsAt, input.endsAt]
    );

    if (unavailableOverrideResult.rows[0]) {
      throw new AppError('This slot has been marked unavailable by the owner.', 409, 'BOOKING_SLOT_UNAVAILABLE');
    }

    const unitResult = await client.query(
      `
        SELECT cu.id, cu.unit_number
        FROM charger_units cu
        WHERE cu.charger_id = $1
          AND cu.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1
            FROM bookings b
            WHERE b.charger_unit_id = cu.id
              AND b.status = 'CONFIRMED'
              AND b.starts_at < $3
              AND b.ends_at > $2
          )
        ORDER BY cu.unit_number ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `,
      [input.chargerId, input.startsAt, input.endsAt]
    );

    const unit = unitResult.rows[0];

    if (!unit) {
      throw new AppError('No charging unit is available for this time slot.', 409, 'BOOKING_SLOT_CONFLICT');
    }

    const bookingResult = await client.query(
      `
        INSERT INTO bookings (
          user_id,
          charger_id,
          charger_unit_id,
          starts_at,
          ends_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'CONFIRMED')
        RETURNING *
      `,
      [userId, input.chargerId, unit.id, input.startsAt, input.endsAt]
    );

    return {
      ...bookingResult.rows[0],
      unit_number: unit.unit_number
    };
  });
}

export async function cancelBooking(userId, bookingId) {
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `
        SELECT b.id, b.status, cu.unit_number
        FROM bookings b
        JOIN charger_units cu ON cu.id = b.charger_unit_id
        WHERE b.id = $1
          AND b.user_id = $2
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

    return toBooking({
      ...result.rows[0],
      unit_number: existingBooking.unit_number
    });
  });
}
