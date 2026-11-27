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
      :class="selectClasses(!!error)"
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
