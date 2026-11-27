import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaveQueue, isTransientError, type CellEdit, type ScheduleBatch } from '../../app/utils/schedule-autosave'
import type { CellValue, ScheduleSaveResult } from '../../shared/types/schedule'

const A: CellValue = { shiftCodeId: 'code-a', startMinute: 480, endMinute: 960, breakMinutes: 0, isCustomTime: false, note: null }
const B: CellValue = { ...A, shiftCodeId: 'code-b' }

function edit(employeeId: string, expected: CellValue | null, predicted: CellValue | null, workDate = '2026-11-24'): CellEdit {
  return { employeeId, workDate, expected, value: predicted ? { shiftCodeId: predicted.shiftCodeId } : null, predicted }
}

const ok = (batch: ScheduleBatch): ScheduleSaveResult => ({
  changeSetId: 'cs', version: 1, duplicate: false, unchanged: 0, conflicts: [],
  applied: batch.changes.map(c => ({ employeeId: c.employeeId, workDate: c.workDate, cell: null })),
})

let ids = 0
const newId = () => `mutation-${++ids}`

beforeEach(() => {
  vi.useFakeTimers()
  ids = 0
})
afterEach(() => vi.useRealTimers())

describe('createAutosaveQueue', () => {
  it('debounces edits into one batch', async () => {
    const send = vi.fn(async (b: ScheduleBatch) => ok(b))
    const queue = createAutosaveQueue({ send, newId, debounceMs: 600 })
    queue.enqueue(edit('e1', null, A))
    queue.enqueue(edit('e2', null, A))
    expect(queue.status()).toBe('pending')
    await vi.advanceTimersByTimeAsync(599)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]![0].changes.map(c => c.employeeId)).toEqual(['e1', 'e2'])
    expect(queue.status()).toBe('idle')
    expect(queue.hasUnsaved()).toBe(false)
  })

  it('coalesces repeated edits of a cell: last value, first expected', async () => {
    const send = vi.fn(async (b: ScheduleBatch) => ok(b))
    const queue = createAutosaveQueue({ send, newId })
    queue.enqueue(edit('e1', null, A))
    queue.enqueue(edit('e1', A, B))
    await vi.runAllTimersAsync()
    expect(send.mock.calls[0]![0].changes).toEqual([{ employeeId: 'e1', workDate: '2026-11-24', expected: null, value: { shiftCodeId: 'code-b' } }])
  })

  it('sends one request at a time; an edit behind an in-flight change expects its predicted value', async () => {
    let release!: () => void
    const send = vi.fn((b: ScheduleBatch) => new Promise<ScheduleSaveResult>((resolve) => {
      release = () => resolve(ok(b))
    }))
    const queue = createAutosaveQueue({ send, newId })
    queue.enqueue(edit('e1', null, A))
    await vi.advanceTimersByTimeAsync(600)
    expect(queue.status()).toBe('saving')

    queue.enqueue(edit('e1', null, B)) // caller still thinks the cell is empty
    await vi.advanceTimersByTimeAsync(5000)
    expect(send).toHaveBeenCalledOnce() // waits for the in-flight request

    release()
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]![0].changes[0]).toMatchObject({ expected: A, value: { shiftCodeId: 'code-b' } })
  })

  it('retries transient failures with the same clientMutationId', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockImplementation(async (b: ScheduleBatch) => ok(b))
    const statuses: string[] = []
    const queue = createAutosaveQueue({ send, newId, retryDelaysMs: [100, 200], onStatus: s => statuses.push(s) })
    queue.enqueue(edit('e1', null, A))
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(3)
    expect(new Set(send.mock.calls.map(([b]) => b.clientMutationId))).toEqual(new Set(['mutation-1']))
    expect(statuses).toEqual(['pending', 'saving', 'error', 'retrying', 'error', 'retrying', 'idle'])
  })

  it('does not retry permanent errors and reports the rejected batch', async () => {
    const send = vi.fn().mockRejectedValue({ statusCode: 422, data: { code: 'VALIDATION' } })
    const onRejected = vi.fn()
    const queue = createAutosaveQueue({ send, newId, onRejected })
    queue.enqueue(edit('e1', null, A))
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledOnce()
    expect(onRejected).toHaveBeenCalledOnce()
    expect(queue.status()).toBe('error')
    expect(queue.hasUnsaved()).toBe(false)
  })

  it('reports saved results so the caller can apply conflicts', async () => {
    const result: ScheduleSaveResult = { changeSetId: null, version: 3, duplicate: false, unchanged: 0, applied: [], conflicts: [{ employeeId: 'e1', workDate: '2026-11-24', cell: { ...B, code: 'B', label: 'Ara', kind: 'WORK', color: '#F8CE67' } }] }
    const onSaved = vi.fn()
    const queue = createAutosaveQueue({ send: async () => result, newId, onSaved })
    queue.enqueue(edit('e1', null, A))
    await vi.runAllTimersAsync()
    expect(onSaved.mock.calls[0]![1]).toBe(result)
  })

  it('splits very large edit sets into several batches', async () => {
    const send = vi.fn(async (b: ScheduleBatch) => ok(b))
    const queue = createAutosaveQueue({ send, newId })
    for (let i = 0; i < 520; i++) queue.enqueue(edit(`e${i}`, null, A))
    await vi.runAllTimersAsync()
    expect(send.mock.calls.map(([b]) => b.changes.length)).toEqual([500, 20])
  })
})

describe('isTransientError', () => {
  it('classifies errors', () => {
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true)
    expect(isTransientError({ statusCode: 500 })).toBe(true)
    expect(isTransientError({ statusCode: 429 })).toBe(true)
    expect(isTransientError({ statusCode: 409 })).toBe(false)
    expect(isTransientError({ statusCode: 403 })).toBe(false)
  })
})
