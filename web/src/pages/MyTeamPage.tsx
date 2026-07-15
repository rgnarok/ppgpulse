import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Empty } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/auth';
import { useConsultants } from '../lib/hooks';
import { usePagination } from '../lib/pagination';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
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
      {isLoading ? (
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
                onClick={() => navigate(`/?consultant=${c.id}`)}
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
