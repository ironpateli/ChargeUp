import { withTransaction } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';

export async function createBooking(userId, input) {
  return withTransaction(async (client) => {
    const chargerResult = await client.query(
      `
        SELECT id, status
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

    const bookingResult = await client.query(
      `
        INSERT INTO bookings (
          user_id,
          charger_id,
          starts_at,
          ends_at,
          status
        )
        VALUES ($1, $2, $3, $4, 'CONFIRMED')
        RETURNING *
      `,
      [userId, input.chargerId, input.startsAt, input.endsAt]
    );

    return bookingResult.rows[0];
  });
}
