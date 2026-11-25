<script setup lang="ts">
import { createOrganizationSchema } from '#shared/schemas/tenancy'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'İşletmenizi oluşturun · Rotiqa' })

const route = useRoute()
const addingAnother = computed(() => route.query.yeni === '1')

// An existing member is sent to their business instead of creating another one automatically.
const { data: organizations } = await useMyOrganizations()
watchEffect(() => {
  const first = organizations.value?.[0]
  if (first && !addingAnother.value) navigateTo(`/app/${first.slug}`, { replace: true })
})

const TIME_ZONES = [
  { value: 'Europe/Istanbul', label: 'Türkiye (Europe/Istanbul)' },
  { value: 'Europe/London', label: 'Londra (Europe/London)' },
  { value: 'Europe/Berlin', label: 'Berlin (Europe/Berlin)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (Europe/Amsterdam)' },
  { value: 'Asia/Dubai', label: 'Dubai (Asia/Dubai)' },
]

const form = reactive({ name: '', locationName: '', timezone: 'Europe/Istanbul' })
const errors = ref<Record<string, string>>({})
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  const parsed = createOrganizationSchema.safeParse(form)
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]))
    return
  }
  errors.value = {}
  submitting.value = true
  try {
    const organization = await $fetch<{ slug: string }>('/api/organizations', { method: 'POST', body: parsed.data })
    clearNuxtData('me:organizations')
    await navigateTo(`/app/${organization.slug}`)
  }
  catch (e) {
    errors.value = apiFieldErrors(e)
    error.value = apiErrorMessage(e)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <p class="text-sm font-semibold text-brand-700">
        {{ addingAnother ? 'Yeni işletme' : 'Hoş geldiniz' }}
      </p>
      <h1 class="text-2xl font-bold tracking-tight">
        İşletmenizi oluşturun
      </h1>
      <p class="text-sm text-navy-500">
        İşletme ve ilk şube bilgilerini girin. Daha sonra yeni şubeler ekleyebilirsiniz.
      </p>
    </div>

    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="submit"
    >
      <UiAlert
        v-if="error"
        variant="error"
      >
        {{ error }}
      </UiAlert>
      <UiInput
        v-model="form.name"
        label="İşletme adı"
        placeholder="Örn. Kordon Bistro"
        autocomplete="organization"
        :error="errors.name"
      />
      <UiInput
        v-model="form.locationName"
        label="İlk şube adı"
        placeholder="Örn. Alsancak"
        :error="errors.locationName"
      />
      <UiSelect
        v-model="form.timezone"
        label="Saat dilimi"
        :options="TIME_ZONES"
        :error="errors.timezone"
      />
      <UiButton
        type="submit"
        size="lg"
        :disabled="submitting"
      >
        {{ submitting ? 'Oluşturuluyor…' : 'İşletmeyi oluştur' }}
      </UiButton>
      <NuxtLink
        v-if="addingAnother"
        to="/app"
        class="text-center text-sm font-semibold text-navy-500 underline"
      >Vazgeç</NuxtLink>
    </form>
  </div>
</template>
