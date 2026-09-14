import { pool, withTransaction } from '../shared/db.js';
import { hashPassword } from '../shared/security/password.js';

const DEMO_PASSWORD = 'StrongPass123';
const DEMO_CHARGERS = [
  {
    name: 'ChargeUp Demo Fast Charger',
    description: 'Demo charger for local development and frontend testing.',
    addressLine1: 'Bandra Kurla Complex',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400051',
    country: 'India',
    latitude: 19.059600,
    longitude: 72.865600,
    powerKw: 60.00,
    pricePerHour: 180.00,
    chargerCount: 1,
    status: 'ACTIVE',
    connectorTypes: ['CCS2', 'TYPE_2']
  },
  {
    name: 'Worli Sea Link Charge Hub',
    description: 'High-speed charging near Worli for city and highway drivers.',
    addressLine1: 'Worli Sea Face',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400030',
    country: 'India',
    latitude: 19.017600,
    longitude: 72.817900,
    powerKw: 120.00,
    pricePerHour: 260.00,
    chargerCount: 3,
    status: 'ACTIVE',
    connectorTypes: ['CCS2', 'TESLA_NACS']
  },
  {
    name: 'Andheri Metro EV Point',
    description: 'Mid-speed charger close to metro and office routes.',
    addressLine1: 'Andheri East Metro Station',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400069',
    country: 'India',
    latitude: 19.119700,
    longitude: 72.846400,
    powerKw: 22.00,
    pricePerHour: 120.00,
    chargerCount: 2,
    status: 'ACTIVE',
    connectorTypes: ['TYPE_2']
  },
  {
    name: 'Powai Lake Charging Station',
    description: 'Neighbourhood charging spot serving Powai and IIT Bombay area.',
    addressLine1: 'Powai Lake Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    country: 'India',
    latitude: 19.119000,
    longitude: 72.905200,
    powerKw: 50.00,
    pricePerHour: 160.00,
    chargerCount: 2,
    status: 'ACTIVE',
    connectorTypes: ['CCS2', 'CHADEMO']
  },
  {
    name: 'Navi Mumbai Vashi EV Stop',
    description: 'Affordable charger near Vashi for Navi Mumbai test searches.',
    addressLine1: 'Sector 17, Vashi',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '400703',
    country: 'India',
    latitude: 19.076200,
    longitude: 72.998000,
    powerKw: 30.00,
    pricePerHour: 95.00,
    chargerCount: 2,
    status: 'ACTIVE',
    connectorTypes: ['CCS2', 'GB_T']
  },
  {
    name: 'Colaba Heritage Slow Charger',
    description: 'Slower destination charger for longer city parking sessions.',
    addressLine1: 'Apollo Bandar, Colaba',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
    latitude: 18.921700,
    longitude: 72.833100,
    powerKw: 7.40,
    pricePerHour: 70.00,
    chargerCount: 1,
    status: 'ACTIVE',
    connectorTypes: ['TYPE_2']
  }
];

async function upsertUser(client, { fullName, email, role }) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const result = await client.query(
    `
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        updated_at = now()
      RETURNING id, email, role
    `,
    [fullName, email, passwordHash, role]
  );

  return result.rows[0];
}

async function upsertOwnerProfile(client, { userId, displayName }) {
  const result = await client.query(
    `
      INSERT INTO owner_profiles (
        user_id,
        display_name,
        verification_status,
        payout_account_reference
      )
      VALUES ($1, $2, 'VERIFIED', 'demo-payout-reference')
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        verification_status = 'VERIFIED',
        updated_at = now()
      RETURNING id
    `,
    [userId, displayName]
  );

  return result.rows[0];
}

async function upsertDemoCharger(client, ownerProfileId, charger) {
  const existing = await client.query(
    `
      SELECT id
      FROM chargers
      WHERE owner_profile_id = $1
        AND name = $2
    `,
    [ownerProfileId, charger.name]
  );

  let chargerId = existing.rows[0]?.id;

  if (chargerId) {
    await client.query(
      `
        UPDATE chargers
        SET description = $2,
            address_line_1 = $3,
            city = $4,
            state = $5,
            postal_code = $6,
            country = $7,
            latitude = $8,
            longitude = $9,
            power_kw = $10,
            price_per_hour = $11,
            charger_count = $12,
            status = $13,
            updated_at = now()
        WHERE id = $1
      `,
      [
        chargerId,
        charger.description,
        charger.addressLine1,
        charger.city,
        charger.state,
        charger.postalCode,
        charger.country,
        charger.latitude,
        charger.longitude,
        charger.powerKw,
        charger.pricePerHour,
        charger.chargerCount,
        charger.status
      ]
    );
  } else {
    const created = await client.query(
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
          charger_count,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14
        )
        RETURNING id
      `,
      [
        ownerProfileId,
        charger.name,
        charger.description,
        charger.addressLine1,
        charger.city,
        charger.state,
        charger.postalCode,
        charger.country,
        charger.latitude,
        charger.longitude,
        charger.powerKw,
        charger.pricePerHour,
        charger.chargerCount,
        charger.status
      ]
    );

    chargerId = created.rows[0].id;
  }

  await client.query('DELETE FROM charger_connector_types WHERE charger_id = $1', [chargerId]);
  await client.query(
    `
      INSERT INTO charger_connector_types (charger_id, connector_type)
      SELECT DISTINCT $1::bigint, unnest($2::connector_type[])
    `,
    [chargerId, charger.connectorTypes]
  );

  await client.query(
    `
      INSERT INTO charger_units (charger_id, unit_number)
      SELECT $1, unit_number
      FROM generate_series(1, $2::integer) AS unit_number
      ON CONFLICT (charger_id, unit_number)
      DO UPDATE SET
        status = 'ACTIVE',
        updated_at = now()
    `,
    [chargerId, charger.chargerCount]
  );

  await client.query(
    `
      UPDATE charger_units
      SET status = 'INACTIVE',
          updated_at = now()
      WHERE charger_id = $1
        AND unit_number > $2
    `,
    [chargerId, charger.chargerCount]
  );

  return { id: chargerId };
}

async function recreateDemoBookings(client, { userId, chargerId }) {
  const unitResult = await client.query(
    `
      SELECT id
      FROM charger_units
      WHERE charger_id = $1
        AND unit_number = 1
        AND status = 'ACTIVE'
    `,
    [chargerId]
  );
  const chargerUnitId = unitResult.rows[0].id;

  await client.query(
    `
      DELETE FROM reviews
      WHERE booking_id IN (
        SELECT id
        FROM bookings
        WHERE user_id = $1
          AND charger_id = $2
      )
    `,
    [userId, chargerId]
  );

  await client.query(
    `
      DELETE FROM bookings
      WHERE user_id = $1
        AND charger_id = $2
    `,
    [userId, chargerId]
  );

  const confirmed = await client.query(
    `
      INSERT INTO bookings (
        user_id,
        charger_id,
        charger_unit_id,
        starts_at,
        ends_at,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        '2026-10-20T10:00:00+05:30',
        '2026-10-20T11:00:00+05:30',
        'CONFIRMED'
      )
      RETURNING id
    `,
    [userId, chargerId, chargerUnitId]
  );

  const completed = await client.query(
    `
      INSERT INTO bookings (
        user_id,
        charger_id,
        charger_unit_id,
        starts_at,
        ends_at,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        '2026-10-19T08:00:00+05:30',
        '2026-10-19T09:00:00+05:30',
        'COMPLETED'
      )
      RETURNING id
    `,
    [userId, chargerId, chargerUnitId]
  );

  await client.query(
    `
      INSERT INTO reviews (
        user_id,
        charger_id,
        booking_id,
        rating,
        comment
      )
      VALUES ($1, $2, $3, 5, 'Smooth demo charging session.')
    `,
    [userId, chargerId, completed.rows[0].id]
  );

  return {
    confirmedBookingId: confirmed.rows[0].id,
    completedBookingId: completed.rows[0].id
  };
}

async function seed() {
  const result = await withTransaction(async (client) => {
    const admin = await upsertUser(client, {
      fullName: 'ChargeUp Admin',
      email: 'admin@chargeup.test',
      role: 'ADMIN'
    });

    const owner = await upsertUser(client, {
      fullName: 'ChargeUp Demo Owner',
      email: 'owner@chargeup.test',
      role: 'CHARGER_OWNER'
    });

    const user = await upsertUser(client, {
      fullName: 'ChargeUp Demo User',
      email: 'user@chargeup.test',
      role: 'EV_USER'
    });

    const ownerProfile = await upsertOwnerProfile(client, {
      userId: owner.id,
      displayName: 'ChargeUp Demo Owner'
    });

    const chargers = [];

    for (const demoCharger of DEMO_CHARGERS) {
      chargers.push(await upsertDemoCharger(client, ownerProfile.id, demoCharger));
    }

    const charger = chargers[0];
    const bookings = await recreateDemoBookings(client, {
      userId: user.id,
      chargerId: charger.id
    });

    return {
      admin,
      owner,
      user,
      ownerProfile,
      charger,
      chargers,
      bookings
    };
  });

  console.log('Seed complete.');
  console.log(`Demo password for all users: ${DEMO_PASSWORD}`);
  console.log(`Admin: ${result.admin.email}`);
  console.log(`Owner: ${result.owner.email}`);
  console.log(`User: ${result.user.email}`);
  console.log(`Active charger ids: ${result.chargers.map((charger) => charger.id).join(', ')}`);
  console.log(`Confirmed booking id: ${result.bookings.confirmedBookingId}`);
  console.log(`Completed booking id: ${result.bookings.completedBookingId}`);
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
