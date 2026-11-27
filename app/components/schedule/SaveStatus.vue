<script setup lang="ts">
import type { SaveState } from '~/composables/useScheduleEditor'

/** Lasting autosave state (not a toast). `compact` is the small phone variant next to the stats. */
defineProps<{ state: SaveState, failedCount: number, compact?: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <p
    class="flex items-center gap-1.5 font-medium"
    :class="compact ? 'h-6 text-xs' : 'min-h-touch gap-2 text-sm'"
    role="status"
    data-testid="save-state"
  >
    <template v-if="state === 'saving'">
      <span
        class="animate-spin rounded-full border-2 border-cream-300 border-t-brand-600"
        :class="compact ? 'size-3' : 'size-4'"
        aria-hidden="true"
      />
      <span class="text-navy-500">Kaydediliyor…</span>
    </template>
    <template v-else-if="state === 'retrying'">
      <span
        class="size-2 rounded-full bg-accent-500"
        aria-hidden="true"
      />
      <span class="text-accent-700">{{ compact ? 'Yeniden deneniyor…' : 'Bağlantı sorunu, yeniden deneniyor…' }}</span>
    </template>
    <template v-else-if="state === 'failed'">
      <span
        class="size-2 rounded-full bg-red-600"
        aria-hidden="true"
      />
      <span class="text-red-800">Kaydedilemedi ({{ failedCount }} hücre)</span>
      <!-- 44px touch target without making the compact row taller. -->
      <button
        type="button"
        class="rounded-lg px-2 font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/40"
        :class="compact ? '-my-2.5 min-h-touch' : 'min-h-touch'"
        @click="$emit('retry')"
      >
        Tekrar dene
      </button>
    </template>
    <template v-else-if="state === 'saved'">
      <svg
        viewBox="0 0 24 24"
        class="text-brand-600"
        :class="compact ? 'size-3.5' : 'size-4'"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      ><path d="m5 12 5 5L20 7" /></svg>
      <span class="text-navy-500">Kaydedildi</span>
    </template>
    <!-- Nothing saved yet: the compact phone variant stays empty to keep the stats on one line. -->
    <span
      v-else-if="!compact"
      class="text-navy-500"
    >Değişiklikler otomatik kaydedilir.</span>
  </p>
</template>
