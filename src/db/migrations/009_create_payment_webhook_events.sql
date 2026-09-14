CREATE TABLE payment_webhook_events (
  id bigserial PRIMARY KEY,
  provider payment_provider NOT NULL,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_webhook_events_provider_idx
  ON payment_webhook_events(provider);

CREATE INDEX payment_webhook_events_event_type_idx
  ON payment_webhook_events(event_type);
