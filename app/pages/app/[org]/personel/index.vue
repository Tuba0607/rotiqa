<script setup lang="ts">
import { readableTextColor } from '#shared/utils/color'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Personel · Rotiqa' })

interface EmployeeRow {
  id: string
  firstName: string
  lastName: string
  isActive: boolean
  sortOrder: number
  department: { id: string, name: string, color: string } | null
}

const route = useRoute()
const router = useRouter()
const orgPath = useOrgPath()
const { slug, activeLocations } = useOrganization()

const requested = typeof route.query.sube === 'string' ? route.query.sube : ''
const locationId = ref('')
const status = ref<'active' | 'archived'>(route.query.durum === 'arsiv' ? 'archived' : 'active')

// Pick the requested (or first) accessible location once the organization is known.
watch(activeLocations, (locations) => {
  if (locationId.value && locations.some(l => l.id === locationId.value)) return
  locationId.value = locations.find(l => l.id === requested)?.id ?? locations[0]?.id ?? ''
}, { immediate: true })

const { data: employees, pending, error, refresh, execute } = useFetch<EmployeeRow[]>(() => `/api/orgs/${slug.value}/employees`, {
  query: { locationId, status },
  immediate: false,
  watch: false,
})
watch([locationId, status], ([id]) => {
  router.replace({ query: { sube: id || undefined, durum: status.value === 'archived' ? 'arsiv' : undefined } })
  if (id) execute()
}, { immediate: true })

const actionError = ref('')
const busyId = ref<string | null>(null)

async function setArchived(employee: EmployeeRow, archived: boolean) {
  actionError.value = ''
  busyId.value = employee.id
  try {
    await $fetch(`/api/orgs/${slug.value}/employees/${employee.id}/${archived ? 'archive' : 'reactivate'}`, { method: 'POST' })
    await refresh()
  }
  catch (e) {
    actionError.value = apiErrorMessage(e)
  }
  finally {
    busyId.value = null
  }
}

async function move(index: number, delta: -1 | 1) {
  const list = [...(employees.value ?? [])]
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target]!, list[index]!]
  employees.value = list
  actionError.value = ''
  try {
    await $fetch(`/api/orgs/${slug.value}/employees/reorder`, { method: 'POST', body: { locationId: locationId.value, employeeIds: list.map(e => e.id) } })
  }
  catch (e) {
    actionError.value = apiErrorMessage(e)
    await refresh()
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <UiPageHeader
      title="Personel"
      description="Personel kaydı için Rotiqa hesabı gerekmez."
    >
      <template #actions>
        <UiButton :to="{ path: orgPath('/personel/yeni'), query: { sube: locationId } }">
          Personel ekle
        </UiButton>
      </template>
    </UiPageHeader>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <LocationPicker
        v-model="locationId"
        class="sm:w-64"
        :locations="activeLocations"
      />
      <div
        class="flex rounded-xl bg-cream-200 p-1"
        role="tablist"
        aria-label="Durum"
      >
        <button
          v-for="tab in [{ value: 'active', label: 'Aktif' }, { value: 'archived', label: 'Arşiv' }] as const"
          :key="tab.value"
          type="button"
          role="tab"
          class="min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold"
          :class="status === tab.value ? 'bg-white text-navy-950 shadow-card' : 'text-navy-500'"
          :aria-selected="status === tab.value"
          @click="status = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <UiAlert
      v-if="actionError"
      variant="error"
    >
      {{ actionError }}
    </UiAlert>
    <UiEmptyState
      v-if="!activeLocations.length"
      title="Yetkili olduğunuz aktif şube yok"
      description="Owner’dan şube erişimi isteyin."
    />
    <UiAlert
      v-else-if="error"
      variant="error"
    >
      {{ apiErrorMessage(error) }}
    </UiAlert>
    <UiSpinner v-else-if="pending && !employees" />
    <UiEmptyState
      v-else-if="!employees?.length"
      :title="status === 'active' ? 'Bu şubede henüz personel yok' : 'Arşivlenmiş personel yok'"
      :description="status === 'active' ? 'İlk personelinizi ekleyerek başlayın.' : undefined"
    />
    <ul
      v-else
      class="flex flex-col divide-y divide-cream-200 overflow-hidden rounded-card bg-white shadow-card"
    >
      <li
        v-for="(employee, index) in employees"
        :key="employee.id"
        class="flex items-center gap-3 py-1.5 pr-1 pl-3 md:py-0.5"
        data-testid="employee-row"
      >
        <span
          class="h-9 w-1.5 shrink-0 rounded-full md:h-7"
          :style="{ backgroundColor: employee.department?.color ?? '#E7E3DA' }"
          aria-hidden="true"
        />
        <NuxtLink
          :to="orgPath(`/personel/${employee.id}`)"
          class="flex min-h-touch min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-lg md:grid md:grid-cols-[minmax(0,14rem)_auto] md:items-center md:justify-start md:gap-3"
        >
          <!-- Desktop: fixed name column so department tags line up whatever the name length. -->
          <span class="truncate font-semibold">{{ employee.firstName }} {{ employee.lastName }}</span>
          <span
            v-if="employee.department"
            data-testid="department-tag"
            class="w-fit shrink-0 rounded px-1.5 text-xs leading-5 font-semibold"
            :style="{ backgroundColor: employee.department.color, color: readableTextColor(employee.department.color) }"
          >{{ employee.department.name }}</span>
        </NuxtLink>
        <div
          v-if="status === 'active'"
          class="flex shrink-0 items-center gap-1"
          role="group"
          :aria-label="`${employee.firstName} ${employee.lastName} sıralaması`"
          data-testid="sort-controls"
        >
          <button
            v-for="direction in ([-1, 1] as const)"
            :key="direction"
            type="button"
            class="grid size-touch place-items-center rounded-lg text-navy-500 transition-colors hover:bg-cream-100 hover:text-navy-950 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-30"
            :disabled="direction === -1 ? index === 0 : index === employees.length - 1"
            :aria-label="`${employee.firstName} ${employee.lastName} ${direction === -1 ? 'yukarı' : 'aşağı'} taşı`"
            @click="move(index, direction)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5"
              :class="direction === 1 ? 'rotate-180' : ''"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            ><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
        <UiButton
          v-else
          variant="ghost"
          :loading="busyId === employee.id"
          @click="setArchived(employee, false)"
        >
          Geri al
        </UiButton>
      </li>
    </ul>
  </div>
</template>
