# ChargeUp System Design

## 1. Core Product

ChargeUp is a marketplace and booking system for EV chargers.

It has two sides:

- EV users who need to find and book charging.
- Charger owners who want to rent out private chargers.

## 2. Functional Requirements

### User Features

- Register and log in.
- Search chargers near a location.
- Filter chargers by connector type, price, speed, and availability.
- View charger details.
- Book a fixed time slot.
- Cancel a booking.
- View booking history.

### Owner Features

- Register as an owner.
- List a charger.
- Set charger location, connector types, speed, price, and availability.
- View upcoming bookings.

### Admin Features Later

- Verify charger listings.
- Suspend suspicious chargers or users.
- Resolve disputes.

## 3. Non-Functional Requirements

### Consistency

A charger must not be double-booked for overlapping time ranges.

### Availability

Search should continue working even if optional systems like payments or notifications are unavailable.

### Low Latency

Nearby search should return quickly. Users expect map interactions to feel responsive.

### Scalability

The design should scale from one city to many cities without rewriting the whole backend.

### Security

Users should only modify their own bookings. Owners should only modify their own chargers.

### Extensibility

Payments, notifications, dynamic pricing, and charger IoT status should be addable later.

## 4. High-Level Architecture

```text
Web or Mobile Client
        |
        v
Express API
        |
        v
Domain Modules
        |
        v
PostgreSQL + PostGIS
```

For the portfolio version, this is enough:

```text
React Client later
        |
        v
Node.js + Express modular monolith
        |
        v
PostgreSQL + PostGIS
```

## 5. Why Modular Monolith First

A modular monolith means one deployable backend with clean folders and boundaries.

Benefits:

- Easier to build.
- Easier to debug.
- Easier to test.
- Still demonstrates real system design.
- Can be split into services later if traffic or team size demands it.

Possible future services:

- Search service
- Booking service
- Payment service
- Notification service

Do not start with microservices. They add distributed-system complexity before the project needs it.

## 5.1 Normalized Core Data Model

The initial schema separates login identity from charger ownership:

```text
users
  account and authentication data

owner_profiles
  owner display identity, verification state, and payout reference

chargers
  physical charger listing
```

This means a user account can become an owner by creating an owner profile. The charger belongs to the owner profile, not directly to the user account.

Connector types use a normalized join table while still using an enum:

```text
connector_type enum
  CCS2, TYPE_2, CHADEMO, GB_T, TESLA_NACS

charger_connector_types
  charger_id
  connector_type
```

This avoids storing arrays inside `chargers`, so the relationship is normalized. It also avoids a separate connector lookup table for now, because PostgreSQL validates allowed connector names through the enum.

If the project later needs connector metadata such as max power, icon, region, or compatibility notes, this can be migrated into a full `connector_types` lookup table.

## 6. Payment Gateway Decision

For MVP:

- Use a mock payment provider.
- Store payment records and webhook-like state transitions.
- Learn payment architecture without needing real money movement.

For India production:

- Prefer Razorpay first.

For international production:

- Stripe is excellent, but new Stripe accounts in India are invite-only at the time of writing.

Design rule:

```text
Booking module should not directly depend on Razorpay or Stripe.
Booking module depends on a PaymentProvider interface.
```

## 7. Search Decision

Use PostgreSQL + PostGIS first.

This is enough for:

- radius search
- distance sorting
- city filtering
- connector filtering
- price filtering
- availability filtering

Use Elasticsearch later only if we need:

- typo-tolerant search
- natural-language station search
- very advanced ranking
- autocomplete over large text-heavy datasets
- logs or analytics search

## 8. How PostGIS Optimizes Search

Normal latitude/longitude columns are just numbers. PostgreSQL can store them, but it does not automatically understand distance.

PostGIS adds spatial types and spatial indexes.

For ChargeUp:

```text
charger.location = geography(Point, 4326)
```

Then we create a GiST index:

```sql
CREATE INDEX chargers_location_gix ON chargers USING GIST (location);
```

Now this query can use the spatial index:

```sql
WHERE ST_DWithin(location, user_point, radius_meters)
```

That avoids checking every charger one by one.

Connector filtering uses the `charger_connector_types` join table:

```sql
CREATE INDEX charger_connector_types_connector_type_idx
  ON charger_connector_types(connector_type);
```

This lets PostgreSQL quickly find charger IDs that support a requested connector type.

## 9. Booking Consistency Options

### Option A: Check Then Insert

Backend checks for an overlapping booking before inserting.

Simple, but unsafe under high concurrency unless done carefully inside a transaction.

### Option B: Row Locking

Lock the charger row while booking.

Works, but can reduce concurrency because unrelated future time slots for the same charger may wait behind each other.

### Option C: PostgreSQL Exclusion Constraint

Let the database reject overlapping time ranges for the same charger.

This is the best first serious design.

Concept:

```text
For the same charger_id, confirmed booking time ranges must not overlap.
```

The database becomes the final authority. Even if two API requests arrive at the same millisecond, one succeeds and the other fails.

## 10. MVP Scope

Build first:

- Auth
- Charger listing
- Nearby charger search
- Booking creation
- Booking cancellation
- Owner booking view

Build later:

- Payments
- Reviews
- Admin verification
- Notifications
- Dynamic pricing
- Temporary holds
