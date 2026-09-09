import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? 'development-secret',
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'mock'
};
