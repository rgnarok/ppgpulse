import { describe, it, expect } from 'vitest';
import { parseNumericTarget } from './service.js';

describe('parseNumericTarget', () => {
  it('extracts the first whole number from a free-text target', () => {
    expect(parseNumericTarget('2 / day / consultant')).toBe(2);
    expect(parseNumericTarget('4/day')).toBe(4);
    expect(parseNumericTarget('≥ 5 / day')).toBe(5);
    expect(parseNumericTarget('12 per week')).toBe(12);
  });

  it('returns null when the text has no digits', () => {
    expect(parseNumericTarget('N/A')).toBeNull();
    expect(parseNumericTarget('')).toBeNull();
    expect(parseNumericTarget('as needed')).toBeNull();
  });
});
