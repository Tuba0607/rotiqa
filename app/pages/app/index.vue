<script setup lang="ts">
// Entry after sign-in: first organization, or onboarding when the user has none.
const { data: organizations, error } = await useMyOrganizations()

watchEffect(() => {
  if (!organizations.value) return
  const first = organizations.value[0]
  navigateTo(first ? `/app/${first.slug}` : '/baslangic', { replace: true })
})
</script>

<template>
  <main class="mx-auto max-w-md px-5 py-16">
    <UiAlert
      v-if="error"
      variant="error"
    >
      {{ apiErrorMessage(error) }}
    </UiAlert>
    <UiSpinner v-else />
  </main>
</template>
