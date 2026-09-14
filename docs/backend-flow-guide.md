# ChargeUp Backend Flow Guide

This guide explains the backend as it exists right now. Read it as a map of how each request enters Express, passes through middleware, reaches a service function, runs SQL, and returns a response.

## 1. Big Picture

The backend is an Express API backed by PostgreSQL plus PostGIS.

Main request pipeline:

```text
HTTP request
-> src/server.js starts the app
-> src/app.js applies global middleware
-> route module matches the URL
-> route-level middleware checks auth/role/validation
-> service function performs business logic
-> shared DB helper runs SQL
-> route sends JSON response
-> error middleware catches failures
```

Main backend folders:

```text
src/app.js                         Express app setup
src/server.js                      Starts the HTTP server
src/shared                         DB, config, middleware, security, errors
src/modules/auth                   Register, login, current user
src/modules/chargers               Search, create, update, availability
src/modules/bookings               User bookings, cancellation, cleanup
src/modules/payments               Mock/Razorpay checkout and webhooks
src/modules/owner-profiles         Owner self-service profile request
src/modules/owner                  Owner dashboard APIs
src/modules/admin                  Admin management APIs
src/modules/reviews                Charger reviews
src/db/migrations                  Database schema changes
src/db/seed.js                     Demo/test data
```

## 2. Global Express Setup

File: `src/app.js`

Middleware order matters.

```text
helmet()
cors()
raw Razorpay webhook parser
express.json()
morgan('dev')
feature routers
notFoundHandler
errorHandler
```

### `helmet()`

Adds security-related HTTP headers. This is defensive hardening for common browser/web risks.

### `cors()`

Allows the frontend app to call this backend from another origin, such as Vite running on `localhost:5173` while the API runs on `localhost:4000`.

### Razorpay raw body parser

```js
app.use('/payments/razorpay/webhook', express.raw({ type: 'application/json' }), razorpayWebhookRouter);
```

This route must receive the raw request body because Razorpay signatures are verified against the exact raw bytes. If `express.json()` parsed it first, the original byte format would be lost and signature verification could fail.

### `express.json()`

Parses normal JSON request bodies and puts the JavaScript object on `req.body`.

### `morgan('dev')`

Logs request method, path, status, and response time in development.

### Routers

Each feature gets its own route module:

```text
/health
/auth
/admin
/owner-profiles
/owner
/chargers
/bookings
/payments
/reviews
```

### `notFoundHandler`

Runs only if no route matched the request. It returns a 404-style error.

### `errorHandler`

Converts thrown errors into consistent JSON responses.

Special case:

```text
PostgreSQL code 23P01 -> booking slot conflict
```

`23P01` is PostgreSQL's exclusion constraint violation. In this project it means two active bookings tried to overlap on the same charger unit.

## 3. Server Startup

File: `src/server.js`

```js
app.listen(config.port, () => {
  console.log(`ChargeUp API listening on http://localhost:${config.port}`);
});
```

`app.js` exports the Express app. `server.js` starts listening. This separation lets tests import the app without opening a real network port.

## 4. Config

File: `src/shared/config.js`

Reads environment variables:

```text
PORT
DATABASE_URL
JWT_SECRET
JWT_ACCESS_TOKEN_EXPIRES_IN
PAYMENT_PROVIDER
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

Important idea: code reads from `config`, not directly from `process.env` everywhere. That keeps configuration centralized.

## 5. Database Helper

File: `src/shared/db.js`

### `pool`

Creates a PostgreSQL connection pool.

```js
export const pool = new Pool({
  connectionString: config.databaseUrl
});
```

The pool manages reusable DB connections. Simple queries can use `pool.query`.

### `query(text, params)`

Wrapper for one-off SQL:

```js
const result = await query('SELECT ... WHERE id = $1', [id]);
```

`$1`, `$2`, etc. are parameter placeholders. This protects against SQL injection because values are sent separately from the SQL string.

### `withTransaction(callback)`

Used when multiple SQL statements must succeed or fail together.

Flow:

```text
client = pool.connect()
BEGIN
run callback(client)
COMMIT if success
ROLLBACK if error
release client back to pool
```

This is important for booking/payment flows where creating a booking and payment must be atomic.

## 6. Shared Middleware

### Validation Middleware

File: `src/shared/middleware/validate.js`

Route usage:

```js
validate(registerSchema)
```

Runtime flow:

```text
schema.safeParse({ body, params, query })
if invalid -> return 400 VALIDATION_ERROR
if valid -> attach parsed data to req.validated
next()
```

Why this matters:

```text
req.body      raw client input
req.validated cleaned and type-checked input
```

Services should use `req.validated`, not raw input.

### Auth Middleware

File: `src/shared/middleware/auth.js`

`requireAuth` expects:

```http
Authorization: Bearer <jwt>
```

Flow:

```text
read Authorization header
extract token
verify JWT signature and expiry
read user id from token subject
query users table to confirm user still exists
attach { id, role } to req.user
next()
```

SQL:

```sql
SELECT id, role
FROM users
WHERE id = $1
```

This extra DB check is useful because a valid JWT may belong to a deleted user.

`requireRole(...allowedRoles)` checks `req.user.role`. Example:

```js
requireRole('CHARGER_OWNER', 'ADMIN')
```

If the role is not allowed, it returns `403 FORBIDDEN`.

## 7. Security Helpers

### Passwords

File: `src/shared/security/password.js`

Uses bcrypt:

```text
hashPassword(password)       hashes password with salt rounds
verifyPassword(password, hash)
runDummyPasswordCheck(password)
```

`PASSWORD_SALT_ROUNDS = 12`.

Dummy password check is used during login when an email does not exist. It makes "wrong email" and "wrong password" take more similar time, reducing user-enumeration timing hints.

### JWT

File: `src/shared/security/jwt.js`

Token signing:

```js
jwt.sign(
  { role: user.role },
  config.jwtSecret,
  { subject: String(user.id), expiresIn: config.jwtAccessTokenExpiresIn }
)
```

Important:

```text
payload.role -> convenience role claim
subject/sub  -> user id
signature    -> prevents client-side tampering
expiry       -> limits lifetime
```

The middleware still queries the DB for the user id and role, so DB role changes can take effect.

## 8. Standard Route Pattern

Most routes follow this pattern:

```js
router.post(
  '/some-path',
  requireAuth,
  requireRole('ADMIN'),
  validate(schema),
  async (req, res, next) => {
    try {
      const result = await serviceFunction(req.user, req.validated.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);
```

`next(error)` sends the error to `errorHandler`.

## 9. Auth Flows

### `POST /auth/register`

Purpose: create an EV user account and return a JWT.

Middleware:

```text
validate(registerSchema)
```

Validation:

```text
fullName: string, 2-120 chars
email: valid email, lowercased
password: string, 8-128 chars
```

Service: `registerUser(input)`

Flow:

```text
hash password
INSERT user
if email unique conflict -> 409 EMAIL_ALREADY_REGISTERED
sign access token
return public user + token
```

SQL:

```sql
INSERT INTO users (full_name, email, password_hash)
VALUES ($1, $2, $3)
RETURNING id, full_name, email, role, created_at
```

### `POST /auth/login`

Purpose: verify credentials and return JWT.

Middleware:

```text
validate(loginSchema)
```

Service: `loginUser(input)`

Flow:

```text
find user by email
if no user -> dummy bcrypt compare -> 401
compare password with stored hash
if wrong -> 401
sign access token
return public user + token
```

SQL:

```sql
SELECT id, full_name, email, password_hash, role, created_at
FROM users
WHERE email = $1
```

### `GET /auth/me`

Purpose: get current logged-in user.

Middleware:

```text
requireAuth
```

Service: `getCurrentUser(userId)`

SQL:

```sql
SELECT id, full_name, email, role, created_at
FROM users
WHERE id = $1
```

## 10. Charger Search And Map Flows

### `GET /chargers`

Purpose: public search for active chargers near a location.

Middleware:

```text
validate(searchChargersSchema)
```

Query params:

```text
lat              required number, -90 to 90
lng              required number, -180 to 180
radiusMeters     positive integer, max 50000
q                optional text search
connectorType    optional enum
minPowerKw       optional number
sortBy           nearest | fastest | cheapest
```

Service: `searchChargers(filters)`

Important SQL ideas:

```text
WHERE c.status = 'ACTIVE'
ST_DWithin(location, point, radius)
ILIKE and trigram similarity for fuzzy name/address/city/state search
EXISTS for connector filtering
GROUP BY charger
array_agg connector types
ST_Distance for distance_meters
ORDER BY fastest/cheapest/search_score/distance
LIMIT 50
```

Key SQL fragments:

```sql
ST_DWithin(
  c.location,
  ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
  $3
)
```

This checks chargers within a radius from longitude `$2`, latitude `$1`.

```sql
ST_Distance(
  c.location,
  ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
) AS distance_meters
```

This calculates the distance to show/sort by nearest.

```sql
similarity(c.name, $4) > 0.18
word_similarity($4, c.name) > 0.25
```

These come from `pg_trgm` and allow similar-name search, not only exact matching.

### `GET /chargers/:chargerId`

Purpose: public station overview page.

Middleware:

```text
validate(getChargerSchema)
```

Service: `getChargerById(chargerId)`

SQL joins:

```text
chargers
owner_profiles
charger_connector_types
```

Important result fields:

```text
owner display name
full address
latitude/longitude
connector types as array
power/price/charger count/status
```

### `GET /chargers/:chargerId/availability`

Purpose: public availability for a station on one date.

Middleware:

```text
validate(getChargerAvailabilitySchema)
```

Query:

```text
date=YYYY-MM-DD
```

Service: `getChargerAvailability(chargerId, date)`

Flow:

```text
expire old pending payment holds
check charger exists
load weekly availability rule for that weekday
if no rule exists -> use default 6 AM to 10 PM, 60 minute slots
load owner overrides for that day
load active charger units
load active bookings for that day
generate slots in memory
mark each slot AVAILABLE, BOOKED, PASSED, or UNAVAILABLE
return slots plus metadata
```

SQL queries:

```sql
SELECT id, status
FROM chargers
WHERE id = $1
```

```sql
SELECT id, charger_id, day_of_week, starts_at::text, ends_at::text, slot_minutes, is_active
FROM charger_availability_rules
WHERE charger_id = $1
  AND day_of_week = $2
```

```sql
SELECT id, charger_id, starts_at, ends_at, status, reason, created_at
FROM charger_availability_overrides
WHERE charger_id = $1
  AND starts_at < $3
  AND ends_at > $2
ORDER BY starts_at ASC
```

```sql
SELECT id, unit_number
FROM charger_units
WHERE charger_id = $1
  AND status = 'ACTIVE'
ORDER BY unit_number ASC
```

```sql
SELECT charger_unit_id, starts_at, ends_at
FROM bookings
WHERE charger_id = $1
  AND status IN ('CONFIRMED', 'PENDING_PAYMENT')
  AND starts_at < $3
  AND ends_at > $2
ORDER BY starts_at ASC
```

The overlap check uses:

```text
starts_at < requested_end AND ends_at > requested_start
```

This is the normal way to detect time range overlap.

## 11. Owner Charger Management

### `POST /chargers`

Purpose: approved charger owners create a charger listing.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(createChargerSchema)
```

Important validation:

```text
name, address, city, state, postal code
lat/lng range
connectorTypes array
powerKw positive
pricePerHour non-negative
chargerCount positive integer
```

Service: `createCharger(userId, input)`

Transaction flow:

```text
find owner profile for user
require owner profile exists
require profile is VERIFIED
insert charger
create physical charger_units
insert connector types
return enriched charger
```

SQL:

```sql
SELECT id, verification_status
FROM owner_profiles
WHERE user_id = $1
```

```sql
INSERT INTO chargers (...)
VALUES (...)
RETURNING id
```

```sql
INSERT INTO charger_units (charger_id, unit_number)
SELECT $1, unit_number
FROM generate_series(1, $2::integer) AS unit_number
ON CONFLICT (charger_id, unit_number)
DO UPDATE SET status = 'ACTIVE', updated_at = now()
```

```sql
INSERT INTO charger_connector_types (charger_id, connector_type)
SELECT DISTINCT $1::bigint, unnest($2::connector_type[])
```

### `PATCH /chargers/:chargerId`

Purpose: owner/admin updates charger details.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(updateChargerSchema)
```

Service: `updateCharger(user, chargerId, input)`

Transaction flow:

```text
assert owner/admin can manage this charger
load current charger
UPDATE chargers using new values or existing values
if chargerCount changed -> sync charger_units
if connectorTypes changed -> delete old connector rows, insert new rows
return refreshed charger
```

Key authorization query:

```sql
SELECT c.id, c.owner_profile_id, c.status, op.user_id AS owner_user_id
FROM chargers c
JOIN owner_profiles op ON op.id = c.owner_profile_id
WHERE c.id = $1
```

Non-admin owners can only manage chargers where `owner_user_id === req.user.id`.

### `PATCH /chargers/:chargerId/status`

Purpose: owner/admin activates or deactivates own charger. Admin has separate broader route too.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(updateChargerStatusSchema)
```

Service: `updateChargerStatus(user, chargerId, status)`

Rules:

```text
PENDING_VERIFICATION cannot be activated by owner
SUSPENDED cannot be changed by owner
admin can manage all
```

SQL:

```sql
UPDATE chargers
SET status = $2,
    updated_at = now()
WHERE id = $1
RETURNING id
```

## 12. Availability Management

### `GET /chargers/:chargerId/availability-settings`

Purpose: owner/admin fetches weekly rules and overrides.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(getChargerAvailabilitySettingsSchema)
```

Service: `getChargerAvailabilitySettings(user, chargerId, date)`

Flow:

```text
assert user can manage charger
load all weekly rules
optionally load overrides for one date
return settings
```

SQL:

```sql
SELECT id, charger_id, day_of_week, starts_at::text, ends_at::text, slot_minutes, is_active
FROM charger_availability_rules
WHERE charger_id = $1
ORDER BY day_of_week ASC
```

```sql
SELECT id, charger_id, starts_at, ends_at, status, reason, created_at
FROM charger_availability_overrides
WHERE charger_id = $1
  AND starts_at < $3
  AND ends_at > $2
ORDER BY starts_at ASC
LIMIT 100
```

### `PUT /chargers/:chargerId/availability-rules`

Purpose: owner/admin replaces weekly opening hours.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(updateChargerAvailabilityRulesSchema)
```

Validation:

```text
rules: 1-7 rules
dayOfWeek: 0-6
startsAt/endsAt: HH:MM
slotMinutes: 30, 60, or 120
only one rule per weekday
endsAt must be after startsAt
```

Service: `updateChargerAvailabilityRules(user, chargerId, rules)`

Transaction flow:

```text
assert can manage charger
DELETE existing rules for charger
INSERT each new rule
return saved rules
```

### `PUT /chargers/:chargerId/availability-overrides`

Purpose: owner/admin disables or enables one exact date/time slot.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(upsertChargerAvailabilityOverrideSchema)
```

Service: `upsertChargerAvailabilityOverride(user, chargerId, input)`

SQL:

```sql
INSERT INTO charger_availability_overrides (
  charger_id, starts_at, ends_at, status, reason
)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (charger_id, starts_at, ends_at)
DO UPDATE SET
  status = EXCLUDED.status,
  reason = EXCLUDED.reason,
  updated_at = now()
RETURNING ...
```

This is an upsert: insert if not present, update if already present.

### `DELETE /chargers/:chargerId/availability-overrides/:overrideId`

Purpose: remove a manual slot override.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
validate(deleteChargerAvailabilityOverrideSchema)
```

SQL:

```sql
DELETE FROM charger_availability_overrides
WHERE id = $1
  AND charger_id = $2
```

## 13. Booking Flows

### `GET /bookings/me`

Purpose: logged-in user sees their bookings.

Middleware:

```text
requireAuth
```

Service: `getMyBookings(userId)`

Flow:

```text
expire pending payment bookings whose hold expired
mark confirmed bookings completed if ends_at <= now()
load user's bookings
join charger, charger unit, payment
return booking summaries
```

SQL cleanup:

```sql
UPDATE bookings
SET status = 'COMPLETED',
    updated_at = now()
WHERE status = 'CONFIRMED'
  AND ends_at <= now()
```

```sql
UPDATE bookings b
SET status = 'CANCELLED',
    updated_at = now()
FROM payments p
WHERE p.booking_id = b.id
  AND b.status = 'PENDING_PAYMENT'
  AND p.status = 'PENDING'
  AND p.expires_at <= now()
```

Main select:

```sql
SELECT b.*, cu.unit_number, c.name AS charger_name, p.*
FROM bookings b
JOIN chargers c ON c.id = b.charger_id
JOIN charger_units cu ON cu.id = b.charger_unit_id
LEFT JOIN payments p ON p.booking_id = b.id
WHERE b.user_id = $1
ORDER BY b.starts_at DESC
```

### `POST /bookings`

Currently disabled by design.

Middleware:

```text
requireAuth
validate(createBookingSchema)
```

Response:

```text
402 BOOKING_PAYMENT_REQUIRED
```

Reason: bookings must go through `/payments/checkout` so the system creates a payment hold and booking together.

### `PATCH /bookings/:bookingId/cancel`

Purpose: user cancels their active booking.

Middleware:

```text
requireAuth
validate(cancelBookingSchema)
```

Service: `cancelBooking(userId, bookingId)`

Transaction flow:

```text
find booking owned by user
only CONFIRMED or PENDING_PAYMENT can be cancelled
update booking to CANCELLED
if pending payment existed -> update payment to FAILED
return booking
```

SQL:

```sql
SELECT b.id, b.status, cu.unit_number
FROM bookings b
JOIN charger_units cu ON cu.id = b.charger_unit_id
WHERE b.id = $1
  AND b.user_id = $2
```

```sql
UPDATE bookings
SET status = 'CANCELLED',
    updated_at = now()
WHERE id = $1
RETURNING *
```

### `DELETE /bookings/me/cancelled`

Purpose: user clears cancelled history.

SQL:

```sql
DELETE FROM bookings
WHERE user_id = $1
  AND status = 'CANCELLED'
RETURNING id
```

### `DELETE /bookings/me/completed`

Purpose: user clears completed history.

Transaction flow:

```text
delete reviews for those completed bookings
delete completed bookings
return deleted count
```

Reviews are deleted first because `reviews.booking_id` references `bookings.id`.

## 14. Booking Concurrency

The most important booking query is the charger unit selection query:

```sql
SELECT cu.id, cu.unit_number
FROM charger_units cu
WHERE cu.charger_id = $1
  AND cu.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.charger_unit_id = cu.id
      AND b.status IN ('CONFIRMED', 'PENDING_PAYMENT')
      AND b.starts_at < $3
      AND b.ends_at > $2
  )
ORDER BY cu.unit_number ASC
FOR UPDATE SKIP LOCKED
LIMIT 1
```

Meaning:

```text
find active physical units for this station
ignore any unit that already has overlapping active booking
lock the selected unit row
skip units another transaction already locked
return one available unit
```

This prevents two users from booking the same charger unit at the same time.

Database backup protection:

```sql
EXCLUDE USING GIST (
  charger_unit_id WITH =,
  booked_range WITH &&
)
WHERE (status IN ('CONFIRMED', 'PENDING_PAYMENT'))
```

This DB constraint rejects overlapping active bookings even if application logic has a bug.

## 15. Payment Flows

### `POST /payments/checkout`

Purpose: create a payment checkout and reserve a charger unit.

Middleware:

```text
requireAuth
validate(createCheckoutSchema)
```

Service: `createCheckout(user, input)`

Transaction flow:

```text
expire old pending holds
load user
load charger and price
check charger is ACTIVE
load availability rule
check unavailable overrides
create PENDING_PAYMENT booking
calculate amount
create provider order:
  MOCK -> local fake order id
  RAZORPAY -> Razorpay orders API
insert payment row
if MOCK -> immediately confirm booking and mark payment captured
return booking, payment, checkout details
```

Important SQL:

```sql
SELECT id, full_name, email
FROM users
WHERE id = $1
```

```sql
SELECT id, name, status, price_per_hour
FROM chargers
WHERE id = $1
```

```sql
INSERT INTO payments (
  booking_id, user_id, provider, provider_order_id,
  amount_paise, currency, expires_at
)
VALUES ($1, $2, $3, $4, $5, 'INR', $6)
RETURNING *
```

Why `PENDING_PAYMENT` blocks the slot:

```text
The user gets a short hold while paying.
Other users cannot take that exact unit/time during the hold.
Expired holds become CANCELLED.
```

### `POST /payments/razorpay/verify`

Purpose: frontend sends Razorpay payment proof after checkout.

Middleware:

```text
requireAuth
validate(verifyRazorpayPaymentSchema)
```

Service: `verifyRazorpayPayment(userId, input)`

Flow:

```text
load payment by id, user id, provider RAZORPAY
ensure Razorpay order id matches
verify HMAC signature
if invalid -> fail booking/payment
if valid -> confirm pending booking and mark payment captured
```

SQL:

```sql
SELECT *
FROM payments
WHERE id = $1
  AND user_id = $2
  AND provider = 'RAZORPAY'
```

```sql
UPDATE payments
SET status = 'CAPTURED',
    provider_payment_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING *
```

### `POST /payments/mock/:paymentId/fail`

Purpose: demo/test endpoint to fail a mock payment.

Middleware:

```text
requireAuth
validate(mockFailPaymentSchema)
```

Flow:

```text
find mock payment owned by user
cancel pending booking
mark payment FAILED
```

### `POST /payments/razorpay/webhook`

Purpose: Razorpay server-to-server payment event.

Special middleware:

```text
express.raw({ type: 'application/json' })
```

No `requireAuth`, because Razorpay sends this request, not a logged-in user.

Security:

```text
verify X-Razorpay-Signature using RAZORPAY_WEBHOOK_SECRET
require x-razorpay-event-id
store event id uniquely to avoid duplicate processing
```

Flow:

```text
verify raw body is Buffer
verify signature
parse JSON
INSERT event into payment_webhook_events
if duplicate event -> return duplicate true
if payment.captured/order.paid -> confirm booking and capture payment
if payment.failed -> fail booking/payment
mark event processed
```

Idempotency SQL:

```sql
INSERT INTO payment_webhook_events (...)
VALUES (...)
ON CONFLICT (event_id)
DO NOTHING
RETURNING id
```

This protects against Razorpay retrying the same webhook.

## 16. Owner Profile Flows

### `POST /owner-profiles`

Purpose: normal user requests owner approval.

Middleware:

```text
requireAuth
validate(createOwnerProfileSchema)
```

Extra route rule:

```text
ADMIN cannot use self-service owner profile creation
```

Service: `createOwnerProfile(userId, input)`

Transaction SQL:

```sql
INSERT INTO owner_profiles (
  user_id, display_name, payout_account_reference
)
VALUES ($1, $2, $3)
RETURNING ...
```

Default status is `PENDING_VERIFICATION`.

If user already has a profile, unique constraint returns `23505`, converted to `409 OWNER_PROFILE_ALREADY_EXISTS`.

### `GET /owner-profiles/me`

Purpose: current user reads their owner profile.

SQL:

```sql
SELECT id, user_id, display_name, verification_status, payout_account_reference, created_at
FROM owner_profiles
WHERE user_id = $1
```

## 17. Owner Dashboard Flows

### `GET /owner/chargers`

Purpose: owner sees their chargers.

Middleware:

```text
requireAuth
requireRole('CHARGER_OWNER', 'ADMIN')
```

Flow:

```text
get owner profile id by user id
select chargers for that owner
join connector types
return list
```

SQL:

```sql
SELECT id
FROM owner_profiles
WHERE user_id = $1
```

```sql
SELECT c.*, array_agg(cct.connector_type ORDER BY cct.connector_type) AS connector_types
FROM chargers c
JOIN charger_connector_types cct ON cct.charger_id = c.id
WHERE c.owner_profile_id = $1
GROUP BY c.id
ORDER BY c.created_at DESC
```

### `GET /owner/bookings`

Purpose: owner sees bookings for their chargers.

Flow:

```text
get owner profile id
expire pending payment holds
mark expired confirmed bookings completed
join bookings, chargers, charger_units
filter by c.owner_profile_id
```

SQL:

```sql
SELECT b.*, cu.unit_number, c.name AS charger_name
FROM bookings b
JOIN chargers c ON c.id = b.charger_id
JOIN charger_units cu ON cu.id = b.charger_unit_id
WHERE c.owner_profile_id = $1
ORDER BY b.starts_at DESC
```

## 18. Admin Flows

All admin routes use:

```text
requireAuth
requireRole('ADMIN')
```

### `GET /admin/owner-profiles`

Purpose: admin lists all owner profiles except admin users.

SQL:

```sql
SELECT op.*, u.full_name, u.email,
       count(c.id) AS charger_count,
       count(c.id) FILTER (WHERE c.status = 'ACTIVE') AS active_charger_count
FROM owner_profiles op
JOIN users u ON u.id = op.user_id
LEFT JOIN chargers c ON c.owner_profile_id = op.id
WHERE u.role != 'ADMIN'
GROUP BY op.id, u.id
ORDER BY op.created_at DESC
```

### `POST /admin/owner-profiles`

Purpose: admin creates a verified owner account.

Middleware:

```text
validate(adminCreateOwnerProfileSchema)
```

Transaction flow:

```text
check if user email exists
if existing user is ADMIN -> reject
if existing user already has owner profile -> reject
if existing normal user -> upgrade role to CHARGER_OWNER
if new user -> hash password, create user as CHARGER_OWNER
create owner profile with VERIFIED status
return enriched owner profile
```

### `GET /admin/owner-profiles/pending`

Purpose: admin sees only pending owner requests.

SQL:

```sql
SELECT op.*, u.full_name, u.email
FROM owner_profiles op
JOIN users u ON u.id = op.user_id
WHERE op.verification_status = 'PENDING_VERIFICATION'
ORDER BY op.created_at ASC
```

### `PATCH /admin/owner-profiles/:id/approve`

Purpose: approve pending owner profile.

Transaction flow:

```text
update owner_profiles status PENDING_VERIFICATION -> VERIFIED
update user role to CHARGER_OWNER unless admin
return enriched profile
```

### `PATCH /admin/owner-profiles/:id/reject`

Purpose: reject pending owner profile.

SQL:

```sql
UPDATE owner_profiles
SET verification_status = 'REJECTED',
    updated_at = now()
WHERE id = $1
  AND verification_status = 'PENDING_VERIFICATION'
RETURNING id
```

### `PATCH /admin/owner-profiles/:id/suspend`

Purpose: remove owner access.

Transaction flow:

```text
owner profile -> SUSPENDED
user role CHARGER_OWNER -> EV_USER
all chargers for that owner -> SUSPENDED
return enriched profile
```

### `PATCH /admin/owner-profiles/:id/restore`

Purpose: restore owner access.

Transaction flow:

```text
owner profile -> VERIFIED
user role -> CHARGER_OWNER
return enriched profile
```

Note: this does not automatically reactivate chargers. Admin can activate chargers separately.

### `GET /admin/chargers`

Purpose: admin lists all chargers with owner info.

SQL:

```sql
SELECT c.*, op.display_name AS owner_name, u.email AS owner_email
FROM chargers c
JOIN owner_profiles op ON op.id = c.owner_profile_id
JOIN users u ON u.id = op.user_id
ORDER BY c.created_at DESC
```

### `GET /admin/chargers/pending`

Purpose: admin lists only chargers waiting for verification.

SQL:

```sql
SELECT ...
FROM chargers
WHERE status = 'PENDING_VERIFICATION'
ORDER BY created_at ASC
```

### `PATCH /admin/chargers/:chargerId/verify`

Purpose: verify pending charger.

SQL:

```sql
UPDATE chargers
SET status = 'ACTIVE',
    updated_at = now()
WHERE id = $1
  AND status = 'PENDING_VERIFICATION'
RETURNING ...
```

### `PATCH /admin/chargers/:chargerId/status`

Purpose: admin force-sets charger status.

Validation:

```text
status: ACTIVE | INACTIVE | SUSPENDED
```

SQL:

```sql
UPDATE chargers
SET status = $2,
    updated_at = now()
WHERE id = $1
RETURNING id
```

## 19. Review Flows

### `POST /reviews`

Purpose: user reviews a completed booking.

Middleware:

```text
requireAuth
validate(createReviewSchema)
```

Validation:

```text
bookingId positive integer
rating 1-5
comment optional, max 1000 chars
```

Flow:

```text
load booking by booking id and current user
require booking status COMPLETED
insert review
if unique conflict -> booking already reviewed
```

SQL:

```sql
SELECT id, user_id, charger_id, status
FROM bookings
WHERE id = $1
  AND user_id = $2
```

```sql
INSERT INTO reviews (
  user_id, charger_id, booking_id, rating, comment
)
VALUES ($1, $2, $3, $4, $5)
RETURNING ...
```

### `GET /reviews/chargers/:chargerId`

Purpose: public list of reviews for a charger.

Flow:

```text
check charger exists
select reviews by charger id
order newest first
```

SQL:

```sql
SELECT id FROM chargers WHERE id = $1
```

```sql
SELECT id, user_id, charger_id, booking_id, rating, comment, created_at
FROM reviews
WHERE charger_id = $1
ORDER BY created_at DESC
```

## 20. Health Flow

### `GET /health`

Purpose: quick API status check.

No DB query.

Response:

```json
{
  "status": "ok",
  "service": "chargeup-api"
}
```

## 21. Database Schema Overview

### Users

Stores all login accounts.

```text
users
id
full_name
email UNIQUE
password_hash
role
created_at
updated_at
```

### Owner Profiles

Represents charger-owner business identity and approval status.

```text
owner_profiles
id
user_id UNIQUE -> users.id
display_name
verification_status
payout_account_reference
created_at
updated_at
```

### Chargers

Represents a charging station/listing.

Important fields:

```text
owner_profile_id -> owner_profiles.id
lat/lng numeric(9,6)
location geography(Point,4326) generated from lat/lng
power_kw numeric(6,2)
price_per_hour numeric(10,2)
charger_count
status
```

### Charger Connector Types

Normalized many-to-many-style table between charger and connector type.

```text
charger_id
connector_type
PRIMARY KEY (charger_id, connector_type)
```

One charger can support multiple connector types.

### Charger Units

Represents actual physical plugs/units at a station.

```text
charger_id
unit_number
status
UNIQUE (charger_id, unit_number)
```

This allows station-level charger count and unit-level booking locks.

### Availability Rules

Weekly schedule.

```text
charger_id
day_of_week
starts_at
ends_at
slot_minutes
is_active
UNIQUE (charger_id, day_of_week)
```

### Availability Overrides

Specific one-off slot changes.

```text
charger_id
starts_at
ends_at
status
reason
UNIQUE (charger_id, starts_at, ends_at)
```

### Bookings

Stores user reservations.

Important fields:

```text
user_id
charger_id
charger_unit_id
starts_at
ends_at
booked_range generated tstzrange
status
```

The generated `booked_range` exists so PostgreSQL can enforce no overlapping active bookings using a GiST exclusion constraint.

### Payments

Stores payment attempt for a booking.

```text
booking_id UNIQUE
user_id
provider
provider_order_id UNIQUE
provider_payment_id
amount_paise
currency
status
expires_at
```

### Payment Webhook Events

Stores Razorpay webhook events for idempotency.

```text
provider
event_id UNIQUE
event_type
payload jsonb
processed_at
```

### Reviews

One review per booking.

```text
booking_id UNIQUE
rating CHECK 1-5
comment
```

## 22. Important Indexes

### Location

```sql
CREATE INDEX chargers_location_gix ON chargers USING GIST (location);
```

Used by PostGIS distance filtering such as `ST_DWithin`.

### Charger status

```sql
CREATE INDEX chargers_status_idx ON chargers(status);
```

Useful because public search only shows active chargers.

### Owner lookup

```sql
CREATE INDEX chargers_owner_profile_id_idx ON chargers(owner_profile_id);
```

Useful for owner/admin dashboards.

### Connector filter

```sql
CREATE INDEX charger_connector_types_connector_type_idx
ON charger_connector_types(connector_type);
```

Useful when filtering by connector type.

### Booking lookups

```sql
CREATE INDEX bookings_user_id_idx ON bookings(user_id);
CREATE INDEX bookings_charger_id_idx ON bookings(charger_id);
CREATE INDEX bookings_starts_at_idx ON bookings(starts_at);
CREATE INDEX bookings_charger_unit_id_idx ON bookings(charger_unit_id);
```

Used for "my bookings", availability, owner bookings, and unit overlap checks.

### Payments

```sql
CREATE INDEX payments_user_id_idx ON payments(user_id);
CREATE INDEX payments_booking_id_idx ON payments(booking_id);
CREATE INDEX payments_status_idx ON payments(status);
```

Used for payment lookup, booking joins, and expiring old pending payments.

## 23. Migrations

File: `src/db/migrate.js`

The migration runner:

```text
creates schema_migrations table if missing
reads SQL files from src/db/migrations
sorts them by filename
skips already-applied files
runs each new SQL file inside BEGIN/COMMIT
records filename after success
ROLLBACK on failure
```

Why migrations matter:

```text
The database schema changes over time.
Instead of manually editing DBs, every schema change is saved as a numbered SQL file.
Every developer/server can apply the same schema history reliably.
```

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
009_create_payment_webhook_events.sql
```

## 24. Key Backend Concepts In This Project

### Validation vs DB Constraints

Validation catches bad input early and returns user-friendly errors.

DB constraints protect the data even if the backend has a bug.

Example:

```text
Zod validates latitude before SQL.
DB CHECK also ensures latitude is between -90 and 90.
```

Both are useful.

### Authorization

Authentication asks:

```text
Who are you?
```

Authorization asks:

```text
Are you allowed to do this?
```

Examples:

```text
requireAuth -> user must be logged in
requireRole('ADMIN') -> only admins
assertCanManageCharger -> owner can manage only own chargers, admin can manage all
```

### Transactions

Used when multiple DB changes must move together.

Examples:

```text
create charger + create units + create connector rows
create booking hold + create payment
approve owner + update user role
suspend owner + update user role + suspend chargers
```

### Race Conditions

Booking is the main race-condition area.

Protection layers:

```text
application checks active unit availability
FOR UPDATE SKIP LOCKED prevents two transactions choosing same unit
DB exclusion constraint rejects overlaps if logic fails
payment hold blocks slot during checkout
expired holds are cleaned up
```

### PostGIS

PostGIS gives PostgreSQL geospatial features.

ChargeUp uses:

```text
geography(Point, 4326)
ST_MakePoint(longitude, latitude)
ST_SetSRID(..., 4326)
ST_DWithin for nearby filtering
ST_Distance for distance in meters
GiST index for fast geospatial lookup
```

### pg_trgm

`pg_trgm` enables fuzzy text matching.

ChargeUp uses:

```text
similarity()
word_similarity()
```

This is why search can still find similar station names or locations.

## 25. Recommended Study Order

Study the backend in this order:

1. `src/app.js` and `src/server.js`
2. `src/shared/db.js`
3. `src/shared/middleware/validate.js`
4. `src/shared/middleware/auth.js`
5. `src/modules/auth`
6. `GET /chargers`
7. `GET /chargers/:id/availability`
8. `POST /payments/checkout`
9. booking helper functions in `booking.service.js`
10. owner/admin routes
11. migrations and schema

Best practice while reading:

```text
Start at the route file.
Write down middleware in order.
Jump to the schema file.
Jump to the service function.
Read SQL query by query.
Trace the returned object back to the route response.
```

