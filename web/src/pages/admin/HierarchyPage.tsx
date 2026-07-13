import { AppShell } from '../../components/AppShell';
import { Card } from '../../components/ui';
import { useHierarchy } from '../../lib/hooks';
import type { OrgNode } from '../../lib/types';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function TreeNode({ node }: { node: OrgNode }) {
  return (
    <li>
      <span className="tnode">
        <span className="av">{initials(node.name)}</span>
        <span>
          <span className="tn">{node.name}</span>
          <span className="tr"> · {node.role}</span>
        </span>
      </span>
      {node.reports.length > 0 && (
        <ul>
          {node.reports.map((r) => (
            <TreeNode key={r.id} node={r} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function HierarchyPage() {
  const { data: tree = [], isLoading } = useHierarchy();
  return (
    <AppShell title="Team Hierarchy" subtitle="Reporting structure">
      <Card>
        {isLoading ? (
          'Loading…'
        ) : (
          <div className="tree">
            <ul>
              {tree.map((n) => (
                <TreeNode key={n.id} node={n} />
              ))}
            </ul>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
