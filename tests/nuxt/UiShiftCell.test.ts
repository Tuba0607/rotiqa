import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UiShiftCell from '~/components/ui/UiShiftCell.vue'

describe('UiShiftCell', () => {
  it('renders the shift code with its colors and accessible label', async () => {
    const wrapper = await mountSuspended(UiShiftCell, {
      props: { shift: { code: 'A', label: 'Sabah vardiyası', color: '#CCFBF1', textColor: '#115E59' } },
    })
    const button = wrapper.get('button')
    expect(button.text()).toBe('A')
    expect(button.attributes('aria-label')).toBe('Sabah vardiyası')
    expect(button.attributes('style')).toContain('background-color')
  })

  it('renders an empty cell and emits select on tap', async () => {
    const wrapper = await mountSuspended(UiShiftCell, { props: { shift: null } })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Boş vardiya')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })
})
