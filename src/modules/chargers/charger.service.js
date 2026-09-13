import { query, withTransaction } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';

const AVAILABILITY_TIME_ZONE_OFFSET = '+05:30';
const AVAILABILITY_START_HOUR = 6;
const AVAILABILITY_END_HOUR = 22;

function toIsoAtLocalHour(date, hour) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00${AVAILABILITY_TIME_ZONE_OFFSET}`;
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export async function searchChargers(filters) {
  const result = await query(
    `
      SELECT
        c.id,
        c.owner_profile_id,
        c.name,
        c.address_line_1,
        c.city,
        c.state,
        array_agg(cct.connector_type ORDER BY cct.connector_type) AS connector_types,
        c.power_kw,
        c.price_per_hour,
        c.status,
        ST_Distance(
          c.location,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) AS distance_meters
      FROM chargers c
      JOIN charger_connector_types cct ON cct.charger_id = c.id
      WHERE c.status = 'ACTIVE'
        AND ST_DWithin(
          c.location,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
          $3
        )
        AND ($4::connector_type IS NULL OR EXISTS (
          SELECT 1
          FROM charger_connector_types filter_cct
          WHERE filter_cct.charger_id = c.id
            AND filter_cct.connector_type = $4
        ))
        AND ($5::numeric IS NULL OR c.power_kw >= $5)
      GROUP BY c.id
      ORDER BY distance_meters ASC
      LIMIT 50
    `,
    [
      filters.lat,
      filters.lng,
      filters.radiusMeters,
      filters.connectorType ?? null,
      filters.minPowerKw ?? null
    ]
  );

  return result.rows;
}

export async function getChargerById(chargerId) {
  const result = await findChargerById(query, chargerId);

  return assertFound(result.rows[0], 'Charger not found.');
}

export async function getChargerAvailability(chargerId, date) {
  const chargerResult = await query(
    `
      SELECT id, status
      FROM chargers
      WHERE id = $1
    `,
    [chargerId]
  );

  const charger = chargerResult.rows[0];

  if (!charger) {
    throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
  }

  const dayStart = toIsoAtLocalHour(date, 0);
  const nextDay = new Date(`${date}T00:00:00${AVAILABILITY_TIME_ZONE_OFFSET}`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEnd = nextDay.toISOString();

  const bookingsResult = await query(
    `
      SELECT starts_at, ends_at
      FROM bookings
      WHERE charger_id = $1
        AND status = 'CONFIRMED'
        AND starts_at < $3
        AND ends_at > $2
      ORDER BY starts_at ASC
    `,
    [chargerId, dayStart, dayEnd]
  );

  const bookedSlots = bookingsResult.rows.map((booking) => ({
    startsAt: booking.starts_at,
    endsAt: booking.ends_at
  }));

  const availableSlots = [];

  if (charger.status === 'ACTIVE') {
    const bookedRanges = bookedSlots.map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt)
    }));

    for (let hour = AVAILABILITY_START_HOUR; hour < AVAILABILITY_END_HOUR; hour += 1) {
      const startsAt = new Date(toIsoAtLocalHour(date, hour));
      const endsAt = new Date(toIsoAtLocalHour(date, hour + 1));
      const isBooked = bookedRanges.some((slot) => (
        rangesOverlap(startsAt, endsAt, slot.startsAt, slot.endsAt)
      ));

      if (!isBooked) {
        availableSlots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString()
        });
      }
    }
  }

  return {
    chargerId,
    date,
    slotMinutes: 60,
    timeZone: 'Asia/Kolkata',
    operatingHours: {
      startsAt: toIsoAtLocalHour(date, AVAILABILITY_START_HOUR),
      endsAt: toIsoAtLocalHour(date, AVAILABILITY_END_HOUR)
    },
    bookedSlots,
    availableSlots
  };
}

async function findChargerById(dbQuery, chargerId) {
  return dbQuery(
    `
      SELECT
        c.id,
        c.owner_profile_id,
        c.name,
        c.description,
        c.address_line_1,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.latitude,
        c.longitude,
        array_agg(cct.connector_type ORDER BY cct.connector_type) AS connector_types,
        c.power_kw,
        c.price_per_hour,
        c.status,
        c.created_at
      FROM chargers c
      JOIN charger_connector_types cct ON cct.charger_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `,
    [chargerId]
  );
}

export async function createCharger(userId, input) {
  return withTransaction(async (client) => {
    const ownerProfileResult = await client.query(
      `
        SELECT id
        FROM owner_profiles
        WHERE user_id = $1
      `,
      [userId]
    );

    const ownerProfile = ownerProfileResult.rows[0];

    if (!ownerProfile) {
      throw new AppError('Owner profile is required before listing chargers.', 403, 'OWNER_PROFILE_REQUIRED');
    }

    const chargerResult = await client.query(
      `
        INSERT INTO chargers (
          owner_profile_id,
          name,
          description,
          address_line_1,
          city,
          state,
          postal_code,
          country,
          latitude,
          longitude,
          power_kw,
          price_per_hour
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `,
      [
        ownerProfile.id,
        input.name,
        input.description ?? null,
        input.addressLine1,
        input.city,
        input.state,
        input.postalCode,
        input.country,
        input.latitude,
        input.longitude,
        input.powerKw,
        input.pricePerHour
      ]
    );

    const chargerId = chargerResult.rows[0].id;

    await client.query(
      `
        INSERT INTO charger_connector_types (charger_id, connector_type)
        SELECT DISTINCT $1::bigint, unnest($2::connector_type[])
      `,
      [chargerId, input.connectorTypes]
    );

    const result = await findChargerById(client.query.bind(client), chargerId);
    return result.rows[0];
  });
}
