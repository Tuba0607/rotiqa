<script setup lang="ts">
/**
 * Phone overflow menu ("⋯"): Geri al, İleri al, Geçmiş. A native popover opened by its
 * button (Esc and outside taps close it, focus returns to the button). Menu semantics:
 * arrow keys, Home and End move between the enabled items; disabled items are skipped.
 */
defineProps<{ canUndo: boolean, canRedo: boolean, undoBusy?: boolean, redoBusy?: boolean }>()
const emit = defineEmits<{ undo: [], redo: [], history: [] }>()

const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const menuId = 'schedule-more-menu'

const items = () => [...(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]

const trigger = ref<HTMLButtonElement | null>(null)
function onToggle(event: Event) {
  open.value = (event as ToggleEvent).newState === 'open'
  if (open.value) {
    nextTick(() => items()[0]?.focus())
    return
  }
  // Safari does not focus a tapped button, so the browser has nothing to return focus to.
  // Step in only when focus was lost (never pull it away from a dialog opened from the menu).
  const active = document.activeElement
  if (!active || active === document.body || menu.value?.contains(active)) trigger.value?.focus()
}
function onKeydown(event: KeyboardEvent) {
  const list = items()
  if (!list.length) return
  const index = list.indexOf(document.activeElement as HTMLButtonElement)
  const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key]
  if (next === undefined) return
  event.preventDefault()
  list[(next + list.length) % list.length]?.focus()
}
function choose(action: 'undo' | 'redo' | 'history') {
  menu.value?.hidePopover()
  if (action === 'undo') emit('undo')
  else if (action === 'redo') emit('redo')
  else emit('history')
}
const item = 'flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-navy-950 hover:bg-cream-100 focus:bg-cream-100 focus:outline-none disabled:pointer-events-none disabled:opacity-40'
</script>

<template>
  <div class="contents">
    <button
      ref="trigger"
      type="button"
      :popovertarget="menuId"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      aria-label="Diğer işlemler"
      class="more-trigger inline-flex min-h-touch min-w-touch items-center justify-center rounded-xl bg-white text-navy-950 shadow-card transition-colors hover:bg-cream-100 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        fill="currentColor"
        aria-hidden="true"
      ><circle
        cx="5"
        cy="12"
        r="1.8"
      /><circle
        cx="12"
        cy="12"
        r="1.8"
      /><circle
        cx="19"
        cy="12"
        r="1.8"
      /></svg>
    </button>
    <div
      :id="menuId"
      ref="menu"
      popover="auto"
      role="menu"
      aria-label="Diğer işlemler"
      class="more-menu m-0 w-52 rounded-xl border border-cream-300 bg-white p-1 shadow-card"
      @toggle="onToggle"
      @keydown="onKeydown"
    >
      <button
        type="button"
        role="menuitem"
        :class="item"
        :disabled="!canUndo"
        :aria-busy="undoBusy || undefined"
        @click="choose('undo')"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        ><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        Geri al
      </button>
      <button
        type="button"
        role="menuitem"
        :class="item"
        :disabled="!canRedo"
        :aria-busy="redoBusy || undefined"
        @click="choose('redo')"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        ><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
        İleri al
      </button>
      <button
        type="button"
        role="menuitem"
        :class="item"
        @click="choose('history')"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        ><circle
          cx="12"
          cy="12"
          r="8"
        /><path d="M12 8v4l2.5 2.5" /></svg>
        Geçmiş
      </button>
    </div>
  </div>
</template>

<style scoped>
.more-trigger {
  anchor-name: --schedule-more;
}
/* Under the button, right edges aligned; flips up when there is no room below. */
.more-menu {
  inset: auto;
  position-anchor: --schedule-more;
  position-area: block-end span-inline-start;
  position-try-fallbacks: flip-block;
  margin-block: 0.25rem;
}
</style>
