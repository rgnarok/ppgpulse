export type Scope = 'org' | 'team' | 'own';

export interface Me {
  id: string;
  name: string;
  email: string;
  team: string;
  managerId: string | null;
  isActive: boolean;
  role: { key: string; label: string; sub: string; scope: Scope };
  scope: Scope;
  /** True if any other user reports up to this one — drives "My Team" visibility. */
  hasReports?: boolean;
  permissions: Record<string, string[]>;
  consultant: {
    id: string;
    pod: string;
    eventsHosted: number;
    eventsParticipated: number;
    insights: number;
  } | null;
}

export interface ScopedConsultant {
  id: string;
  userId: string;
  name: string;
  email: string;
  pod: string;
  team: string;
  eventsHosted: number;
  eventsParticipated: number;
  insights: number;
}

export interface OverviewResponse {
  period: { lo: string; hi: string };
  tiles: {
    requirementsReceived: number;
    totalClosures: number;
    closureSplit: { radc: number; radf: number };
    totalRequirements: number;
    insightsPublished: number;
    eventsHosted: number;
    eventsParticipated: number;
    consultants: number;
  };
  charts: {
    requirementsByConsultant: { name: string; value: number }[];
    /** Status mix broken down by the HDIS status-reason detail (e.g. "Fulfilled by
     * VAYUZ" vs "Fulfilled by others"), grouped under Active/On Hold/Fulfilled/Closed. */
    statusReasonMix: { status: string; label: string; count: number }[];
    closuresByConsultant: { name: string; value: number }[];
    confidenceByConsultant: { name: string; value: number }[];
  };
}

export interface ConsultantReport {
  period: { lo: string; hi: string };
  consultant: {
    id: string;
    name: string;
    email: string;
    pod: string;
    role: string;
    eventsHosted: number;
    eventsParticipated: number;
    insights: number;
  };
  stats: {
    reqs: number;
    closed: number;
    profiles: number;
    shortlist: number;
    onboard: number;
    l1: number;
    l2: number;
    l3: number;
  };
  confidence: { score: number; band: string; factors: [string, number][] };
  kpi: { val: number; label: string };
  funnel: { code: string; label: string; actual: number; target: number }[];
  closureSplit: { radc: number; radf: number };
  /** Live (not yet closed) requirement priority split for this consultant, same
   * bucketing as Dhruva's org-wide tiles. */
  priority: { p1: number; p2: number; p3: number; uncategorised: number };
  /** Profile aging — how long this person's requirements take to move through
   * R0->R5. `overall` is the average total days across every requirement in the
   * selected period; `byTransition` breaks that down per stage-to-stage hop. */
  aging: {
    overall: number | null;
    byTransition: Record<AgingTransition, number | null>;
  };
  requirements: RequirementRow[];
}

export type AgingStage = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
export type AgingTransition = 'R0->R1' | 'R1->R2' | 'R2->R3' | 'R3->R4' | 'R4->R5';

export interface RequirementRow {
  id: string;
  code: string;
  jdId: string | null;
  title: string;
  client: string;
  reqDate: string;
  status: string;
  statusReason: string | null;
  profiles: number;
  shortlist: number;
  l1: number;
  l2: number;
  l3: number;
  onboard: number;
  openings: number;
  type: string | null;
  jdLink: string | null;
}

/** One row of the org-wide "PPG Team Roster" table — an all-time snapshot, not
 * period-filtered. */
export interface TeamRosterRow {
  id: string;
  name: string;
  role: string;
  activeReqs: number;
  load: 'LIGHT' | 'OK' | 'OVERLOAD';
  onboardMtd: number;
  onboardTarget: number;
  profilesWk: number;
  profilesTarget: number;
  hdisToday: boolean;
  kpiVal: number;
  kpiBand: 'ME' | 'SME' | 'NI';
}

export interface DhruvaFunnelStage {
  code: string;
  label: string;
  count: number;
  /** % of the previous stage's count that didn't make it here; null for R0. */
  dropoffPct: number | null;
}

export interface DhruvaTopClient {
  client: string;
  deployed: number;
}

/** GET /report/dhruva — super-admin-only org-wide operations dashboard. */
export interface DhruvaDashboard {
  rapyd: { total: number; radc: number; radf: number };
  /** Total live requirement segregation — RAPYD Active (radc+radf) plus Internal, since
   * radc+radf alone doesn't equal the total live requirement count. */
  segregation: { total: number; radc: number; radf: number; internal: number };
  activeClients: number;
  interviewsToday: { total: number; radc: number; radf: number };
  priority: { p1: number; p2: number; p3: number; uncategorised: number };
  funnel: DhruvaFunnelStage[];
  funnelTotal: number;
  topClients: { radc: DhruvaTopClient[]; radf: DhruvaTopClient[] };
  /** Org-wide RADC+RADF closures within the selected period vs. an editable target. */
  closureTarget: {
    kpiId: string | null;
    target: number;
    actual: number;
    radc: number;
    radf: number;
  };
}

export interface HdisRecord {
  jdId: string;
  title: string;
  client: string;
  type: 'RADC' | 'RADF' | 'Internal';
  openings: number;
  status: string;
  statusReason: string | null;
  remarks: string | null;
  priority: string;
  confidence: string;
  reqDate: string;
  jdLink: string | null;
  owners: string[];
  pipeline: {
    r0: number;
    r1: number;
    r2: number;
    r3: number;
    r4: number;
    r5: number;
    stage: string;
  } | null;
  attachments: { id: string; fileName: string; contentType: string; size: number; at: string }[];
  /** How long this requirement has taken to move through R0->R5 — see aging.ts. */
  aging: {
    totalDays: number;
    transitions: Record<AgingTransition, number | null>;
  };
  /** Whether the requirement questionnaire's required fields (+ at least one
   * attachment) are all filled in — the gate for moving status to "Active". */
  detailsComplete: boolean;
  requirementDetail: RequirementDetail | null;
  createdAt: string;
  updatedAt: string;
}

/** The "BIG RAPYD Requirement Questionnaire" — deeper intake details captured after a
 * requirement is created, grouped into sections in the UI (see HdisPage.tsx's
 * DETAIL_SECTIONS). Every field is optional so it can be saved as a partial draft. */
export interface RequirementDetail {
  bigMemberName: string | null;
  requirementsReceived: number | null;
  requirementName: string | null;
  engagementType: string | null;
  clientType: string | null;
  roleBackground: string | null;
  positionOpenDuration: string | null;
  hiringDeadline: string | null;
  interviewRoundsCount: number | null;
  interviewRoundsDefinition: string | null;
  positionsAlreadyFilled: number | null;
  clientAttemptedInternalHiring: boolean | null;
  internalHiringDuration: string | null;
  internalHiringChannels: string | null;
  internalHiringStageReached: string | null;
  internalHiringChallenges: string | null;
  ctcBlockerGap: string | null;
  maxNoticePeriod: string | null;
  targetCompaniesSuggested: string | null;
  vayuzExclusive: boolean | null;
  vendorCount: string | null;
  vendorsSharingProfiles: string | null;
  vendorSubmissionDuration: string | null;
  duplicateProfileTimeline: string | null;
  commercialRates: string | null;
  clientPocDetails: string | null;
  additionalInsights: string | null;
  closureConfidence: string | null;
  exceptionNotes: string | null;
  atsUsed: string | null;
  isComplete: boolean;
}

export interface HdisActivityEntry {
  id: string;
  action: string;
  detail: string;
  actor: string;
  at: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  team: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
  role: { key: string; label: string; scope: Scope };
  overrides: { section: string; capability: string }[];
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  section: string;
  action: string;
  detail: string;
  entityId: string | null;
  at: string;
}

export interface RoleRow {
  id: string;
  key: string;
  label: string;
  sub: string;
  scope: Scope;
  isSystem: boolean;
  isProtected: boolean;
  permissions: Record<string, string[]>;
  userCount: number;
}

export interface OrgNode {
  id: string;
  name: string;
  email: string;
  team: string;
  role: string;
  reports: OrgNode[];
}
