<script setup lang="ts">
import type { WeekScheduleView } from '#shared/types/schedule'
import { readableTextColor } from '#shared/utils/color'
import { addDays, currentWeekStart, formatDayHeader, formatWeekRange, todayIn } from '#shared/utils/week'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Vardiya planı · Rotiqa' })

/**
 * Weekly schedule: view (F2.3) and editing (F2.4). Branch and week live in the URL
 * (?sube=…&hafta=YYYY-MM-DD). Before the branch or week changes, or the user leaves the page,
 * queued edits are saved first.
 */
const route = useRoute()
const router = useRouter()
const orgPath = useOrgPath()
const { slug, activeLocations } = useOrganization()

const requestedLocation = typeof route.query.sube === 'string' ? route.query.sube : ''
const locationId = ref('')
const week = ref(parseWeekParam(route.query.hafta) ?? '')

const location = computed(() => activeLocations.value.find(l => l.id === locationId.value) ?? null)
const thisWeek = computed(() => location.value ? currentWeekStart(location.value.timezone) : '')

watch(activeLocations, (locations) => {
  if (locationId.value && locations.some(l => l.id === locationId.value)) return
  locationId.value = locations.find(l => l.id === requestedLocation)?.id ?? locations[0]?.id ?? ''
}, { immediate: true })
watch(thisWeek, (value) => {
  if (!week.value && value) week.value = value
}, { immediate: true })

const { data: view, pending, error, refresh, execute } = useFetch<WeekScheduleView>(() => `/api/orgs/${slug.value}/schedule`, {
  query: { locationId, week },
  immediate: false,
  watch: false,
})
watch([locationId, week], ([id, monday]) => {
  router.replace({ query: { ...route.query, sube: id || undefined, hafta: monday || undefined } })
  if (id && monday) execute()
}, { immediate: true })

// Data for another branch or week is shown dimmed (never as current) while the new one loads.
const isCurrent = computed(() => !!view.value && view.value.location.id === locationId.value && view.value.week.weekStart === week.value)
const today = computed(() => view.value ? todayIn(view.value.location.timezone) : undefined)
const summary = computed(() => view.value ? weekSummary(groupSchedule(view.value)) : null)
const legend = computed(() => view.value ? legendCodes(view.value.shiftCodes, view.value.cells) : [])

const editor = useScheduleEditor({ slug, view, refresh })
const editable = computed(() => editor.editable.value && isCurrent.value)
const activeCodes = computed(() => (view.value?.shiftCodes ?? []).filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder))

// Saves (or asks about failed saves) before switching branch or week.
async function goWeek(value: string) {
  if (!value || value === week.value) return
  if (await editor.settle()) {
    quick.value = false
    week.value = value
  }
}
const locationKey = ref(0)
const selectedLocation = computed({
  get: () => locationId.value,
  set: async (value: string) => {
    if (await editor.settle()) {
      quick.value = false
      locationId.value = value
    }
    else locationKey.value++ // re-render the select with the current branch
  },
})
onBeforeRouteLeave(() => editor.settle())

const shiftWeek = (days: number) => {
  if (week.value) void goWeek(addDays(week.value, days))
}

// Cell picker.
const picker = ref<{ open: (el: HTMLElement) => void, close: () => void } | null>(null)
const pickerCell = ref<{ employeeId: string, workDate: string, title: string, currentId: string | null } | null>(null)
const activeKey = computed(() => pickerCell.value ? `${pickerCell.value.employeeId}|${pickerCell.value.workDate}` : null)

// Quick assign: choose a code, then each tap applies it to one cell. No drag-painting, so
// scrolling the table on a phone never changes cells; a tap on a cell that already has the
// code changes nothing, and every saved batch can be undone.
const CLEAR = '__clear'
const quick = ref(false)
const quickCode = ref<string | null>(null)
watch(quick, (on) => {
  if (!on) quickCode.value = null
  picker.value?.close()
})

function onCell(employeeId: string, workDate: string, element: HTMLElement) {
  if (!view.value) return
  if (quick.value) {
    if (!quickCode.value) {
      showToast({ key: 'quick-hint', tone: 'info', text: 'Önce yukarıdan uygulanacak vardiya kodunu seçin.' })
      return
    }
    editor.edit(employeeId, workDate, quickCode.value === CLEAR ? null : quickCode.value)
    return
  }
  const employee = view.value.employees.find(e => e.id === employeeId)!
  const day = formatDayHeader(workDate)
  pickerCell.value = {
    employeeId,
    workDate,
    title: `${employee.firstName} ${employee.lastName} · ${day.weekday} ${day.day}`,
    currentId: view.value.cells.find(c => c.employeeId === employeeId && c.workDate === workDate)?.shiftCodeId ?? null,
  }
  nextTick(() => picker.value?.open(element))
}
function onPick(shiftCodeId: string | null) {
  if (pickerCell.value) editor.edit(pickerCell.value.employeeId, pickerCell.value.workDate, shiftCodeId)
}

const copyOpen = ref(false)
const historyOpen = ref(false)
const copyDialog = ref<{ fail: (message: string) => void } | null>(null)
async function onCopy(mode: 'fill-empty' | 'overwrite') {
  try {
    if (await editor.copyPreviousWeek(mode)) copyOpen.value = false
  }
  catch (e) {
    copyDialog.value?.fail(apiErrorMessage(e))
  }
}
async function openHistory() {
  historyOpen.value = true
  await editor.loadHistory()
}

const toolButton = 'inline-flex min-h-touch items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-navy-950 shadow-card transition-colors hover:bg-cream-100 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-40'
const navButton = 'grid size-touch shrink-0 place-items-center rounded-xl text-navy-950 transition-colors hover:bg-cream-200 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <div class="flex flex-col gap-3 sm:gap-5">
    <!--
      Phones: title and branch on one row, the week below, so the table starts high on screen.
      Larger screens keep the original layout: title, then branch (left) and week (right).
    -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 [grid-template-areas:'title_location'_'week_week'] sm:items-end sm:gap-y-5 sm:[grid-template-areas:'title_title'_'location_week']">
      <header class="min-w-0 [grid-area:title]">
        <h1 class="text-2xl font-bold tracking-tight text-navy-950">
          Vardiya planı
        </h1>
        <p class="mt-1 hidden text-sm text-navy-500 sm:block">
          Şubenin haftalık vardiyaları, departmanlara göre.
        </p>
      </header>

      <div
        v-if="activeLocations.length"
        class="min-w-0 [grid-area:location] max-sm:max-w-40 max-sm:justify-self-end"
      >
        <LocationPicker
          :key="locationKey"
          v-model="selectedLocation"
          :locations="activeLocations"
          label-class="max-sm:sr-only"
          class="sm:w-64"
        />
      </div>
      <div
        v-if="activeLocations.length"
        class="flex items-center gap-1 rounded-xl bg-white p-1 shadow-card [grid-area:week] sm:justify-self-end"
        role="group"
        aria-label="Hafta"
      >
        <button
          type="button"
          :class="navButton"
          aria-label="Önceki hafta"
          :disabled="!week"
          @click="shiftWeek(-7)"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          ><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <p
          class="min-w-0 flex-1 px-1 text-center text-sm font-semibold whitespace-nowrap text-navy-950 sm:w-52 sm:flex-none"
          aria-live="polite"
          data-testid="week-label"
        >
          {{ week ? formatWeekRange(week) : '' }}
        </p>
        <button
          type="button"
          :class="navButton"
          aria-label="Sonraki hafta"
          :disabled="!week"
          @click="shiftWeek(7)"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          ><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <!-- Phones: an icon (44px) with the same accessible name; larger screens: the text. -->
        <button
          type="button"
          class="grid min-h-touch min-w-touch shrink-0 place-items-center rounded-xl text-sm font-semibold text-brand-700 transition-colors hover:bg-cream-200 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:text-navy-500 disabled:opacity-60 sm:px-3"
          aria-label="Bu hafta"
          title="Bu hafta"
          :disabled="week === thisWeek"
          @click="goWeek(thisWeek)"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5 sm:hidden"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          ><rect
            x="4"
            y="5"
            width="16"
            height="15"
            rx="2"
          /><path d="M4 10h16M9 3v4M15 3v4" /><circle
            cx="12"
            cy="15"
            r="1.5"
            fill="currentColor"
          /></svg>
          <span
            class="hidden sm:inline"
            aria-hidden="true"
          >Bu hafta</span>
        </button>
      </div>
    </div>

    <UiEmptyState
      v-if="!activeLocations.length"
      title="Yetkili olduğunuz aktif şube yok"
      description="Owner’dan şube erişimi isteyin."
    />

    <template v-else>
      <UiAlert
        v-if="error"
        variant="error"
      >
        <span class="flex flex-wrap items-center justify-between gap-2">
          <span>Vardiya planı yüklenemedi. {{ apiErrorMessage(error) }}</span>
          <UiButton
            variant="ghost"
            :loading="pending"
            @click="refresh()"
          >
            Tekrar dene
          </UiButton>
        </span>
      </UiAlert>
      <UiSpinner
        v-else-if="!view"
        label="Vardiya planı yükleniyor…"
      />
      <UiEmptyState
        v-else-if="!view.employees.length"
        title="Bu şubede henüz personel yok"
        description="Vardiya planlamak için önce bu şubeye personel ekleyin."
      >
        <UiButton :to="{ path: orgPath('/personel/yeni'), query: { sube: locationId } }">
          Personel ekle
        </UiButton>
      </UiEmptyState>
      <section
        v-else
        class="flex flex-col gap-3 transition-opacity"
        :class="isCurrent ? '' : 'opacity-50'"
        :aria-busy="!isCurrent || pending"
        aria-label="Haftalık tablo"
      >
        <!-- Phones: always one line (the summary shortens), so status changes never move the table. -->
        <div class="flex items-center gap-x-3 gap-y-1 text-sm text-navy-500 max-sm:h-6 max-sm:flex-nowrap sm:flex-wrap">
          <UiBadge
            v-if="view.week.exists"
            class="shrink-0"
            :tone="view.week.status === 'PUBLISHED' ? 'success' : 'neutral'"
          >
            {{ view.week.status === 'PUBLISHED' ? 'Yayında' : 'Taslak' }}
          </UiBadge>
          <!-- Phones: the short version; filled and working counts on larger screens. -->
          <span
            class="max-sm:min-w-0 max-sm:truncate"
            data-testid="schedule-summary"
          >{{ summary!.staff }} personel<span class="hidden sm:inline"> · {{ summary!.filled }}/{{ summary!.cells }} hücre dolu · {{ summary!.working }} çalışma vardiyası</span> · {{ summary!.empty }} boş hücre</span>
          <span
            v-if="isCurrent && !view.cells.length"
            class="-ml-2 shrink-0 sm:hidden"
          >· Plan boş</span>
          <span
            v-if="!isCurrent"
            role="status"
          >Yükleniyor…</span>
          <ScheduleSaveStatus
            v-if="editable"
            class="ml-auto shrink-0 sm:hidden"
            compact
            :state="editor.saveState.value"
            :failed-count="editor.failed.value.length"
            @retry="editor.retryFailed()"
          />
        </div>
        <UiAlert v-if="isCurrent && view.week.status === 'PUBLISHED'">
          Bu hafta yayınlanmış; plan değiştirilemez.
        </UiAlert>
        <UiAlert
          v-else-if="isCurrent && !view.cells.length"
          class="max-sm:hidden"
        >
          Bu hafta için henüz vardiya planlanmamış. Bir hücreye dokunarak başlayın veya önceki haftayı kopyalayın.
        </UiAlert>

        <!-- Phones: Hızlı atama · Kopyala · ⋯ (Geri al, İleri al, Geçmiş). Larger screens: all buttons. -->
        <div
          v-if="editable"
          class="flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label="Plan araçları"
        >
          <ScheduleSaveStatus
            class="hidden sm:flex sm:flex-1"
            :state="editor.saveState.value"
            :failed-count="editor.failed.value.length"
            @retry="editor.retryFailed()"
          />
          <button
            type="button"
            :class="[toolButton, 'max-sm:hidden']"
            :disabled="!editor.canUndo.value"
            :aria-busy="editor.busy.value === 'undo' || undefined"
            @click="editor.undo()"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            ><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
            Geri al
          </button>
          <button
            type="button"
            :class="[toolButton, 'max-sm:hidden']"
            :disabled="!editor.canRedo.value"
            :aria-busy="editor.busy.value === 'redo' || undefined"
            @click="editor.redo()"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            ><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
            İleri al
          </button>
          <button
            type="button"
            :class="[toolButton, 'max-sm:flex-1', quick ? 'bg-navy-950! text-white hover:bg-navy-900!' : '']"
            :aria-pressed="quick"
            @click="quick = !quick"
          >
            Hızlı atama
          </button>
          <button
            type="button"
            :class="[toolButton, 'max-sm:flex-1']"
            :disabled="!!editor.busy.value"
            @click="copyOpen = true"
          >
            <span class="sm:hidden">Kopyala</span><span class="hidden sm:inline">Önceki haftayı kopyala</span>
          </button>
          <button
            type="button"
            :class="[toolButton, 'max-sm:hidden']"
            @click="openHistory"
          >
            Geçmiş
          </button>
          <ScheduleMoreMenu
            class="sm:hidden"
            :can-undo="editor.canUndo.value"
            :can-redo="editor.canRedo.value"
            :undo-busy="editor.busy.value === 'undo'"
            :redo-busy="editor.busy.value === 'redo'"
            @undo="editor.undo()"
            @redo="editor.redo()"
            @history="openHistory"
          />
        </div>

        <div
          v-if="editable && quick"
          class="sticky top-14 z-10 -mx-4 flex flex-col gap-1 border-y border-cream-300 bg-cream-100/95 px-4 py-1.5 backdrop-blur md:top-13"
          data-testid="quick-palette"
        >
          <p class="hidden text-xs font-medium text-navy-500 sm:block">
            Hızlı atama açık: bir kod seçin, sonra hücrelere tek tek dokunun. Kaydırmak hücreleri değiştirmez.
          </p>
          <div class="flex items-center gap-2">
            <!-- One row; scrolls sideways on narrow phones (codes stay 44px touch targets). -->
            <div
              class="-my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain py-1 pl-0.5 [scrollbar-width:none]"
              role="radiogroup"
              aria-label="Hızlı atama: uygulanacak vardiya kodu"
              data-testid="quick-codes"
            >
              <button
                v-for="code in activeCodes"
                :key="code.id"
                type="button"
                role="radio"
                :aria-checked="quickCode === code.id"
                :aria-label="`${code.code} · ${code.label}`"
                class="grid min-h-touch min-w-touch shrink-0 place-items-center rounded-xl px-2 text-sm font-bold uppercase ring-offset-2 ring-offset-cream-100 transition-shadow focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
                :class="quickCode === code.id ? 'ring-3 ring-navy-950!' : ''"
                :style="{ backgroundColor: code.color, color: readableTextColor(code.color) }"
                @click="quickCode = code.id"
              >
                {{ code.code }}
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="quickCode === CLEAR"
                class="grid min-h-touch shrink-0 place-items-center rounded-xl border border-cream-300 bg-white px-3 text-sm font-semibold ring-offset-2 ring-offset-cream-100 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
                :class="quickCode === CLEAR ? 'ring-3 ring-navy-950!' : ''"
                @click="quickCode = CLEAR"
              >
                Temizle
              </button>
            </div>
            <button
              type="button"
              class="min-h-touch shrink-0 rounded-xl bg-navy-950 px-4 text-sm font-semibold text-white hover:bg-navy-900 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
              @click="quick = false"
            >
              Bitti
            </button>
          </div>
        </div>

        <ScheduleWeekTable
          :view="view"
          :today="today"
          :editable="editable"
          :active-key="activeKey"
          :quick="quick"
          @cell="onCell"
          @clear="(employeeId, workDate) => editor.edit(employeeId, workDate, null)"
        />
        <p class="-mt-1 text-xs text-navy-500 sm:hidden">
          Diğer günler için tabloyu yana kaydırın. İsimler sabit kalır.
        </p>
        <p
          class="sr-only"
          aria-live="polite"
        >
          {{ editor.announcement.value }}
        </p>

        <ScheduleShiftPicker
          v-if="pickerCell"
          ref="picker"
          :codes="activeCodes"
          :title="pickerCell.title"
          :current-id="pickerCell.currentId"
          @pick="onPick"
          @closed="pickerCell = null"
        />
        <ScheduleCopyWeekDialog
          ref="copyDialog"
          v-model:open="copyOpen"
          :week-start="view.week.weekStart"
          :filled-cells="view.cells.length"
          :busy="editor.busy.value === 'copy'"
          @copy="onCopy"
        />
        <ScheduleHistoryDialog
          v-model:open="historyOpen"
          :entries="editor.history.value"
        />

        <ul
          v-if="legend.length"
          class="flex flex-wrap gap-2 text-xs"
          aria-label="Vardiya kodları"
        >
          <li
            v-for="code in legend"
            :key="code.id"
            class="flex items-center gap-2 rounded-lg bg-white py-1 pr-3 pl-1 shadow-card"
          >
            <span
              class="grid h-6 min-w-8 place-items-center rounded px-1 font-bold uppercase"
              :style="{ backgroundColor: code.color, color: readableTextColor(code.color) }"
            >{{ code.code }}</span>
            <span class="font-medium text-navy-950">{{ code.label }}</span>
            <span
              v-if="cellHours(code)"
              class="text-navy-500"
            >{{ cellHours(code) }}</span>
          </li>
          <li class="flex items-center gap-2 py-1 pr-3 pl-1 text-navy-500">
            <span
              class="size-1.5 rounded-full bg-navy-500"
              aria-hidden="true"
            />
            Özel saat veya not
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
