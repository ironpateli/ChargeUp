import { z } from 'zod';

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);
const connectorType = z.enum(['CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'TESLA_NACS']);
const ownerChargerStatus = z.enum(['ACTIVE', 'INACTIVE']);
const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD format')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }, 'date must be a valid calendar date');

export const searchChargersSchema = z.object({
  query: z.object({
    lat: latitude,
    lng: longitude,
    radiusMeters: z.coerce.number().int().positive().max(50000).default(5000),
    q: z.string().trim().min(1).max(120).optional(),
    connectorType: connectorType.optional(),
    minPowerKw: z.coerce.number().positive().optional()
  })
});

export const getChargerSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  })
});

export const updateChargerSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    addressLine1: z.string().trim().min(2).max(200).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    state: z.string().trim().min(2).max(100).optional(),
    postalCode: z.string().trim().min(3).max(20).optional(),
    country: z.string().trim().min(2).max(80).optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    connectorTypes: z.array(connectorType).min(1).optional(),
    powerKw: z.number().positive().optional(),
    pricePerHour: z.number().nonnegative().optional()
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.'
  })
});

export const updateChargerStatusSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  body: z.object({
    status: ownerChargerStatus
  })
});

export const getChargerAvailabilitySchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  query: z.object({
    date: dateOnly
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
