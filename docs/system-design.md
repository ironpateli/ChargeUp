# ChargeUp System Design

## 1. Core Product

ChargeUp is a marketplace and booking system for EV chargers.

It has three main actors:

- EV users who need to find and book charging.
- Charger owners who want to rent out private chargers.
- Admins who manage trust, verification, and system-level control.

## 2. Functional Requirements

### User Features

- Register and log in.
- Search chargers near a location.
- Search chargers by name, location text, and connector type.
- Filter chargers by active status and connector type.
- Sort chargers by nearest, fastest, or cheapest.
- View chargers on a map.
- View charger details.
- Check charger availability.
- Book a fixed time slot.
- Cancel a booking.
- View booking history.
- Separate confirmed, completed, and cancelled bookings.
- Clear completed or cancelled booking history.
- Create and view charger reviews.

### Owner Features

- Request an owner profile.
- Wait for admin approval before listing chargers.
- List a charger after approval.
- Set charger location, connector types, speed, price, and status.
- Set the number of charging units at a station/listing.
- Update charger details.
- Activate or deactivate owned chargers.
- Define weekly active hours.
- Disable or re-enable individual slots.
- View bookings for owned chargers.

### Admin Features

- View pending owner profile requests.
- Approve owner requests.
- Reject owner requests.
- Suspend owners.
- Restore suspended owners.
- Create owner accounts directly.
- View all owner profiles.
- View all chargers.
- Verify charger listings.
- Activate, deactivate, or suspend chargers.
- Search, sort, and filter admin lists.

## 3. Non-Functional Requirements

### Consistency

A charger must not be double-booked for overlapping confirmed time ranges.

The database enforces this with a PostgreSQL exclusion constraint on:

```text
charger_id + booked_range
```

This makes PostgreSQL the final authority even if two users try to book the same slot at almost the same time.

### Availability

Core search should continue working even if optional systems such as payments, notifications, or analytics are unavailable.

### Low Latency

Map search and filters should feel responsive. Nearby search uses PostGIS and indexes instead of scanning every charger row manually.

### Scalability

The current design should scale from one city to multiple cities without rewriting the whole backend.

Scaling steps later:

- Add pagination.
- Add caching for common searches.
- Add read replicas.
- Split search/payment/notification services only if needed.

### Security

- Users should only modify their own bookings.
- Owners should only modify their own chargers.
- Admins can manage system-wide owner and charger data.
- Passwords are hashed with bcrypt.
- API access is protected using JWT access tokens.
- Request bodies are validated before service logic runs.

### Extensibility

Payments, notifications, payout logic, dynamic pricing, IoT charger status, and real-world charger dataset imports should be addable without rewriting the core modules.

## 4. High-Level Architecture

```text
React Client
  |
  v
Express API
  |
  v
Domain Services
  |
  v
PostgreSQL + PostGIS
```

More detailed view:

```text
Browser
  - React
  - React Router
  - Leaflet map
  - Shared API client

Express App
  - helmet
  - cors
  - express.json
  - morgan
  - auth middleware
  - validation middleware
  - error handling middleware

Modules
  - auth
  - owner-profiles
  - owner
  - chargers
  - bookings
  - reviews
  - admin

Database
  - PostgreSQL
  - PostGIS
  - pg_trgm
  - GiST indexes
  - relational constraints
```

## 5. Why Modular Monolith First

A modular monolith means one deployable backend with clean internal folders and boundaries.

Benefits:

- Easier to build.
- Easier to debug.
- Easier to test.
- Easier to understand while learning.
- Still demonstrates real system design.
- Can be split into services later if traffic or team size demands it.

Do not start with microservices here. They add distributed-system complexity before the project needs it.

Possible future services:

- Search service.
- Booking service.
- Payment service.
- Notification service.
- Admin/audit service.

## 6. Current Data Model

The schema separates account identity from charger ownership:

```text
users
  account, auth, and role data

owner_profiles
  owner display identity, verification state, and payout reference

chargers
  physical charger listing

charger_connector_types
  normalized connector relationship

charger_availability_rules
  weekly active hours and slot duration per charger

charger_availability_overrides
  individual slot availability changes

charger_units
  physical charging units under one station/listing

bookings
  user reservations assigned to one charging unit

reviews
  user feedback for chargers
```

This means a user account can become an owner by creating an owner profile. The charger belongs to the owner profile, not directly to the user account.

Connector types use a normalized join table while still using a PostgreSQL enum:

```text
connector_type enum
  CCS2, TYPE_2, CHADEMO, GB_T, TESLA_NACS

charger_connector_types
  charger_id
  connector_type
```

This avoids storing connector arrays inside `chargers`, so the relationship stays normalized. It also avoids a separate connector lookup table for now because PostgreSQL validates allowed connector names through the enum.

If the project later needs connector metadata such as max power, icon, region, or compatibility notes, this can be migrated into a full `connector_types` lookup table.

## 7. Search Design

Use PostgreSQL + PostGIS first.

This is enough for:

- Radius search.
- Nearest-first sorting.
- City/state/address filtering.
- Connector filtering.
- Status filtering.
- Price filtering.
- Speed filtering.
- Availability checks.
- Basic fuzzy text search with `pg_trgm`.

Elasticsearch can be added later only if needed for:

- Large-scale autocomplete.
- Typo-tolerant ranking.
- Natural-language station search.
- Advanced relevance scoring.
- Analytics/log search.

## 8. How PostGIS Optimizes Search

Normal latitude and longitude columns are just numbers. PostgreSQL can store them, but it does not automatically understand distance.

PostGIS adds spatial types and spatial indexes.

For ChargeUp:

```text
chargers.location = geography(Point, 4326)
```

The generated location column is built from:

```text
longitude, latitude
```

Then we create a GiST index:

```sql
CREATE INDEX chargers_location_gix ON chargers USING GIST (location);
```

This allows queries such as:

```sql
WHERE ST_DWithin(location, user_point, radius_meters)
ORDER BY ST_Distance(location, user_point)
```

Meaning:

- Find chargers within a radius.
- Sort closest first.
- Use a spatial index where possible.

## 9. Booking Consistency

The current version uses confirm-on-submit with physical unit assignment:

1. User views availability.
2. User submits a booking request.
3. Backend validates the requested slot against the owner's availability rule.
4. Backend finds one active charging unit that is not booked for that range.
5. Backend inserts the booking for that unit.
6. PostgreSQL rejects the insert if the same unit already has an overlapping confirmed booking.

The key database rule is:

```text
For the same charger_unit_id, confirmed booking time ranges must not overlap.
```

That means a station/listing with 4 active charging units can accept up to 4 confirmed bookings for the same time slot. Cancelled and completed bookings do not block future slots.

Expired confirmed bookings are automatically moved to `COMPLETED` when booking-related reads run.

## 10. Payment Gateway Plan

Payments are intentionally not implemented yet.

The recommended sequence is:

1. Add a `payments` table.
2. Add payment statuses such as `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`.
3. Create a mock payment provider.
4. Change booking creation to create a short-lived hold instead of immediate confirmation.
5. Confirm booking only after payment succeeds.
6. Add webhook handling.
7. Replace or supplement the mock provider with Razorpay.

For India-facing production, Razorpay is the practical first real provider.

For international expansion, Stripe can be added later through the same internal payment-provider interface.

Design rule:

```text
Booking logic should not directly depend on Razorpay or Stripe SDKs.
```

Instead:

```text
Booking service -> Payment service -> Payment provider implementation
```

## 11. Current MVP Status

Implemented:

- Auth.
- Role-based access.
- Owner profile approval flow.
- Charger listing.
- Charger search.
- Map UI.
- Availability slots.
- Owner-managed weekly availability.
- Individual slot overrides.
- Charger count per station/listing.
- Physical charger unit assignment.
- Capacity-aware booking slots.
- Booking creation.
- Booking cancellation.
- Booking completion.
- Booking history cleanup.
- Owner dashboard.
- Admin dashboard.
- Reviews.
- Friendly validation errors.

Not implemented yet:

- Payments.
- Payment holds.
- Webhooks.
- Notifications.
- Payouts.
- Audit logs.
- Full automated tests.
- Production deployment.

## 12. Roadmap

### Next Backend Features

- Mock payment gateway.
- Payment schema and service.
- Temporary booking holds.
- Razorpay integration.
- Webhook idempotency.
- Notification service.
- Forgot password flow.
- Rate limiting.
- Audit logs.
- Automated API tests.

### Next Frontend Features

- Payment screen.
- Payment success/failure states.
- Better review UI.
- Admin audit views.
- Cleaner owner availability schedule editor.
- Mobile responsiveness polish.
- UI/UX pass for empty states and loading states.

### Next Data Features

- Charger maintenance blocks.
- Import external charger datasets.
- Better fuzzy search ranking.
- Pagination for large lists.
- Search result caching.
