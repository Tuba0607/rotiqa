import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UiInput from '~/components/ui/UiInput.vue'

describe('UiInput', () => {
  it('links label, error and aria-invalid', async () => {
    const wrapper = await mountSuspended(UiInput, { props: { label: 'E-posta', error: 'Geçerli bir e-posta adresi girin.' } })
    const input = wrapper.get('input')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`#${input.attributes('aria-describedby')}`).text()).toBe('Geçerli bir e-posta adresi girin.')
  })

  it('has no toggle for non-password fields', async () => {
    const wrapper = await mountSuspended(UiInput, { props: { label: 'Ad' } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('toggles password visibility with an accessible button', async () => {
    const wrapper = await mountSuspended(UiInput, { props: { label: 'Şifre', type: 'password' } })
    const input = wrapper.get('input')
    const toggle = wrapper.get('button')
    expect(input.attributes('type')).toBe('password')
    expect(toggle.attributes()).toMatchObject({ 'type': 'button', 'aria-label': 'Şifreyi göster', 'aria-pressed': 'false', 'aria-controls': input.attributes('id') })

    await toggle.trigger('click')
    expect(input.attributes('type')).toBe('text')
    expect(toggle.attributes()).toMatchObject({ 'aria-label': 'Şifreyi gizle', 'aria-pressed': 'true' })
  })
})
