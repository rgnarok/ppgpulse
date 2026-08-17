import { describe, it, expect } from 'vitest';
import { parseInterviewText, parseLooseDate } from './parseInterviewText';

describe('parseInterviewText', () => {
  it('parses the standard labeled-block format end to end', () => {
    const raw = `Interview Update: 2026140808(L4)
Mode - Face 2 Face
Candidate Full Name: Tanya Garg
Email: tgarg1012@gmail.com
Date: Aug 14, 2026
Time: 3:30 PM
Profile: Flutter VIP
With: Kushagra Bindra
Sourcing: Priya Pal
Status: Selected`;

    const { fields, unmatchedLines } = parseInterviewText(raw);

    expect(fields.ref).toBe('2026140808');
    expect(fields.round).toBe('L4');
    expect(fields.modeRaw).toBe('Face 2 Face');
    expect(fields.candidate).toBe('Tanya Garg');
    expect(fields.email).toBe('tgarg1012@gmail.com');
    expect(fields.dateISO).toBe('2026-08-14');
    expect(fields.time).toBe('3:30 PM');
    expect(fields.profileRaw).toBe('Flutter VIP');
    expect(fields.interviewer).toBe('Kushagra Bindra');
    expect(fields.sourcingRaw).toBe('Priya Pal');
    expect(fields.statusRaw).toBe('Selected');
    expect(unmatchedLines).toEqual([]);
  });

  it('handles a bare interview-update ref with no round in parens', () => {
    const { fields } = parseInterviewText('Interview Update: 2026090701');
    expect(fields.ref).toBe('2026090701');
    expect(fields.round).toBeUndefined();
  });

  it('reports lines that look like key:value but use an unknown label', () => {
    const { unmatchedLines, fields } = parseInterviewText(
      'Candidate Full Name: Tanya Garg\nRecruiter Notes: called twice, no answer',
    );
    expect(fields.candidate).toBe('Tanya Garg');
    expect(unmatchedLines).toEqual(['Recruiter Notes: called twice, no answer']);
  });

  it('reports lines with no label:value shape at all', () => {
    const { unmatchedLines } = parseInterviewText('just a stray sentence with no colon');
    expect(unmatchedLines).toEqual(['just a stray sentence with no colon']);
  });

  it('is case- and spacing-insensitive on labels', () => {
    const { fields } = parseInterviewText('email:   Tgarg1012@Gmail.com  ');
    expect(fields.email).toBe('Tgarg1012@Gmail.com');
  });
});

describe('parseLooseDate', () => {
  it('parses "Mon D, YYYY"', () => {
    expect(parseLooseDate('Aug 14, 2026')).toBe('2026-08-14');
  });
  it('parses full month names', () => {
    expect(parseLooseDate('August 14, 2026')).toBe('2026-08-14');
  });
  it('parses "D Mon YYYY"', () => {
    expect(parseLooseDate('14 Aug 2026')).toBe('2026-08-14');
  });
  it('parses ISO', () => {
    expect(parseLooseDate('2026-8-4')).toBe('2026-08-04');
  });
  it('parses US slash dates', () => {
    expect(parseLooseDate('08/14/2026')).toBe('2026-08-14');
  });
  it('returns null for unparseable input', () => {
    expect(parseLooseDate('sometime next week')).toBeNull();
  });
});
