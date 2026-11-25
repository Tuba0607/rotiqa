import { describe, expect, it } from 'vitest'
import { buildSetupSteps } from '../../app/utils/next-steps'

const empty = { departments: 0, activeEmployees: 0, managers: 0, pendingInvitations: 0 }

describe('buildSetupSteps', () => {
  it('asks a new OWNER for departments, staff and managers', () => {
    const steps = buildSetupSteps(empty, true)
    expect(steps.map(s => [s.key, s.done])).toEqual([['departments', false], ['employees', false], ['managers', false]])
  })

  it('does not ask again for what already exists', () => {
    const steps = buildSetupSteps({ departments: 3, activeEmployees: 18, managers: 0, pendingInvitations: 0 }, true)
    expect(steps.filter(s => !s.done).map(s => s.key)).toEqual(['managers'])
    expect(steps.find(s => s.key === 'departments')?.doneLabel).toBe('3 departman')
    expect(steps.find(s => s.key === 'employees')?.doneLabel).toBe('18 aktif personel')
  })

  it('treats a pending invitation as progress on the manager step', () => {
    const step = buildSetupSteps({ ...empty, pendingInvitations: 1 }, true).find(s => s.key === 'managers')!
    expect(step).toMatchObject({ done: true, doneLabel: '1 bekleyen davet' })
  })

  it('shows a MANAGER only the step they can act on', () => {
    expect(buildSetupSteps(empty, false).map(s => s.key)).toEqual(['employees'])
  })
})
