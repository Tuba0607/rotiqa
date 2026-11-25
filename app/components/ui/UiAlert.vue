<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'error' | 'success' | 'info' }>(), { variant: 'info' })
</script>

<template>
  <div
    :role="variant === 'error' ? 'alert' : 'status'"
    class="rounded-xl border px-4 py-3 text-sm font-medium"
    :class="{
      'border-red-200 bg-red-50 text-red-800': variant === 'error',
      'border-brand-100 bg-brand-50 text-brand-700': variant === 'success',
      'border-cream-300 bg-cream-50 text-navy-900': variant === 'info',
    }"
  >
    <slot />
  </div>
</template>
