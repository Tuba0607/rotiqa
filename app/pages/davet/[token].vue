<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Davet · Rotiqa', robots: 'noindex' })

const route = useRoute()
const token = computed(() => String(route.params.token))

const { data: invitation, error: previewError } = await useFetch<{ organizationName: string, email: string, status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' }>(
  () => `/api/invitations/${token.value}`,
  { key: computed(() => `invitation:${token.value}`) },
)
const session = authClient.useSession()
const signedInEmail = computed(() => session.value.data?.user.email?.toLowerCase())

const STATUS_MESSAGE = {
  ACCEPTED: 'Bu davet daha önce kullanılmış.',
  EXPIRED: 'Davetin süresi dolmuş. İşletme sahibinden yeni bir davet isteyin.',
  REVOKED: 'Bu davet iptal edilmiş.',
} as const

const accepting = ref(false)
const error = ref('')

async function accept() {
  error.value = ''
  accepting.value = true
  try {
    const result = await $fetch<{ slug: string }>(`/api/invitations/${token.value}/accept`, { method: 'POST' })
    clearNuxtData('me:organizations')
    await navigateTo(`/app/${result.slug}`)
  }
  catch (e) {
    error.value = apiErrorMessage(e)
  }
  finally {
    accepting.value = false
  }
}

async function switchAccount() {
  await authClient.signOut()
  await navigateTo({ path: '/giris', query: { redirect: route.fullPath } })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiAlert
      v-if="previewError"
      variant="error"
    >
      {{ apiErrorMessage(previewError) }}
    </UiAlert>
    <UiSpinner v-else-if="!invitation" />
    <template v-else>
      <div class="flex flex-col gap-1">
        <p class="text-sm font-semibold text-brand-700">
          Yönetici daveti
        </p>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ invitation.organizationName }}
        </h1>
        <p class="text-sm text-navy-500">
          <span class="font-semibold text-navy-950">{{ invitation.email }}</span> adresi şube yöneticisi olarak davet edildi.
        </p>
      </div>

      <UiAlert
        v-if="invitation.status !== 'PENDING'"
        variant="error"
      >
        {{ STATUS_MESSAGE[invitation.status] }}
      </UiAlert>

      <template v-else-if="!session.data">
        <p class="text-sm text-navy-500">
          Daveti kabul etmek için <strong>{{ invitation.email }}</strong> adresiyle giriş yapın veya kayıt olun.
        </p>
        <div class="flex flex-col gap-3">
          <NuxtLink :to="{ path: '/kayit', query: { redirect: route.fullPath } }">
            <UiButton
              size="lg"
              class="w-full"
            >
              Kayıt ol
            </UiButton>
          </NuxtLink>
          <NuxtLink :to="{ path: '/giris', query: { redirect: route.fullPath } }">
            <UiButton
              size="lg"
              variant="secondary"
              class="w-full"
            >
              Giriş yap
            </UiButton>
          </NuxtLink>
        </div>
      </template>

      <template v-else-if="signedInEmail !== invitation.email">
        <UiAlert variant="error">
          Şu an {{ signedInEmail }} hesabıyla giriş yaptınız. Bu davet {{ invitation.email }} adresine ait.
        </UiAlert>
        <UiButton
          variant="secondary"
          @click="switchAccount"
        >
          Farklı hesapla giriş yap
        </UiButton>
      </template>

      <template v-else>
        <UiAlert
          v-if="error"
          variant="error"
        >
          {{ error }}
        </UiAlert>
        <UiButton
          size="lg"
          :disabled="accepting"
          @click="accept"
        >
          {{ accepting ? 'Kabul ediliyor…' : 'Daveti kabul et' }}
        </UiButton>
      </template>
    </template>
  </div>
</template>
