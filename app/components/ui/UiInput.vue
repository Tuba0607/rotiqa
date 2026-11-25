<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })
const props = defineProps<{
  label: string
  error?: string
  hint?: string
}>()

const id = useId()
const describedBy = computed(() => [props.error ? `${id}-error` : '', props.hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-sm font-semibold text-navy-950"
    >{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      v-bind="$attrs"
      class="min-h-touch w-full rounded-xl border bg-white px-3.5 text-base text-navy-950 transition-colors placeholder:text-navy-500/70 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      :class="error ? 'border-red-600' : 'border-cream-300'"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
    >
    <p
      v-if="hint && !error"
      :id="`${id}-hint`"
      class="text-sm text-navy-500"
    >
      {{ hint }}
    </p>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="text-sm font-medium text-red-700"
    >
      {{ error }}
    </p>
  </div>
</template>
