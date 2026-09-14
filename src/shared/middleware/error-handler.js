import { AppError } from '../errors.js';

export function errorHandler(error, req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  if (error.code === '23P01') {
    return res.status(409).json({
      error: {
        code: 'BOOKING_SLOT_CONFLICT',
        message: 'No charging unit is available for the requested time slot.'
      }
    });
  }

  console.error(error);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong.'
    }
  });
}
