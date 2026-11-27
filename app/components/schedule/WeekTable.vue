<script setup lang="ts">
import type { WeekScheduleView } from '#shared/types/schedule'
import { readableTextColor } from '#shared/utils/color'
import { formatDayHeader, formatWeekRange } from '#shared/utils/week'

/**
 * Read-only weekly table (F2.3): departments as row groups, Monday → Sunday, daily totals.
 * A real <table> so screen readers announce employee and day for every cell. On narrow
 * screens the table keeps readable cells (≥ 44px day columns) and scrolls sideways while the
 * name column stays put. Editing is F2.4.
 *
 * This in-app view is for owners/managers and shows sick leave (R) as is. Any public or shared
 * output (the schedule PNG) must mask SICK codes as "İZİNLİ" (MASKED_LEAVE_DISPLAY) by default.
 */
const props = defineProps<{ view: WeekScheduleView, today?: string }>()

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
const stickyCell = 'sticky left-0 z-10 shadow-[2px_0_0_0_var(--color-sheet-grid)]'
</script>

<template>
  <div
    class="relative overflow-x-auto rounded-lg border-2 border-sheet-grid bg-sheet-grid overscroll-x-contain"
    role="region"
    :aria-label="`${view.location.name} vardiya tablosu`"
    tabindex="0"
    data-testid="schedule-scroll"
  >
    <table class="w-full min-w-[27.5rem] table-fixed border-separate border-spacing-0.5 text-center">
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
            class="z-20 bg-sheet-day px-1 text-xs leading-tight font-bold tracking-wider text-white sm:text-[11px]"
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
            :class="day.weekend ? 'bg-sheet-weekend' : 'bg-sheet-day'"
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
            <template v-if="cell">
              <span
                class="block truncate text-sm leading-4 font-bold uppercase sm:text-[13px]"
                aria-hidden="true"
              >{{ cell.code }}</span>
              <span
                v-if="cellHours(cell)"
                class="hidden truncate text-[10px] leading-3 font-medium opacity-80 md:block"
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
