<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { data: overview, isOwner } = useOrganization()
const orgPath = useOrgPath()
useSeoMeta({ title: () => `${overview.value?.organization.name ?? 'Pano'} · Rotiqa` })
</script>

<template>
  <div
    v-if="overview"
    class="flex flex-col gap-6"
  >
    <UiPageHeader
      :title="overview.organization.name"
      :description="isOwner ? 'İşletme sahibi' : 'Şube yöneticisi'"
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

    <UiCard>
      <h2 class="font-semibold">
        Sonraki adımlar
      </h2>
      <ol class="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-navy-900">
        <li v-if="isOwner">
          <NuxtLink
            :to="orgPath('/departmanlar')"
            class="font-semibold text-brand-700 underline"
          >Departmanları</NuxtLink> oluşturun (Salon, Mutfak…).
        </li>
        <li>
          <NuxtLink
            :to="orgPath('/personel/yeni')"
            class="font-semibold text-brand-700 underline"
          >Personel ekleyin</NuxtLink>.
        </li>
        <li v-if="isOwner">
          Şube yöneticilerini <NuxtLink
            :to="orgPath('/davetler')"
            class="font-semibold text-brand-700 underline"
          >davet edin</NuxtLink>.
        </li>
        <li class="text-navy-500">
          Haftalık vardiya planı yakında.
        </li>
      </ol>
    </UiCard>
  </div>
</template>
