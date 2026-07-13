import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Pill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useUsers, useRoles, useApiMutation } from '../../lib/hooks';
import type { UserRow } from '../../lib/types';

export default function UsersPage() {
  const { me } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const patch = useApiMutation(
    ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/users/${id}`, { method: 'PATCH', body }),
    [['users']],
  );

  const isHr = me?.role.key === 'hr_manager';

  return (
    <AppShell title="Users" subtitle="Assign roles, teams and reporting lines">
      <Card pad={false}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Team</th>
                  <th>Role</th>
                  <th>Manager</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const locked = isHr && u.role.key === 'super_admin';
                  return (
                    <tr
                      key={u.id}
                      data-testid={`user-row-${u.id}`}
                      data-locked={locked ? 'true' : 'false'}
                    >
                      <td style={{ fontWeight: 600 }}>{u.name}</td>
                      <td className="muted">{u.email}</td>
                      <td>{u.team}</td>
                      <td>
                        {locked ? (
                          <Pill tone="p-grey">{u.role.label}</Pill>
                        ) : (
                          <select
                            className="iv-f"
                            value={u.role.key}
                            onChange={(e) =>
                              patch.mutate({ id: u.id, body: { roleKey: e.target.value } })
                            }
                          >
                            {roles.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="muted">{u.managerName ?? '—'}</td>
                      <td>
                        {locked ? (
                          <span className="muted" title="Locked for HR Managers">
                            🔒
                          </span>
                        ) : (
                          <button
                            className="lnk"
                            onClick={() =>
                              patch.mutate({ id: u.id, body: { isActive: !u.isActive } })
                            }
                          >
                            {u.isActive ? 'Active' : 'Inactive'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div style={{ marginTop: 16 }}>
        <Card>
          <SectionTitle>Overrides</SectionTitle>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Grant a single extra capability to a user via the API (POST /users/:id/overrides). Each
            user row above reflects their effective role; overrides layer on top.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

export type { UserRow };
