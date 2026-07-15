import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Card, Empty, Btn } from '../../components/ui';
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from '../../lib/hooks';
import { formatDate } from '../../lib/format';

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const create = useCreateClient();
  const update = useUpdateClient();
  const remove = useDeleteClient();

  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(needle));
  }, [clients, q]);

  function submitAdd() {
    const name = newName.trim();
    if (!name) return;
    setAddError(null);
    create.mutate(name, {
      onSuccess: () => setNewName(''),
      onError: (err) =>
        setAddError(err instanceof Error ? err.message : 'Could not add this client'),
    });
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditValue(name);
    setEditError(null);
  }

  function saveEdit(id: string) {
    const name = editValue.trim();
    if (!name) return;
    update.mutate(
      { id, name },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) =>
          setEditError(err instanceof Error ? err.message : 'Could not save this change'),
      },
    );
  }

  function remove_(id: string, name: string) {
    if (!window.confirm(`Remove "${name}" from the client master?`)) return;
    remove.mutate(id);
  }

  return (
    <AppShell title="Clients" subtitle="Client master — powers the client picker on HDIS records">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="client-search">Search</label>
            <input
              id="client-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a client…"
            />
          </div>
          <div className="field" style={{ minWidth: 260 }}>
            <label htmlFor="client-new">Add a client</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="client-new"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submitAdd())}
                placeholder="New client name"
              />
              <Btn onClick={submitAdd} disabled={create.isPending || !newName.trim()}>
                + Add
              </Btn>
            </div>
          </div>
        </div>
        {addError && (
          <div className="pill p-red" style={{ marginTop: 10, display: 'inline-block' }}>
            {addError}
          </div>
        )}
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <Empty title="No clients found" icon="🏢">
            Clients are also added automatically the first time they're used on an HDIS record — or
            add one here directly.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl hover">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(c.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                      ) : (
                        c.name
                      )}
                      {editingId === c.id && editError && (
                        <div
                          className="pill p-red"
                          style={{ marginTop: 6, display: 'inline-block' }}
                        >
                          {editError}
                        </div>
                      )}
                    </td>
                    <td className="muted">{formatDate(c.createdAt.slice(0, 10))}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        {editingId === c.id ? (
                          <>
                            <button
                              type="button"
                              className="lnk"
                              onClick={() => saveEdit(c.id)}
                              disabled={update.isPending}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="lnk"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="lnk"
                              onClick={() => startEdit(c.id, c.name)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="lnk"
                              style={{ color: 'var(--danger, #c0392b)' }}
                              onClick={() => remove_(c.id, c.name)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
