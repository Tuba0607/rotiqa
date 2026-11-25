<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'İşletme ayarları · Rotiqa' })

interface Member { id: string, role: 'OWNER' | 'MANAGER', name: string, email: string, locations: { id: string, name: string }[] }

const { slug, data: overview, isOwner, refresh } = useOrganization()
const { data: members, error: membersError } = await useFetch<Member[]>(() => `/api/orgs/${slug.value}/members`, { immediate: isOwner.value })

const name = ref(overview.value?.organization.name ?? '')
const state = reactive({ saving: false, error: '', success: '' })

async function save() {
  state.error = ''
  state.success = ''
  state.saving = true
  try {
    await $fetch(`/api/orgs/${slug.value}`, { method: 'PATCH', body: { name: name.value } })
    await refresh()
    clearNuxtData('me:organizations')
    state.success = 'İşletme adı güncellendi.'
  }
  catch (e) {
    state.error = apiErrorMessage(e)
  }
  finally {
    state.saving = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <UiPageHeader title="İşletme ayarları" />

    <UiAlert
      v-if="!isOwner"
      variant="error"
    >
      İşletme ayarlarını yalnızca işletme sahibi değiştirebilir.
    </UiAlert>

    <template v-else>
      <UiCard>
        <form
          class="flex flex-col gap-4"
          novalidate
          @submit.prevent="save"
        >
          <h2 class="font-semibold">
            Genel
          </h2>
          <UiAlert
            v-if="state.error"
            variant="error"
          >
            {{ state.error }}
          </UiAlert>
          <UiAlert
            v-if="state.success"
            variant="success"
          >
            {{ state.success }}
          </UiAlert>
          <UiInput
            v-model="name"
            label="İşletme adı"
          />
          <p class="text-sm text-navy-500">
            Adres: <span class="font-mono text-navy-950">/app/{{ slug }}</span>
          </p>
          <UiButton
            type="submit"
            :loading="state.saving"
          >
            Kaydet
          </UiButton>
        </form>
      </UiCard>

      <NuxtLink
        :to="`/app/${slug}/davetler`"
        class="flex min-h-touch items-center justify-between rounded-card bg-white p-4 shadow-card"
      >
        <span>
          <span class="block font-semibold">Yönetici davetleri</span>
          <span class="text-sm text-navy-500">Şube yöneticilerini davet edin veya davetleri iptal edin.</span>
        </span>
        <span aria-hidden="true">→</span>
      </NuxtLink>

      <UiCard>
        <h2 class="font-semibold">
          Üyeler
        </h2>
        <UiAlert
          v-if="membersError"
          variant="error"
          class="mt-3"
        >
          {{ apiErrorMessage(membersError) }}
        </UiAlert>
        <ul
          v-else
          class="mt-3 flex flex-col divide-y divide-cream-200"
        >
          <li
            v-for="member in members"
            :key="member.id"
            class="flex flex-wrap items-center gap-2 py-3"
          >
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{ member.name }}</span>
              <span class="truncate text-xs text-navy-500">{{ member.email }}</span>
            </div>
            <UiBadge :tone="member.role === 'OWNER' ? 'success' : 'neutral'">
              {{ member.role === 'OWNER' ? 'Sahip' : `Yönetici · ${member.locations.map(l => l.name).join(', ') || 'şube yok'}` }}
            </UiBadge>
          </li>
        </ul>
      </UiCard>
    </template>
  </div>
</template>
