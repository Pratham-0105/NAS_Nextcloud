import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://cloud_admin:supersecure_admin_password_change_me@localhost:5432/cloud_nas?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('development_jwt_secret_must_be_over_16_chars!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  NEXTCLOUD_INTERNAL_URL: z.string().default('http://localhost:8080'),
  NEXTCLOUD_ADMIN_USER: z.string().default('ncadmin'),
  NEXTCLOUD_ADMIN_PASSWORD: z.string().default('change_this_strong_nc_password'),
  STORAGE_POOL_PATH: z.string().default('/mnt/storage_pool'),
  PHYSICAL_DEVICES_MOUNT_DIR: z.string().default('/mnt/devices'),
  SIMULATE_STORAGE: z.string().transform(v => v === 'true').default('true'),
});

export const env = envSchema.parse(process.env);
