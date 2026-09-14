import { pool, withTransaction } from '../shared/db.js';
import { hashPassword } from '../shared/security/password.js';

const DEMO_PASSWORD = 'StrongPass123';

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

async function upsertDemoCharger(client, ownerProfileId) {
  const existing = await client.query(
    `
      SELECT id
      FROM chargers
      WHERE owner_profile_id = $1
        AND name = 'ChargeUp Demo Fast Charger'
    `,
    [ownerProfileId]
  );

  let chargerId = existing.rows[0]?.id;

  if (chargerId) {
    await client.query(
      `
        UPDATE chargers
        SET description = 'Demo charger for local development and frontend testing.',
            address_line_1 = 'Bandra Kurla Complex',
            city = 'Mumbai',
            state = 'Maharashtra',
            postal_code = '400051',
            country = 'India',
            latitude = 19.059600,
            longitude = 72.865600,
            power_kw = 60.00,
            price_per_hour = 180.00,
            charger_count = 1,
            status = 'ACTIVE',
            updated_at = now()
        WHERE id = $1
      `,
      [chargerId]
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
          status
        )
        VALUES (
          $1,
          'ChargeUp Demo Fast Charger',
          'Demo charger for local development and frontend testing.',
          'Bandra Kurla Complex',
          'Mumbai',
          'Maharashtra',
          '400051',
          'India',
          19.059600,
          72.865600,
          60.00,
          180.00,
          'ACTIVE'
        )
        RETURNING id
      `,
      [ownerProfileId]
    );

    chargerId = created.rows[0].id;
  }

  await client.query('DELETE FROM charger_connector_types WHERE charger_id = $1', [chargerId]);
  await client.query(
    `
      INSERT INTO charger_connector_types (charger_id, connector_type)
      VALUES
        ($1, 'CCS2'),
        ($1, 'TYPE_2')
    `,
    [chargerId]
  );

  await client.query(
    `
      INSERT INTO charger_units (charger_id, unit_number)
      VALUES ($1, 1)
      ON CONFLICT (charger_id, unit_number)
      DO UPDATE SET
        status = 'ACTIVE',
        updated_at = now()
    `,
    [chargerId]
  );

  await client.query(
    `
      UPDATE charger_units
      SET status = 'INACTIVE',
          updated_at = now()
      WHERE charger_id = $1
        AND unit_number > 1
    `,
    [chargerId]
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

    const charger = await upsertDemoCharger(client, ownerProfile.id);
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
      bookings
    };
  });

  console.log('Seed complete.');
  console.log(`Demo password for all users: ${DEMO_PASSWORD}`);
  console.log(`Admin: ${result.admin.email}`);
  console.log(`Owner: ${result.owner.email}`);
  console.log(`User: ${result.user.email}`);
  console.log(`Active charger id: ${result.charger.id}`);
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
