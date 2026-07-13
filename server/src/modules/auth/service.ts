import type { PrismaClient } from '@prisma/client';
import { verifyPassword } from '../../lib/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens.js';
import { getConfig } from '../../config.js';
import { UnauthorizedError } from '../../lib/errors.js';

function refreshExpiry(): Date {
  // Mirror JWT_REFRESH_TTL loosely for the DB record; supports "7d"/"15m"/seconds.
  const ttl = getConfig().JWT_REFRESH_TTL;
  const m = /^(\d+)([smhd])$/.exec(ttl);
  let ms = 7 * 24 * 3600 * 1000;
  if (m) {
    const n = Number(m[1]);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!;
    ms = n * unit;
  } else if (/^\d+$/.test(ttl)) {
    ms = Number(ttl) * 1000;
  }
  return new Date(Date.now() + ms);
}

export interface TokenPair {
  access: string;
  refresh: string;
}

async function issueTokens(prisma: PrismaClient, userId: string): Promise<TokenPair> {
  const { token: refresh, jti } = signRefreshToken(userId);
  await prisma.refreshToken.create({
    data: { jti, userId, expiresAt: refreshExpiry() },
  });
  return { access: signAccessToken(userId), refresh };
}

/** Validate credentials and issue a fresh token pair. */
export async function login(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<{ tokens: TokenPair; userId: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive)
    throw new UnauthorizedError('Invalid credentials', 'bad_credentials');
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new UnauthorizedError('Invalid credentials', 'bad_credentials');
  const tokens = await issueTokens(prisma, user.id);
  return { tokens, userId: user.id };
}

/**
 * Rotate a refresh token: verify it, ensure the stored jti is live, revoke it,
 * and issue a new pair. Reuse of a revoked/expired token is rejected.
 */
export async function refresh(prisma: PrismaClient, refreshToken: string): Promise<TokenPair> {
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token', 'bad_refresh');
  }
  const stored = await prisma.refreshToken.findUnique({ where: { jti: claims.jti } });
  if (
    !stored ||
    stored.revokedAt ||
    stored.expiresAt < new Date() ||
    stored.userId !== claims.sub
  ) {
    throw new UnauthorizedError('Refresh token no longer valid', 'bad_refresh');
  }
  await prisma.refreshToken.update({
    where: { jti: claims.jti },
    data: { revokedAt: new Date() },
  });
  return issueTokens(prisma, claims.sub);
}

/** Revoke a refresh token (logout). Idempotent; unknown/invalid tokens are ignored. */
export async function logout(prisma: PrismaClient, refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  try {
    const claims = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { jti: claims.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // ignore invalid tokens on logout
  }
}
