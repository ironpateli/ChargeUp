ALTER TABLE chargers
  ADD COLUMN charger_count integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT chargers_charger_count_positive CHECK (charger_count > 0);
