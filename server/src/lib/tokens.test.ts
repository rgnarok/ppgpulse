import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './tokens.js';
import { getConfig } from '../config.js';

describe('tokens', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken('u_kb');
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe('u_kb');
    expect(claims.type).toBe('access');
  });

  it('signs and verifies a refresh token with a jti', () => {
    const { token, jti } = signRefreshToken('u_kb');
    const claims = verifyRefreshToken(token);
    expect(claims.sub).toBe('u_kb');
    expect(claims.jti).toBe(jti);
    expect(claims.type).toBe('refresh');
  });

  it('rejects an expired token', () => {
    const cfg = getConfig();
    const expired = jwt.sign({ sub: 'u_kb', type: 'access' }, cfg.JWT_SECRET, { expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it('rejects an access token presented as refresh', () => {
    const token = signAccessToken('u_kb');
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it('rejects a token signed with the wrong secret', () => {
    const bad = jwt.sign({ sub: 'u_kb', type: 'access' }, 'some-other-secret-000000');
    expect(() => verifyAccessToken(bad)).toThrow();
  });
});
