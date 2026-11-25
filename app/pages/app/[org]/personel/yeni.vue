<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Personel ekle · Rotiqa' })

const route = useRoute()
const orgPath = useOrgPath()
const { slug, activeLocations } = useOrganization()
const { data: departments } = await useFetch<{ id: string, name: string }[]>(() => `/api/orgs/${slug.value}/departments`)

const initialLocation = typeof route.query.sube === 'string' && route.query.sube ? route.query.sube : undefined

async function create(value: { firstName: string, lastName: string, locationId: string, departmentId: string | null }) {
  await $fetch(`/api/orgs/${slug.value}/employees`, { method: 'POST', body: value })
  await navigateTo({ path: orgPath('/personel'), query: { sube: value.locationId } })
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-5">
    <NuxtLink
      :to="orgPath('/personel')"
      class="text-sm font-semibold text-navy-500 underline"
    >← Personel listesi</NuxtLink>
    <UiPageHeader title="Personel ekle" />
    <UiEmptyState
      v-if="!activeLocations.length"
      title="Personel eklemek için aktif bir şube gerekli"
    />
    <UiCard v-else>
      <EmployeeForm
        submit-label="Personeli ekle"
        :locations="activeLocations"
        :departments="departments ?? []"
        :initial="{ locationId: initialLocation }"
        :submit="create"
      />
    </UiCard>
  </div>
</template>
