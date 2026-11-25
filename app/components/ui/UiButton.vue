<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
})

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand-500 text-navy-950 hover:bg-brand-600 hover:text-white',
  secondary: 'bg-navy-950 text-white hover:bg-navy-900',
  ghost: 'bg-transparent text-navy-950 hover:bg-cream-200',
}

const sizeClass: Record<Size, string> = {
  md: 'min-h-touch px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
}

const classes = computed(() => [variantClass[props.variant], sizeClass[props.size]])
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="classes"
  >
    <slot />
  </button>
</template>
