import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(16),
  JWT_REFRESH_SECRET: 'y'.repeat(16),
  WEB_ORIGIN: 'http://localhost:5173',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const cfg = loadConfig(base);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.PORT).toBe(4000);
    expect(cfg.MAX_UPLOAD_BYTES).toBe(10_485_760);
  });

  it('throws when a required var is missing', () => {
    const { JWT_SECRET: _omit, ...withoutSecret } = base;
    void _omit;
    expect(() => loadConfig(withoutSecret as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  it('throws when DATABASE_URL is absent', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    void _omit;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects an invalid WEB_ORIGIN', () => {
    expect(() => loadConfig({ ...base, WEB_ORIGIN: 'not-a-url' })).toThrow(/WEB_ORIGIN/);
  });

  it('uses TEST_DATABASE_URL when NODE_ENV=test', () => {
    const cfg = loadConfig({
      ...base,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgresql://u@localhost:5432/db_test',
    });
    expect(cfg.DATABASE_URL).toContain('db_test');
  });
});
