<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Davetler · Rotiqa' })

interface Invitation {
  id: string
  email: string
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
  expiresAt: string
  locations: { id: string, name: string }[]
}

const STATUS: Record<Invitation['status'], { label: string, tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  PENDING: { label: 'Bekliyor', tone: 'neutral' },
  ACCEPTED: { label: 'Kabul edildi', tone: 'success' },
  EXPIRED: { label: 'Süresi doldu', tone: 'warning' },
  REVOKED: { label: 'İptal edildi', tone: 'danger' },
}

const { slug, isOwner, activeLocations } = useOrganization()
const { data: invitations, error, refresh } = await useFetch<Invitation[]>(() => `/api/orgs/${slug.value}/invitations`, { immediate: isOwner.value })

const form = reactive({ email: '', locationIds: [] as string[] })
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')
const saving = ref(false)
const createdLink = ref('')
const copied = ref(false)

async function create() {
  formError.value = ''
  fieldErrors.value = {}
  createdLink.value = ''
  saving.value = true
  try {
    const invitation = await $fetch<{ token: string }>(`/api/orgs/${slug.value}/invitations`, { method: 'POST', body: form })
    createdLink.value = `${window.location.origin}/davet/${invitation.token}`
    form.email = ''
    form.locationIds = []
    await refresh()
  }
  catch (e) {
    fieldErrors.value = apiFieldErrors(e)
    formError.value = apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}

async function copyLink() {
  await navigator.clipboard.writeText(createdLink.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function revoke(invitation: Invitation) {
  if (!confirm(`${invitation.email} için davet iptal edilsin mi?`)) return
  formError.value = ''
  try {
    await $fetch(`/api/orgs/${slug.value}/invitations/${invitation.id}/revoke`, { method: 'POST' })
    await refresh()
  }
  catch (e) {
    formError.value = apiErrorMessage(e)
  }
}

const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="flex flex-col gap-5">
    <UiPageHeader
      title="Yönetici davetleri"
      description="Şube yöneticileri yalnızca seçtiğiniz şubelerin personelini yönetebilir."
    />

    <UiAlert
      v-if="!isOwner"
      variant="error"
    >
      Davetleri yalnızca Owner yönetebilir.
    </UiAlert>

    <template v-else>
      <UiCard>
        <form
          class="flex flex-col gap-4"
          novalidate
          @submit.prevent="create"
        >
          <h2 class="font-semibold">
            Davet bağlantısı oluştur
          </h2>
          <UiAlert
            v-if="formError"
            variant="error"
          >
            {{ formError }}
          </UiAlert>
          <UiInput
            v-model="form.email"
            label="Yöneticinin e-posta adresi"
            type="email"
            inputmode="email"
            autocomplete="off"
            hint="Davet yalnızca bu e-posta adresiyle giriş yapan kişi tarafından kabul edilebilir."
            :error="fieldErrors.email"
          />
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-semibold">
              Erişebileceği şubeler
            </legend>
            <label
              v-for="location in activeLocations"
              :key="location.id"
              class="flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border border-cream-300 bg-white px-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-500/30 has-[:checked]:border-brand-600"
            >
              <input
                v-model="form.locationIds"
                type="checkbox"
                :value="location.id"
                class="size-5 accent-brand-600"
              >
              {{ location.name }}
            </label>
            <p
              v-if="fieldErrors.locationIds"
              class="text-sm font-medium text-red-700"
            >
              {{ fieldErrors.locationIds }}
            </p>
          </fieldset>
          <UiButton
            type="submit"
            :loading="saving"
          >
            Bağlantı oluştur
          </UiButton>
        </form>

        <div
          v-if="createdLink"
          class="mt-5 flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4"
          data-testid="invitation-link"
        >
          <p class="text-sm font-semibold text-brand-700">
            Davet bağlantısı hazır. E-posta gönderilmedi.
          </p>
          <p class="text-sm text-navy-900">
            Bağlantıyı kopyalayıp yöneticiyle kendiniz paylaşın (ör. WhatsApp). Güvenlik için bağlantı yalnızca şimdi gösterilir ve 7 gün geçerlidir.
          </p>
          <input
            :value="createdLink"
            readonly
            aria-label="Davet bağlantısı"
            class="min-h-touch w-full rounded-xl border border-cream-300 bg-white px-3 font-mono text-xs"
            @focus="($event.target as HTMLInputElement).select()"
          >
          <UiButton
            variant="secondary"
            @click="copyLink"
          >
            {{ copied ? 'Kopyalandı' : 'Bağlantıyı kopyala' }}
          </UiButton>
        </div>
      </UiCard>

      <UiAlert
        v-if="error"
        variant="error"
      >
        {{ apiErrorMessage(error) }}
      </UiAlert>
      <UiEmptyState
        v-else-if="!invitations?.length"
        title="Henüz davet oluşturulmadı"
      />
      <ul
        v-else
        class="flex flex-col divide-y divide-cream-200 overflow-hidden rounded-card bg-white shadow-card"
      >
        <li
          v-for="invitation in invitations"
          :key="invitation.id"
          class="flex flex-wrap items-center gap-3 px-4 py-3"
        >
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-semibold">{{ invitation.email }}</span>
            <span class="text-xs text-navy-500">
              {{ invitation.locations.map(l => l.name).join(', ') }} · Son geçerlilik: {{ dateFormat.format(new Date(invitation.expiresAt)) }}
            </span>
          </div>
          <UiBadge :tone="STATUS[invitation.status].tone">
            {{ STATUS[invitation.status].label }}
          </UiBadge>
          <UiButton
            v-if="invitation.status === 'PENDING'"
            variant="ghost"
            @click="revoke(invitation)"
          >
            İptal et
          </UiButton>
        </li>
      </ul>
    </template>
  </div>
</template>
