import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Card, Empty, Pill } from '../../components/ui';
import { Pagination } from '../../components/Pagination';
import { useAuditLog } from '../../lib/hooks';
import { usePagination } from '../../lib/pagination';
import { formatDateTime } from '../../lib/format';

const SECTION_LABELS: Record<string, string> = {
  home: 'Home',
  interviews: 'Interviews',
  hdis: 'HDIS',
  myteam: 'My Team',
  profile: 'Profile',
  users: 'Users',
  roles: 'Roles & Access',
  hierarchy: 'Team Hierarchy',
  auditlog: 'Activity Log',
};

export default function AuditLogPage() {
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const { data: entries = [], isLoading } = useAuditLog({
    section: section || undefined,
    q: q.trim() || undefined,
  });
  const { page, setPage, pageCount, pageItems, pageSize, totalItems } = usePagination(entries);

  const sections = useMemo(() => Object.keys(SECTION_LABELS), []);

  return (
    <AppShell
      title="Activity Log"
      subtitle="Every update on the platform — who changed what, and when"
    >
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="audit-search">Search</label>
            <input
              id="audit-search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Person, action, or detail…"
            />
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="audit-section">Section</label>
            <select
              id="audit-section"
              className="iv-f"
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {SECTION_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : entries.length === 0 ? (
          <Empty title="No activity yet" icon="☰">
            Updates across Users, Roles, HDIS, Clients, and Interviews will show up here as they
            happen.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Section</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e) => (
                  <tr key={e.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(e.at)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{e.actorName}</td>
                    <td>
                      <Pill tone="p-grey">{SECTION_LABELS[e.section] ?? e.section}</Pill>
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {e.action}
                    </td>
                    <td>{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={totalItems}
          onChange={setPage}
        />
      </Card>
    </AppShell>
  );
}
