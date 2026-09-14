CREATE TYPE payment_status AS ENUM ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED');
CREATE TYPE payment_provider AS ENUM ('MOCK', 'RAZORPAY');

CREATE TABLE payments (
  id bigserial PRIMARY KEY,
  booking_id bigint NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id),
  provider payment_provider NOT NULL,
  provider_order_id text NOT NULL UNIQUE,
  provider_payment_id text,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status payment_status NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount_paise > 0)
);

ALTER TABLE bookings
  DROP CONSTRAINT bookings_no_overlapping_confirmed_unit_slots,
  ADD CONSTRAINT bookings_no_overlapping_active_unit_slots
  EXCLUDE USING GIST (
    charger_unit_id WITH =,
    booked_range WITH &&
  )
  WHERE (status IN ('CONFIRMED', 'PENDING_PAYMENT'));

CREATE INDEX payments_user_id_idx ON payments(user_id);
CREATE INDEX payments_booking_id_idx ON payments(booking_id);
CREATE INDEX payments_status_idx ON payments(status);
