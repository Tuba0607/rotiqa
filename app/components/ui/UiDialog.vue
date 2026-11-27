<script setup lang="ts">
/**
 * Modal dialog on the native <dialog> element: focus is moved in and trapped, Esc and the
 * backdrop close it, and focus returns to the opener. A bottom sheet on phones.
 */
const open = defineModel<boolean>('open', { default: false })
defineProps<{ title: string, description?: string }>()

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()

watch(open, (value) => {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  if (!value && el.open) el.close()
}, { flush: 'post' })
onMounted(() => {
  if (open.value) dialog.value?.showModal()
})

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="ui-dialog m-0 mt-auto w-full max-w-none rounded-t-card bg-white p-0 text-navy-950 shadow-card backdrop:bg-navy-950/40 sm:m-auto sm:max-w-md sm:rounded-card"
    :aria-labelledby="titleId"
    @close="open = false"
    @click="onBackdrop"
  >
    <div class="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
      <header class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2
            :id="titleId"
            class="text-lg font-bold"
          >
            {{ title }}
          </h2>
          <p
            v-if="description"
            class="text-sm text-navy-500"
          >
            {{ description }}
          </p>
        </div>
        <button
          type="button"
          class="-mt-2 -mr-2 grid size-touch shrink-0 place-items-center rounded-xl text-navy-500 hover:bg-cream-100 hover:text-navy-950 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
          aria-label="Kapat"
          @click="open = false"
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
      </header>
      <slot />
    </div>
  </dialog>
</template>
