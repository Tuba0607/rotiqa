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
  <label class="flex min-w-0 items-center">
    <span class="sr-only">İşletme seç</span>
    <!-- Header-sized variant of the shared select: same chevron, compact height, thin focus ring. -->
    <select
      class="ui-select ui-select-inverse h-10 max-w-[11rem] min-w-0 cursor-pointer truncate rounded-lg border border-white/10 bg-navy-900 pr-9 pl-3 text-sm font-semibold text-white transition-[border-color,box-shadow] hover:border-white/25 focus:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 sm:max-w-xs md:h-9"
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
  </label>
</template>
