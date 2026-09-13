# ChargeUp

ChargeUp is an EV charger discovery and booking platform.

The learning goal is to build a realistic backend with JavaScript, Node.js, Express, PostgreSQL, PostGIS, DBMS constraints, and system-design thinking.

## Initial Architecture

```text
Client App
  - Web/mobile UI
  - Map view
  - Booking flow
  - Owner dashboard

API Layer
  - Express app
  - Auth middleware
  - Request validation
  - Rate limiting later

Domain Modules
  - Auth
  - Users
  - Chargers
  - Search
  - Availability
  - Bookings
  - Payments later
  - Reviews later
  - Admin later

Data Layer
  - PostgreSQL
  - PostGIS for location search
  - Exclusion constraints for booking conflicts
  - Owner profiles
  - Normalized charger connector relationships with enum values
```

## Architecture Choices

### Backend

Start with a modular monolith. One Express app is easier to build, debug, and deploy while still allowing clean internal boundaries.

Microservices are not useful yet because the project does not have independent teams, heavy traffic, or separate deployment needs.

### Database

Use PostgreSQL with PostGIS.

PostgreSQL is enough for the first version because ChargeUp's search is mostly structured:

- nearby chargers
- connector type
- charging speed
- price
- availability
- verified status

Elasticsearch is useful later if we add heavy text search, typo-tolerant search, complex ranking, or autocomplete across large station datasets.

### Payments

Use a provider abstraction.

For India-facing payments, Razorpay is a practical first provider. Stripe can be added later behind the same interface, but new Stripe accounts in India are currently invite-only.

For the MVP, use a mock payment provider first so booking and payment state transitions are easy to test.

## Functional Requirements

- Users can register and log in.
- Users can search nearby EV chargers.
- Users can view charger details.
- Users can check availability.
- Users can book a fixed time slot.
- Users can cancel a booking.
- Owners can list chargers.
- Owners can define charger metadata and availability.
- Owners can view bookings for their chargers.
- Admins can verify chargers later.

## Non-Functional Requirements

- Prevent double bookings.
- Keep nearby search fast.
- Keep booking state consistent.
- Keep authentication secure.
- Make the codebase modular and extensible.
- Add observability later with logs, metrics, and traces.

## Booking Consistency

The first version should use confirm-on-submit:

1. User views availability.
2. User submits booking request.
3. Backend opens a database transaction.
4. PostgreSQL checks that no confirmed booking overlaps the requested time range.
5. Booking is created or rejected.

Later, when real payments are added, use temporary holds:

1. User selects a slot.
2. Backend creates a short-lived hold.
3. User completes payment.
4. Hold becomes a confirmed booking.
5. Expired holds are released.

## PostGIS In One Minute

PostGIS adds geospatial types and indexes to PostgreSQL.

Instead of storing only plain latitude and longitude numbers, we store a generated `geography(Point, 4326)` value.

That lets PostgreSQL answer questions like:

```sql
SELECT *
FROM chargers
WHERE ST_DWithin(location, ST_MakePoint(77.5946, 12.9716)::geography, 5000)
ORDER BY ST_Distance(location, ST_MakePoint(77.5946, 12.9716)::geography);
```

Meaning:

- find chargers within 5 km
- sort closest first
- use a spatial index instead of scanning every row

## Run Locally

### Backend

```bash
npm install
cp .env.example .env
npm run dev
```

The API starts on `http://localhost:4000`.

### Frontend

```bash
cd web
npm install
cp .env.example .env
npm run build
npm run preview
```

The React app preview starts on `http://127.0.0.1:4173`.

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

For example:

```text
001_initial_schema.sql
002_add_payments.sql
003_add_reviews.sql
```

Each migration is applied once and recorded in the `schema_migrations` table.

Because this project is still at draft zero, we can edit `001_initial_schema.sql` directly. After a database is shared, deployed, or contains useful data, we should create a new migration instead of rewriting an old one.
