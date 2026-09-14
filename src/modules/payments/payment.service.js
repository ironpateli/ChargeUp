import crypto from 'node:crypto';
import { config } from '../../shared/config.js';
import { query, withTransaction } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';
import {
  confirmPendingBooking,
  createPendingPaymentBooking,
  expirePendingPaymentBookings,
  failPendingBooking,
  toPublicBooking
} from '../bookings/booking.service.js';

const PAYMENT_HOLD_MINUTES = 10;
const TIME_ZONE_OFFSET = '+05:30';
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;

function toIsoAtLocalHour(date, hour) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00${TIME_ZONE_OFFSET}`;
}

function toBookingLocalDate(date) {
  const localDate = new Date(date.getTime() + 330 * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDayOfWeek(date) {
  const localDate = toBookingLocalDate(date);
  const utcNoon = new Date(`${localDate}T12:00:00Z`);

  return utcNoon.getUTCDay();
}

function defaultAvailabilityRule(date) {
  return {
    starts_at: `${String(DEFAULT_START_HOUR).padStart(2, '0')}:00`,
    ends_at: `${String(DEFAULT_END_HOUR).padStart(2, '0')}:00`,
    slot_minutes: 60,
    is_active: true,
    date: toBookingLocalDate(date)
  };
}

function paymentProvider() {
  return config.paymentProvider.toLowerCase() === 'razorpay' ? 'RAZORPAY' : 'MOCK';
}

function toPayment(row) {
  return {
    id: Number(row.id),
    bookingId: Number(row.booking_id),
    userId: Number(row.user_id),
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

async function getPaymentUser(client, userId) {
  const result = await client.query(
    `
      SELECT id, full_name, email
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0];
}

async function createRazorpayOrder({ amountPaise, currency, receipt, notes }) {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new AppError('Razorpay keys are not configured.', 500, 'RAZORPAY_NOT_CONFIGURED');
  }

  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency,
      receipt,
      notes
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AppError(payload.error?.description ?? 'Could not create Razorpay order.', 502, 'RAZORPAY_ORDER_FAILED');
  }

  return payload;
}

function createMockOrderId() {
  return `mock_order_${crypto.randomUUID()}`;
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  if (!config.razorpayKeySecret) {
    throw new AppError('Razorpay secret is not configured.', 500, 'RAZORPAY_NOT_CONFIGURED');
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function createCheckout(user, input) {
  await expirePendingPaymentBookings();

  return withTransaction(async (client) => {
    const paymentUser = await getPaymentUser(client, user.id);
    const chargerResult = await client.query(
      `
        SELECT id, name, status, price_per_hour
        FROM chargers
        WHERE id = $1
      `,
      [input.chargerId]
    );
    const charger = chargerResult.rows[0];

    if (!charger) {
      throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
    }

    if (charger.status !== 'ACTIVE') {
      throw new AppError('Charger is not available for booking.', 409, 'CHARGER_NOT_BOOKABLE');
    }

    const bookingDate = toBookingLocalDate(input.startsAt);
    const ruleResult = await client.query(
      `
        SELECT starts_at::text, ends_at::text, slot_minutes, is_active
        FROM charger_availability_rules
        WHERE charger_id = $1
          AND day_of_week = $2
      `,
      [input.chargerId, getDayOfWeek(input.startsAt)]
    );
    const rule = {
      ...(ruleResult.rows[0] ?? defaultAvailabilityRule(input.startsAt)),
      date: bookingDate
    };

    const unavailableOverrideResult = await client.query(
      `
        SELECT id
        FROM charger_availability_overrides
        WHERE charger_id = $1
          AND status = 'UNAVAILABLE'
          AND starts_at < $3
          AND ends_at > $2
        LIMIT 1
      `,
      [input.chargerId, input.startsAt, input.endsAt]
    );

    if (unavailableOverrideResult.rows[0]) {
      throw new AppError('This slot has been marked unavailable by the owner.', 409, 'BOOKING_SLOT_UNAVAILABLE');
    }

    const booking = await createPendingPaymentBooking(client, user.id, {
      ...input,
      rule
    });
    const durationHours = (input.endsAt.getTime() - input.startsAt.getTime()) / (60 * 60 * 1000);
    const amountPaise = Math.round(Number(charger.price_per_hour) * durationHours * 100);
    const provider = paymentProvider();
    const expiresAt = new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000);
    const providerOrder = provider === 'RAZORPAY'
      ? await createRazorpayOrder({
        amountPaise,
        currency: 'INR',
        receipt: `booking_${booking.id}`,
        notes: {
          bookingId: String(booking.id),
          chargerId: String(input.chargerId),
          userId: String(user.id)
        }
      })
      : { id: createMockOrderId() };

    const paymentResult = await client.query(
      `
        INSERT INTO payments (
          booking_id,
          user_id,
          provider,
          provider_order_id,
          amount_paise,
          currency,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, 'INR', $6)
        RETURNING *
      `,
      [booking.id, user.id, provider, providerOrder.id, amountPaise, expiresAt]
    );

    let payment = toPayment(paymentResult.rows[0]);
    let confirmedBooking = toPublicBooking(booking);

    if (provider === 'MOCK') {
      const confirmed = await confirmPendingBooking(client, booking.id);
      const capturedResult = await client.query(
        `
          UPDATE payments
          SET status = 'CAPTURED',
              provider_payment_id = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [payment.id, `mock_pay_${crypto.randomUUID()}`]
      );

      payment = toPayment(capturedResult.rows[0]);
      confirmedBooking = confirmed;
    }

    return {
      booking: confirmedBooking,
      payment,
      checkout: {
        provider,
        keyId: provider === 'RAZORPAY' ? config.razorpayKeyId : null,
        orderId: providerOrder.id,
        amountPaise,
        currency: 'INR',
        name: 'ChargeUp',
        description: `Booking for ${charger.name}`,
        prefill: {
          name: paymentUser.full_name,
          email: paymentUser.email
        }
      }
    };
  });
}

export async function verifyRazorpayPayment(userId, input) {
  const result = await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `
        SELECT *
        FROM payments
        WHERE id = $1
          AND user_id = $2
          AND provider = 'RAZORPAY'
      `,
      [input.paymentId, userId]
    );
    const payment = paymentResult.rows[0];

    if (!payment) {
      throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    if (payment.status === 'CAPTURED') {
      return {
        payment: toPayment(payment),
        booking: null
      };
    }

    if (payment.provider_order_id !== input.razorpayOrderId) {
      throw new AppError('Razorpay order does not match this payment.', 409, 'RAZORPAY_ORDER_MISMATCH');
    }

    const isValid = verifyRazorpaySignature({
      orderId: payment.provider_order_id,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature
    });

    if (!isValid) {
      const booking = await failPendingBooking(client, payment.booking_id);
      await client.query(
        `
          UPDATE payments
          SET status = 'FAILED',
              provider_payment_id = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [payment.id, input.razorpayPaymentId]
      );

      return {
        invalidSignature: true,
        payment: toPayment({
          ...payment,
          status: 'FAILED',
          provider_payment_id: input.razorpayPaymentId
        }),
        booking
      };
    }

    const booking = await confirmPendingBooking(client, payment.booking_id);
    const capturedResult = await client.query(
      `
        UPDATE payments
        SET status = 'CAPTURED',
            provider_payment_id = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [payment.id, input.razorpayPaymentId]
    );

    return {
      payment: toPayment(capturedResult.rows[0]),
      booking
    };
  });

  if (result.invalidSignature) {
    throw new AppError('Razorpay signature verification failed.', 400, 'RAZORPAY_SIGNATURE_INVALID');
  }

  return result;
}

export async function failMockPayment(userId, paymentId) {
  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      `
        SELECT *
        FROM payments
        WHERE id = $1
          AND user_id = $2
          AND provider = 'MOCK'
      `,
      [paymentId, userId]
    );
    const payment = paymentResult.rows[0];

    if (!payment) {
      throw new AppError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    await failPendingBooking(client, payment.booking_id);
    const failedResult = await client.query(
      `
        UPDATE payments
        SET status = 'FAILED',
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [payment.id]
    );

    return toPayment(failedResult.rows[0]);
  });
}
