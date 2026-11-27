import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismiss, MAX_TOASTS, showToast, useToasts } from '~/composables/useToasts'

describe('toasts', () => {
  const { toasts } = useToasts()
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    for (const t of [...toasts.value]) dismiss(t.id)
    vi.useRealTimers()
  })

  it('closes success toasts by themselves and keeps errors until closed', () => {
    showToast({ tone: 'success', text: 'Geri alındı: 1 hücre.' })
    showToast({ tone: 'error', text: 'Kaydedilemedi.' })
    vi.advanceTimersByTime(60_000)
    expect(toasts.value.map(t => t.tone)).toEqual(['error'])
  })

  it('replaces a toast with the same key instead of stacking, and counts repeats', () => {
    showToast({ key: 'revert', tone: 'success', text: 'Geri alındı: 1 hücre.' })
    showToast({ key: 'revert', tone: 'success', text: 'Geri alındı: 1 hücre.' })
    showToast({ key: 'revert', tone: 'success', text: 'İleri alındı: 2 hücre.' })
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0]).toMatchObject({ text: 'İleri alındı: 2 hücre.', count: 1 })
    showToast({ key: 'revert', tone: 'success', text: 'İleri alındı: 2 hücre.' })
    expect(toasts.value[0]!.count).toBe(2)
  })

  it('restarts the timer when a toast is raised again', () => {
    showToast({ key: 'k', tone: 'success', text: 'A' })
    vi.advanceTimersByTime(3000)
    showToast({ key: 'k', tone: 'success', text: 'A' })
    vi.advanceTimersByTime(3000)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1500)
    expect(toasts.value).toHaveLength(0)
  })

  it(`shows at most ${MAX_TOASTS}, dropping the oldest non-error toast first`, () => {
    showToast({ tone: 'error', text: 'Hata 1' })
    showToast({ tone: 'success', text: 'Bilgi 1' })
    showToast({ tone: 'success', text: 'Bilgi 2' })
    showToast({ tone: 'success', text: 'Bilgi 3' })
    expect(toasts.value.map(t => t.text)).toEqual(['Hata 1', 'Bilgi 2', 'Bilgi 3'])
  })

  it('dismisses by key', () => {
    showToast({ key: 'save-failed', tone: 'error', text: 'Kaydedilemedi.' })
    dismiss('save-failed')
    expect(toasts.value).toHaveLength(0)
  })
})
