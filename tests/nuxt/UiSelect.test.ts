import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UiSelect from '~/components/ui/UiSelect.vue'

const options = [{ value: 'k', label: 'Konyaaltı' }, { value: 'l', label: 'Lara' }]

describe('UiSelect', () => {
  it('stays a native, labelled select with the shared chevron and no second arrow', async () => {
    const wrapper = await mountSuspended(UiSelect, { props: { label: 'Şube', options, modelValue: 'k' } })
    const select = wrapper.get('select')
    expect(wrapper.get('label').attributes('for')).toBe(select.attributes('id'))
    // One chevron, drawn by .ui-select (appearance: none hides the browser arrow); room for it on the right.
    expect(select.classes()).toEqual(expect.arrayContaining(['ui-select', 'pr-11', 'truncate']))
    expect(wrapper.findAll('svg')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('▾')
  })

  it('keeps page width classes on the select and updates the model', async () => {
    const wrapper = await mountSuspended(UiSelect, { props: { 'label': 'Şube', options, 'modelValue': 'k', 'class': 'sm:w-64', 'onUpdate:modelValue': () => {} } })
    const select = wrapper.get('select')
    expect(select.classes()).toContain('sm:w-64')
    await select.setValue('l')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['l'])
  })

  it('marks errors for assistive technology', async () => {
    const wrapper = await mountSuspended(UiSelect, { props: { label: 'Departman', options, error: 'Departman seçin.' } })
    const select = wrapper.get('select')
    expect(select.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`#${select.attributes('aria-describedby')}`).text()).toBe('Departman seçin.')
  })
})
