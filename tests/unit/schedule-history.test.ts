import { describe, expect, it } from 'vitest'
import { describeCopyResult, redoTarget, undoTarget } from '../../app/utils/schedule-history'
import type { ScheduleChangeKind, ScheduleHistoryEntry } from '../../shared/types/schedule'

const entry = (id: string, kind: ScheduleChangeKind, canRevert: boolean): ScheduleHistoryEntry => ({
  id, kind, canRevert, createdAt: '2026-11-27T10:00:00.000Z', actor: null, cellCount: 1, revertsId: null, revertedById: canRevert ? null : 'x',
})

describe('undoTarget / redoTarget (history is newest first)', () => {
  it('undoes the newest own change and has nothing to redo after a new edit', () => {
    const history = [entry('e2', 'EDIT', true), entry('e1', 'EDIT', true)]
    expect(undoTarget(history)?.id).toBe('e2')
    expect(redoTarget(history)).toBeNull()
  })

  it('after an undo: undo goes further back, redo restores the undone change', () => {
    const history = [entry('u2', 'UNDO', true), entry('e2', 'EDIT', false), entry('e1', 'EDIT', true)]
    expect(undoTarget(history)?.id).toBe('e1')
    expect(redoTarget(history)?.id).toBe('u2')
  })

  it('redoes a chain of undos in order and undoes a redo', () => {
    // e1, e2, undo(e2), undo(e1), redo(undo e1)
    const history = [entry('r1', 'REDO', true), entry('u1', 'UNDO', false), entry('u2', 'UNDO', true), entry('e2', 'EDIT', false), entry('e1', 'EDIT', false)]
    expect(redoTarget(history)?.id).toBe('u2')
    expect(undoTarget(history)?.id).toBe('r1')
  })

  it('a new own edit after an undo ends the redo chain', () => {
    const history = [entry('e3', 'EDIT', true), entry('u2', 'UNDO', true), entry('e2', 'EDIT', false)]
    expect(redoTarget(history)).toBeNull()
    expect(undoTarget(history)?.id).toBe('e3')
  })

  it('never picks other people’s changes (canRevert is false for them)', () => {
    const history = [entry('other', 'EDIT', false), entry('copy', 'COPY_WEEK', true)]
    expect(undoTarget(history)?.id).toBe('copy')
    expect(undoTarget([entry('other', 'EDIT', false)])).toBeNull()
    expect(redoTarget([entry('other', 'EDIT', false), entry('u', 'UNDO', true)])?.id).toBe('u')
  })
})

describe('describeCopyResult', () => {
  it('lists only the skipped reasons that happened', () => {
    expect(describeCopyResult(12, { occupied: 3, inactiveEmployee: 0, inactiveCode: 0, otherLocation: 0 })).toBe('12 hücre kopyalandı. Atlanan: 3 dolu hücre.')
    expect(describeCopyResult(0, { occupied: 5, inactiveEmployee: 2, inactiveCode: 0, otherLocation: 1 }))
      .toBe('Kopyalanacak yeni hücre yoktu. Atlanan: 5 dolu hücre, arşivlenmiş veya başka şubeye geçmiş personelin 2 hücresi, başka şubede vardiyası olan 1 hücre.')
    expect(describeCopyResult(4, { occupied: 0, inactiveEmployee: 0, inactiveCode: 0, otherLocation: 0 })).toBe('4 hücre kopyalandı.')
  })
})
