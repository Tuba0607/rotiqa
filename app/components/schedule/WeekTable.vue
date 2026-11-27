<script setup lang="ts">
import type { WeekScheduleView } from '#shared/types/schedule'
import { readableTextColor } from '#shared/utils/color'
import { formatDayHeader, formatWeekRange } from '#shared/utils/week'

/**
 * Weekly table: departments as row groups, Monday → Sunday, daily totals. A real <table> so
 * screen readers announce employee and day for every cell. On narrow screens the table keeps
 * readable cells (≥ 44px day columns) and scrolls sideways while the name column stays put;
 * on phones scrolling snaps day columns to the right edge of the name column (scroll padding =
 * the stuck name column 7rem + its 2px grid-gap shadow), so no half-hidden day is left behind the names.
 *
 * With `editable`, the cells of active staff are buttons (F2.4). The grid has one tab stop:
 * arrow keys, Home and End move between cells, Enter/Space opens the picker (or applies the
 * quick-assign code) and Delete/Backspace clears a cell. Archived staff stay read-only.
 *
 * This in-app view is for owners/managers and shows sick leave (R) as is. Any public or shared
 * output (the schedule PNG) must mask SICK codes as "İZİNLİ" (MASKED_LEAVE_DISPLAY) by default.
 */
const props = defineProps<{
  view: WeekScheduleView
  today?: string
  editable?: boolean
  /** Cell whose picker is open ("employeeId|workDate"). */
  activeKey?: string | null
  /** Quick-assign mode: a tap applies the chosen code. */
  quick?: boolean
}>()
const emit = defineEmits<{
  cell: [employeeId: string, workDate: string, element: HTMLElement]
  clear: [employeeId: string, workDate: string]
}>()

const groups = computed(() => groupSchedule(props.view))
const totals = computed(() => dayTotals(groups.value, props.view.days.length))
const days = computed(() => props.view.days.map((iso, index) => ({
  iso,
  index,
  weekend: index >= 5,
  today: iso === props.today,
  number: Number(iso.slice(8)),
  ...formatDayHeader(iso),
})))
// Month label of the corner cell, e.g. "KASIM" or "KAS–ARA" when the week spans two months.
const monthLabel = computed(() => {
  const fmt = (iso: string, month: 'long' | 'short') => new Intl.DateTimeFormat('tr-TR', { month, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)).toLocaleUpperCase('tr-TR')
  const first = props.view.days[0]!
  const last = props.view.days[props.view.days.length - 1]!
  return first.slice(5, 7) === last.slice(5, 7) ? fmt(first, 'long') : `${fmt(first, 'short')}–${fmt(last, 'short')}`
})
const year = computed(() => props.view.days[0]!.slice(0, 4))

const upper = (text: string) => text.toLocaleUpperCase('tr-TR')
const nameStyle = (color: string) => ({ backgroundColor: color, color: readableTextColor(color) })
// Sticky cells cover the 2px grid gap to their right, so scrolled cells never peek through.
// Above focused/active cells (z-10) that scroll underneath. The scroller is `isolate`, so these
// z-indexes only order cells inside the table and never lift it over the page header or tab bar.
const stickyCell = 'sticky left-0 z-20 shadow-[2px_0_0_0_var(--color-sheet-grid)]'

/*
 * Phones: size the day columns so a whole number of days fills the space next to the stuck
 * name column. Every snap stop, including the end of the scroll, then starts on a column
 * edge, so no day is ever left half hidden behind the names. Cells stay at least 44px.
 */
const scroller = ref<HTMLElement | null>(null)
const phoneWidth = ref<number | null>(null)
const GAP = 2
const MIN_CELL = 44
function fitColumns() {
  const el = scroller.value
  const name = el?.querySelector<HTMLElement>('tbody th[scope="row"], thead th')
  if (!el || !name || !window.matchMedia('(max-width: 639px)').matches) {
    phoneWidth.value = null
    return
  }
  const days = props.view.days.length
  const nameWidth = name.getBoundingClientRect().width
  const visible = el.clientWidth - nameWidth - GAP // area right of the stuck name column and its gap shadow
  const natural = nameWidth + days * (MIN_CELL + GAP) + 2 * GAP
  if (el.clientWidth >= natural) {
    phoneWidth.value = null
    return
  }
  const count = Math.max(1, Math.floor(visible / (MIN_CELL + GAP)))
  const cell = visible / count - GAP
  phoneWidth.value = nameWidth + days * (cell + GAP) + 2 * GAP
}
let observer: ResizeObserver | null = null
onMounted(() => {
  fitColumns()
  observer = new ResizeObserver(() => fitColumns())
  if (scroller.value) observer.observe(scroller.value)
})
onBeforeUnmount(() => observer?.disconnect())

// Keyboard grid: row index over all staff rows, column = day index.
const rowIndex = computed(() => new Map(groups.value.flatMap(g => g.rows).map((row, i) => [row.employee.id, i])))
const canEdit = (employee: { isActive: boolean }) => !!props.editable && employee.isActive
const firstEditable = computed(() => {
  const rows = groups.value.flatMap(g => g.rows)
  const index = rows.findIndex(row => canEdit(row.employee))
  return index < 0 ? '' : `${index}:0`
})
const focusKey = ref('')
watch(() => `${props.view.location.id}|${props.view.week.weekStart}`, () => {
  focusKey.value = ''
})
const tabStop = computed(() => focusKey.value || firstEditable.value)
const table = ref<HTMLElement | null>(null)

function cellButton(key: string) {
  return table.value?.querySelector<HTMLElement>(`[data-cell="${key}"]`) ?? null
}
function onFocusIn(event: FocusEvent) {
  const key = (event.target as HTMLElement).dataset?.cell
  if (key) focusKey.value = key
}
function onKeydown(event: KeyboardEvent, employeeId: string, workDate: string) {
  const [row, col] = ((event.currentTarget as HTMLElement).dataset.cell ?? '0:0').split(':').map(Number) as [number, number]
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    emit('clear', employeeId, workDate)
    return
  }
  const rows = rowIndex.value.size
  const moves: Record<string, [number, number]> = {
    ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
  }
  let target: HTMLElement | null = null
  if (event.key === 'Home') target = cellButton(`${row}:0`)
  else if (event.key === 'End') target = cellButton(`${row}:${props.view.days.length - 1}`)
  else if (moves[event.key]) {
    const [dr, dc] = moves[event.key]!
    // Skip read-only (archived) rows.
    for (let r = row + dr, c = col + dc; r >= 0 && r < rows && c >= 0 && c < props.view.days.length && !target; r += dr, c += dc) {
      target = cellButton(`${r}:${c}`)
      if (dc) break
    }
  }
  else return
  event.preventDefault()
  target?.focus()
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
const cellName = (employee: { firstName: string, lastName: string }, dayIndex: number) =>
  `${employee.firstName} ${employee.lastName}, ${days.value[dayIndex]!.weekday} ${days.value[dayIndex]!.number}`
</script>

<template>
  <div
    ref="scroller"
    class="relative isolate overflow-x-auto rounded-lg border-2 border-sheet-grid bg-sheet-grid overscroll-x-contain max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-pl-[calc(7rem+2px)]"
    role="region"
    :aria-label="`${view.location.name} vardiya tablosu`"
    tabindex="0"
    data-testid="schedule-scroll"
  >
    <table
      ref="table"
      class="w-full min-w-[27.5rem] table-fixed border-separate border-spacing-0.5 text-center"
      :style="phoneWidth ? { width: `${phoneWidth}px`, minWidth: '0' } : undefined"
      @focusin="onFocusIn"
    >
      <caption class="sr-only">
        {{ view.location.name }}, {{ formatWeekRange(view.week.weekStart) }} vardiya planı
      </caption>
      <colgroup>
        <col class="w-28 sm:w-36 lg:w-48">
        <col
          v-for="day in days"
          :key="day.iso"
        >
      </colgroup>
      <thead>
        <tr>
          <th
            rowspan="2"
            scope="col"
            class="z-30! bg-sheet-day px-1 text-xs leading-tight font-bold tracking-wider text-white sm:text-[11px]"
            :class="stickyCell"
          >
            <span class="block">{{ monthLabel }}</span>
            <span class="block font-semibold text-white/70">{{ year }}</span>
          </th>
          <th
            v-for="day in days"
            :key="day.iso"
            scope="col"
            class="relative py-1 text-base font-bold text-white sm:text-lg"
            :class="day.weekend ? 'bg-sheet-weekend max-sm:snap-start' : 'bg-sheet-day max-sm:snap-start'"
            :aria-current="day.today ? 'date' : undefined"
            :data-testid="`day-${day.iso}`"
          >
            <span class="sr-only">{{ day.weekday }} </span>{{ day.number }}<span
              v-if="day.today"
              class="sr-only"
            > (bugün)</span>
            <span
              v-if="day.today"
              class="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-brand-500"
              aria-hidden="true"
            />
          </th>
        </tr>
        <tr aria-hidden="true">
          <td
            v-for="day in days"
            :key="day.iso"
            class="py-0.5 text-xs font-semibold sm:text-[11px]"
            :class="day.weekend ? 'bg-sheet-weekend text-white' : 'bg-sheet-weekday text-navy-950'"
          >
            {{ day.weekday }}
          </td>
        </tr>
      </thead>

      <tbody
        v-for="group in groups"
        :key="group.department?.id ?? 'none'"
        data-testid="department-group"
      >
        <tr>
          <th
            scope="rowgroup"
            class="bg-sheet-frame px-2 py-1 text-left text-xs font-bold tracking-wide text-white sm:text-[11px]"
            :class="stickyCell"
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <span
                class="size-2.5 shrink-0 rounded-sm ring-1 ring-white/40"
                :style="{ backgroundColor: group.department?.color ?? NO_DEPARTMENT_COLOR }"
                aria-hidden="true"
              />
              <span class="truncate">{{ upper(group.department?.name ?? 'Departmansız') }}</span>
              <span class="ml-auto shrink-0 font-semibold text-white/70">{{ group.rows.length }}<span class="sr-only"> kişi</span></span>
            </span>
          </th>
          <td
            v-for="(count, i) in group.working"
            :key="i"
            class="bg-sheet-frame py-1 text-xs font-semibold text-white/80 sm:text-[11px]"
          >
            {{ count }}<span class="sr-only"> çalışan</span>
          </td>
        </tr>
        <tr
          v-for="row in group.rows"
          :key="row.employee.id"
          data-testid="schedule-row"
        >
          <th
            scope="row"
            class="px-2 text-left text-xs font-bold"
            :class="stickyCell"
            :style="nameStyle(group.department?.color ?? NO_DEPARTMENT_COLOR)"
            :title="`${row.employee.firstName} ${row.employee.lastName}`"
          >
            <!-- Phones: first and last name on two lines so names are not cut after a few letters. -->
            <span
              class="block text-xs leading-4 sm:truncate"
              :class="row.employee.isActive ? '' : 'opacity-70'"
            >
              <span class="block truncate sm:inline">{{ upper(row.employee.firstName) }}</span>{{ ' ' }}<span class="block truncate sm:inline">{{ upper(row.employee.lastName) }}</span>
            </span>
            <span
              v-if="!row.employee.isActive"
              class="block text-[10px] leading-3 font-semibold opacity-80"
            >ARŞİVDE</span>
          </th>
          <td
            v-for="(cell, i) in row.cells"
            :key="view.days[i]"
            class="relative h-11 px-0.5 sm:h-12"
            :class="cell ? '' : 'bg-white'"
            :style="cell ? nameStyle(cell.color) : undefined"
            :data-empty="cell ? undefined : ''"
          >
            <component
              :is="canEdit(row.employee) ? 'button' : 'span'"
              :type="canEdit(row.employee) ? 'button' : undefined"
              class="absolute inset-0 flex flex-col items-center justify-center px-0.5"
              :class="canEdit(row.employee) ? [
                'transition-[filter] hover:brightness-95 focus:outline-none focus-visible:z-10 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-navy-950',
                quick ? 'cursor-crosshair' : 'cursor-pointer',
                activeKey === `${row.employee.id}|${view.days[i]}` ? 'z-10 outline-3 -outline-offset-3 outline-navy-950' : '',
              ] : ''"
              v-bind="canEdit(row.employee) ? {
                'tabindex': tabStop === `${rowIndex.get(row.employee.id)}:${i}` ? 0 : -1,
                'data-cell': `${rowIndex.get(row.employee.id)}:${i}`,
                'aria-label': `${cellName(row.employee, i)}: ${describeCell(cell)}`,
                'aria-haspopup': quick ? undefined : 'dialog',
              } : {}"
              @click="canEdit(row.employee) && emit('cell', row.employee.id, view.days[i]!, $event.currentTarget as HTMLElement)"
              @keydown="canEdit(row.employee) && onKeydown($event, row.employee.id, view.days[i]!)"
            >
              <template v-if="cell">
                <span
                  class="block max-w-full truncate text-sm leading-4 font-bold uppercase sm:text-[13px]"
                  aria-hidden="true"
                >{{ cell.code }}</span>
                <span
                  v-if="cellHours(cell)"
                  class="hidden max-w-full truncate text-[10px] leading-3 font-medium opacity-80 md:block"
                  aria-hidden="true"
                >{{ cellHours(cell) }}</span>
                <span
                  v-if="cell.isCustomTime || cell.note"
                  class="absolute top-1 right-1 size-1.5 rounded-full bg-current opacity-70"
                  aria-hidden="true"
                />
                <span class="sr-only">{{ describeCell(cell) }}</span>
              </template>
              <template v-else>
                <span
                  class="mx-auto block h-0.5 w-3 rounded-full bg-cream-300"
                  aria-hidden="true"
                />
                <span class="sr-only">Boş</span>
              </template>
            </component>
          </td>
        </tr>
      </tbody>

      <tfoot>
        <tr data-testid="total-working">
          <th
            scope="row"
            class="bg-sheet-day px-2 py-1.5 text-left text-xs font-bold tracking-wide text-white sm:text-[11px]"
            :class="stickyCell"
          >
            ÇALIŞAN
          </th>
          <td
            v-for="(total, i) in totals"
            :key="i"
            class="bg-white py-1.5 text-sm font-bold text-navy-950"
          >
            {{ total.working }}
          </td>
        </tr>
        <tr data-testid="total-empty">
          <th
            scope="row"
            class="bg-sheet-day px-2 py-1.5 text-left text-xs font-bold tracking-wide text-white sm:text-[11px]"
            :class="stickyCell"
          >
            BOŞ
          </th>
          <td
            v-for="(total, i) in totals"
            :key="i"
            class="py-1.5 text-sm font-bold"
            :class="total.empty ? 'bg-accent-100 text-accent-700' : 'bg-white text-navy-500'"
          >
            {{ total.empty }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
