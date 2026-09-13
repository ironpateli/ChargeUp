import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './shared/middleware/error-handler.js';
import { notFoundHandler } from './shared/middleware/not-found-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bookingRouter } from './modules/bookings/booking.routes.js';
import { chargerRouter } from './modules/chargers/charger.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { ownerProfileRouter } from './modules/owner-profiles/owner-profile.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/owner-profiles', ownerProfileRouter);
app.use('/chargers', chargerRouter);
app.use('/bookings', bookingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
