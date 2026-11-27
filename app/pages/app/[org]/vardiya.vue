<script setup lang="ts">
import type { WeekScheduleView } from '#shared/types/schedule'
import { readableTextColor } from '#shared/utils/color'
import { addDays, currentWeekStart, formatWeekRange, todayIn } from '#shared/utils/week'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Vardiya planı · Rotiqa' })

/** Read-only weekly schedule (F2.3). Branch and week live in the URL (?sube=…&hafta=YYYY-MM-DD). */
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
const summary = computed(() => {
  if (!view.value) return null
  const totals = dayTotals(groupSchedule(view.value), view.value.days.length)
  return {
    staff: view.value.employees.length,
    shifts: view.value.cells.length,
    empty: totals.reduce((sum, t) => sum + t.empty, 0),
  }
})
const legend = computed(() => view.value ? legendCodes(view.value.shiftCodes, view.value.cells) : [])

const shiftWeek = (days: number) => {
  if (week.value) week.value = addDays(week.value, days)
}
const navButton = 'grid size-touch shrink-0 place-items-center rounded-xl text-navy-950 transition-colors hover:bg-cream-200 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <div class="flex flex-col gap-5">
    <UiPageHeader
      title="Vardiya planı"
      description="Şubenin haftalık vardiyaları, departmanlara göre."
    />

    <UiEmptyState
      v-if="!activeLocations.length"
      title="Yetkili olduğunuz aktif şube yok"
      description="Owner’dan şube erişimi isteyin."
    />

    <template v-else>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <UiSelect
          v-model="locationId"
          label="Şube"
          class="sm:w-64"
          :options="activeLocations.map(l => ({ value: l.id, label: l.name }))"
        />
        <div
          class="flex items-center gap-1 rounded-xl bg-white p-1 shadow-card"
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
          <button
            type="button"
            class="min-h-touch shrink-0 rounded-xl px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-cream-200 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:text-navy-500 disabled:opacity-60"
            :disabled="week === thisWeek"
            @click="week = thisWeek"
          >
            Bu hafta
          </button>
        </div>
      </div>

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
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-navy-500">
          <UiBadge
            v-if="view.week.exists"
            :tone="view.week.status === 'PUBLISHED' ? 'success' : 'neutral'"
          >
            {{ view.week.status === 'PUBLISHED' ? 'Yayında' : 'Taslak' }}
          </UiBadge>
          <span data-testid="schedule-summary">{{ summary!.staff }} personel · {{ summary!.shifts }} vardiya · {{ summary!.empty }} boş hücre</span>
          <span
            v-if="!isCurrent"
            role="status"
          >Yükleniyor…</span>
        </div>
        <UiAlert v-if="isCurrent && !view.cells.length">
          Bu hafta için henüz vardiya planlanmamış.
        </UiAlert>

        <ScheduleWeekTable
          :view="view"
          :today="today"
        />
        <p class="-mt-1 text-xs text-navy-500 sm:hidden">
          Diğer günler için tabloyu yana kaydırın. İsimler sabit kalır.
        </p>

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
