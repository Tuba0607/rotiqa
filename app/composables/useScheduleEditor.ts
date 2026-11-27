import type { CellChangeResult, CellSnapshot, CopyWeekResult, ScheduleHistoryEntry, ScheduleSaveResult, WeekScheduleView } from '#shared/types/schedule'
import { cellKey, resolveCell, toCellValue } from '#shared/utils/schedule-cells'
import { formatDayHeader } from '#shared/utils/week'
import { createAutosaveQueue, isTransientError, type AutosaveQueue, type ScheduleBatch } from '~/utils/schedule-autosave'
import { describeCopyResult, redoTarget, undoTarget } from '~/utils/schedule-history'

/**
 * Editing state of the weekly planner (F2.4), on top of the F2.2 API:
 *
 * - Edits are shown at once (optimistic) and saved by the autosave queue in debounced batches.
 * - A cell someone else changed in the meantime is never overwritten (server-side check); the
 *   current value is shown and the user is told which cells were affected.
 * - Edits that could not be sent (network down after all retries) stay on screen and are kept
 *   in `failed` until "Tekrar dene" or until the user explicitly discards them.
 * - Messages are toasts (fixed, never move the table); the lasting save state is `saveState`.
 * - Edits the server refuses (validation, permissions, published week) are rolled back by
 *   reloading the week.
 * - Undo/redo and the change history come from the server, so they survive a reload and only
 *   ever revert the signed-in user's own change sets.
 */

export type SaveState = 'idle' | 'saving' | 'retrying' | 'saved' | 'failed'
type Scope = { locationId: string, weekStart: string }
type BatchChange = ScheduleBatch['changes'][number]

export function useScheduleEditor(options: {
  slug: Ref<string>
  view: Ref<WeekScheduleView | null | undefined>
  refresh: () => Promise<void>
}) {
  const { slug, view } = options
  const saveState = ref<SaveState>('idle')
  const failed = ref<BatchChange[]>([])
  const history = ref<ScheduleHistoryEntry[]>([])
  const busy = ref<null | 'undo' | 'redo' | 'copy'>(null)
  /** Short text for a polite live region ("Defne Aksoy, Pzt 23: Sabah"). */
  const announcement = ref('')

  const editable = computed(() => !!view.value && view.value.week.status !== 'PUBLISHED' && view.value.location.isActive)
  const canUndo = computed(() => editable.value && !busy.value && (saveState.value === 'saving' || saveState.value === 'retrying' || !!undoTarget(history.value)))
  const canRedo = computed(() => editable.value && !busy.value && saveState.value !== 'saving' && !!redoTarget(history.value))

  let scope: Scope | null = null
  let queue: AutosaveQueue | null = null
  let waiters: (() => void)[] = []
  const wake = () => {
    const pending = waiters
    waiters = []
    pending.forEach(resolve => resolve())
  }

  const api = (path: string) => `/api/orgs/${slug.value}/schedule${path}`
  const sameScope = (s: Scope | null) => !!s && !!view.value && view.value.location.id === s.locationId && view.value.week.weekStart === s.weekStart

  function cellLabel(employeeId: string, workDate: string): string {
    const employee = view.value?.employees.find(e => e.id === employeeId)
    const day = formatDayHeader(workDate)
    return `${employee ? `${employee.firstName} ${employee.lastName}` : 'Personel'} (${day.weekday} ${Number(workDate.slice(8))})`
  }

  /** Replaces one cell in the shown week (the fetched data is a shallow ref, so copy it). */
  function setLocal(s: Scope, employeeId: string, workDate: string, cell: CellSnapshot | null) {
    if (!sameScope(s)) return
    const v = view.value!
    const cells = v.cells.filter(c => !(c.employeeId === employeeId && c.workDate === workDate))
    if (cell) cells.push({ ...toCellValue(cell)!, code: cell.code, label: cell.label, kind: cell.kind, color: cell.color, employeeId, workDate })
    view.value = { ...v, cells }
  }

  function showConflicts(s: Scope, conflicts: CellChangeResult[], action: string) {
    if (!conflicts.length) return false
    for (const c of conflicts) setLocal(s, c.employeeId, c.workDate, c.cell)
    const names = conflicts.slice(0, 3).map(c => cellLabel(c.employeeId, c.workDate)).join(', ')
    const more = conflicts.length > 3 ? ` ve ${conflicts.length - 3} hücre daha` : ''
    // Errors stay until closed; a new conflict replaces the previous message instead of stacking.
    showToast({
      key: 'schedule-conflict',
      tone: 'error',
      text: `${conflicts.length} hücre siz ${action} önce başka biri tarafından değiştirildi; sizin değişikliğiniz uygulanmadı, güncel değer gösteriliyor: ${names}${more}.`,
    })
    return true
  }

  async function loadHistory() {
    if (!scope) return
    const s = scope
    try {
      const entries = await $fetch<ScheduleHistoryEntry[]>(api('/history'), { query: { locationId: s.locationId, week: s.weekStart, limit: 50 } })
      if (scope === s) history.value = entries
    }
    catch {
      // History only drives the undo/redo buttons; the next save reloads it.
    }
  }

  function createQueue(s: Scope): AutosaveQueue {
    return createAutosaveQueue({
      send: batch => $fetch<ScheduleSaveResult>(api('/changes'), { method: 'POST', body: { ...s, ...batch } }),
      onStatus: (status) => {
        if (scope !== s) return
        if (status === 'pending' || status === 'saving') saveState.value = 'saving'
        else if (status === 'retrying' || (status === 'error' && queue?.hasUnsaved())) saveState.value = 'retrying'
        else if (status === 'idle') {
          saveState.value = failed.value.length ? 'failed' : 'saved'
          if (!failed.value.length) dismiss('schedule-save-failed')
          void loadHistory()
        }
        if (status === 'idle') wake()
      },
      onSaved: (_batch, result) => {
        showConflicts(s, result.conflicts, 'kaydetmeden')
      },
      onRejected: (batch, error) => {
        if (isTransientError(error)) {
          // Never drop work silently: keep the cells on screen and offer a retry.
          failed.value = [...failed.value.filter(f => !batch.changes.some(c => c.employeeId === f.employeeId && c.workDate === f.workDate)), ...batch.changes]
          saveState.value = 'failed'
          showToast({
            key: 'schedule-save-failed',
            tone: 'error',
            text: 'Değişiklikler kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin; değişiklikleriniz bu sayfada duruyor.',
            action: { label: 'Tekrar dene', run: () => retryFailed() },
          })
        }
        else {
          saveState.value = 'idle'
          showToast({ key: 'schedule-save-rejected', tone: 'error', text: `${apiErrorMessage(error)} Değişiklik uygulanmadı; tablo güncel hâliyle yenilendi.` })
          void settle({ confirmFailed: false }).then(() => options.refresh())
        }
        wake()
      },
    })
  }

  // A new branch or week gets its own queue; the page settles the old one before switching.
  watch(() => view.value && `${view.value.location.id}|${view.value.week.weekStart}`, (key) => {
    if (!key || !view.value) return
    if (scope && sameScope(scope)) return
    scope = { locationId: view.value.location.id, weekStart: view.value.week.weekStart }
    queue = createQueue(scope)
    failed.value = []
    history.value = []
    saveState.value = 'idle'
    void loadHistory()
  }, { immediate: true })

  function predict(value: BatchChange['value']) {
    if (!value || !view.value) return null
    const code = view.value.shiftCodes.find(c => c.id === value.shiftCodeId)
    return code ? toCellValue(resolveCell(value, code)) : null
  }

  /** Sets (or clears, with null) one cell. Returns false when nothing changed. */
  function edit(employeeId: string, workDate: string, shiftCodeId: string | null): boolean {
    if (!editable.value || !scope || !queue || !view.value) return false
    const v = view.value
    const employee = v.employees.find(e => e.id === employeeId)
    if (!employee?.isActive) return false
    const current = v.cells.find(c => c.employeeId === employeeId && c.workDate === workDate) ?? null
    if (shiftCodeId && current?.shiftCodeId === shiftCodeId) return false
    if (!shiftCodeId && !current) return false
    const code = shiftCodeId ? v.shiftCodes.find(c => c.id === shiftCodeId && c.isActive) : null
    if (shiftCodeId && !code) return false

    const value = code ? { shiftCodeId: code.id, note: current?.note ?? null } : null
    const target = code ? resolveCell(value!, code) : null
    // A cell that failed to save earlier: the server still has the value from before that edit.
    const key = cellKey(employeeId, workDate)
    const earlier = failed.value.find(f => cellKey(f.employeeId, f.workDate) === key)
    if (earlier) failed.value = failed.value.filter(f => f !== earlier)

    setLocal(scope, employeeId, workDate, target)
    queue.enqueue({ employeeId, workDate, expected: earlier ? earlier.expected : toCellValue(current), value, predicted: toCellValue(target) })
    announcement.value = `${cellLabel(employeeId, workDate)}: ${target ? target.label : 'temizlendi'}`
    return true
  }

  /** Re-sends edits that failed after all retries. */
  function retryFailed() {
    if (!queue) return
    const items = failed.value
    failed.value = []
    dismiss('schedule-save-failed')
    for (const c of items) queue.enqueue({ ...c, predicted: predict(c.value) })
    queue.retryNow()
  }

  /**
   * Waits until queued edits are saved (before undo, copy, or leaving the week). With failed
   * edits left, asks before they are discarded; returns false when the user wants to stay.
   */
  async function settle({ confirmFailed = true } = {}): Promise<boolean> {
    if (queue?.hasUnsaved()) void queue.flush()
    while (queue?.hasUnsaved()) await new Promise<void>(resolve => waiters.push(resolve))
    if (confirmFailed && failed.value.length) {
      if (!window.confirm('Kaydedilemeyen değişiklikler var. Devam ederseniz bu değişiklikler kaybolacak. Devam edilsin mi?')) return false
      failed.value = []
      saveState.value = 'idle'
    }
    return true
  }

  async function revert(kind: 'undo' | 'redo') {
    if (busy.value || !scope) return
    const s = scope
    busy.value = kind
    try {
      if (!(await settle())) return
      await loadHistory()
      const target = kind === 'undo' ? undoTarget(history.value) : redoTarget(history.value)
      if (!target) {
        showToast({ key: 'schedule-revert', tone: 'info', text: kind === 'undo' ? 'Geri alınacak değişikliğiniz yok.' : 'İleri alınacak değişikliğiniz yok.' })
        return
      }
      const result = await $fetch<ScheduleSaveResult>(api('/revert'), {
        method: 'POST',
        body: { ...s, changeSetId: target.id, clientMutationId: crypto.randomUUID() },
      })
      for (const a of result.applied) setLocal(s, a.employeeId, a.workDate, a.cell)
      if (!showConflicts(s, result.conflicts, kind === 'undo' ? 'geri almadan' : 'ileri almadan')) {
        showToast({ key: 'schedule-revert', tone: 'success', text: `${kind === 'undo' ? 'Geri alındı' : 'İleri alındı'}: ${result.applied.length} hücre.` })
      }
    }
    catch (error) {
      showToast({ key: 'schedule-revert-error', tone: 'error', text: apiErrorMessage(error) })
    }
    finally {
      busy.value = null
      await loadHistory()
    }
  }

  /** Copies the previous week. Throws (for the dialog to show) when the server refuses. */
  async function copyPreviousWeek(mode: 'fill-empty' | 'overwrite'): Promise<CopyWeekResult | null> {
    if (busy.value || !scope) return null
    const s = scope
    busy.value = 'copy'
    try {
      if (!(await settle())) return null
      const result = await $fetch<CopyWeekResult>(api('/copy-week'), { method: 'POST', body: { ...s, mode, clientMutationId: crypto.randomUUID() } })
      await options.refresh()
      showToast({ key: 'schedule-copy', tone: 'success', duration: 8000, text: `${describeCopyResult(result.applied.length, result.skipped)} Tamamını tek adımda “Geri al” ile geri alabilirsiniz.` })
      return result
    }
    finally {
      busy.value = null
      await loadHistory()
    }
  }

  const hasUnsaved = () => !!queue?.hasUnsaved() || failed.value.length > 0
  if (import.meta.client) {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsaved()) event.preventDefault()
    }
    onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
    onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  return {
    editable,
    saveState,
    failed,
    history,
    busy,
    announcement,
    canUndo,
    canRedo,
    edit,
    retryFailed,
    settle,
    undo: () => revert('undo'),
    redo: () => revert('redo'),
    copyPreviousWeek,
    loadHistory,
    hasUnsaved,
  }
}
