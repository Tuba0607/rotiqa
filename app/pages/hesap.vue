<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Hesabım · Rotiqa' })

const session = authClient.useSession()
const user = computed(() => session.value.data?.user)

const profile = reactive({ name: '' })
watchEffect(() => {
  if (user.value && !profile.name) profile.name = user.value.name
})
const profileState = reactive({ saving: false, error: '', success: '' })

async function saveProfile() {
  profileState.error = ''
  profileState.success = ''
  if (!profile.name.trim()) {
    profileState.error = 'Adınızı girin.'
    return
  }
  profileState.saving = true
  const { error } = await authClient.updateUser({ name: profile.name.trim() })
  profileState.saving = false
  if (error) profileState.error = authErrorMessage(error)
  else profileState.success = 'Bilgileriniz güncellendi.'
}

const password = reactive({ current: '', next: '' })
const passwordState = reactive({ saving: false, error: '', success: '' })

async function changePassword() {
  passwordState.error = ''
  passwordState.success = ''
  if (password.next.length < 8) {
    passwordState.error = 'Yeni şifre en az 8 karakter olmalı.'
    return
  }
  passwordState.saving = true
  const { error } = await authClient.changePassword({ currentPassword: password.current, newPassword: password.next, revokeOtherSessions: true })
  passwordState.saving = false
  if (error) {
    passwordState.error = authErrorMessage(error)
    return
  }
  password.current = ''
  password.next = ''
  passwordState.success = 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.'
}

async function signOut() {
  await authClient.signOut()
  clearNuxtData()
  await navigateTo('/giris')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold tracking-tight">
        Hesabım
      </h1>
      <NuxtLink
        to="/app"
        class="text-sm font-semibold text-brand-700 underline"
      >İşletmelerim</NuxtLink>
    </div>

    <UiSpinner v-if="!user" />
    <template v-else>
      <UiCard>
        <form
          class="flex flex-col gap-4"
          novalidate
          @submit.prevent="saveProfile"
        >
          <h2 class="font-semibold">
            Profil
          </h2>
          <UiAlert
            v-if="profileState.error"
            variant="error"
          >
            {{ profileState.error }}
          </UiAlert>
          <UiAlert
            v-if="profileState.success"
            variant="success"
          >
            {{ profileState.success }}
          </UiAlert>
          <UiInput
            v-model="profile.name"
            label="Ad soyad"
            autocomplete="name"
          />
          <p class="text-sm text-navy-500">
            E-posta: <span class="font-semibold text-navy-950">{{ user.email }}</span>
          </p>
          <UiButton
            type="submit"
            :disabled="profileState.saving"
          >
            Kaydet
          </UiButton>
        </form>
      </UiCard>

      <UiCard>
        <form
          class="flex flex-col gap-4"
          novalidate
          @submit.prevent="changePassword"
        >
          <h2 class="font-semibold">
            Şifre değiştir
          </h2>
          <UiAlert
            v-if="passwordState.error"
            variant="error"
          >
            {{ passwordState.error }}
          </UiAlert>
          <UiAlert
            v-if="passwordState.success"
            variant="success"
          >
            {{ passwordState.success }}
          </UiAlert>
          <UiInput
            v-model="password.current"
            label="Mevcut şifre"
            type="password"
            autocomplete="current-password"
          />
          <UiInput
            v-model="password.next"
            label="Yeni şifre"
            type="password"
            autocomplete="new-password"
            hint="En az 8 karakter."
          />
          <UiButton
            type="submit"
            variant="secondary"
            :disabled="passwordState.saving"
          >
            Şifreyi değiştir
          </UiButton>
        </form>
      </UiCard>

      <UiButton
        variant="ghost"
        @click="signOut"
      >
        Çıkış yap
      </UiButton>
    </template>
  </div>
</template>
