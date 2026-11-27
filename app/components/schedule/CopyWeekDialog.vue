<script setup lang="ts">
import { addDays, formatWeekRange } from '#shared/utils/week'

/**
 * "Önceki haftayı kopyala". Filling only empty cells is the default; overwriting filled cells
 * is a separate choice that must be confirmed with a checkbox. The whole copy is one change
 * set, so one "Geri al" reverts it.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ weekStart: string, filledCells: number, busy: boolean }>()
const emit = defineEmits<{ copy: [mode: 'fill-empty' | 'overwrite'] }>()
defineExpose({ fail })

const mode = ref<'fill-empty' | 'overwrite'>('fill-empty')
const confirmed = ref(false)
const error = ref('')

watch(open, (value) => {
  if (!value) return
  mode.value = 'fill-empty'
  confirmed.value = false
  error.value = ''
})
watch(mode, () => {
  confirmed.value = false
})

const sourceRange = computed(() => formatWeekRange(addDays(props.weekStart, -7)))
const canSubmit = computed(() => !props.busy && (mode.value === 'fill-empty' || confirmed.value))

function fail(message: string) {
  error.value = message
}
function submit() {
  if (!canSubmit.value) return
  error.value = ''
  emit('copy', mode.value)
}
const optionClass = (active: boolean) => [
  'flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition-colors',
  active ? 'border-brand-600 bg-brand-50' : 'border-cream-300 hover:border-navy-500/40',
]
</script>

<template>
  <UiDialog
    v-model:open="open"
    title="Önceki haftayı kopyala"
    :description="`${sourceRange} haftasının planı bu haftaya kopyalanır.`"
  >
    <form
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <fieldset class="flex flex-col gap-2">
        <legend class="sr-only">
          Kopyalama biçimi
        </legend>
        <label :class="optionClass(mode === 'fill-empty')">
          <input
            v-model="mode"
            type="radio"
            name="copy-mode"
            value="fill-empty"
            class="mt-1 size-4 accent-brand-600"
          >
          <span class="flex flex-col gap-0.5">
            <span class="font-semibold">Yalnızca boş hücreleri doldur</span>
            <span class="text-sm text-navy-500">Önerilen. Bu haftada zaten girilmiş vardiyalar değişmez.</span>
          </span>
        </label>
        <label :class="optionClass(mode === 'overwrite')">
          <input
            v-model="mode"
            type="radio"
            name="copy-mode"
            value="overwrite"
            class="mt-1 size-4 accent-brand-600"
          >
          <span class="flex flex-col gap-0.5">
            <span class="font-semibold">Dolu hücrelerin üzerine yaz</span>
            <span class="text-sm text-navy-500">Geçen haftada vardiyası olan hücreler bu haftadaki değerin yerine geçer.</span>
          </span>
        </label>
      </fieldset>

      <label
        v-if="mode === 'overwrite'"
        class="flex gap-3 rounded-xl border border-accent-500/40 bg-accent-100 p-3 text-sm text-accent-700"
      >
        <input
          v-model="confirmed"
          type="checkbox"
          class="mt-0.5 size-4 shrink-0 accent-accent-700"
        >
        <span>Bu haftadaki <strong>{{ filledCells }}</strong> dolu hücrenin değişebileceğini anlıyorum.</span>
      </label>

      <UiAlert
        v-if="error"
        variant="error"
      >
        {{ error }}
      </UiAlert>

      <p class="text-sm text-navy-500">
        Arşivlenmiş personel ve pasif vardiya kodları kopyalanmaz; atlanan hücreler size bildirilir. Tamamı tek adımda “Geri al” ile geri alınabilir.
      </p>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UiButton
          variant="ghost"
          @click="open = false"
        >
          Vazgeç
        </UiButton>
        <UiButton
          type="submit"
          :disabled="!canSubmit"
          :loading="busy"
        >
          {{ mode === 'overwrite' ? 'Üzerine yazarak kopyala' : 'Boş hücrelere kopyala' }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
