import { describe, expect, it } from 'vitest'
import { showLocationSelect } from '../../app/utils/roles'

describe('showLocationSelect', () => {
  it('always shows the selector to owners', () => {
    expect(showLocationSelect('OWNER', 1)).toBe(true)
    expect(showLocationSelect('OWNER', 3)).toBe(true)
  })

  it('shows it to managers only when they have several branches', () => {
    expect(showLocationSelect('MANAGER', 1)).toBe(false)
    expect(showLocationSelect('MANAGER', 2)).toBe(true)
  })

  it('hides it when there is nothing to choose or the role is unknown', () => {
    expect(showLocationSelect('OWNER', 0)).toBe(false)
    expect(showLocationSelect(undefined, 1)).toBe(false)
  })
})
