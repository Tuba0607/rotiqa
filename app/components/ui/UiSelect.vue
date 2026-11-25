<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })
defineProps<{
  label: string
  options: { value: string, label: string }[]
  error?: string
  placeholder?: string
}>()

const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-sm font-semibold text-navy-950"
    >{{ label }}</label>
    <select
      :id="id"
      v-model="model"
      v-bind="$attrs"
      class="min-h-touch w-full rounded-xl border bg-white px-3 text-base text-navy-950 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      :class="error ? 'border-red-600' : 'border-cream-300'"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? `${id}-error` : undefined"
    >
      <option
        v-if="placeholder"
        value=""
      >
        {{ placeholder }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="text-sm font-medium text-red-700"
    >
      {{ error }}
    </p>
  </div>
</template>
