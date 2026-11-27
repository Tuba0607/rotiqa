<script setup lang="ts">
import type { ScheduleHistoryEntry } from '#shared/types/schedule'

/** Saved change sets of the week, newest first (who, what, when). Read-only. */
const open = defineModel<boolean>('open', { default: false })
defineProps<{ entries: ScheduleHistoryEntry[] }>()

const time = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <UiDialog
    v-model:open="open"
    title="Değişiklik geçmişi"
    description="Bu haftanın kayıtlı değişiklikleri, en yenisi üstte. “Geri al” yalnızca sizin değişikliklerinizi geri alır."
  >
    <p
      v-if="!entries.length"
      class="text-sm text-navy-500"
    >
      Bu hafta için kayıtlı değişiklik yok.
    </p>
    <ol
      v-else
      class="flex flex-col divide-y divide-cream-200"
      data-testid="history-list"
    >
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="flex items-start justify-between gap-3 py-2.5"
      >
        <span class="flex min-w-0 flex-col">
          <span class="font-semibold">{{ CHANGE_KIND_LABELS[entry.kind] }} · {{ entry.cellCount }} hücre</span>
          <span class="truncate text-sm text-navy-500">{{ entry.actor?.name ?? 'Silinmiş kullanıcı' }} · {{ time.format(new Date(entry.createdAt)) }}</span>
        </span>
        <UiBadge
          v-if="entry.revertedById && (entry.kind === 'EDIT' || entry.kind === 'COPY_WEEK')"
          tone="neutral"
        >
          Geri alındı
        </UiBadge>
      </li>
    </ol>
  </UiDialog>
</template>
