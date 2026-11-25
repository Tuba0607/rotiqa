/** Display names for membership roles. Database values (OWNER / MANAGER) never change. */
export const ROLE_LABELS = {
  OWNER: 'Owner',
  MANAGER: 'Şube yöneticisi',
} as const satisfies Record<'OWNER' | 'MANAGER', string>

export type MembershipRole = keyof typeof ROLE_LABELS
