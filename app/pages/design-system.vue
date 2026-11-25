<script setup lang="ts">
import { BRAND_COLORS, DEPARTMENT_COLORS, SHEET_COLORS } from '#shared/design/tokens'
import { readableTextColor } from '#shared/utils/color'
import { DEFAULT_SHIFT_CODES } from '#shared/utils/shift-codes'
import { formatDayHeader, weekDays } from '#shared/utils/week'

useSeoMeta({ title: 'Tasarım sistemi · Rotiqa', robots: 'noindex' })

const isDev = import.meta.dev
// Bound (not static) so the template compiler does not treat the API route as a module import.
const previewImageUrl = '/api/dev/schedule-image'

const brand = [
  { name: 'Navy', hex: BRAND_COLORS.navy },
  { name: 'Dark blue', hex: BRAND_COLORS.darkBlue },
  { name: 'Teal', hex: BRAND_COLORS.teal },
  { name: 'Cream', hex: BRAND_COLORS.cream },
  { name: 'Amber', hex: BRAND_COLORS.amber },
]

// Fictional preview rows. The real planner (F2) renders the same structure from data.
const departments = [
  { name: 'Salon', color: DEPARTMENT_COLORS[0] },
  { name: 'Mutfak', color: DEPARTMENT_COLORS[1] },
]
const rows = [
  { name: 'Deniz Akın', department: 0, codes: ['A', 'A', 'A', 'OFF', 'A', 'A', 'A'] },
  { name: 'Barış Çelik', department: 0, codes: ['B', 'B', 'B', 'B', 'OFF', 'B', 'B'] },
  { name: 'Tolga Er', department: 0, codes: ['R', 'R', 'C', 'C', 'C', 'OFF', 'C'] },
  { name: 'Göktuğ Öztürk', department: 1, codes: ['C', 'C', 'OFF', 'C', 'C', 'C', 'C'] },
  { name: 'Ilgın Er', department: 1, codes: ['Y.İ', 'Y.İ', 'A', 'A', 'A', 'A', null] },
]
const days = weekDays('2026-11-23').map((iso, index) => ({ iso, index, ...formatDayHeader(iso) }))
const selected = ref<string | null>(null)

const shiftFor = (code: string | null) => DEFAULT_SHIFT_CODES.find(def => def.code === code) ?? null
const upper = (text: string) => text.toLocaleUpperCase('tr-TR')
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-8 sm:px-6">
    <header class="flex items-center justify-between">
      <NuxtLink to="/">
        <AppLogo />
      </NuxtLink>
      <span class="text-sm text-navy-500">Tasarım sistemi</span>
    </header>

    <section class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">
        Marka renkleri
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          v-for="color in brand"
          :key="color.name"
          class="overflow-hidden rounded-card bg-white shadow-card"
        >
          <div
            class="h-14 border-b border-cream-200"
            :style="{ backgroundColor: color.hex }"
          />
          <div class="p-3 text-sm">
            <p class="font-semibold">
              {{ color.name }}
            </p>
            <p class="text-navy-500">
              {{ color.hex }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">
        Vardiya ve departman renkleri
      </h2>
      <ul class="flex flex-wrap gap-2 text-sm">
        <li
          v-for="def in DEFAULT_SHIFT_CODES"
          :key="def.code"
          class="flex items-center gap-2 rounded-lg bg-white py-1 pr-3 pl-1 shadow-card"
        >
          <span
            class="min-w-10 rounded px-2 py-1 text-center text-xs font-bold"
            :style="{ backgroundColor: def.color, color: def.textColor }"
          >{{ def.code }}</span>
          <span>{{ def.label }}</span>
        </li>
      </ul>
      <ul class="flex flex-wrap gap-2 text-sm">
        <li
          v-for="(color, index) in DEPARTMENT_COLORS"
          :key="color"
          class="rounded-lg px-3 py-1.5 text-xs font-bold"
          :style="{ backgroundColor: color, color: readableTextColor(color) }"
        >
          Departman {{ index + 1 }} · {{ color }}
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">
        Vardiya tablosu
      </h2>
      <div class="overflow-x-auto rounded-lg border-2 border-sheet-grid">
        <div class="grid min-w-[21rem] grid-cols-[minmax(5.5rem,1.6fr)_repeat(7,minmax(2.25rem,1fr))] gap-0.5 bg-sheet-grid">
          <div class="row-span-2 grid place-items-center bg-sheet-day px-1 text-center text-[11px] font-bold tracking-wider text-white">
            KASIM 2026
          </div>
          <div
            v-for="day in days"
            :key="day.iso"
            class="grid place-items-center py-1 text-base font-bold text-white sm:text-lg"
            :class="day.index >= 5 ? 'bg-sheet-weekend' : 'bg-sheet-day'"
          >
            {{ Number(day.iso.slice(8)) }}
          </div>
          <div
            v-for="day in days"
            :key="`${day.iso}-name`"
            class="grid place-items-center py-0.5 text-[11px] font-semibold"
            :class="day.index >= 5 ? 'bg-sheet-weekend text-white' : 'bg-sheet-weekday text-navy-950'"
          >
            {{ day.weekday }}
          </div>
          <template
            v-for="row in rows"
            :key="row.name"
          >
            <div
              class="flex min-w-0 items-center px-2 text-xs font-bold"
              :style="{ backgroundColor: departments[row.department]!.color, color: readableTextColor(departments[row.department]!.color) }"
              :title="row.name"
            >
              <span class="truncate">{{ upper(row.name) }}</span>
            </div>
            <UiShiftCell
              v-for="(code, index) in row.codes"
              :key="`${row.name}-${index}`"
              :shift="shiftFor(code)"
              :selected="selected === `${row.name}-${index}`"
              @select="selected = `${row.name}-${index}`"
            />
          </template>
        </div>
      </div>
      <p class="text-sm text-navy-500">
        Hücre renkleri ve departman renkleri işletme ayarlarından değiştirilebilir; metin rengi okunabilirliğe göre otomatik seçilir.
      </p>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">
        Butonlar
      </h2>
      <div class="flex flex-wrap gap-3">
        <UiButton>Yayınla ve Paylaş</UiButton>
        <UiButton variant="secondary">
          Önceki haftayı kopyala
        </UiButton>
        <UiButton variant="ghost">
          Geri al
        </UiButton>
        <UiButton disabled>
          Devre dışı
        </UiButton>
      </div>
    </section>

    <section
      v-if="isDev"
      class="flex flex-col gap-4"
    >
      <h2 class="text-lg font-semibold">
        WhatsApp görseli (prototip)
      </h2>
      <img
        :src="previewImageUrl"
        alt="Örnek haftalık vardiya görseli"
        class="w-full rounded-card shadow-card"
        :style="{ backgroundColor: SHEET_COLORS.frame }"
      >
    </section>
  </main>
</template>
