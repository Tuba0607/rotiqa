<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

type Variant = 'primary' | 'secondary' | 'ghost' | 'inverse'
type Size = 'md' | 'lg'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  /** Shows a spinner, sets aria-busy and blocks clicks. The label stays the same. */
  loading?: boolean
  /** Renders a link styled as a button (avoids nesting a <button> inside an <a>). */
  to?: RouteLocationRaw
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  to: undefined,
})

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand-500 text-navy-950 hover:bg-brand-600 hover:text-white',
  secondary: 'bg-navy-950 text-white hover:bg-navy-900',
  ghost: 'bg-transparent text-navy-950 hover:bg-cream-200',
  /** For dark (navy) backgrounds. */
  inverse: 'bg-transparent text-white ring-1 ring-inset ring-white/25 hover:bg-navy-900',
}

const sizeClass: Record<Size, string> = {
  md: 'min-h-touch px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
}

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors',
  'focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress',
  variantClass[props.variant],
  sizeClass[props.size],
])
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    :class="classes"
  >
    <slot />
  </NuxtLink>
  <button
    v-else
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :class="classes"
  >
    <span
      v-if="loading"
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
