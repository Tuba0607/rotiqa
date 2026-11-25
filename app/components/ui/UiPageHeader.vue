<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight text-navy-950">
        {{ title }}
      </h1>
      <p
        v-if="description"
        class="text-sm text-navy-500"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="flex flex-wrap gap-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
