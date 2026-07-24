import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  AuditLogEntry,
  ConsultantReport,
  DhruvaDashboard,
  HdisActivityEntry,
  HdisRecord,
  OverviewResponse,
  OrgNode,
  RequirementRow,
  RoleRow,
  ScopedConsultant,
  TeamRosterRow,
  UserRow,
} from './types';

export interface PeriodParams {
  from?: string;
  to?: string;
  month?: string;
  fy?: string;
  /** Narrows the Overview endpoint's tiles/charts to one person, without
   * changing the response shape (or the UI that renders it). */
  consultantId?: string;
}

function qs(params: object): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '' && v !== null,
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function useConsultants() {
  return useQuery({
    queryKey: ['consultants'],
    queryFn: () => api<ScopedConsultant[]>('/consultants'),
  });
}

/** The org-wide (or pod-scoped) "PPG Team Roster" table — an all-time snapshot. */
export function useTeamRoster() {
  return useQuery({
    queryKey: ['team-roster'],
    queryFn: () => api<TeamRosterRow[]>('/report/roster'),
  });
}

export interface DhruvaFilterParams {
  priority?: string;
  client?: string;
  ppg?: string;
  from?: string;
  to?: string;
  month?: string;
  fy?: string;
}

/** The Dhruva org-wide operations dashboard (super-admin only). The headline tiles
 * (RAPYD Active, Total Live Requirements, Priority, Active Clients) and the funnel
 * both respond to the period fields (month/fy/from/to); priority/client/ppg only
 * narrow the funnel. Top Clients and Interviews Today are always unscoped. */
export function useDhruva(filters: DhruvaFilterParams) {
  return useQuery({
    queryKey: ['dhruva', filters],
    queryFn: () => api<DhruvaDashboard>(`/report/dhruva${qs({ ...filters })}`),
  });
}

export function useOverview(period: PeriodParams) {
  return useQuery({
    queryKey: ['overview', period],
    queryFn: () => api<OverviewResponse>(`/report/overview${qs({ ...period })}`),
  });
}

export function useConsultantReport(id: string | null, period: PeriodParams) {
  return useQuery({
    queryKey: ['consultant-report', id, period],
    queryFn: () => api<ConsultantReport>(`/report/consultant/${id}${qs({ ...period })}`),
    enabled: !!id,
  });
}

export function useRequirement(id: string | null) {
  return useQuery({
    queryKey: ['requirement', id],
    queryFn: () => api<Record<string, unknown>>(`/requirements/${id}`),
    enabled: !!id,
  });
}

export function useHdisList(params: { month?: string; status?: string; q?: string }) {
  return useQuery({
    queryKey: ['hdis', params],
    queryFn: () => api<HdisRecord[]>(`/hdis${qs(params)}`),
  });
}

export function useHdisRecord(jdId: string | null) {
  return useQuery({
    queryKey: ['hdis-record', jdId],
    queryFn: () => api<HdisRecord>(`/hdis/${jdId}`),
    enabled: !!jdId,
  });
}

/** Set/clear the JD link directly (used by the inline editor in the Attachments card,
 * distinct from full-record edits). */
export function useSetHdisLink(jdId: string) {
  return useApiMutation(
    (jdLink: string | null) =>
      api<HdisRecord>(`/hdis/${jdId}/link`, { method: 'POST', body: { jdLink } }),
    [
      ['hdis', {}],
      ['hdis-record', jdId],
      ['hdis-activity', jdId],
    ],
  );
}

export function useHdisActivity(jdId: string | null) {
  return useQuery({
    queryKey: ['hdis-activity', jdId],
    queryFn: () => api<HdisActivityEntry[]>(`/hdis/${jdId}/activity`),
    enabled: !!jdId,
  });
}

/** Save (partial or complete) the requirement questionnaire — returns the full record,
 * so `detailsComplete` is always fresh right after a save. */
export function useSaveRequirementDetail(jdId: string) {
  return useApiMutation(
    (body: Record<string, unknown>) =>
      api<HdisRecord>(`/hdis/${jdId}/details`, { method: 'PUT', body }),
    [
      ['hdis', {}],
      ['hdis-record', jdId],
      ['hdis-activity', jdId],
    ],
  );
}

export interface ClientRow {
  id: string;
  name: string;
  createdAt: string;
}

/** The client master list — powers the searchable client picker on the HDIS form. */
export function useClients() {
  return useQuery({ queryKey: ['clients'], queryFn: () => api<ClientRow[]>('/clients') });
}

export function useCreateClient() {
  return useApiMutation(
    (name: string) => api<ClientRow>('/clients', { method: 'POST', body: { name } }),
    [['clients']],
  );
}

export function useUpdateClient() {
  return useApiMutation(
    ({ id, name }: { id: string; name: string }) =>
      api<ClientRow>(`/clients/${id}`, { method: 'PATCH', body: { name } }),
    [['clients']],
  );
}

export function useDeleteClient() {
  return useApiMutation(
    (id: string) => api<void>(`/clients/${id}`, { method: 'DELETE' }),
    [['clients']],
  );
}

export const KPI_PERIODICITY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Incidental'];

export interface KpiRow {
  id: string;
  kpiNo: number;
  symbol: string;
  title: string;
  target: string;
  description: string;
  periodicity: string;
  whyItMatters: string | null;
  trackedMetric: string | null;
  numericTarget: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface KpiInput {
  kpiNo: number;
  symbol: string;
  title: string;
  target: string;
  description: string;
  periodicity: string;
  whyItMatters?: string;
}

/** The KPI scorecard master list — super-admin CRUD, viewed at /admin/kpis. */
export function useKpis(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['kpis'],
    queryFn: () => api<KpiRow[]>('/kpis'),
    enabled: opts.enabled ?? true,
  });
}

export function useCreateKpi() {
  return useApiMutation(
    (input: KpiInput) => api<KpiRow>('/kpis', { method: 'POST', body: input }),
    [['kpis']],
  );
}

export function useUpdateKpi() {
  return useApiMutation(
    ({ id, input }: { id: string; input: KpiInput }) =>
      api<KpiRow>(`/kpis/${id}`, { method: 'PATCH', body: input }),
    // A tracked KPI's numeric target can change here too (derived from the target
    // text server-side) — invalidate the calendar/targets views too so an open
    // Interviews legend or KPI tracking page picks up the new number right away.
    [['kpis'], ['kpi-calendar'], ['kpi-targets']],
  );
}

export function useDeleteKpi() {
  return useApiMutation((id: string) => api<void>(`/kpis/${id}`, { method: 'DELETE' }), [['kpis']]);
}

// ---- KPI tracking: per-consultant targets + the "interviews/day" calendar ----

export interface KpiTargetRow {
  consultantId: string;
  name: string;
  team: string;
  isActive: boolean;
  target: number;
  isOverride: boolean;
}

export function useKpiTargets(kpiId: string | null) {
  return useQuery({
    queryKey: ['kpi-targets', kpiId],
    queryFn: () => api<KpiTargetRow[]>(`/kpis/${kpiId}/targets`),
    enabled: !!kpiId,
  });
}

export function useSetKpiTarget(kpiId: string) {
  return useApiMutation(
    ({ consultantId, target }: { consultantId: string; target: number }) =>
      api(`/kpis/${kpiId}/targets/${consultantId}`, { method: 'PUT', body: { target } }),
    [
      ['kpi-targets', kpiId],
      ['kpi-calendar', kpiId],
    ],
  );
}

export function useClearKpiTarget(kpiId: string) {
  return useApiMutation(
    (consultantId: string) => api(`/kpis/${kpiId}/targets/${consultantId}`, { method: 'DELETE' }),
    [
      ['kpi-targets', kpiId],
      ['kpi-calendar', kpiId],
    ],
  );
}

export function useSetKpiDefaultTarget(kpiId: string) {
  return useApiMutation(
    (target: number) =>
      api<KpiRow>(`/kpis/${kpiId}/default-target`, { method: 'PATCH', body: { target } }),
    // Also invalidates 'dhruva' — the Closure Target section reads a KPI's
    // numericTarget via /report/dhruva, and needs to refresh when it's edited here.
    [['kpis'], ['kpi-targets', kpiId], ['kpi-calendar', kpiId], ['dhruva']],
  );
}

export type DayColor = 'green' | 'amber' | 'red' | 'none';
export interface KpiCalendarDay {
  date: string;
  actual: number;
  target: number;
  pct: number | null;
  color: DayColor;
}
export interface KpiCalendarResponse {
  month: string;
  totalTarget: number;
  consultantCount: number;
  days: KpiCalendarDay[];
}

export function useKpiCalendar(kpiId: string | null, month: string, team?: string) {
  return useQuery({
    queryKey: ['kpi-calendar', kpiId, month, team],
    queryFn: () => api<KpiCalendarResponse>(`/kpis/${kpiId}/calendar${qs({ month, team })}`),
    enabled: !!kpiId,
  });
}

// ---- Consultant activity log (own profile calendar: events/insights/remarks) ----

export interface ConsultantLogRow {
  id: string;
  consultantId: string;
  date: string;
  eventsHosted: number;
  eventsParticipated: number;
  insights: number;
  remarks: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface ConsultantLogInput {
  date: string;
  eventsHosted: number;
  eventsParticipated: number;
  insights: number;
  remarks?: string;
}

export function useConsultantLogMonth(month: string) {
  return useQuery({
    queryKey: ['consultant-log', month],
    queryFn: () => api<MonthCounts>(`/consultant-log${qs({ month })}`),
  });
}

export function useConsultantLogDay(date: string | null) {
  return useQuery({
    queryKey: ['consultant-log-day', date],
    queryFn: () => api<ConsultantLogRow[]>(`/consultant-log/day/${date}`),
    enabled: !!date,
  });
}

export function useCreateConsultantLog() {
  return useApiMutation(
    (input: ConsultantLogInput) =>
      api<ConsultantLogRow>('/consultant-log', { method: 'POST', body: input }),
    [['consultant-log'], ['consultant-log-day']],
  );
}

export function useUpdateConsultantLog() {
  return useApiMutation(
    ({ id, input }: { id: string; input: Partial<ConsultantLogInput> }) =>
      api<ConsultantLogRow>(`/consultant-log/${id}`, { method: 'PATCH', body: input }),
    [['consultant-log'], ['consultant-log-day']],
  );
}

export function useDeleteConsultantLog() {
  return useApiMutation(
    (id: string) => api<void>(`/consultant-log/${id}`, { method: 'DELETE' }),
    [['consultant-log'], ['consultant-log-day']],
  );
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api<UserRow[]>('/users') });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<RoleRow[]>('/roles') });
}

export function useHierarchy() {
  return useQuery({ queryKey: ['hierarchy'], queryFn: () => api<OrgNode[]>('/hierarchy') });
}

export interface AuditLogFilter {
  section?: string;
  actorId?: string;
  q?: string;
}

export function useAuditLog(filter: AuditLogFilter = {}) {
  return useQuery({
    queryKey: ['audit-log', filter],
    queryFn: () => api<AuditLogEntry[]>(`/audit-log${qs(filter)}`),
  });
}

export interface InterviewScopeFilter {
  /** Org-scope callers only: restrict to a specific team name. */
  team?: string;
  /** Team/own-scope callers: restrict to a specific consultant within their own visibility. */
  consultantId?: string;
}

export interface MonthCounts {
  month: string;
  counts: Record<string, number>;
  total: number;
}

export function useInterviewMonth(month: string, filter: InterviewScopeFilter = {}) {
  return useQuery({
    queryKey: ['interviews', month, filter],
    queryFn: () => api<MonthCounts>(`/interviews${qs({ month, ...filter })}`),
  });
}

/**
 * Per-day counts across several months at once (e.g. the 1-2 months a visible week spans),
 * merged into a single date → count map.
 */
export function useInterviewMonths(months: string[], filter: InterviewScopeFilter = {}) {
  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: ['interviews', month, filter],
      queryFn: () => api<MonthCounts>(`/interviews${qs({ month, ...filter })}`),
    })),
  });
  const counts: Record<string, number> = {};
  for (const r of results) Object.assign(counts, r.data?.counts ?? {});
  return { counts, isLoading: results.some((r) => r.isLoading) };
}

export interface DayView {
  date: string;
  mid: InterviewRow[];
  end: InterviewRow[];
  byConsultant: { name: string; count: number }[];
}
export interface InterviewRow {
  id: string;
  date: string;
  session: 'mid' | 'end';
  type: string | null;
  candidate: string;
  candidateEmail: string | null;
  ref: string | null;
  round: string | null;
  client: string | null;
  profile: string | null;
  requirementRef: string | null;
  interviewer: string | null;
  ppgConsultantId: string | null;
  ppgConsultantName: string | null;
  stage: string | null;
  status: string | null;
  time: string | null;
  createdByName: string;
}

export function useInterviewDay(date: string | null, filter: InterviewScopeFilter = {}) {
  return useQuery({
    queryKey: ['interview-day', date, filter],
    queryFn: () => api<DayView>(`/interviews/day/${date}${qs(filter)}`),
    enabled: !!date,
  });
}

export function useApiMutation<TInput, TResult = unknown>(
  fn: (input: TInput) => Promise<TResult>,
  invalidate: unknown[][],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export type { RequirementRow, RoleRow, UserRow };
