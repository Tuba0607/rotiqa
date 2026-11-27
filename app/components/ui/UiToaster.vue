<script setup lang="ts">
/**
 * Toast stack. Fixed to the viewport (top right on larger screens, above the bottom tab bar on
 * phones, clear of the safe areas), so it never shifts the page. Success/info toasts use
 * role="status", errors role="alert". The auto-close timer pauses while a mouse actually moves
 * over a toast or it holds keyboard focus; a toast that merely appears under a resting pointer
 * or finger (touch screens report "hover" after a tap) still closes.
 */
const { toasts, dismiss, pause, resume } = useToasts()

const tones = {
  success: { box: 'border-brand-100 bg-white text-navy-950', icon: 'bg-brand-100 text-brand-700' },
  info: { box: 'border-cream-300 bg-white text-navy-950', icon: 'bg-cream-200 text-navy-900' },
  error: { box: 'border-red-200 bg-red-50 text-red-800', icon: 'bg-red-100 text-red-800' },
} as const
</script>

<template>
  <section
    aria-label="Bildirimler"
    class="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-50 flex flex-col-reverse gap-2 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:top-[calc(env(safe-area-inset-top)+4.25rem)] md:bottom-auto md:left-auto md:w-96 md:flex-col"
  >
    <TransitionGroup
      enter-from-class="opacity-0 translate-y-2 md:-translate-y-2"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200 motion-reduce:transition-none"
      leave-active-class="transition duration-150 motion-reduce:transition-none"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :role="toast.tone === 'error' ? 'alert' : 'status'"
        class="pointer-events-auto flex items-start gap-3 rounded-xl border p-3 text-sm shadow-card"
        :class="tones[toast.tone].box"
        data-testid="toast"
        :data-tone="toast.tone"
        @pointermove="$event.pointerType === 'mouse' && pause(toast.id)"
        @pointerleave="resume(toast.id)"
        @focusin="pause(toast.id)"
        @focusout="resume(toast.id)"
      >
        <span
          class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
          :class="tones[toast.tone].icon"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              v-if="toast.tone === 'success'"
              d="m5 12 5 5L20 7"
            />
            <path
              v-else-if="toast.tone === 'error'"
              d="M12 7v6M12 17h.01"
            />
            <path
              v-else
              d="M12 11v6M12 7h.01"
            />
          </svg>
        </span>
        <p class="min-w-0 flex-1 font-medium">
          {{ toast.text }}<span
            v-if="toast.count > 1"
            class="ml-1 font-semibold opacity-70"
          >×{{ toast.count }}</span>
        </p>
        <button
          v-if="toast.action"
          type="button"
          class="-my-1 min-h-9 shrink-0 rounded-lg px-2 font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
          @click="toast.action.run(); dismiss(toast.id)"
        >
          {{ toast.action.label }}
        </button>
        <button
          type="button"
          class="-my-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
          aria-label="Bildirimi kapat"
          @click="dismiss(toast.id)"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          ><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </TransitionGroup>
  </section>
</template>
