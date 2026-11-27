/**
 * Toast notifications: fixed on screen, so showing or hiding one never moves the page.
 *
 * - Success and info toasts close by themselves (paused while hovered or focused).
 * - Errors stay until the user closes them or uses their action ("Tekrar dene").
 * - A toast with the same `key` replaces the existing one (and restarts its timer) instead
 *   of stacking; at most MAX_TOASTS are shown, the oldest non-error one leaves first.
 *
 * Client-only state: toasts are created in response to user actions, never during SSR.
 */
export type ToastTone = 'success' | 'info' | 'error'

export interface Toast {
  id: number
  key: string
  tone: ToastTone
  text: string
  action?: { label: string, run: () => void }
  /** Auto-close delay in ms; 0 = stays until closed. */
  duration: number
  /** How many times the same toast was raised while visible ("×2"). */
  count: number
}

export interface ToastInput {
  tone: ToastTone
  text: string
  /** Same key = same toast (replaced, not stacked). Defaults to tone + text. */
  key?: string
  action?: Toast['action']
  duration?: number
}

export const MAX_TOASTS = 3
const DEFAULT_DURATION: Record<ToastTone, number> = { success: 4000, info: 5000, error: 0 }

const toasts = shallowRef<Toast[]>([])
const timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null, remaining: number, started: number }>()
let nextId = 1

function clearTimer(id: number) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
}

function startTimer(toast: Toast, ms = toast.duration) {
  clearTimer(toast.id)
  if (!ms || !import.meta.client) return
  timers.set(toast.id, { handle: setTimeout(() => dismiss(toast.id), ms), remaining: ms, started: Date.now() })
}

export function dismiss(idOrKey: number | string) {
  const match = (t: Toast) => (typeof idOrKey === 'number' ? t.id === idOrKey : t.key === idOrKey)
  for (const t of toasts.value.filter(match)) clearTimer(t.id)
  toasts.value = toasts.value.filter(t => !match(t))
}

export function showToast(input: ToastInput): number {
  const key = input.key ?? `${input.tone}:${input.text}`
  const existing = toasts.value.find(t => t.key === key)
  const toast: Toast = {
    id: existing?.id ?? nextId++,
    key,
    tone: input.tone,
    text: input.text,
    action: input.action,
    duration: input.duration ?? DEFAULT_DURATION[input.tone],
    count: existing && existing.text === input.text ? existing.count + 1 : 1,
  }
  let list = existing ? toasts.value.map(t => (t.id === toast.id ? toast : t)) : [...toasts.value, toast]
  while (list.length > MAX_TOASTS) {
    const victim = list.find(t => t.tone !== 'error') ?? list[0]!
    clearTimer(victim.id)
    list = list.filter(t => t !== victim)
  }
  toasts.value = list
  startTimer(toast)
  return toast.id
}

/** Hover/focus keeps a toast open; it resumes with the time it had left. */
export function pauseToast(id: number) {
  const timer = timers.get(id)
  if (!timer?.handle) return
  clearTimeout(timer.handle)
  timers.set(id, { handle: null, remaining: Math.max(1000, timer.remaining - (Date.now() - timer.started)), started: 0 })
}
export function resumeToast(id: number) {
  const timer = timers.get(id)
  const toast = toasts.value.find(t => t.id === id)
  if (timer && !timer.handle && toast) startTimer(toast, timer.remaining)
}

export function useToasts() {
  return { toasts: readonly(toasts), show: showToast, dismiss, pause: pauseToast, resume: resumeToast }
}
