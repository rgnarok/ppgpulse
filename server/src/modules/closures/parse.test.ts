import { describe, it, expect } from 'vitest';
import { parseMonth, parseType, matchRecruiter, parseImport } from './parse.js';

const users = [
  { id: 'u1', name: 'Priya Pal' },
  { id: 'u2', name: 'Suhani Singh' },
  { id: 'u3', name: 'Pragyashree Jain' },
  { id: 'u4', name: 'Abha Sharma' },
  { id: 'u5', name: 'Anshika Rana' },
  { id: 'u6', name: 'Sunita Rana' },
];

describe('parseMonth', () => {
  it('accepts the documented shapes', () => {
    expect(parseMonth('Oct 2026')).toBe('2026-10');
    expect(parseMonth('October 2026')).toBe('2026-10');
    expect(parseMonth('2026-10')).toBe('2026-10');
    expect(parseMonth('15-10-2026')).toBe('2026-10');
    expect(parseMonth('Oct-26')).toBe('2026-10');
  });
  it('rejects junk', () => {
    expect(parseMonth('soon')).toBeNull();
    expect(parseMonth('2026-13')).toBeNull();
  });
});

describe('parseType', () => {
  it('maps labels to HDIS categories', () => {
    expect(parseType('RAPYD Contract')).toBe('RADC');
    expect(parseType('rapyd fte')).toBe('RADF');
    expect(parseType('Internal')).toBe('Internal');
    expect(parseType('RADC')).toBe('RADC');
    expect(parseType('other')).toBeNull();
  });
});

describe('matchRecruiter', () => {
  it('matches first names when unique, flags ambiguity', () => {
    expect(matchRecruiter('Suhani', users)).toEqual({ kind: 'user', userId: 'u2' });
    expect(matchRecruiter('Pragya', users)).toEqual({ kind: 'user', userId: 'u3' });
    expect(matchRecruiter('Rana', users).kind).toBe('none');
    expect(matchRecruiter('VAYUZ Internal', users)).toEqual({ kind: 'unassigned' });
    expect(matchRecruiter('Nobody', users).kind).toBe('none');
  });
});

describe('parseImport', () => {
  it('parses rows, skips header, defaults closures to 1, reports errors per line', () => {
    const text = [
      'Month\tRecruiter\tType\tClosures\tClient\tCandidate',
      'Oct 2026\tPragya\tRAPYD Contract\t1\tApexon\tA B',
      '2026-09\tAbha\tRAPYD FTE',
      'Sep 2026\tNobody\tInternal\t1',
      'Sep 2026\tAbha\tInternal\tx',
    ].join('\n');
    const rows = parseImport(text, users);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      month: '2026-10',
      userId: 'u3',
      type: 'RADC',
      count: 1,
      client: 'Apexon',
    });
    expect(rows[1]).toMatchObject({ month: '2026-09', userId: 'u4', type: 'RADF', count: 1 });
    expect(rows[2].error).toMatch(/Unknown recruiter/);
    expect(rows[3].error).toMatch(/whole number/);
  });
});
