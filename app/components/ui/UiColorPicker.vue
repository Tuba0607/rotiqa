<script setup lang="ts">
import { DEPARTMENT_COLORS } from '#shared/design/tokens'
import { readableTextColor } from '#shared/utils/color'

const model = defineModel<string>({ required: true })
defineProps<{ label: string }>()
const id = useId()
</script>

<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="text-sm font-semibold text-navy-950">
      {{ label }}
    </legend>
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="color in DEPARTMENT_COLORS"
        :key="color"
        type="button"
        class="grid size-11 place-items-center rounded-xl ring-offset-2 transition"
        :class="model.toUpperCase() === color ? 'ring-2 ring-navy-950' : ''"
        :style="{ backgroundColor: color, color: readableTextColor(color) }"
        :aria-label="`Renk ${color}`"
        :aria-pressed="model.toUpperCase() === color"
        @click="model = color"
      >
        <span
          v-if="model.toUpperCase() === color"
          aria-hidden="true"
        >✓</span>
      </button>
      <label
        :for="id"
        class="flex min-h-touch items-center gap-2 rounded-xl border border-cream-300 bg-white px-3 text-sm"
      >
        Özel
        <input
          :id="id"
          v-model="model"
          type="color"
          class="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
        >
      </label>
    </div>
  </fieldset>
</template>
