# ChargeUp

ChargeUp is an EV charger discovery, booking, and owner-management platform.

The project is being built as a learning-focused full-stack system using JavaScript, Node.js, Express, PostgreSQL, PostGIS, DBMS constraints, React, and system-design thinking.

## Current Architecture

```text
React Web Client
  - Login/register
  - Map-based charger search
  - Charger list and filters
  - Availability and booking flow
  - Booking history
  - Owner dashboard
  - Admin dashboard

Express API
  - Auth middleware
  - Role-based authorization
  - Request validation
  - Domain routes and services
  - Central error handling

Domain Modules
  - Auth
  - Owner profiles
  - Chargers
  - Search and availability
  - Bookings
  - Payments
  - Reviews
  - Admin controls

Data Layer
  - PostgreSQL
  - PostGIS for location search
  - pg_trgm for text search support
  - Exclusion constraints for booking conflicts
  - Normalized charger connector relationships
```

## Architecture Choices

### Backend

ChargeUp currently uses a modular monolith: one Express application split into domain modules.

This is the right first architecture because it is easier to build, debug, test, and understand while still teaching real production ideas such as authorization, transactions, validation, schema design, and consistency.

Possible future services:

- Search service
- Booking service
- Payment service
- Notification service

These should be split only when traffic, deployment needs, or team ownership make that complexity useful.

### Database

ChargeUp uses PostgreSQL with PostGIS.

PostgreSQL is enough for the current version because most search is structured:

- nearby chargers
- connector type
- charger status
- price
- charging speed
- availability
- owner/admin filters

Elasticsearch can be added later if the project needs very advanced fuzzy search, autocomplete at large scale, natural-language search, or complex ranking.

### Payments

Payments use a provider boundary.

Current behavior:

- `PAYMENT_PROVIDER=mock` confirms bookings immediately for local testing.
- `PAYMENT_PROVIDER=razorpay` creates a Razorpay order and confirms the booking after signature verification.
- Payment checkout creates a short-lived `PENDING_PAYMENT` booking hold.
- Pending payment holds consume charging-unit capacity.
- Expired pending payment holds are cancelled automatically when booking or availability flows run.

The booking module does not directly depend on Razorpay. It depends on the internal payment module/provider flow.

## Implemented Features

### Authentication and Authorization

- User registration.
- User login.
- JWT access tokens.
- Password hashing with bcrypt.
- Current user endpoint.
- Role-based authorization.
- Roles:
  - `EV_USER`
  - `CHARGER_OWNER`
  - `ADMIN`

### Validation and Error Handling

- Zod request validation.
- Field-level validation messages.
- Frontend displays useful errors such as `Email: Enter a valid email address.`
- Central Express error handler.
- Not-found handler.
- Booking conflict errors mapped from PostgreSQL exclusion constraints.

### Charger Search and Map

- Map interface using Leaflet.
- Default map location set to Mumbai.
- User location marker when browser location access is allowed.
- Search chargers by nearby location.
- Search by name/location text.
- Filter by connector type.
- Filter active chargers.
- Sort by nearest, fastest, and cheapest.
- Charger result list alongside the map.
- Charger marker selection.
- Charger details and availability view.

### Charger Management

- Owners can create chargers after owner approval.
- Owners can set the number of charging units at a station/listing.
- Owners can update charger details.
- Owners can activate or deactivate their chargers.
- Admins can view and control chargers across the system.
- Admins can verify chargers.
- Admins can activate, deactivate, or suspend chargers.

### Booking

- Users can book fixed time slots.
- Multi-unit stations can accept multiple bookings for the same time slot, one per active charging unit.
- Booking from the frontend goes through the payment checkout flow.
- Users can cancel bookings.
- Booked slots are shown as unavailable.
- Past dates and invalid time slots are rejected.
- Expired confirmed bookings automatically move to `COMPLETED`.
- Booking history is split into:
  - confirmed
  - completed
  - cancelled
- Users can clear cancelled booking history.
- Users can clear completed booking history.

### Availability Management

- Owners can define weekly active hours per charger.
- Owners can choose slot duration: 30, 60, or 120 minutes.
- Owners can disable individual generated slots.
- Owners can re-enable owner-disabled slots.

### Owner Flow

- Users can request an owner profile.
- Admin approval is required before a normal user becomes a charger owner.
- Owners can view their chargers.
- Owners can view bookings for their chargers.

### Admin Dashboard

- Admins can view pending owner requests.
- Admins can approve or reject owner requests.
- Admins can suspend or restore owners.
- Admins can create owner accounts directly.
- Admins can view all owners.
- Admins can view all chargers.
- Admin lists support search, sorting, filtering, and internal scrolling.

### Reviews

- Users can create reviews.
- Charger reviews can be listed.
- Review cleanup is handled when completed booking history is cleared.

### Payments

- Mock payment provider for local testing.
- Razorpay order creation when configured.
- Razorpay Checkout frontend integration.
- Razorpay signature verification endpoint.
- Payment records are stored in PostgreSQL.
- Pending payment bookings hold capacity until confirmed, cancelled, or expired.

## Current API Areas

```text
GET    /health

POST   /auth/register
POST   /auth/login
GET    /auth/me

POST   /owner-profiles
GET    /owner-profiles/me

GET    /owner/bookings
GET    /owner/chargers

GET    /chargers
GET    /chargers/:chargerId
GET    /chargers/:chargerId/availability
GET    /chargers/:chargerId/availability-settings
POST   /chargers
PATCH  /chargers/:chargerId
PATCH  /chargers/:chargerId/status
PUT    /chargers/:chargerId/availability-rules
PUT    /chargers/:chargerId/availability-overrides
DELETE /chargers/:chargerId/availability-overrides/:overrideId

GET    /bookings/me
POST   /bookings
PATCH  /bookings/:bookingId/cancel
DELETE /bookings/me/cancelled
DELETE /bookings/me/completed

POST   /payments/checkout
POST   /payments/razorpay/verify
POST   /payments/mock/:paymentId/fail

POST   /reviews
GET    /reviews/chargers/:chargerId

GET    /admin/owner-profiles
POST   /admin/owner-profiles
GET    /admin/owner-profiles/pending
PATCH  /admin/owner-profiles/:ownerProfileId/approve
PATCH  /admin/owner-profiles/:ownerProfileId/reject
PATCH  /admin/owner-profiles/:ownerProfileId/suspend
PATCH  /admin/owner-profiles/:ownerProfileId/restore
GET    /admin/chargers
GET    /admin/chargers/pending
PATCH  /admin/chargers/:chargerId/verify
PATCH  /admin/chargers/:chargerId/status
```

## Run Locally

### Backend

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The API starts on `http://localhost:4000`.

### Frontend

```bash
cd web
npm install
npm run dev
```

For a production build preview:

```bash
cd web
npm run build
npm run preview
```

The preview starts on `http://127.0.0.1:4173`.

## Demo Seed

After running migrations, seed demo data with:

```bash
npm run db:seed
```

Demo accounts use this password:

```text
StrongPass123
```

```text
admin@chargeup.test
owner@chargeup.test
user@chargeup.test
```

## Migrations

Database migrations are version-controlled changes to the database schema.

Current migrations:

```text
001_initial_schema.sql
002_create_reviews.sql
003_enable_trigram_search.sql
004_create_charger_availability.sql
005_add_charger_count.sql
006_create_charger_units.sql
007_add_pending_payment_booking_status.sql
008_create_payments.sql
```

Each migration is applied once and recorded in the `schema_migrations` table.

Because this project is still in active learning/development, early schema changes may still be adjusted directly. Once the database is shared, deployed, or contains important data, new schema changes should be added as new migration files instead of rewriting old migrations.

## Important Missing Features

- Payment webhooks.
- Refund handling.
- Owner payout tracking.
- Email/SMS notifications.
- Forgot password and reset password.
- Refresh tokens or stronger session management.
- Rate limiting.
- Audit logs for admin actions.
- Charger maintenance/unavailable blocks.
- Import flow for external charger datasets.
- Automated backend and frontend tests.
- API documentation.
- Production deployment.
- UI/UX polish and mobile responsiveness pass.
