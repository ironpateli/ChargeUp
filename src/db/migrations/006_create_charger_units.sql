CREATE TYPE charger_unit_status AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

CREATE TABLE charger_units (
  id bigserial PRIMARY KEY,
  charger_id bigint NOT NULL REFERENCES chargers(id) ON DELETE CASCADE,
  unit_number integer NOT NULL,
  status charger_unit_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charger_units_unit_number_positive CHECK (unit_number > 0),
  CONSTRAINT charger_units_unique_unit_number UNIQUE (charger_id, unit_number)
);

INSERT INTO charger_units (charger_id, unit_number)
SELECT c.id, unit_number
FROM chargers c
CROSS JOIN LATERAL generate_series(1, c.charger_count) AS unit_number;

ALTER TABLE bookings
  ADD COLUMN charger_unit_id bigint REFERENCES charger_units(id);

UPDATE bookings b
SET charger_unit_id = (
  SELECT cu.id
  FROM charger_units cu
  WHERE cu.charger_id = b.charger_id
  ORDER BY cu.unit_number ASC
  LIMIT 1
);

ALTER TABLE bookings
  ALTER COLUMN charger_unit_id SET NOT NULL,
  DROP CONSTRAINT bookings_no_overlapping_confirmed_slots,
  ADD CONSTRAINT bookings_no_overlapping_confirmed_unit_slots
  EXCLUDE USING GIST (
    charger_unit_id WITH =,
    booked_range WITH &&
  )
  WHERE (status = 'CONFIRMED');

CREATE INDEX charger_units_charger_id_status_idx
  ON charger_units(charger_id, status);

CREATE INDEX bookings_charger_unit_id_idx
  ON bookings(charger_unit_id);
