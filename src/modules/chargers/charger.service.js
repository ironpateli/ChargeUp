import { query, withTransaction } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';

const AVAILABILITY_TIME_ZONE_OFFSET = '+05:30';
const AVAILABILITY_START_HOUR = 6;
const AVAILABILITY_END_HOUR = 22;
const DEFAULT_SLOT_MINUTES = 60;

function toIsoAtLocalHour(date, hour) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00${AVAILABILITY_TIME_ZONE_OFFSET}`;
}

function toIsoAtLocalTime(date, time) {
  const [hour, minute] = time.slice(0, 5).split(':');

  return `${date}T${hour}:${minute}:00${AVAILABILITY_TIME_ZONE_OFFSET}`;
}

function getDayOfWeek(date) {
  const utcNoon = new Date(`${date}T12:00:00Z`);

  return utcNoon.getUTCDay();
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function defaultAvailabilityRule(date) {
  return {
    day_of_week: getDayOfWeek(date),
    starts_at: `${String(AVAILABILITY_START_HOUR).padStart(2, '0')}:00`,
    ends_at: `${String(AVAILABILITY_END_HOUR).padStart(2, '0')}:00`,
    slot_minutes: DEFAULT_SLOT_MINUTES,
    is_active: true
  };
}

function toAvailabilityRule(row) {
  return {
    id: row.id ? Number(row.id) : null,
    chargerId: Number(row.charger_id),
    dayOfWeek: Number(row.day_of_week),
    startsAt: row.starts_at.slice(0, 5),
    endsAt: row.ends_at.slice(0, 5),
    slotMinutes: Number(row.slot_minutes),
    isActive: row.is_active
  };
}

function toAvailabilityOverride(row) {
  return {
    id: Number(row.id),
    chargerId: Number(row.charger_id),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at
  };
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
        c.latitude,
        c.longitude,
        array_agg(cct.connector_type ORDER BY cct.connector_type) AS connector_types,
        c.power_kw,
        c.price_per_hour,
        c.charger_count,
        c.status,
        GREATEST(
          similarity(c.name, COALESCE($4::text, '')),
          similarity(c.address_line_1, COALESCE($4::text, '')),
          similarity(c.city, COALESCE($4::text, '')),
          similarity(c.state, COALESCE($4::text, ''))
        ) AS search_score,
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
        AND (
          $4::text IS NULL
          OR c.name ILIKE '%' || $4 || '%'
          OR c.address_line_1 ILIKE '%' || $4 || '%'
          OR c.city ILIKE '%' || $4 || '%'
          OR c.state ILIKE '%' || $4 || '%'
          OR similarity(c.name, $4) > 0.18
          OR similarity(c.address_line_1, $4) > 0.18
          OR similarity(c.city, $4) > 0.18
          OR similarity(c.state, $4) > 0.18
          OR EXISTS (
            SELECT 1
            FROM charger_connector_types search_cct
            WHERE search_cct.charger_id = c.id
              AND search_cct.connector_type::text ILIKE '%' || $4 || '%'
          )
        )
        AND ($5::connector_type IS NULL OR EXISTS (
          SELECT 1
          FROM charger_connector_types filter_cct
          WHERE filter_cct.charger_id = c.id
            AND filter_cct.connector_type = $5
        ))
        AND ($6::numeric IS NULL OR c.power_kw >= $6)
      GROUP BY c.id
      ORDER BY
        CASE WHEN $7 = 'fastest' THEN c.power_kw END DESC,
        CASE WHEN $7 = 'cheapest' THEN c.price_per_hour END ASC,
        CASE WHEN $4::text IS NOT NULL THEN GREATEST(
          similarity(c.name, $4),
          similarity(c.address_line_1, $4),
          similarity(c.city, $4),
          similarity(c.state, $4)
        ) END DESC,
        distance_meters ASC
      LIMIT 50
    `,
    [
      filters.lat,
      filters.lng,
      filters.radiusMeters,
      filters.q ?? null,
      filters.connectorType ?? null,
      filters.minPowerKw ?? null,
      filters.sortBy
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
  const dayOfWeek = getDayOfWeek(date);
  const ruleResult = await query(
    `
      SELECT id, charger_id, day_of_week, starts_at::text, ends_at::text, slot_minutes, is_active
      FROM charger_availability_rules
      WHERE charger_id = $1
        AND day_of_week = $2
    `,
    [chargerId, dayOfWeek]
  );
  const rule = ruleResult.rows[0] ?? defaultAvailabilityRule(date);
  const overridesResult = await query(
    `
      SELECT id, charger_id, starts_at, ends_at, status, reason, created_at
      FROM charger_availability_overrides
      WHERE charger_id = $1
        AND starts_at < $3
        AND ends_at > $2
      ORDER BY starts_at ASC
    `,
    [chargerId, dayStart, dayEnd]
  );
  const overrides = overridesResult.rows.map(toAvailabilityOverride);

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
  const slots = [];

  if (charger.status === 'ACTIVE' && rule.is_active) {
    const bookedRanges = bookedSlots.map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt)
    }));
    const overrideRanges = overrides.map((override) => ({
      ...override,
      startsAtDate: new Date(override.startsAt),
      endsAtDate: new Date(override.endsAt)
    }));

    const operatingStart = new Date(toIsoAtLocalTime(date, rule.starts_at));
    const operatingEnd = new Date(toIsoAtLocalTime(date, rule.ends_at));
    const slotMinutes = Number(rule.slot_minutes);

    for (
      let startsAt = new Date(operatingStart);
      startsAt < operatingEnd;
      startsAt = new Date(startsAt.getTime() + slotMinutes * 60 * 1000)
    ) {
      const endsAt = new Date(startsAt.getTime() + slotMinutes * 60 * 1000);

      if (endsAt > operatingEnd) {
        break;
      }

      const isBooked = bookedRanges.some((slot) => (
        rangesOverlap(startsAt, endsAt, slot.startsAt, slot.endsAt)
      ));
      const isPassed = startsAt <= new Date();
      const override = overrideRanges.find((slot) => (
        rangesOverlap(startsAt, endsAt, slot.startsAtDate, slot.endsAtDate)
      ));

      if (isBooked) {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'BOOKED'
        });
      } else if (override?.status === 'UNAVAILABLE') {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'UNAVAILABLE',
          overrideId: override.id,
          reason: override.reason
        });
      } else if (isPassed) {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'PASSED'
        });
      } else {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: 'AVAILABLE'
        });
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
    slotMinutes: Number(rule.slot_minutes),
    timeZone: 'Asia/Kolkata',
    rule: rule.id ? toAvailabilityRule(rule) : {
      id: null,
      chargerId: Number(chargerId),
      dayOfWeek: dayOfWeek,
      startsAt: rule.starts_at,
      endsAt: rule.ends_at,
      slotMinutes: Number(rule.slot_minutes),
      isActive: rule.is_active
    },
    operatingHours: {
      startsAt: toIsoAtLocalTime(date, rule.starts_at),
      endsAt: toIsoAtLocalTime(date, rule.ends_at)
    },
    bookedSlots,
    overrides,
    availableSlots,
    slots
  };
}

export async function getChargerAvailabilitySettings(user, chargerId, date) {
  await assertCanManageCharger({ query }, user, chargerId);

  const rulesResult = await query(
    `
      SELECT id, charger_id, day_of_week, starts_at::text, ends_at::text, slot_minutes, is_active
      FROM charger_availability_rules
      WHERE charger_id = $1
      ORDER BY day_of_week ASC
    `,
    [chargerId]
  );
  const rules = rulesResult.rows.map(toAvailabilityRule);
  const overridesParams = [chargerId];
  let overridesWhere = '';

  if (date) {
    const dayStart = toIsoAtLocalHour(date, 0);
    const nextDay = new Date(`${date}T00:00:00${AVAILABILITY_TIME_ZONE_OFFSET}`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    overridesParams.push(dayStart, nextDay.toISOString());
    overridesWhere = 'AND starts_at < $3 AND ends_at > $2';
  }

  const overridesResult = await query(
    `
      SELECT id, charger_id, starts_at, ends_at, status, reason, created_at
      FROM charger_availability_overrides
      WHERE charger_id = $1
        ${overridesWhere}
      ORDER BY starts_at ASC
      LIMIT 100
    `,
    overridesParams
  );

  return {
    rules,
    overrides: overridesResult.rows.map(toAvailabilityOverride)
  };
}

export async function updateChargerAvailabilityRules(user, chargerId, rules) {
  return withTransaction(async (client) => {
    await assertCanManageCharger(client, user, chargerId);

    await client.query('DELETE FROM charger_availability_rules WHERE charger_id = $1', [chargerId]);

    const savedRules = [];

    for (const rule of rules) {
      const result = await client.query(
        `
          INSERT INTO charger_availability_rules (
            charger_id,
            day_of_week,
            starts_at,
            ends_at,
            slot_minutes,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, charger_id, day_of_week, starts_at::text, ends_at::text, slot_minutes, is_active
        `,
        [
          chargerId,
          rule.dayOfWeek,
          rule.startsAt,
          rule.endsAt,
          rule.slotMinutes,
          rule.isActive
        ]
      );

      savedRules.push(toAvailabilityRule(result.rows[0]));
    }

    return savedRules;
  });
}

export async function upsertChargerAvailabilityOverride(user, chargerId, input) {
  return withTransaction(async (client) => {
    await assertCanManageCharger(client, user, chargerId);

    const result = await client.query(
      `
        INSERT INTO charger_availability_overrides (
          charger_id,
          starts_at,
          ends_at,
          status,
          reason
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (charger_id, starts_at, ends_at)
        DO UPDATE SET
          status = EXCLUDED.status,
          reason = EXCLUDED.reason,
          updated_at = now()
        RETURNING id, charger_id, starts_at, ends_at, status, reason, created_at
      `,
      [
        chargerId,
        input.startsAt,
        input.endsAt,
        input.status,
        input.reason ?? null
      ]
    );

    return toAvailabilityOverride(result.rows[0]);
  });
}

export async function deleteChargerAvailabilityOverride(user, chargerId, overrideId) {
  await assertCanManageCharger({ query }, user, chargerId);

  const result = await query(
    `
      DELETE FROM charger_availability_overrides
      WHERE id = $1
        AND charger_id = $2
    `,
    [overrideId, chargerId]
  );

  if (result.rowCount === 0) {
    throw new AppError('Availability override not found.', 404, 'AVAILABILITY_OVERRIDE_NOT_FOUND');
  }
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
        op.display_name AS owner_display_name,
        c.latitude,
        c.longitude,
        array_agg(cct.connector_type ORDER BY cct.connector_type) AS connector_types,
        c.power_kw,
        c.price_per_hour,
        c.charger_count,
        c.status,
        c.created_at
      FROM chargers c
      JOIN owner_profiles op ON op.id = c.owner_profile_id
      JOIN charger_connector_types cct ON cct.charger_id = c.id
      WHERE c.id = $1
      GROUP BY c.id, op.id
    `,
    [chargerId]
  );
}

async function assertCanManageCharger(client, user, chargerId) {
  const result = await client.query(
    `
      SELECT
        c.id,
        c.owner_profile_id,
        c.status,
        op.user_id AS owner_user_id
      FROM chargers c
      JOIN owner_profiles op ON op.id = c.owner_profile_id
      WHERE c.id = $1
    `,
    [chargerId]
  );

  const charger = result.rows[0];

  if (!charger) {
    throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
  }

  if (user.role !== 'ADMIN' && Number(charger.owner_user_id) !== user.id) {
    throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
  }

  return charger;
}

export async function updateCharger(user, chargerId, input) {
  return withTransaction(async (client) => {
    await assertCanManageCharger(client, user, chargerId);

    const currentResult = await findChargerById(client.query.bind(client), chargerId);
    const current = currentResult.rows[0];

    const result = await client.query(
      `
        UPDATE chargers
        SET name = $2,
            description = $3,
            address_line_1 = $4,
            city = $5,
            state = $6,
            postal_code = $7,
            country = $8,
            latitude = $9,
            longitude = $10,
            power_kw = $11,
            price_per_hour = $12,
            charger_count = $13,
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [
        chargerId,
        input.name ?? current.name,
        input.description === undefined ? current.description : input.description,
        input.addressLine1 ?? current.address_line_1,
        input.city ?? current.city,
        input.state ?? current.state,
        input.postalCode ?? current.postal_code,
        input.country ?? current.country,
        input.latitude ?? current.latitude,
        input.longitude ?? current.longitude,
        input.powerKw ?? current.power_kw,
        input.pricePerHour ?? current.price_per_hour,
        input.chargerCount ?? current.charger_count
      ]
    );

    if (input.connectorTypes) {
      await client.query('DELETE FROM charger_connector_types WHERE charger_id = $1', [chargerId]);
      await client.query(
        `
          INSERT INTO charger_connector_types (charger_id, connector_type)
          SELECT DISTINCT $1::bigint, unnest($2::connector_type[])
        `,
        [chargerId, input.connectorTypes]
      );
    }

    const updated = await findChargerById(client.query.bind(client), result.rows[0].id);
    return updated.rows[0];
  });
}

export async function updateChargerStatus(user, chargerId, status) {
  return withTransaction(async (client) => {
    const charger = await assertCanManageCharger(client, user, chargerId);

    if (charger.status === 'PENDING_VERIFICATION' && status === 'ACTIVE') {
      throw new AppError('Pending chargers must be verified by an admin before activation.', 409, 'CHARGER_NOT_VERIFIED');
    }

    if (charger.status === 'SUSPENDED' && user.role !== 'ADMIN') {
      throw new AppError('Suspended chargers cannot be changed by owner.', 403, 'CHARGER_SUSPENDED');
    }

    const result = await client.query(
      `
        UPDATE chargers
        SET status = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [chargerId, status]
    );

    const updated = await findChargerById(client.query.bind(client), result.rows[0].id);
    return updated.rows[0];
  });
}

export async function createCharger(userId, input) {
  return withTransaction(async (client) => {
    const ownerProfileResult = await client.query(
      `
        SELECT id, verification_status
        FROM owner_profiles
        WHERE user_id = $1
      `,
      [userId]
    );

    const ownerProfile = ownerProfileResult.rows[0];

    if (!ownerProfile) {
      throw new AppError('Owner profile is required before listing chargers.', 403, 'OWNER_PROFILE_REQUIRED');
    }

    if (ownerProfile.verification_status !== 'VERIFIED') {
      throw new AppError('Owner profile must be approved before listing chargers.', 403, 'OWNER_PROFILE_NOT_VERIFIED');
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
          price_per_hour,
          charger_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        input.pricePerHour,
        input.chargerCount
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
