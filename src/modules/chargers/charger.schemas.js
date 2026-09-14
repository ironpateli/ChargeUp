import { z } from 'zod';

const latitude = z.coerce.number({
  invalid_type_error: 'Latitude must be a number.'
}).min(-90, 'Latitude must be between -90 and 90.').max(90, 'Latitude must be between -90 and 90.');

const longitude = z.coerce.number({
  invalid_type_error: 'Longitude must be a number.'
}).min(-180, 'Longitude must be between -180 and 180.').max(180, 'Longitude must be between -180 and 180.');

const connectorType = z.enum(['CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'TESLA_NACS'], {
  errorMap: () => ({ message: 'Choose a valid connector type.' })
});
const ownerChargerStatus = z.enum(['ACTIVE', 'INACTIVE']);
const chargerSearchSort = z.enum(['nearest', 'fastest', 'cheapest']);
const timeOnly = z.string()
  .regex(/^\d{2}:\d{2}$/, 'Time must use HH:MM format.')
  .refine((value) => {
    const [hour, minute] = value.split(':').map(Number);

    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }, 'Time must be a valid 24-hour time.');
const isoDateTime = z.string().datetime('Time slot must be a valid ISO date-time.');
const chargerName = z.string({
  required_error: 'Charger name is required.',
  invalid_type_error: 'Charger name must be text.'
}).trim().min(2, 'Charger name must be at least 2 characters.').max(120, 'Charger name must be at most 120 characters.');
const chargerDescription = z.string({
  invalid_type_error: 'Description must be text.'
}).trim().max(1000, 'Description must be at most 1000 characters.');
const addressLine1 = z.string({
  required_error: 'Address is required.',
  invalid_type_error: 'Address must be text.'
}).trim().min(2, 'Address must be at least 2 characters.').max(200, 'Address must be at most 200 characters.');
const city = z.string({
  required_error: 'City is required.',
  invalid_type_error: 'City must be text.'
}).trim().min(2, 'City must be at least 2 characters.').max(100, 'City must be at most 100 characters.');
const state = z.string({
  required_error: 'State is required.',
  invalid_type_error: 'State must be text.'
}).trim().min(2, 'State must be at least 2 characters.').max(100, 'State must be at most 100 characters.');
const postalCode = z.string({
  required_error: 'Postal code is required.',
  invalid_type_error: 'Postal code must be text.'
}).trim().min(3, 'Postal code must be at least 3 characters.').max(20, 'Postal code must be at most 20 characters.');
const country = z.string({
  invalid_type_error: 'Country must be text.'
}).trim().min(2, 'Country must be at least 2 characters.').max(80, 'Country must be at most 80 characters.');
const connectorTypes = z.array(connectorType, {
  required_error: 'At least one connector type is required.',
  invalid_type_error: 'Connector types must be a list.'
}).min(1, 'At least one connector type is required.');
const powerKw = z.number({
  required_error: 'Power is required.',
  invalid_type_error: 'Power must be a number.'
}).positive('Power must be greater than 0.');
const pricePerHour = z.number({
  required_error: 'Price per hour is required.',
  invalid_type_error: 'Price per hour must be a number.'
}).nonnegative('Price per hour cannot be negative.');
const chargerCount = z.number({
  required_error: 'Number of chargers is required.',
  invalid_type_error: 'Number of chargers must be a number.'
}).int('Number of chargers must be a whole number.').positive('Number of chargers must be greater than 0.');
const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD format')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }, 'date must be a valid calendar date');

const availabilityRule = z.object({
  dayOfWeek: z.coerce.number().int().min(0, 'Day must be between 0 and 6.').max(6, 'Day must be between 0 and 6.'),
  startsAt: timeOnly,
  endsAt: timeOnly,
  slotMinutes: z.coerce.number().int().refine((value) => [30, 60, 120].includes(value), 'Slot length must be 30, 60, or 120 minutes.').default(60),
  isActive: z.boolean().default(true)
}).refine((value) => value.endsAt > value.startsAt, {
  message: 'End time must be after start time.',
  path: ['endsAt']
});

export const searchChargersSchema = z.object({
  query: z.object({
    lat: latitude,
    lng: longitude,
    radiusMeters: z.coerce.number().int().positive().max(50000).default(5000),
    q: z.string().trim().min(1).max(120).optional(),
    connectorType: connectorType.optional(),
    minPowerKw: z.coerce.number().positive().optional(),
    sortBy: chargerSearchSort.default('nearest')
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
    name: chargerName.optional(),
    description: chargerDescription.nullable().optional(),
    addressLine1: addressLine1.optional(),
    city: city.optional(),
    state: state.optional(),
    postalCode: postalCode.optional(),
    country: country.optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    connectorTypes: connectorTypes.optional(),
    powerKw: powerKw.optional(),
    pricePerHour: pricePerHour.optional(),
    chargerCount: chargerCount.optional()
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

export const getChargerAvailabilitySettingsSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  query: z.object({
    date: dateOnly.optional()
  })
});

export const updateChargerAvailabilityRulesSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  body: z.object({
    rules: z.array(availabilityRule).min(1, 'At least one availability rule is required.').max(7, 'Only one rule per weekday is allowed.')
  }).refine((value) => new Set(value.rules.map((rule) => rule.dayOfWeek)).size === value.rules.length, {
    message: 'Only one rule per weekday is allowed.',
    path: ['rules']
  })
});

export const upsertChargerAvailabilityOverrideSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  body: z.object({
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    status: z.enum(['AVAILABLE', 'UNAVAILABLE'], {
      errorMap: () => ({ message: 'Override status must be AVAILABLE or UNAVAILABLE.' })
    }),
    reason: z.string({
      invalid_type_error: 'Reason must be text.'
    }).trim().max(200, 'Reason must be at most 200 characters.').optional()
  }).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'End time must be after start time.',
    path: ['endsAt']
  })
});

export const deleteChargerAvailabilityOverrideSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive(),
    overrideId: z.coerce.number().int().positive()
  })
});

export const createChargerSchema = z.object({
  body: z.object({
    name: chargerName,
    description: chargerDescription.optional(),
    addressLine1,
    city,
    state,
    postalCode,
    country: country.default('India'),
    latitude,
    longitude,
    connectorTypes,
    powerKw,
    pricePerHour,
    chargerCount: chargerCount.default(1)
  })
});
