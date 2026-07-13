import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  WEB_ORIGIN: z.string().url('WEB_ORIGIN must be a valid URL'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Validate an environment-like object into a typed config. Throws a descriptive
 * error listing every missing/invalid key. Pure: does not read process.env.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // On single-origin PaaS hosts (Render, etc.) the public URL is injected as
  // RENDER_EXTERNAL_URL; use it as the WEB_ORIGIN default so CORS matches.
  const merged: NodeJS.ProcessEnv = { ...env };
  if (!merged.WEB_ORIGIN && merged.RENDER_EXTERNAL_URL) {
    merged.WEB_ORIGIN = merged.RENDER_EXTERNAL_URL;
  }
  const parsed = configSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const cfg = parsed.data;
  // In the test env, prefer the dedicated test database when provided.
  if (cfg.NODE_ENV === 'test' && cfg.TEST_DATABASE_URL) {
    cfg.DATABASE_URL = cfg.TEST_DATABASE_URL;
  }
  return cfg;
}

let cached: AppConfig | null = null;

/** Lazily load, validate and cache the process config (reads .env files once). */
export function getConfig(): AppConfig {
  if (cached) return cached;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Load server/.env then repo-root .env without overriding real env vars.
  loadDotenv({ path: path.resolve(here, '../.env') });
  loadDotenv({ path: path.resolve(here, '../../.env') });
  cached = loadConfig(process.env);
  return cached;
}
