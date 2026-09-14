CREATE TYPE availability_override_status AS ENUM ('AVAILABLE', 'UNAVAILABLE');

CREATE TABLE charger_availability_rules (
  id bigserial PRIMARY KEY,
  charger_id bigint NOT NULL REFERENCES chargers(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charger_availability_rules_day_valid CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT charger_availability_rules_time_range_valid CHECK (ends_at > starts_at),
  CONSTRAINT charger_availability_rules_slot_minutes_valid CHECK (slot_minutes IN (30, 60, 120)),
  CONSTRAINT charger_availability_rules_unique_day UNIQUE (charger_id, day_of_week)
);

CREATE TABLE charger_availability_overrides (
  id bigserial PRIMARY KEY,
  charger_id bigint NOT NULL REFERENCES chargers(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status availability_override_status NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charger_availability_overrides_time_range_valid CHECK (ends_at > starts_at),
  CONSTRAINT charger_availability_overrides_unique_slot UNIQUE (charger_id, starts_at, ends_at)
);

CREATE INDEX charger_availability_rules_charger_id_idx
  ON charger_availability_rules(charger_id);

CREATE INDEX charger_availability_overrides_charger_time_idx
  ON charger_availability_overrides(charger_id, starts_at, ends_at);
