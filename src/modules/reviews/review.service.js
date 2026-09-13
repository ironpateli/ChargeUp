import { query } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';

function toReview(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    chargerId: Number(row.charger_id),
    bookingId: Number(row.booking_id),
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at
  };
}

export async function createReview(userId, input) {
  const bookingResult = await query(
    `
      SELECT id, user_id, charger_id, status
      FROM bookings
      WHERE id = $1
        AND user_id = $2
    `,
    [input.bookingId, userId]
  );

  const booking = bookingResult.rows[0];

  if (!booking) {
    throw new AppError('Booking not found.', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status !== 'COMPLETED') {
    throw new AppError('Only completed bookings can be reviewed.', 409, 'BOOKING_NOT_REVIEWABLE');
  }

  try {
    const result = await query(
      `
        INSERT INTO reviews (
          user_id,
          charger_id,
          booking_id,
          rating,
          comment
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, charger_id, booking_id, rating, comment, created_at
      `,
      [
        userId,
        booking.charger_id,
        input.bookingId,
        input.rating,
        input.comment ?? null
      ]
    );

    return toReview(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Booking has already been reviewed.', 409, 'REVIEW_ALREADY_EXISTS');
    }

    throw error;
  }
}

export async function getChargerReviews(chargerId) {
  const chargerResult = await query('SELECT id FROM chargers WHERE id = $1', [chargerId]);

  if (!chargerResult.rows[0]) {
    throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
  }

  const result = await query(
    `
      SELECT id, user_id, charger_id, booking_id, rating, comment, created_at
      FROM reviews
      WHERE charger_id = $1
      ORDER BY created_at DESC
    `,
    [chargerId]
  );

  return result.rows.map(toReview);
}
