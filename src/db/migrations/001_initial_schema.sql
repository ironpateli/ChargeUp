CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('EV_USER', 'CHARGER_OWNER', 'ADMIN');
CREATE TYPE owner_verification_status AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE charger_status AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE connector_type AS ENUM ('CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'TESLA_NACS');
CREATE TYPE booking_status AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');

CREATE TABLE users (
  id bigserial PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'EV_USER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owner_profiles (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL UNIQUE REFERENCES users(id),
  display_name text NOT NULL,
  verification_status owner_verification_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  payout_account_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chargers (
  id bigserial PRIMARY KEY,
  owner_profile_id bigint NOT NULL REFERENCES owner_profiles(id),
  name text NOT NULL,
  description text,
  address_line_1 text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'India',
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  location geography(Point, 4326)
    GENERATED ALWAYS AS (
      ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
    ) STORED,
  power_kw numeric(6, 2) NOT NULL,
  price_per_hour numeric(10, 2) NOT NULL,
  status charger_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chargers_power_positive CHECK (power_kw > 0),
  CONSTRAINT chargers_price_non_negative CHECK (price_per_hour >= 0),
  CONSTRAINT chargers_latitude_valid CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chargers_longitude_valid CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE charger_connector_types (
  charger_id bigint NOT NULL REFERENCES chargers(id) ON DELETE CASCADE,
  connector_type connector_type NOT NULL,
  PRIMARY KEY (charger_id, connector_type)
);

CREATE INDEX chargers_location_gix ON chargers USING GIST (location);
CREATE INDEX chargers_status_idx ON chargers(status);
CREATE INDEX chargers_owner_profile_id_idx ON chargers(owner_profile_id);
CREATE INDEX charger_connector_types_connector_type_idx
  ON charger_connector_types(connector_type);

CREATE TABLE bookings (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  charger_id bigint NOT NULL REFERENCES chargers(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  booked_range tstzrange
    GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status booking_status NOT NULL DEFAULT 'CONFIRMED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_valid_time_range CHECK (ends_at > starts_at),
  CONSTRAINT bookings_no_overlapping_confirmed_slots
  EXCLUDE USING GIST (
    charger_id WITH =,
    booked_range WITH &&
  )
  WHERE (status = 'CONFIRMED')
);

CREATE INDEX bookings_user_id_idx ON bookings(user_id);
CREATE INDEX bookings_charger_id_idx ON bookings(charger_id);
CREATE INDEX bookings_starts_at_idx ON bookings(starts_at);
