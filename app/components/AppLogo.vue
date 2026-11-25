<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'dark' | 'light' }>(), { variant: 'dark' })
</script>

<template>
  <span
    class="inline-flex items-center gap-2 font-bold tracking-tight"
    :class="variant === 'dark' ? 'text-navy-950' : 'text-white'"
  >
    <span
      class="grid size-8 place-items-center rounded-lg bg-brand-500 text-navy-950"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
      >
        <path d="M4 7h16M4 12h10M4 17h6" />
        <circle
          cx="18"
          cy="16"
          r="3"
        />
      </svg>
    </span>
    <span class="text-xl">Rotiqa</span>
  </span>
</template>
