import type { CurrentUser } from '../rbac/context.js';
import { effectivePermissions } from '../rbac/engine.js';

/** Shape /me: identity + role + effective permissions + scope (+ consultant profile). */
export function meDto(user: CurrentUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    team: user.team,
    managerId: user.managerId,
    isActive: user.isActive,
    role: {
      key: user.role.key,
      label: user.roleLabel,
      sub: user.roleSub,
      scope: user.role.scope,
    },
    scope: user.role.scope,
    hasReports: user.hasReports,
    permissions: effectivePermissions(user),
    consultant: user.consultant,
  };
}
