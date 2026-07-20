import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, Empty, Pill } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/auth';
import { useConsultants, useTeamRoster } from '../lib/hooks';
import { usePagination } from '../lib/pagination';
import type { TeamRosterRow } from '../lib/types';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const LOAD_COLOR: Record<TeamRosterRow['load'], string> = {
  OK: 'var(--green)',
  LIGHT: 'var(--amber)',
  OVERLOAD: 'var(--red)',
};
const KPI_TONE: Record<TeamRosterRow['kpiBand'], string> = {
  ME: 'p-blue',
  SME: 'p-amber',
  NI: 'p-red',
};

/** Org-wide (or pod-scoped) performance table — Consultant/Role/Active Reqs/Load/
 * Onboard MTD/Profiles per wk/HDIS Today/KPI Rating. Clicking a row opens that
 * person's dedicated report page. Exported for reuse on the Dhruva dashboard, which
 * shows the same org-wide roster in its "PPG Team Roster" section. */
export function TeamRosterTable() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useTeamRoster();
  const { page, setPage, pageCount, pageItems, pageSize, totalItems } = usePagination(rows, 20);

  if (isLoading) return <Card>Loading…</Card>;
  if (rows.length === 0) return <Empty title="No team members in scope" icon="◎" />;

  return (
    <Card pad={false}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 0',
        }}
      >
        <div className="sec-t">
          <span className="dot" />
          PPG Team Roster
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          click a consultant to open the full profile
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl hover">
          <thead>
            <tr>
              <th>Consultant</th>
              <th>Role</th>
              <th>Active Reqs</th>
              <th>Load</th>
              <th>Onboard MTD</th>
              <th>Profiles/wk</th>
              <th>HDIS Today</th>
              <th>KPI Rating</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/team/${r.id}`)}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="muted">{r.role}</td>
                <td className="mono">{r.activeReqs}</td>
                <td style={{ color: LOAD_COLOR[r.load], fontWeight: 700 }}>{r.load}</td>
                <td className="mono">
                  {r.onboardMtd}/{r.onboardTarget}
                </td>
                <td className="mono">
                  {r.profilesWk}/{r.profilesTarget}
                </td>
                <td style={{ color: r.hdisToday ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                  {r.hdisToday ? 'Yes' : 'No'}
                </td>
                <td>
                  <span
                    className="mono"
                    style={{ fontWeight: 700, marginRight: 6, color: LOAD_COLOR[r.load] }}
                  >
                    {r.kpiVal.toFixed(1)}
                  </span>
                  <Pill tone={KPI_TONE[r.kpiBand]}>{r.kpiBand}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        totalItems={totalItems}
        onChange={setPage}
      />
    </Card>
  );
}

export default function MyTeamPage() {
  const { me } = useAuth();
  const { data: consultants = [], isLoading } = useConsultants();
  const navigate = useNavigate();
  const { page, setPage, pageCount, pageItems, pageSize, totalItems } = usePagination(
    consultants,
    24,
  );

  // Org-scope users (Super Admin/HR) aren't looking at "their" pod — this is the full
  // PPG roster, so the page identifies and reads that way instead.
  const orgScope = me?.scope === 'org';
  const title = orgScope ? 'PPG Team' : 'My Team';
  const subtitle = orgScope
    ? 'All PPG people, HR Managers to Consultants — click a member to open their work'
    : 'Your pod — click a member to open their report';

  return (
    <AppShell title={title} subtitle={subtitle}>
      {orgScope ? (
        <TeamRosterTable />
      ) : isLoading ? (
        <div className="card pad">Loading…</div>
      ) : consultants.length === 0 ? (
        <Empty title="No team members in scope" icon="◎" />
      ) : (
        <>
          <div className="grid g-3">
            {pageItems.map((c) => (
              <div
                key={c.id}
                className="pcard"
                role="button"
                onClick={() => navigate(`/team/${c.id}`)}
              >
                <div className="av">{initials(c.name)}</div>
                <div>
                  <div className="pn">{c.name}</div>
                  <div className="pr">{c.pod}</div>
                  <div className="pm">
                    {c.insights} insights · {c.eventsHosted} hosted
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pageCount > 1 && (
            <div className="card" style={{ marginTop: 4 }}>
              <Pagination
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                totalItems={totalItems}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
