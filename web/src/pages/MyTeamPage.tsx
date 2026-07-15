import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Empty } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useConsultants } from '../lib/hooks';

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

  // Org-scope users (Super Admin/HR) aren't looking at "their" pod — this is the full
  // PPG roster, so the page identifies and reads that way instead.
  const orgScope = me?.scope === 'org';
  const title = orgScope ? 'PPG Team' : 'My Team';
  const subtitle = orgScope
    ? 'All PPG consultants — click a member to open their work'
    : 'Your pod — click a member to open their report';

  return (
    <AppShell title={title} subtitle={subtitle}>
      {isLoading ? (
        <div className="card pad">Loading…</div>
      ) : consultants.length === 0 ? (
        <Empty title="No team members in scope" icon="◎" />
      ) : (
        <div className="grid g-3">
          {consultants.map((c) => (
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
      )}
    </AppShell>
  );
}
