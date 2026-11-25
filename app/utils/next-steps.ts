export interface SetupStats {
  departments: number
  activeEmployees: number
  /** MANAGER memberships (accepted invitations). */
  managers: number
  /** Invitations still waiting to be accepted. */
  pendingInvitations: number
}

export interface SetupStep {
  key: 'departments' | 'employees' | 'managers'
  label: string
  action: string
  path: string
  done: boolean
  /** Shown instead of the action once done, e.g. "3 departman". */
  doneLabel: string
}

/**
 * Dashboard checklist derived from what already exists, so a business that has departments
 * and staff is not asked to create them again. Managers only see the step they can act on.
 */
export function buildSetupSteps(stats: SetupStats, isOwner: boolean): SetupStep[] {
  const steps: SetupStep[] = []
  if (isOwner) {
    steps.push({
      key: 'departments',
      label: 'Departmanları oluşturun',
      action: 'Departman ekle',
      path: '/departmanlar',
      done: stats.departments > 0,
      doneLabel: `${stats.departments} departman`,
    })
  }
  steps.push({
    key: 'employees',
    label: 'Personel ekleyin',
    action: 'Personel ekle',
    path: '/personel/yeni',
    done: stats.activeEmployees > 0,
    doneLabel: `${stats.activeEmployees} aktif personel`,
  })
  if (isOwner) {
    const invited = stats.managers + stats.pendingInvitations
    steps.push({
      key: 'managers',
      label: 'Şube yöneticilerini davet edin',
      action: 'Davet oluştur',
      path: '/davetler',
      done: invited > 0,
      doneLabel: stats.managers > 0 ? `${stats.managers} şube yöneticisi` : `${stats.pendingInvitations} bekleyen davet`,
    })
  }
  return steps
}
