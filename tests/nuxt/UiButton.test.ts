import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UiButton from '~/components/ui/UiButton.vue'

describe('UiButton', () => {
  it('is busy and disabled while loading, keeping its label', async () => {
    const wrapper = await mountSuspended(UiButton, { props: { loading: true }, slots: { default: () => 'Kaydet' } })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Kaydet')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('renders a real link (not a button inside a link) when given a route', async () => {
    const wrapper = await mountSuspended(UiButton, { props: { to: '/kayit' }, slots: { default: () => 'Ücretsiz başla' } })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.get('a').attributes('href')).toBe('/kayit')
  })
})
