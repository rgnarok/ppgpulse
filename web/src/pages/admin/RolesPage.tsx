import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Pill, Btn } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { can } from '../../lib/permissions';
import { generatePassword } from '../../lib/password';
import { useRoles, useApiMutation } from '../../lib/hooks';
import type { UserRow } from '../../lib/types';

const SECTIONS = ['home', 'interviews', 'hdis', 'myteam', 'profile', 'users', 'roles', 'hierarchy'];
const CAPS = ['view', 'add', 'edit', 'delete'];

const SECTION_LABELS: Record<string, string> = {
  home: 'Home',
  interviews: 'Interviews',
  hdis: 'HDIS',
  myteam: 'My Team',
  profile: 'Profile',
  users: 'Users',
  roles: 'Roles & Access',
  hierarchy: 'Team Hierarchy',
};

// Sections a new "user" gets by default — the admin can toggle any of them.
const DEFAULT_SECTIONS = ['home', 'interviews', 'hdis', 'myteam', 'profile'];

function CreateUserForm() {
  const { me } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState('PPG');
  const [password, setPassword] = useState(() => generatePassword());
  const [sections, setSections] = useState<Set<string>>(new Set(DEFAULT_SECTIONS));
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useApiMutation<{ body: Record<string, unknown> }, UserRow>(
    ({ body }) => api<UserRow>('/users', { method: 'POST', body }),
    [['users'], ['roles'], ['hierarchy']],
  );

  const toggle = (s: string) =>
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const reset = () => {
    setName('');
    setEmail('');
    setTeam('PPG');
    setSections(new Set(DEFAULT_SECTIONS));
    setPassword(generatePassword());
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    create.mutate(
      {
        body: {
          name: name.trim(),
          email: email.trim(),
          roleKey: 'user',
          team: team.trim() || 'PPG',
          password,
          sections: [...sections],
          managerId: me?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          setCreated({ email: email.trim(), password });
          reset();
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not create the user'),
      },
    );
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionTitle>Create user</SectionTitle>
        <Pill tone="p-violet">type: user</Pill>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        New accounts are created as a <strong>user</strong> with an auto-generated password. Pick
        the sections they should be able to see — the new account appears in Users immediately.
      </p>

      <form onSubmit={submit} style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div className="grid g-2" style={{ gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Name
            </span>
            <input
              className="iv-f"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Email
            </span>
            <input
              className="iv-f"
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@vayuz.com"
            />
          </label>
        </div>

        <div className="grid g-2" style={{ gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Team
            </span>
            <input className="iv-f" value={team} onChange={(e) => setTeam(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Generated password
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="iv-f"
                readOnly
                value={password}
                style={{ fontFamily: 'monospace', flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-gho btn-sm"
                onClick={() => setPassword(generatePassword())}
                title="Generate a new password"
              >
                ↻
              </button>
            </div>
          </label>
        </div>

        <div>
          <span className="muted" style={{ fontSize: 12 }}>
            Section access
          </span>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 6,
            }}
          >
            {SECTIONS.map((s) => (
              <label
                key={s}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={sections.has(s)} onChange={() => toggle(s)} />
                {SECTION_LABELS[s] ?? s}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div
            className="muted"
            role="alert"
            style={{ color: 'var(--danger, #c0392b)', fontSize: 13 }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create user'}
          </Btn>
        </div>
      </form>

      {created && (
        <div
          className="scope-note"
          role="status"
          style={{ marginTop: 14, display: 'grid', gap: 4 }}
        >
          <strong>User created.</strong> Share these credentials — the password is shown only once:
          <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {created.email} / {created.password}
          </div>
          <button
            type="button"
            className="lnk"
            style={{ justifySelf: 'start' }}
            onClick={() => navigator.clipboard?.writeText(`${created.email} / ${created.password}`)}
          >
            Copy credentials
          </button>
        </div>
      )}
    </Card>
  );
}

export default function RolesPage() {
  const { me } = useAuth();
  const { data: roles = [], isLoading } = useRoles();
  const canCreateUsers = useMemo(() => can(me, 'users', 'edit'), [me]);

  return (
    <AppShell title="Roles & Access" subtitle="Create users and review the permission matrix">
      {canCreateUsers && (
        <div style={{ marginBottom: 16 }}>
          <CreateUserForm />
        </div>
      )}
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
