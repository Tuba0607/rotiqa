<script setup lang="ts">
const orgPath = useOrgPath()
const { data: overview, isOwner, error } = useOrganization()
const route = useRoute()

const nav = computed(() => [
  { to: orgPath(), label: 'Pano', short: 'Pano', exact: true },
  { to: orgPath('/vardiya'), label: 'Vardiya', short: 'Vardiya' },
  { to: orgPath('/personel'), label: 'Personel', short: 'Personel' },
  // Owners reach departments from the settings page on phones (five tabs at most).
  { to: orgPath('/departmanlar'), label: 'Departmanlar', short: 'Departman', desktopOnly: isOwner.value },
  { to: orgPath('/subeler'), label: 'Şubeler', short: 'Şube' },
  ...(isOwner.value ? [{ to: orgPath('/davetler'), label: 'Davetler', short: 'Davet', desktopOnly: true }, { to: orgPath('/ayarlar'), label: 'Ayarlar', short: 'Ayarlar' }] : []),
])
// Phones get at most five tabs; invitations and (for owners) departments are linked from the settings page.
const mobileNav = computed(() => nav.value.filter(item => !item.desktopOnly))

const isActive = (item: { to: string, exact?: boolean }) => item.exact ? route.path === item.to : route.path.startsWith(item.to)
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-cream-100 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
    <header class="sticky top-0 z-20 bg-navy-950 text-white">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <NuxtLink
          to="/app"
          aria-label="Rotiqa"
          class="shrink-0"
        >
          <AppLogo variant="light" />
        </NuxtLink>
        <OrganizationSwitcher class="ml-1" />
        <nav
          class="ml-4 hidden gap-1 md:flex"
          aria-label="Ana menü"
        >
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            :class="isActive(item) ? 'bg-navy-900 text-brand-500' : 'text-white/80 hover:text-white'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <NuxtLink
          to="/hesap"
          class="ml-auto grid min-h-touch min-w-touch place-items-center rounded-xl text-sm font-semibold text-white/80 hover:text-white"
        >
          Hesabım
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <UiAlert
        v-if="error"
        variant="error"
      >
        {{ apiErrorMessage(error) }}
        <NuxtLink
          to="/app"
          class="ml-1 underline"
        >İşletmelerime dön</NuxtLink>
      </UiAlert>
      <UiSpinner v-else-if="!overview" />
      <slot v-else />
    </main>

    <UiToaster />

    <nav
      class="fixed inset-x-0 bottom-0 z-20 border-t border-cream-300 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Ana menü"
    >
      <ul class="flex">
        <li
          v-for="item in mobileNav"
          :key="item.to"
          class="flex-1"
        >
          <NuxtLink
            :to="item.to"
            class="flex min-h-14 items-center justify-center px-1 text-xs font-semibold"
            :class="isActive(item) ? 'text-brand-700' : 'text-navy-500'"
            :aria-current="isActive(item) ? 'page' : undefined"
          >
            {{ item.short }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
