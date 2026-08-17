/**
 * "Paste to fill" — turns a block of free-form labeled text (as people already
 * copy/paste from Slack/WhatsApp/email when logging an interview) into a
 * partial interview record the Add Interview form can prefill.
 *
 * Deliberately NOT an LLM call: the format recruiters actually type is a
 * short list of `Label: value` (or `Label - value`) lines, so a label-alias
 * lookup plus a few small heuristics covers it for free, instantly, with no
 * external dependency. If the format drifts too far from that, lines that
 * don't match anything come back in `unmatchedLines` so the UI can say so
 * rather than silently dropping data.
 */

export interface ParsedInterviewFields {
  /** e.g. "2026140808" — the interview-update reference id. */
  ref?: string;
  /** One of the app's round codes (L0–L5), if recognized. */
  round?: string;
  /** Raw text describing mode/type ("Face 2 Face", "Virtual call", …) — the
   *  caller fuzzy-matches this against the app's TYPE_OPTIONS since the
   *  mapping (e.g. "Face" → "RAPYD(F)") is app-specific, not text-parsing. */
  modeRaw?: string;
  candidate?: string;
  email?: string;
  /** ISO 'YYYY-MM-DD', if the date line could be parsed. */
  dateISO?: string;
  time?: string;
  /** Raw profile text ("Flutter VIP") — caller fuzzy-matches against live
   *  HDIS options. */
  profileRaw?: string;
  interviewer?: string;
  /** Raw sourcing/PPG name — caller fuzzy-matches against live consultants. */
  sourcingRaw?: string;
  /** Raw status text — caller matches against STATUS_OPTIONS. */
  statusRaw?: string;
}

export interface ParseInterviewTextResult {
  fields: ParsedInterviewFields;
  /** Lines that had a `Label: value` shape but didn't match any known label. */
  unmatchedLines: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Loosely parses common human date formats into 'YYYY-MM-DD'. Returns null
 *  if nothing recognizable is found. */
export function parseLooseDate(raw: string): string | null {
  const s = raw.trim();

  // Already ISO: 2026-08-14
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;

  // "Aug 14, 2026" / "August 14 2026" / "14 Aug 2026" / "14 August, 2026"
  const monthName = s.match(
    /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})|(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/,
  );
  if (monthName) {
    const monRaw = (monthName[1] ?? monthName[5] ?? '').slice(0, 3).toLowerCase();
    const day = Number(monthName[2] ?? monthName[4]);
    const year = Number(monthName[3] ?? monthName[6]);
    const mon = MONTHS[monRaw];
    if (mon && day && year) return `${year}-${pad2(mon)}-${pad2(day)}`;
  }

  // "08/14/2026" (US) or "14/08/2026" (day-first) — assume US when day <= 12,
  // otherwise day-first, since that's ambiguous by nature.
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    const [month, day] = a <= 12 ? [a, b] : [b, a];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return null;
}

/** Normalizes a label for alias lookup: lowercase, strip anything but letters. */
function normLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z]/g, '');
}

const LABEL_ALIASES: Record<string, keyof ParsedInterviewFields | 'refRound' | 'roundOnly'> = {
  interviewupdate: 'refRound',
  interviewid: 'refRound',
  ref: 'refRound',
  round: 'roundOnly',
  mode: 'modeRaw',
  type: 'modeRaw',
  interviewtype: 'modeRaw',
  candidatefullname: 'candidate',
  candidatename: 'candidate',
  candidate: 'candidate',
  name: 'candidate',
  email: 'email',
  emailid: 'email',
  date: 'dateISO',
  interviewdate: 'dateISO',
  time: 'time',
  interviewtime: 'time',
  profile: 'profileRaw',
  requirement: 'profileRaw',
  jd: 'profileRaw',
  with: 'interviewer',
  interviewer: 'interviewer',
  withinterviewer: 'interviewer',
  sourcing: 'sourcingRaw',
  sourcingppg: 'sourcingRaw',
  ppg: 'sourcingRaw',
  status: 'statusRaw',
};

// Matches "Label: value" or "Label - value" (colon or a dash surrounded by
// whitespace, so hyphenated values like "Face-to-face" aren't split wrongly).
const LINE_RE = /^\s*([A-Za-z][A-Za-z0-9 /]{1,40}?)\s*(?::\s*|\s+-\s+)(.+?)\s*$/;

export function parseInterviewText(raw: string): ParseInterviewTextResult {
  const fields: ParsedInterviewFields = {};
  const unmatchedLines: string[] = [];

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (!m) {
      unmatchedLines.push(line);
      continue;
    }
    const [, rawLabel, rawValue] = m;
    const key = LABEL_ALIASES[normLabel(rawLabel)];
    if (!key) {
      unmatchedLines.push(line);
      continue;
    }

    if (key === 'refRound') {
      // "2026140808(L4)" → ref="2026140808", round="L4" (if it looks like a
      // round code). Falls back to just the ref if there's no parenthetical.
      const withRound = rawValue.match(/^(\S+?)\s*\(([^)]+)\)\s*$/);
      if (withRound) {
        fields.ref = withRound[1];
        const roundGuess = withRound[2].trim().toUpperCase();
        if (/^L[0-5]$/.test(roundGuess)) fields.round = roundGuess;
      } else {
        fields.ref = rawValue.trim();
      }
      continue;
    }
    if (key === 'roundOnly') {
      const roundGuess = rawValue.trim().toUpperCase();
      if (/^L[0-5]$/.test(roundGuess)) fields.round = roundGuess;
      else unmatchedLines.push(line);
      continue;
    }
    if (key === 'dateISO') {
      const parsed = parseLooseDate(rawValue);
      if (parsed) fields.dateISO = parsed;
      else unmatchedLines.push(line);
      continue;
    }

    (fields as Record<string, string>)[key] = rawValue.trim();
  }

  return { fields, unmatchedLines };
}
