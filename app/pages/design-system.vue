<script setup lang="ts">
import { DEFAULT_SHIFT_CODES } from '#shared/utils/shift-codes'

useSeoMeta({ title: 'Tasarım sistemi · Rotiqa', robots: 'noindex' })

const isDev = import.meta.dev
// Bound (not static) so the template compiler does not treat the API route as a module import.
const previewImageUrl = '/api/dev/schedule-image'

const palette = [
  { name: 'Navy', token: 'navy-950', hex: '#0A1628', class: 'bg-navy-950' },
  { name: 'Dark blue', token: 'navy-900', hex: '#13294B', class: 'bg-navy-900' },
  { name: 'Teal', token: 'brand-500', hex: '#14B8A6', class: 'bg-brand-500' },
  { name: 'Cream', token: 'cream-100', hex: '#F8F6F1', class: 'bg-cream-100' },
  { name: 'Amber', token: 'accent-500', hex: '#F59E0B', class: 'bg-accent-500' },
]

const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const preview = ['A', 'B', null, 'C', 'OFF', 'R', 'Y.İ']
const selectedIndex = ref<number | null>(null)

const shiftFor = (code: string | null) => DEFAULT_SHIFT_CODES.find(def => def.code === code) ?? null
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
        Renkler
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          v-for="color in palette"
          :key="color.token"
          class="overflow-hidden rounded-card bg-white shadow-card"
        >
          <div
            class="h-16 border-b border-cream-200"
            :class="color.class"
          />
          <div class="p-3 text-sm">
            <p class="font-semibold">
              {{ color.name }}
            </p>
            <p class="text-navy-500">
              {{ color.token }} · {{ color.hex }}
            </p>
          </div>
        </div>
      </div>
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

    <section class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">
        Vardiya hücreleri
      </h2>
      <div class="rounded-card bg-white p-3 shadow-card">
        <div class="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-navy-500">
          <span
            v-for="day in days"
            :key="day"
          >{{ day }}</span>
        </div>
        <div class="mt-2 grid grid-cols-7 gap-1.5">
          <UiShiftCell
            v-for="(code, index) in preview"
            :key="index"
            :shift="shiftFor(code)"
            :selected="selectedIndex === index"
            @select="selectedIndex = index"
          />
        </div>
      </div>
      <ul class="flex flex-wrap gap-2 text-sm">
        <li
          v-for="def in DEFAULT_SHIFT_CODES"
          :key="def.code"
          class="flex items-center gap-2 rounded-lg bg-white px-2 py-1 shadow-card"
        >
          <span
            class="rounded-md px-2 py-0.5 font-bold"
            :style="{ backgroundColor: def.color, color: def.textColor }"
          >{{ def.code }}</span>
          <span>{{ def.label }}</span>
        </li>
      </ul>
    </section>

    <section
      v-if="isDev"
      class="flex flex-col gap-4"
    >
      <h2 class="text-lg font-semibold">
        WhatsApp görseli (deneme)
      </h2>
      <img
        :src="previewImageUrl"
        alt="Örnek haftalık vardiya görseli"
        class="w-full rounded-card shadow-card"
      >
    </section>
  </main>
</template>
