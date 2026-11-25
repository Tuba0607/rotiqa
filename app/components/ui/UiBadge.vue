<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' }>(), { tone: 'neutral' })
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
    :class="{
      'bg-cream-200 text-navy-900': tone === 'neutral',
      'bg-brand-100 text-brand-700': tone === 'success',
      'bg-accent-100 text-accent-700': tone === 'warning',
      'bg-red-100 text-red-800': tone === 'danger',
    }"
  ><slot /></span>
</template>
