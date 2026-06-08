import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  SESSION_COOKIE_NAME: z.string().min(1).default('sd_session'),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_INITIAL_PASSWORD: z.string().min(8).optional(),
  APP_URL: z.url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = schema.parse(process.env);
