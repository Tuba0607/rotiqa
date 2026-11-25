<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Giriş yap · Rotiqa' })

const route = useRoute()
const form = reactive({ email: '', password: '' })
const error = ref('')
const submitting = ref(false)

const redirectTo = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/app'
})

async function submit() {
  error.value = ''
  if (!form.email || !form.password) {
    error.value = 'E-posta ve şifrenizi girin.'
    return
  }
  submitting.value = true
  const { error: authError } = await authClient.signIn.email({ email: form.email.trim(), password: form.password })
  submitting.value = false
  if (authError) {
    error.value = authErrorMessage(authError)
    return
  }
  await navigateTo(redirectTo.value)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight">
        Giriş yap
      </h1>
      <p class="text-sm text-navy-500">
        Vardiya planlarınıza devam edin.
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
        v-model="form.email"
        label="E-posta"
        type="email"
        autocomplete="email"
        inputmode="email"
        required
      />
      <UiInput
        v-model="form.password"
        label="Şifre"
        type="password"
        autocomplete="current-password"
        required
      />
      <UiButton
        type="submit"
        size="lg"
        :disabled="submitting"
      >
        {{ submitting ? 'Giriş yapılıyor…' : 'Giriş yap' }}
      </UiButton>
    </form>

    <p class="text-sm text-navy-500">
      Hesabınız yok mu?
      <NuxtLink
        :to="{ path: '/kayit', query: route.query }"
        class="font-semibold text-brand-700 underline"
      >Ücretsiz kayıt olun</NuxtLink>
    </p>
  </div>
</template>
