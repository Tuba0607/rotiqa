<script setup lang="ts">
import type { ShiftCodeDefinition } from '#shared/types/schedule'

const props = defineProps<{
  /** Assigned code; omit for an empty cell. Colors come from data so organizations can recolor codes. */
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
    class="grid min-h-touch w-full min-w-9 place-items-center bg-white text-[13px] font-bold uppercase text-navy-950 transition-[filter] active:brightness-95"
    :class="selected ? 'relative z-10 outline-3 -outline-offset-3 outline-navy-950' : ''"
    :style="style"
    :aria-label="shift ? shift.label : 'Boş vardiya'"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    {{ shift?.code ?? '' }}
  </button>
</template>
