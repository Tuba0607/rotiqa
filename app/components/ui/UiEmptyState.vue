<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-cream-300 px-6 py-10 text-center">
    <p class="font-semibold text-navy-950">
      {{ title }}
    </p>
    <p
      v-if="description"
      class="max-w-sm text-sm text-navy-500"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-2"
    >
      <slot />
    </div>
  </div>
</template>
