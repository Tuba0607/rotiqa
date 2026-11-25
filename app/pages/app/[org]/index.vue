<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { data: overview, isOwner } = useOrganization()
const orgPath = useOrgPath()
useSeoMeta({ title: () => `${overview.value?.organization.name ?? 'Pano'} · Rotiqa` })

const steps = computed(() => (overview.value ? buildSetupSteps(overview.value.stats, isOwner.value) : []))
const completed = computed(() => steps.value.filter(step => step.done).length)
const allDone = computed(() => steps.value.length > 0 && completed.value === steps.value.length)
</script>

<template>
  <div
    v-if="overview"
    class="flex flex-col gap-6"
  >
    <UiPageHeader
      :title="overview.organization.name"
      :description="ROLE_LABELS[overview.role]"
    />

    <div class="grid grid-cols-3 gap-2 sm:gap-3">
      <NuxtLink
        :to="orgPath('/personel')"
        class="flex flex-col justify-between gap-1 rounded-card bg-white p-3 shadow-card transition-shadow hover:shadow-md sm:p-4"
      >
        <p class="text-xs text-navy-500 sm:text-sm">Aktif personel</p>
        <p class="text-2xl font-bold sm:text-3xl">{{ overview.stats.activeEmployees }}</p>
      </NuxtLink>
      <NuxtLink
        :to="orgPath('/departmanlar')"
        class="flex flex-col justify-between gap-1 rounded-card bg-white p-3 shadow-card transition-shadow hover:shadow-md sm:p-4"
      >
        <p class="text-xs text-navy-500 sm:text-sm">Departman</p>
        <p class="text-2xl font-bold sm:text-3xl">{{ overview.stats.departments }}</p>
      </NuxtLink>
      <NuxtLink
        :to="orgPath('/subeler')"
        class="flex flex-col justify-between gap-1 rounded-card bg-white p-3 shadow-card transition-shadow hover:shadow-md sm:p-4"
      >
        <p class="text-xs text-navy-500 sm:text-sm">{{ isOwner ? 'Şube' : 'Yetkili şube' }}</p>
        <p class="text-2xl font-bold sm:text-3xl">{{ overview.stats.locations }}</p>
      </NuxtLink>
    </div>

    <UiCard v-if="allDone">
      <div
        class="flex items-center gap-3"
        data-testid="setup-complete"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          ><path d="m5 12 5 5L20 7" /></svg>
        </span>
        <div>
          <h2 class="font-semibold">
            Kurulum tamamlandı
          </h2>
          <p class="text-sm text-navy-500">
            Haftalık vardiya planı yakında bu panelde olacak.
          </p>
        </div>
      </div>
    </UiCard>

    <UiCard v-else>
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="font-semibold">
          Sonraki adımlar
        </h2>
        <span class="text-sm text-navy-500">{{ completed }}/{{ steps.length }} tamamlandı</span>
      </div>
      <ol
        class="mt-3 flex flex-col divide-y divide-cream-200"
        data-testid="setup-steps"
      >
        <li
          v-for="step in steps"
          :key="step.key"
          class="flex min-h-touch items-center gap-3 py-2"
          :data-step="step.key"
          :data-done="step.done"
        >
          <span
            class="grid size-7 shrink-0 place-items-center rounded-full border-2"
            :class="step.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-cream-300 text-transparent'"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            ><path d="m5 12 5 5L20 7" /></svg>
          </span>
          <span
            class="flex-1 text-sm"
            :class="step.done ? 'text-navy-500' : 'font-semibold text-navy-950'"
          >
            {{ step.label }}
            <span class="sr-only">{{ step.done ? '(tamamlandı)' : '(bekliyor)' }}</span>
          </span>
          <span
            v-if="step.done"
            class="text-sm text-navy-500"
          >{{ step.doneLabel }}</span>
          <UiButton
            v-else
            variant="ghost"
            :to="orgPath(step.path)"
          >
            {{ step.action }}
          </UiButton>
        </li>
      </ol>
      <p class="mt-3 text-sm text-navy-500">
        Haftalık vardiya planı yakında.
      </p>
    </UiCard>
  </div>
</template>
