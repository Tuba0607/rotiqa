<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Şubeler · Rotiqa' })

interface Location { id: string, name: string, timezone: string, isActive: boolean }

const { slug, isOwner, refresh: refreshOrganization } = useOrganization()
const { data: locations, error, refresh } = await useFetch<Location[]>(() => `/api/orgs/${slug.value}/locations`)

const form = reactive({ name: '', timezone: 'Europe/Istanbul' })
const showForm = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

async function create() {
  formError.value = ''
  saving.value = true
  try {
    await $fetch(`/api/orgs/${slug.value}/locations`, { method: 'POST', body: form })
    form.name = ''
    showForm.value = false
    await Promise.all([refresh(), refreshOrganization()])
  }
  catch (e) {
    fieldErrors.value = apiFieldErrors(e)
    formError.value = apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}

async function toggle(location: Location) {
  if (location.isActive && !confirm(`${location.name} pasif yapılsın mı? Personel kayıtları korunur.`)) return
  formError.value = ''
  try {
    await $fetch(`/api/orgs/${slug.value}/locations/${location.id}`, { method: 'PATCH', body: { isActive: !location.isActive } })
    await Promise.all([refresh(), refreshOrganization()])
  }
  catch (e) {
    formError.value = apiErrorMessage(e)
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <UiPageHeader
      title="Şubeler"
      :description="isOwner ? undefined : 'Yalnızca yetkili olduğunuz şubeler listelenir.'"
    >
      <template
        v-if="isOwner"
        #actions
      >
        <UiButton
          v-if="!showForm"
          @click="showForm = true"
        >
          Şube ekle
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert
      v-if="formError"
      variant="error"
    >
      {{ formError }}
    </UiAlert>

    <UiCard v-if="isOwner && showForm">
      <form
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent="create"
      >
        <h2 class="font-semibold">
          Yeni şube
        </h2>
        <UiInput
          v-model="form.name"
          label="Şube adı"
          :error="fieldErrors.name"
        />
        <UiSelect
          v-model="form.timezone"
          label="Saat dilimi"
          :options="[{ value: 'Europe/Istanbul', label: 'Türkiye (Europe/Istanbul)' }, { value: 'Europe/London', label: 'Londra (Europe/London)' }, { value: 'Europe/Berlin', label: 'Berlin (Europe/Berlin)' }]"
          :error="fieldErrors.timezone"
        />
        <div class="flex gap-2">
          <UiButton
            type="submit"
            :loading="saving"
          >
            Kaydet
          </UiButton>
          <UiButton
            variant="ghost"
            @click="showForm = false"
          >
            Vazgeç
          </UiButton>
        </div>
      </form>
    </UiCard>

    <UiAlert
      v-if="error"
      variant="error"
    >
      {{ apiErrorMessage(error) }}
    </UiAlert>
    <UiEmptyState
      v-else-if="!locations?.length"
      title="Yetkili olduğunuz şube yok"
    />
    <ul
      v-else
      class="flex flex-col divide-y divide-cream-200 overflow-hidden rounded-card bg-white shadow-card"
    >
      <li
        v-for="location in locations"
        :key="location.id"
        class="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2"
      >
        <div class="flex flex-col">
          <span class="font-semibold">{{ location.name }}</span>
          <span class="text-xs text-navy-500">{{ location.timezone }}</span>
        </div>
        <UiBadge :tone="location.isActive ? 'success' : 'warning'">
          {{ location.isActive ? 'Aktif' : 'Pasif' }}
        </UiBadge>
        <UiButton
          v-if="isOwner"
          variant="ghost"
          class="ml-auto"
          @click="toggle(location)"
        >
          {{ location.isActive ? 'Pasif yap' : 'Aktif yap' }}
        </UiButton>
      </li>
    </ul>
  </div>
</template>
