// Generate a strong, human-shareable temporary password for new accounts.
// Guarantees at least one lower, upper, digit and symbol so it always passes
// the server's minimum-length rule and common password policies.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%*?';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function pick(set: string): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return set[arr[0] % set.length];
}

export function generatePassword(length = 14): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Fisher–Yates shuffle with crypto randomness so required chars aren't front-loaded.
  for (let i = chars.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
