<script setup lang="ts">
const route = useRoute()
const { data: organizations } = useMyOrganizations()
const current = computed(() => organizations.value?.find(o => o.slug === route.params.org))

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === '__new') return navigateTo('/baslangic?yeni=1')
  return navigateTo(`/app/${value}`)
}
</script>

<template>
  <label class="relative flex min-w-0 items-center">
    <span class="sr-only">İşletme seç</span>
    <select
      class="min-h-touch max-w-[12rem] appearance-none truncate rounded-xl bg-navy-900 py-2 pr-8 pl-3 text-sm font-semibold text-white sm:max-w-xs"
      :value="current?.slug"
      @change="onChange"
    >
      <option
        v-for="org in organizations"
        :key="org.id"
        :value="org.slug"
      >
        {{ org.name }}
      </option>
      <option value="__new">
        + Yeni işletme ekle
      </option>
    </select>
    <span
      class="pointer-events-none absolute right-3 text-xs text-white/70"
      aria-hidden="true"
    >▾</span>
  </label>
</template>
