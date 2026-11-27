/** Display names for membership roles. Database values (OWNER / MANAGER) never change. */
export const ROLE_LABELS = {
  OWNER: 'Owner',
  MANAGER: 'Şube yöneticisi',
} as const satisfies Record<'OWNER' | 'MANAGER', string>

export type MembershipRole = keyof typeof ROLE_LABELS

/**
 * Whether a branch selector is worth showing. Owners always get one (they manage every branch);
 * a manager only when assigned to more than one branch. A single assigned branch is shown as
 * plain text: a dropdown with one option the user cannot change is noise. The list itself is
 * already limited to accessible branches by the API (RLS), so this is presentation only.
 */
export function showLocationSelect(role: MembershipRole | undefined, accessibleCount: number): boolean {
  if (accessibleCount === 0) return false
  return role === 'OWNER' || accessibleCount > 1
}
