import { CLOSURE_TYPES, type ClosureType } from './schema.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Oct 2026" | "October 2026" | "2026-10" | "15-10-2026" | "15/10/2026" -> "2026-10". */
export function parseMonth(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (m) return ok(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return ok(Number(m[3]), Number(m[2]));
  m = /^([A-Za-z]{3,9})[\s,-]*'?(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx < 0) return null;
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return ok(y, idx + 1);
  }
  return null;
}

function ok(y: number, mo: number): string | null {
  if (!y || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/** "RAPYD Contract" | "RADC" | "FTE" | "RAPYD FTE" | "Internal" -> closure type. */
export function parseType(raw: string): ClosureType | null {
  const s = raw.trim().toLowerCase();
  if ((CLOSURE_TYPES as readonly string[]).map((t) => t.toLowerCase()).includes(s)) {
    return CLOSURE_TYPES.find((t) => t.toLowerCase() === s)!;
  }
  if (s.includes('contract')) return 'RADC';
  if (s.includes('fte') || s.includes('full')) return 'RADF';
  if (s.includes('internal')) return 'Internal';
  return null;
}

export interface UserLite {
  id: string;
  name: string;
}

export type RecruiterMatch =
  | { kind: 'user'; userId: string }
  | { kind: 'unassigned' }
  | { kind: 'none' }
  | { kind: 'ambiguous' };

/** Resolve a pasted recruiter name: exact (case-insensitive), then unique first-name /
 * prefix match, "VAYUZ Internal"/"Unassigned" -> the unassigned bucket. */
export function matchRecruiter(raw: string, users: UserLite[]): RecruiterMatch {
  const s = raw.trim().toLowerCase();
  if (!s) return { kind: 'none' };
  if (s === 'vayuz internal' || s === 'unassigned' || s === 'internal') {
    return { kind: 'unassigned' };
  }
  const exact = users.filter((u) => u.name.toLowerCase() === s);
  if (exact.length === 1) return { kind: 'user', userId: exact[0].id };
  const partial = users.filter(
    (u) => u.name.toLowerCase().startsWith(s) || u.name.toLowerCase().split(/\s+/)[0] === s,
  );
  if (partial.length === 1) return { kind: 'user', userId: partial[0].id };
  return partial.length > 1 ? { kind: 'ambiguous' } : { kind: 'none' };
}

export interface ParsedRow {
  line: number;
  month?: string;
  userId?: string | null;
  type?: ClosureType;
  count?: number;
  client?: string | null;
  candidate?: string | null;
  error?: string;
}

/** Parse pasted Excel rows: `Month, Recruiter, Type, Closures, Client, Candidate`
 * (tab- or comma-separated; first three required; Closures defaults to 1). A header
 * row (first cell "month") is skipped. */
export function parseImport(text: string, users: UserLite[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    if (!rawLine.trim()) return;
    const cells = (rawLine.includes('\t') ? rawLine.split('\t') : rawLine.split(',')).map((c) =>
      c.trim(),
    );
    if (i === 0 && cells[0].toLowerCase() === 'month') return;
    const row: ParsedRow = { line: i + 1 };
    const month = parseMonth(cells[0] ?? '');
    const rec = matchRecruiter(cells[1] ?? '', users);
    const type = parseType(cells[2] ?? '');
    const countRaw = (cells[3] ?? '').trim();
    const count = countRaw === '' ? 1 : Number(countRaw);
    if (!month) row.error = `Unrecognised month "${cells[0] ?? ''}"`;
    else if (rec.kind === 'none') row.error = `Unknown recruiter "${cells[1] ?? ''}"`;
    else if (rec.kind === 'ambiguous') row.error = `Recruiter "${cells[1]}" matches several people`;
    else if (!type) row.error = `Unrecognised type "${cells[2] ?? ''}"`;
    else if (!Number.isInteger(count) || count < 0 || count > 999)
      row.error = `Closures must be a whole number, got "${countRaw}"`;
    else {
      row.month = month;
      row.userId = rec.kind === 'user' ? rec.userId : null;
      row.type = type;
      row.count = count;
      row.client = cells[4] || null;
      row.candidate = cells[5] || null;
    }
    out.push(row);
  });
  return out;
}
