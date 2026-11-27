import { MAX_CHANGES_PER_BATCH } from '../../shared/schemas/scheduling'
import type { CellValue, ScheduleSaveResult } from '../../shared/types/schedule'
import { cellKey } from '../../shared/utils/schedule-cells'

/**
 * Autosave queue for the weekly planner (UI-independent; wired to the planner store later).
 *
 * - Debounces edits and sends them as one batch per request.
 * - Coalesces repeated edits of the same cell: the last value wins, the first `expected` is kept.
 * - Single-flight: one request at a time. A cell edited while its previous change is in flight
 *   uses that in-flight value as its `expected`.
 * - Transient failures (network, 5xx, 408, 429) retry with backoff using the SAME
 *   clientMutationId, so the server applies the batch at most once.
 * - Permanent failures (other 4xx) are not retried; the batch is reported as rejected.
 */

export interface CellEdit {
  employeeId: string
  workDate: string
  /** What the client believes is stored now (null = empty). */
  expected: CellValue | null
  /** What the cell should become (null = clear). */
  value: { shiftCodeId: string, custom?: { startMinute: number, endMinute: number, breakMinutes: number } | null, note?: string | null } | null
  /** Predicted stored value after this edit; becomes `expected` for edits queued behind it. */
  predicted: CellValue | null
}

export interface ScheduleBatch {
  clientMutationId: string
  changes: { employeeId: string, workDate: string, expected: CellValue | null, value: CellEdit['value'] }[]
}

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'retrying' | 'error'

export interface AutosaveOptions {
  send: (batch: ScheduleBatch) => Promise<ScheduleSaveResult>
  onSaved?: (batch: ScheduleBatch, result: ScheduleSaveResult) => void
  /** Batch refused by the server (validation, permission…): caller should roll back its edits. */
  onRejected?: (batch: ScheduleBatch, error: unknown) => void
  onStatus?: (status: AutosaveStatus) => void
  debounceMs?: number
  retryDelaysMs?: number[]
  newId?: () => string
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

/** Network errors and 408/429/5xx are worth retrying; other HTTP errors are final. */
export function isTransientError(error: unknown): boolean {
  const status = (error as { statusCode?: number, status?: number } | null)?.statusCode ?? (error as { status?: number } | null)?.status
  if (typeof status !== 'number') return true
  return status === 408 || status === 429 || status >= 500
}

export function createAutosaveQueue(options: AutosaveOptions) {
  const debounceMs = options.debounceMs ?? 600
  const retryDelays = options.retryDelaysMs ?? [1000, 2000, 5000, 10_000, 30_000]
  const newId = options.newId ?? (() => crypto.randomUUID())
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  const pending = new Map<string, CellEdit>()
  let inFlight: { batch: ScheduleBatch, predicted: Map<string, CellValue | null> } | null = null
  let timer: unknown = null
  let attempt = 0
  let status: AutosaveStatus = 'idle'

  function setStatus(next: AutosaveStatus) {
    if (next === status) return
    status = next
    options.onStatus?.(next)
  }

  function schedule(ms: number) {
    if (timer) clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      void flush()
    }, ms)
  }

  function enqueue(edit: CellEdit): void {
    const key = cellKey(edit.employeeId, edit.workDate)
    const existing = pending.get(key)
    const expected = existing
      ? existing.expected
      : inFlight?.predicted.has(key) ? inFlight.predicted.get(key)! : edit.expected
    pending.set(key, { ...edit, expected })
    if (!inFlight) {
      setStatus('pending')
      schedule(debounceMs)
    }
  }

  function takeBatch(): ScheduleBatch | null {
    if (pending.size === 0) return null
    const edits = [...pending.values()].slice(0, MAX_CHANGES_PER_BATCH)
    const predicted = new Map<string, CellValue | null>()
    for (const edit of edits) {
      const key = cellKey(edit.employeeId, edit.workDate)
      pending.delete(key)
      predicted.set(key, edit.predicted)
    }
    const batch: ScheduleBatch = {
      clientMutationId: newId(),
      changes: edits.map(e => ({ employeeId: e.employeeId, workDate: e.workDate, expected: e.expected, value: e.value })),
    }
    inFlight = { batch, predicted }
    attempt = 0
    return batch
  }

  async function send(): Promise<void> {
    const current = inFlight!
    setStatus(attempt === 0 ? 'saving' : 'retrying')
    try {
      const result = await options.send(current.batch)
      inFlight = null
      options.onSaved?.(current.batch, result)
      if (pending.size > 0) await flush()
      else setStatus('idle')
    }
    catch (error) {
      if (isTransientError(error) && attempt < retryDelays.length) {
        setStatus('error')
        const delay = retryDelays[attempt]!
        attempt++
        timer = setTimer(() => {
          timer = null
          void send()
        }, delay)
        return
      }
      inFlight = null
      setStatus('error')
      options.onRejected?.(current.batch, error)
      if (pending.size > 0) schedule(debounceMs)
    }
  }

  /** Sends queued edits now (e.g. before navigating away). */
  async function flush(): Promise<void> {
    if (timer) {
      clearTimer(timer)
      timer = null
    }
    if (inFlight) return
    if (!takeBatch()) {
      setStatus('idle')
      return
    }
    await send()
  }

  return {
    enqueue,
    flush,
    /** Unsaved or in-flight edits exist (warn before leaving the page). */
    hasUnsaved: () => pending.size > 0 || inFlight !== null,
    status: () => status,
    /** Retry immediately after an error (e.g. "Tekrar dene" button). */
    retryNow: () => {
      if (inFlight && timer) {
        clearTimer(timer)
        timer = null
        void send()
      }
      else void flush()
    },
  }
}

export type AutosaveQueue = ReturnType<typeof createAutosaveQueue>
