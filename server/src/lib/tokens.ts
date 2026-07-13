import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';

export interface AccessClaims {
  sub: string; // user id
  type: 'access';
}
export interface RefreshClaims {
  sub: string; // user id
  jti: string; // refresh token id (for rotation/revocation)
  type: 'refresh';
}

/** Sign a short-lived access token for a user. */
export function signAccessToken(userId: string): string {
  const cfg = getConfig();
  return jwt.sign({ sub: userId, type: 'access' } satisfies AccessClaims, cfg.JWT_SECRET, {
    expiresIn: cfg.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

/** Sign a refresh token bound to a rotation id (jti). Generates a jti if absent. */
export function signRefreshToken(
  userId: string,
  jti: string = randomUUID(),
): {
  token: string;
  jti: string;
} {
  const cfg = getConfig();
  const token = jwt.sign(
    { sub: userId, jti, type: 'refresh' } satisfies RefreshClaims,
    cfg.JWT_REFRESH_SECRET,
    { expiresIn: cfg.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'] },
  );
  return { token, jti };
}

/** Verify an access token. Throws on invalid/expired. */
export function verifyAccessToken(token: string): AccessClaims {
  const cfg = getConfig();
  const decoded = jwt.verify(token, cfg.JWT_SECRET) as AccessClaims;
  if (decoded.type !== 'access') throw new jwt.JsonWebTokenError('wrong token type');
  return decoded;
}

/** Verify a refresh token. Throws on invalid/expired. */
export function verifyRefreshToken(token: string): RefreshClaims {
  const cfg = getConfig();
  const decoded = jwt.verify(token, cfg.JWT_REFRESH_SECRET) as RefreshClaims;
  if (decoded.type !== 'refresh') throw new jwt.JsonWebTokenError('wrong token type');
  return decoded;
}
