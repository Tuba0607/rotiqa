<script setup lang="ts">
import type { ScheduleShiftCode } from '#shared/types/schedule'
import { readableTextColor } from '#shared/utils/color'

/**
 * Shift code picker for one cell. A popover in the top layer (Esc and outside clicks close it):
 * anchored under the cell on larger screens, a bottom sheet on phones, so it never runs off
 * screen or under the tab bar. Focus moves to the current code and returns to the cell.
 */
const props = defineProps<{
  codes: ScheduleShiftCode[]
  /** e.g. "Defne Aksoy · Pzt 23 Kasım" */
  title: string
  currentId: string | null
}>()
const emit = defineEmits<{ pick: [shiftCodeId: string | null], closed: [] }>()

const panel = ref<HTMLElement | null>(null)
let anchor: HTMLElement | null = null

function open(cell: HTMLElement) {
  close()
  anchor?.style.removeProperty('anchor-name')
  anchor = cell
  cell.style.setProperty('anchor-name', '--shift-cell')
  panel.value?.showPopover()
  nextTick(() => {
    const target = panel.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel.value?.querySelector<HTMLElement>('[data-code]')
    target?.focus()
  })
}

function close() {
  if (panel.value?.matches(':popover-open')) panel.value.hidePopover()
}

function onToggle(event: Event) {
  // A late "closed" event from the previous cell must not close the picker reopened on a new one.
  if ((event as ToggleEvent).newState !== 'closed' || panel.value?.matches(':popover-open')) return
  anchor?.style.removeProperty('anchor-name')
  // The browser usually restores focus itself; only step in when focus was lost (still in the
  // hidden panel or on <body>), never pull it back from a cell the user has moved to since.
  const active = document.activeElement
  if (!active || active === document.body || panel.value?.contains(active)) anchor?.focus({ preventScroll: true })
  anchor = null
  emit('closed')
}

function pick(id: string | null) {
  emit('pick', id)
  close()
}

// Arrow keys move between the code buttons (grid of two or three columns).
function onKeydown(event: KeyboardEvent) {
  const buttons = [...(panel.value?.querySelectorAll<HTMLElement>('[data-code]') ?? [])]
  const index = buttons.indexOf(document.activeElement as HTMLElement)
  if (index < 0) return
  const columns = Math.max(1, Math.round(panel.value!.querySelector('[data-grid]')!.clientWidth / buttons[0]!.offsetWidth))
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key]
  if (!step) return
  event.preventDefault()
  buttons[Math.min(buttons.length - 1, Math.max(0, index + step))]?.focus()
}

defineExpose({ open, close })
const hours = (code: ScheduleShiftCode) => cellHours(code)
</script>

<template>
  <div
    ref="panel"
    popover="auto"
    role="dialog"
    :aria-label="`Vardiya seç: ${props.title}`"
    class="shift-picker m-0 rounded-card border border-cream-300 bg-white p-3 text-navy-950 shadow-card"
    data-testid="shift-picker"
    @toggle="onToggle"
    @keydown="onKeydown"
  >
    <div class="flex items-center justify-between gap-2 pb-2">
      <p class="truncate text-sm font-semibold">
        {{ title }}
      </p>
      <button
        type="button"
        class="grid size-9 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-cream-100 hover:text-navy-950 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
        aria-label="Kapat"
        @click="close"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        ><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <div
      class="grid grid-cols-2 gap-2"
      data-grid
    >
      <button
        v-for="code in codes"
        :key="code.id"
        type="button"
        data-code
        class="flex min-h-12 items-center gap-2 rounded-xl border-2 p-1.5 pr-2 text-left transition-colors focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
        :class="code.id === currentId ? 'border-navy-950 bg-cream-100' : 'border-transparent bg-cream-50 hover:bg-cream-100'"
        :aria-pressed="code.id === currentId"
        @click="pick(code.id)"
      >
        <span
          class="grid h-9 min-w-10 shrink-0 place-items-center rounded-lg px-1 text-sm font-bold uppercase"
          :style="{ backgroundColor: code.color, color: readableTextColor(code.color) }"
        >{{ code.code }}</span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-semibold">{{ code.label }}</span>
          <span
            v-if="hours(code)"
            class="truncate text-xs text-navy-500"
          >{{ hours(code) }}</span>
        </span>
      </button>
    </div>
    <button
      v-if="currentId"
      type="button"
      class="mt-2 flex min-h-touch w-full items-center justify-center gap-2 rounded-xl border border-cream-300 text-sm font-semibold text-navy-950 hover:bg-cream-100 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
      @click="pick(null)"
    >
      Hücreyi temizle
    </button>
  </div>
</template>

<style scoped>
/* Anchored under the cell; flips up or left near the screen edges. */
.shift-picker {
  inset: auto;
  position-anchor: --shift-cell;
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
  margin: 0.25rem;
  width: min(22rem, calc(100vw - 1rem));
}

/* Phones: bottom sheet above everything (top layer), clear of the home indicator. */
@media (max-width: 639px) {
  .shift-picker {
    position-area: none;
    inset: auto 0 0 0;
    width: 100%;
    max-width: none;
    margin: 0;
    border-radius: 1rem 1rem 0 0;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
    box-shadow: 0 -8px 32px rgb(10 22 40 / 0.18);
  }
}
</style>
