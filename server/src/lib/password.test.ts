import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('roundtrips a correct password', async () => {
    const hash = await hashPassword('Passw0rd!');
    expect(hash).toMatch(/^\$argon2/);
    expect(await verifyPassword(hash, 'Passw0rd!')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Passw0rd!');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});
