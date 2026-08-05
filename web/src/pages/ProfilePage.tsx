import { AppShell } from '../components/AppShell';
import { Card, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import ProfileActivityLog from './ProfileActivityLog';

const SECTIONS = [
  'home',
  'interviews',
  'hdis',
  'myteam',
  'profile',
  'users',
  'roles',
  'hierarchy',
  'auditlog',
  'dhruva',
  'kpis',
  'scorecard',
];
const CAPS = ['view', 'add', 'edit', 'delete'];

export default function ProfilePage() {
  const { me } = useAuth();
  if (!me) return null;

  return (
    <AppShell title="Profile" subtitle="Account, role & access">
      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Card>
          <SectionTitle>Account</SectionTitle>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <Row label="Name" value={me.name} />
            <Row label="Email" value={me.email} />
            <Row label="Team" value={me.team} />
            <Row label="Role" value={`${me.role.label} (${me.role.sub})`} />
            <Row label="Data scope" value={me.scope} />
          </div>
        </Card>
        {me.consultant && (
          <Card>
            <SectionTitle color="var(--green)">Your stats</SectionTitle>
            <div className="grid g-3" style={{ marginTop: 12 }}>
              <div className="mini">
                <div className="l">Insights</div>
                <div className="v">{me.consultant.insights}</div>
              </div>
              <div className="mini">
                <div className="l">Hosted</div>
                <div className="v">{me.consultant.eventsHosted}</div>
              </div>
              <div className="mini">
                <div className="l">Participated</div>
                <div className="v">{me.consultant.eventsParticipated}</div>
              </div>
            </div>
          </Card>
        )}
      </div>
      {me.consultant && (
        <div style={{ marginBottom: 16 }}>
          <ProfileActivityLog />
        </div>
      )}

      <Card pad={false}>
        <div style={{ padding: '16px 20px 0' }}>
          <SectionTitle>Access summary</SectionTitle>
        </div>
        <div className="tbl-wrap" style={{ padding: 16 }}>
          <table className="pmx">
            <thead>
              <tr>
                <th>Section</th>
                {CAPS.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <tr key={section}>
                  <td>{section}</td>
                  {CAPS.map((cap) => (
                    <td key={cap}>{me.permissions[section]?.includes(cap) ? '✓' : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
