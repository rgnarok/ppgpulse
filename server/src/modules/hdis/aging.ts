/**
 * "Profile aging" — how long a requirement/profile has taken to move through the
 * R0→R5 pipeline. Pure, dependency-free so it's unit-testable without a database.
 *
 * The raw input is a set of HdisStageEvent rows: the first time each stage's headcount
 * went from 0 to positive (see setPipeline() in service.ts). R0's "start" is the
 * requirement's reqDate itself (a profile is "in R0" from the moment it's raised),
 * so an explicit R0 event isn't required for the first transition to be computable.
 */

export const STAGES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5'] as const;
export type Stage = (typeof STAGES)[number];
export type Transition = 'R0->R1' | 'R1->R2' | 'R2->R3' | 'R3->R4' | 'R4->R5';
export const TRANSITIONS: Transition[] = ['R0->R1', 'R1->R2', 'R2->R3', 'R3->R4', 'R4->R5'];

export interface StageEventLite {
  stage: string;
  at: string | Date;
}

export interface AgingResult {
  /** Total days elapsed so far: reqDate -> (last stage reached's event time, if the
   * requirement is closed/fulfilled) or reqDate -> now (if still open/active). */
  totalDays: number;
  /** Days for each individual R{n}->R{n+1} transition; null where that transition
   * hasn't happened yet (the requirement hasn't reached that stage). */
  transitions: Record<Transition, number | null>;
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/**
 * @param reqDate ISO YYYY-MM-DD — treated as the R0 start time.
 * @param events stage-entry events for this requirement (any order, any subset of R0-R5).
 * @param now current time — used as the "still open" endpoint.
 * @param isClosed true once the requirement is Closed/Fulfilled — freezes aging at the
 *   last reached stage's event instead of continuing to grow against `now`.
 */
export function computeAging(
  reqDate: string,
  events: StageEventLite[],
  now: Date,
  isClosed: boolean,
): AgingResult {
  const atByStage = new Map<string, Date>();
  for (const e of events) {
    const at = toDate(e.at);
    const existing = atByStage.get(e.stage);
    if (!existing || at < existing) atByStage.set(e.stage, at); // keep the earliest
  }

  const r0Start = toDate(`${reqDate}T00:00:00.000Z`);
  const transitions: Record<Transition, number | null> = {
    'R0->R1': null,
    'R1->R2': null,
    'R2->R3': null,
    'R3->R4': null,
    'R4->R5': null,
  };

  let anchor = r0Start;
  let lastReached = r0Start;
  for (let i = 1; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const at = atByStage.get(stage);
    if (!at) break; // hasn't reached this stage yet — later transitions stay null
    const key = `${STAGES[i - 1]}->${stage}` as Transition;
    transitions[key] = daysBetween(anchor, at);
    anchor = at;
    lastReached = at;
  }

  const endpoint = isClosed ? lastReached : now;
  const totalDays = daysBetween(r0Start, endpoint);

  return { totalDays, transitions };
}

/** Average of the non-null values in `values` — null if there are none. */
export function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}
