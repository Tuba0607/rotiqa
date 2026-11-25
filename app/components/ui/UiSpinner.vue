<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Yükleniyor…' })
</script>

<template>
  <div
    class="flex items-center justify-center gap-3 py-10 text-sm text-navy-500"
    role="status"
  >
    <span
      class="size-5 animate-spin rounded-full border-2 border-cream-300 border-t-brand-600"
      aria-hidden="true"
    />
    {{ label }}
  </div>
</template>
