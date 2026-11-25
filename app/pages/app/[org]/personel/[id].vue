<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Personel · Rotiqa' })

interface Employee {
  id: string
  firstName: string
  lastName: string
  locationId: string
  isActive: boolean
  archivedAt: string | null
  department: { id: string, name: string, color: string } | null
}

const route = useRoute()
const orgPath = useOrgPath()
// All visible locations (an employee may belong to a location that was deactivated later).
const { slug, data: overview } = useOrganization()
const id = computed(() => String(route.params.id))

const [{ data: employee, error, refresh }, { data: departments }] = await Promise.all([
  useFetch<Employee>(() => `/api/orgs/${slug.value}/employees/${id.value}`),
  useFetch<{ id: string, name: string }[]>(() => `/api/orgs/${slug.value}/departments`),
])

const saved = ref(false)
const archiveError = ref('')
const archiving = ref(false)

async function save(value: { firstName: string, lastName: string, locationId: string, departmentId: string | null }) {
  saved.value = false
  await $fetch(`/api/orgs/${slug.value}/employees/${id.value}`, { method: 'PATCH', body: value })
  await refresh()
  saved.value = true
}

async function setArchived(archived: boolean) {
  if (archived && !confirm('Personel arşivlensin mi? Geçmiş kayıtları korunur ve istediğiniz zaman geri alabilirsiniz.')) return
  archiveError.value = ''
  archiving.value = true
  try {
    await $fetch(`/api/orgs/${slug.value}/employees/${id.value}/${archived ? 'archive' : 'reactivate'}`, { method: 'POST' })
    await refresh()
  }
  catch (e) {
    archiveError.value = apiErrorMessage(e)
  }
  finally {
    archiving.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-5">
    <NuxtLink
      :to="orgPath('/personel')"
      class="text-sm font-semibold text-navy-500 underline"
    >← Personel listesi</NuxtLink>

    <UiAlert
      v-if="error"
      variant="error"
    >
      {{ apiErrorMessage(error) }}
    </UiAlert>
    <UiSpinner v-else-if="!employee" />
    <template v-else>
      <UiPageHeader :title="`${employee.firstName} ${employee.lastName}`">
        <template #actions>
          <UiBadge :tone="employee.isActive ? 'success' : 'warning'">
            {{ employee.isActive ? 'Aktif' : 'Arşivde' }}
          </UiBadge>
        </template>
      </UiPageHeader>

      <UiAlert
        v-if="saved"
        variant="success"
      >
        Değişiklikler kaydedildi.
      </UiAlert>
      <UiCard>
        <EmployeeForm
          :key="`${employee.id}-${employee.locationId}-${employee.department?.id}`"
          submit-label="Kaydet"
          :locations="overview?.locations ?? []"
          :departments="departments ?? []"
          :initial="{ firstName: employee.firstName, lastName: employee.lastName, locationId: employee.locationId, departmentId: employee.department?.id ?? '' }"
          :submit="save"
        />
      </UiCard>

      <UiCard>
        <h2 class="font-semibold">
          {{ employee.isActive ? 'Personeli arşivle' : 'Personeli geri al' }}
        </h2>
        <p class="mt-1 text-sm text-navy-500">
          {{ employee.isActive
            ? 'Arşivlenen personel yeni planlarda görünmez; geçmiş vardiya ve puantaj kayıtları korunur.'
            : 'Personel yeniden aktif listeye eklenir.' }}
        </p>
        <UiAlert
          v-if="archiveError"
          variant="error"
          class="mt-3"
        >
          {{ archiveError }}
        </UiAlert>
        <UiButton
          class="mt-4"
          :variant="employee.isActive ? 'secondary' : 'primary'"
          :disabled="archiving"
          @click="setArchived(employee.isActive)"
        >
          {{ employee.isActive ? 'Arşivle' : 'Geri al' }}
        </UiButton>
      </UiCard>
    </template>
  </div>
</template>
