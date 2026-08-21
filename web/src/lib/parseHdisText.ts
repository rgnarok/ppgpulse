/**
 * "Paste to fill" for HDIS — turns a copy/paste of a row from the team's tracker
 * spreadsheet into a partial HDIS record the Add record form can prefill.
 *
 * The tracker export has a very specific (if awkward) shape: a block of column
 * headers, one per line, immediately followed by a block of values, one per line,
 * in the same order — not `Label: value` pairs on a single line like the Interviews
 * paste format. Some cells (like the running "observations" log) contain their own
 * embedded newlines, which would corrupt a naive full-sheet parse — but since every
 * field this app actually has a slot for appears earlier in the row than that, we
 * only need to reliably walk the header block and the first N values.
 *
 * Deliberately scoped to the handful of fields HDIS already has (jdId, title,
 * client, requirement date, positions, JD link, owner, priority) rather than trying
 * to capture the sheet's other 50-odd tracking columns (ageing, projections,
 * sourcing lots, screening links, the observations log, etc.) — those don't have a
 * home in this app yet, so they're intentionally left out rather than guessed at.
 */

import { parseLooseDate } from './parseInterviewText';

export interface ParsedHdisFields {
  jdId?: string;
  title?: string;
  client?: string;
  /** ISO 'YYYY-MM-DD', if the requirement-date cell could be parsed. */
  reqDateISO?: string;
  openings?: number;
  jdLink?: string;
  owners?: string[];
  /** Raw text as pasted ("Low"/"Medium"/"High"), before mapping to P1–P3. */
  priorityRaw?: string;
  /** Mapped to the app's P1/P2/P3 scale, if the raw value was recognized. */
  priority?: string;
}

export interface ParseHdisTextResult {
  fields: ParsedHdisFields;
  /** How many of the 58 known tracker columns were actually recognized in the
   *  pasted header block — 0 means this doesn't look like the tracker format at all. */
  matchedHeaderCount: number;
  /** Human-readable summary of what was filled (and what wasn't), for the UI to
   *  show under the paste box so nothing is silently wrong. */
  notes: string[];
}

// The tracker's column order, exactly as exported — every column is listed (even
// the ~50 we don't map to anything) purely so the header-block walk can correctly
// count past them and land on the right value for the columns we DO care about.
const HEADER_TEMPLATE = [
  'ageing',
  'req_status',
  'priority_pm',
  'priority_cm',
  'priority_BIG',
  'position_title',
  'client_name',
  'client_category',
  'ARPD',
  'position_confidence',
  'confidence_predictor',
  'jd_id',
  'hiring_manager',
  'hiring_category',
  'new_requirement',
  'job_req_date',
  'selection_date',
  'target_closure_date',
  'position_went_on_hold',
  'position_type',
  'ppg_owner',
  'partners_name',
  'openings',
  'projection_BIG',
  'projection_PPG',
  'projection_date',
  'reason_for_projection_change_1',
  'no_of_flags_received',
  'location_type',
  'Location',
  'is_replacement',
  'jd_google_link',
  'blocker',
  'escalation (if req going beyond 60 days)',
  'screening_questions',
  'screening_questions_link',
  'sourcing_type',
  '1+1_strategy',
  'profiles_shared',
  'duplicate_profile',
  'actual_profile_shared',
  '1st lot',
  '1st Iteration',
  '2nd lot',
  '3rd lot',
  'profile_selected_for_L1',
  'profile_%_screen_select_L1',
  'L0',
  'L1_select',
  'L2_select',
  'L3_select',
  'profile_offer_raised',
  'profile_onboarded',
  'last_updated',
  'interview_rounds',
  'observations_by_Cofo',
  'business_loss_status',
  'business_loss_responsible',
] as const;

/** Index of each app-relevant column within HEADER_TEMPLATE, by name — kept as a
 *  lookup rather than magic numbers so the template above stays the single source
 *  of truth for column order. */
const FIELD_INDEX: Record<string, number> = Object.fromEntries(
  HEADER_TEMPLATE.map((h, i) => [h, i]),
);

function normalizeHeaderToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // drop parenthetical notes, e.g. "escalation (if req...)"
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const NORM_TEMPLATE = HEADER_TEMPLATE.map(normalizeHeaderToken);

/** Extracts the URL out of a Markdown link `[text](url)`, or returns the raw
 *  string if it's already a bare URL. Returns null for anything else. */
function extractUrl(raw: string): string | null {
  const md = raw.match(/\]\(\s*(https?:\/\/[^\s)]+)\s*\)/);
  if (md) return md[1];
  const trimmed = raw.trim();
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return null;
}

const PRIORITY_MAP: Record<string, string> = {
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};

export function parseHdisText(raw: string): ParseHdisTextResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());

  // Walk the header block: consume lines that match the next expected template
  // column in order, silently skipping blank lines (the sheet sometimes has a
  // stray blank between columns) without advancing the template pointer. Stop at
  // the first line that doesn't match what comes next — that's where values begin.
  let li = 0;
  let templateIdx = 0;
  while (templateIdx < NORM_TEMPLATE.length && li < lines.length) {
    if (lines[li] === '') {
      li++;
      continue;
    }
    if (normalizeHeaderToken(lines[li]) === NORM_TEMPLATE[templateIdx]) {
      templateIdx++;
      li++;
    } else {
      break;
    }
  }

  const matchedHeaderCount = templateIdx;
  if (matchedHeaderCount === 0) {
    return {
      fields: {},
      matchedHeaderCount: 0,
      notes: [
        "Didn't recognize this as the tracker export — paste both the column headers and the row of values, in order.",
      ],
    };
  }

  // Values are read positionally from here, one raw line per matched header,
  // including blanks (an empty line IS a value — an empty cell) — no skipping.
  const values = lines.slice(li, li + matchedHeaderCount);
  const valueAt = (headerName: (typeof HEADER_TEMPLATE)[number]): string | undefined => {
    const idx = FIELD_INDEX[headerName];
    if (idx === undefined || idx >= values.length) return undefined;
    return values[idx];
  };

  const fields: ParsedHdisFields = {};
  const notes: string[] = [];
  const filled: string[] = [];
  const skipped: string[] = [];

  const jdId = valueAt('jd_id')?.trim();
  if (jdId) {
    fields.jdId = jdId;
    filled.push('JD ID');
  }

  const title = valueAt('position_title')?.trim();
  if (title) {
    fields.title = title;
    filled.push('Title');
  }

  const client = valueAt('client_name')?.trim();
  if (client) {
    fields.client = client;
    filled.push('Client');
  }

  const reqDateRaw = valueAt('job_req_date')?.trim();
  if (reqDateRaw) {
    // Reuses the same loose-date parsing as the Interviews paste feature.
    const parsed = parseLooseDate(reqDateRaw);
    if (parsed) {
      fields.reqDateISO = parsed;
      filled.push('Requirement date');
    } else {
      skipped.push(`Requirement date — couldn't read "${reqDateRaw}"`);
    }
  }

  const openingsRaw = valueAt('openings')?.trim();
  if (openingsRaw) {
    const n = Number(openingsRaw);
    if (Number.isFinite(n) && n > 0) {
      fields.openings = Math.floor(n);
      filled.push('Positions');
    } else {
      skipped.push(`Positions — couldn't read "${openingsRaw}" as a number`);
    }
  }

  const jdLinkRaw = valueAt('jd_google_link')?.trim();
  if (jdLinkRaw) {
    const url = extractUrl(jdLinkRaw);
    if (url) {
      fields.jdLink = url;
      filled.push('JD link');
    } else {
      skipped.push('JD link — no URL found in that cell');
    }
  }

  const ownerRaw = valueAt('ppg_owner')?.trim();
  if (ownerRaw) {
    fields.owners = ownerRaw
      .split(/,|&| and /i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (fields.owners.length) filled.push('Owner(s)');
  }

  const priorityRaw = valueAt('priority_BIG')?.trim();
  if (priorityRaw) {
    fields.priorityRaw = priorityRaw;
    const mapped = PRIORITY_MAP[priorityRaw.toLowerCase()];
    if (mapped) {
      fields.priority = mapped;
      filled.push(`Priority (mapped "${priorityRaw}" → ${mapped})`);
    } else {
      skipped.push(`Priority — couldn't map "${priorityRaw}"`);
    }
  }

  if (filled.length) notes.push(`Filled: ${filled.join(', ')}.`);
  if (skipped.length) notes.push(...skipped);
  if (matchedHeaderCount < HEADER_TEMPLATE.length) {
    notes.push(
      `Recognized ${matchedHeaderCount} of ${HEADER_TEMPLATE.length} tracker columns — the rest of the paste was ignored.`,
    );
  }
  notes.push(
    "This app doesn't track every tracker column (ageing, projections, sourcing lots, screening links, the observations log, etc.) — only the fields above were filled.",
  );

  return { fields, matchedHeaderCount, notes };
}
