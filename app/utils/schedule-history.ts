import type { CopyWeekSkipped, ScheduleChangeKind, ScheduleHistoryEntry } from '../../shared/types/schedule'

/**
 * Undo/redo targets rebuilt from the saved history (newest first), so they survive a reload.
 * `canRevert` is only true for the signed-in user's own change sets that were not reverted
 * yet, so other managers' changes are never picked (the server checks this again).
 */

/** "Geri al": the newest own change that can still be reverted (an edit, a copy or a redo). */
export function undoTarget(history: ScheduleHistoryEntry[]): ScheduleHistoryEntry | null {
  return history.find(entry => entry.canRevert && entry.kind !== 'UNDO') ?? null
}

/**
 * "İleri al": the newest own UNDO that can still be reverted, as long as no new own edit or
 * copy was made after it (a new change ends the redo chain, as in any editor). Redos and
 * reverted entries are skipped; other people's changes do not end the chain.
 */
export function redoTarget(history: ScheduleHistoryEntry[]): ScheduleHistoryEntry | null {
  for (const entry of history) {
    if (!entry.canRevert) continue
    if (entry.kind === 'UNDO') return entry
    if (entry.kind === 'REDO') continue
    return null
  }
  return null
}

export const CHANGE_KIND_LABELS: Record<ScheduleChangeKind, string> = {
  EDIT: 'Düzenleme',
  COPY_WEEK: 'Önceki hafta kopyalandı',
  UNDO: 'Geri alma',
  REDO: 'İleri alma',
}

/** Turkish summary of a week copy, e.g. "12 hücre kopyalandı. Atlanan: 3 dolu hücre." */
export function describeCopyResult(applied: number, skipped: CopyWeekSkipped): string {
  const parts = [
    skipped.occupied ? `${skipped.occupied} dolu hücre` : null,
    skipped.inactiveEmployee ? `arşivlenmiş veya başka şubeye geçmiş personelin ${skipped.inactiveEmployee} hücresi` : null,
    skipped.inactiveCode ? `pasif vardiya kodlu ${skipped.inactiveCode} hücre` : null,
    skipped.otherLocation ? `başka şubede vardiyası olan ${skipped.otherLocation} hücre` : null,
  ].filter(Boolean)
  const head = applied ? `${applied} hücre kopyalandı.` : 'Kopyalanacak yeni hücre yoktu.'
  return parts.length ? `${head} Atlanan: ${parts.join(', ')}.` : head
}
