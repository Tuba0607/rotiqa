<script setup lang="ts">
import type { ShiftCodeDefinition } from '#shared/types/schedule'

const props = defineProps<{
  /** Assigned code; omit for an empty cell. */
  shift?: Pick<ShiftCodeDefinition, 'code' | 'label' | 'color' | 'textColor'> | null
  selected?: boolean
}>()

defineEmits<{ select: [] }>()

const style = computed(() => props.shift
  ? { backgroundColor: props.shift.color, color: props.shift.textColor }
  : undefined)
</script>

<template>
  <button
    type="button"
    class="grid min-h-touch w-full min-w-10 place-items-center rounded-lg text-sm font-bold transition-transform active:scale-95"
    :class="[
      shift ? '' : 'border-[1.5px] border-dashed border-cream-300 bg-white text-navy-500',
      selected ? 'ring-2 ring-brand-500 ring-offset-1' : '',
    ]"
    :style="style"
    :aria-label="shift ? shift.label : 'Boş vardiya'"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    {{ shift?.code ?? '·' }}
  </button>
</template>
