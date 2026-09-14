import { z } from 'zod';

const email = z.string({
  required_error: 'Email is required.',
  invalid_type_error: 'Email must be text.'
}).trim().email('Enter a valid email address.').toLowerCase();

const registrationPassword = z.string({
  required_error: 'Password is required.',
  invalid_type_error: 'Password must be text.'
}).min(8, 'Password must be at least 8 characters.').max(128, 'Password must be at most 128 characters.');

const loginPassword = z.string({
  required_error: 'Password is required.',
  invalid_type_error: 'Password must be text.'
}).min(1, 'Password is required.').max(128, 'Password must be at most 128 characters.');

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string({
      required_error: 'Full name is required.',
      invalid_type_error: 'Full name must be text.'
    }).trim().min(2, 'Full name must be at least 2 characters.').max(120, 'Full name must be at most 120 characters.'),
    email,
    password: registrationPassword
  })
});

export const loginSchema = z.object({
  body: z.object({
    email,
    password: loginPassword
  })
});
