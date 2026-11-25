<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Kayıt ol · Rotiqa' })

const route = useRoute()
const form = reactive({ name: '', email: '', password: '' })
const errors = reactive<{ name?: string, email?: string, password?: string }>({})
const error = ref('')
const submitting = ref(false)

function validate(): boolean {
  errors.name = form.name.trim() ? undefined : 'Adınızı girin.'
  errors.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? undefined : 'Geçerli bir e-posta adresi girin.'
  errors.password = form.password.length >= 8 ? undefined : 'Şifre en az 8 karakter olmalı.'
  return !errors.name && !errors.email && !errors.password
}

async function submit() {
  error.value = ''
  if (!validate()) return
  submitting.value = true
  const { error: authError } = await authClient.signUp.email({ name: form.name.trim(), email: form.email.trim(), password: form.password })
  submitting.value = false
  if (authError) {
    error.value = authErrorMessage(authError)
    return
  }
  const redirect = route.query.redirect
  await navigateTo(typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/app')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight">
        Hesap oluştur
      </h1>
      <p class="text-sm text-navy-500">
        Ekibinizin vardiyalarını dakikalar içinde planlayın.
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
        label="Ad soyad"
        autocomplete="name"
        :error="errors.name"
        required
      />
      <UiInput
        v-model="form.email"
        label="E-posta"
        type="email"
        autocomplete="email"
        inputmode="email"
        :error="errors.email"
        required
      />
      <UiInput
        v-model="form.password"
        label="Şifre"
        type="password"
        autocomplete="new-password"
        hint="En az 8 karakter."
        :error="errors.password"
        required
      />
      <UiButton
        type="submit"
        size="lg"
        :disabled="submitting"
      >
        {{ submitting ? 'Hesap oluşturuluyor…' : 'Kayıt ol' }}
      </UiButton>
    </form>

    <p class="text-sm text-navy-500">
      Zaten hesabınız var mı?
      <NuxtLink
        :to="{ path: '/giris', query: route.query }"
        class="font-semibold text-brand-700 underline"
      >Giriş yapın</NuxtLink>
    </p>
  </div>
</template>
