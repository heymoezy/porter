export const PROJECT_ROLE_ORDER = ['view', 'chat', 'edit', 'admin', 'owner'] as const;
export type ProjectRole = typeof PROJECT_ROLE_ORDER[number];

export function hasProjectRole(actual: ProjectRole, minimum: ProjectRole): boolean {
  return PROJECT_ROLE_ORDER.indexOf(actual) >= PROJECT_ROLE_ORDER.indexOf(minimum);
}
