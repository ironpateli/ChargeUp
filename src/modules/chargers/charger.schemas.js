import { z } from 'zod';

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);
const connectorType = z.enum(['CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'TESLA_NACS']);

export const searchChargersSchema = z.object({
  query: z.object({
    lat: latitude,
    lng: longitude,
    radiusMeters: z.coerce.number().int().positive().max(50000).default(5000),
    connectorType: connectorType.optional(),
    minPowerKw: z.coerce.number().positive().optional()
  })
});

export const getChargerSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  })
});

export const createChargerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    addressLine1: z.string().trim().min(2).max(200),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(20),
    country: z.string().trim().min(2).max(80).default('India'),
    latitude,
    longitude,
    connectorTypes: z.array(connectorType).min(1),
    powerKw: z.number().positive(),
    pricePerHour: z.number().nonnegative()
  })
});
