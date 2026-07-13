import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Empty } from '../components/ui';
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
  const { data: consultants = [], isLoading } = useConsultants();
  const navigate = useNavigate();

  return (
    <AppShell title="My Team" subtitle="Your pod — click a member to open their report">
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
