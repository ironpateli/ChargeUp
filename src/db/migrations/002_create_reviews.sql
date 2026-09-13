CREATE TABLE reviews (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  charger_id bigint NOT NULL REFERENCES chargers(id),
  booking_id bigint NOT NULL UNIQUE REFERENCES bookings(id),
  rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX reviews_charger_id_idx ON reviews(charger_id);
CREATE INDEX reviews_user_id_idx ON reviews(user_id);
