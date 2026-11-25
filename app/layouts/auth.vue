<template>
  <div class="flex min-h-dvh flex-col bg-cream-100">
    <header class="mx-auto w-full max-w-md px-5 pt-8">
      <NuxtLink
        to="/"
        aria-label="Rotiqa ana sayfa"
      >
        <AppLogo />
      </NuxtLink>
    </header>
    <main class="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
      <slot />
    </main>
  </div>
</template>
