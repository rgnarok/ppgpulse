import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Pill } from '../../components/ui';
import { useRoles } from '../../lib/hooks';

const SECTIONS = ['home', 'interviews', 'hdis', 'myteam', 'profile', 'users', 'roles', 'hierarchy'];
const CAPS = ['view', 'add', 'edit', 'delete'];

export default function RolesPage() {
  const { data: roles = [], isLoading } = useRoles();

  return (
    <AppShell title="Roles & Access" subtitle="Role definitions and the permission matrix">
      {isLoading ? (
        <Card>Loading…</Card>
      ) : (
        <div className="grid g-2">
          {roles.map((role) => (
            <Card key={role.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SectionTitle>{role.label}</SectionTitle>
                {role.isSystem && <Pill tone="p-grey">system</Pill>}
                {role.isProtected && <Pill tone="p-violet">protected</Pill>}
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                  {role.userCount} users · scope {role.scope}
                </span>
              </div>
              <div className="tbl-wrap" style={{ marginTop: 12 }}>
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
                    {SECTIONS.map((s) => (
                      <tr key={s}>
                        <td>{s}</td>
                        {CAPS.map((cap) => (
                          <td key={cap}>{role.permissions[s]?.includes(cap) ? '✓' : '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
