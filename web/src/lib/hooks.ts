import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  ConsultantReport,
  HdisActivityEntry,
  HdisRecord,
  OverviewResponse,
  OrgNode,
  RequirementRow,
  RoleRow,
  ScopedConsultant,
  UserRow,
} from './types';

export interface PeriodParams {
  from?: string;
  to?: string;
  month?: string;
  fy?: string;
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

export function useHdisActivity(jdId: string | null) {
  return useQuery({
    queryKey: ['hdis-activity', jdId],
    queryFn: () => api<HdisActivityEntry[]>(`/hdis/${jdId}/activity`),
    enabled: !!jdId,
  });
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
  candidate: string;
  candidateEmail: string | null;
  ref: string | null;
  round: string | null;
  profile: string | null;
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
