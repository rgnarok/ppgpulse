import { describe, it, expect } from 'vitest';
import { health } from './health.js';

describe('health', () => {
  it('reports ok', () => {
    expect(health()).toEqual({ status: 'ok', service: 'ppg-pulse-server' });
  });
});
