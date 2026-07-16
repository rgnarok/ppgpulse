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
    statusMix: { active: number; onHold: number; closed: number };
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
  requirements: RequirementRow[];
}

export interface RequirementRow {
  id: string;
  code: string;
  jdId: string | null;
  title: string;
  client: string;
  reqDate: string;
  status: string;
  profiles: number;
  shortlist: number;
  l1: number;
  l2: number;
  l3: number;
  onboard: number;
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
  createdAt: string;
  updatedAt: string;
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
