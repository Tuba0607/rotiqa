<script setup lang="ts">
// Placeholder home for F0. The full landing page is built in F6.
</script>

<template>
  <main class="flex min-h-dvh flex-col bg-navy-950 text-white">
    <header class="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
      <AppLogo variant="light" />
      <span class="rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold text-accent-500">Geliştirme aşamasında</span>
    </header>

    <section class="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-5 pb-16">
      <h1 class="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        Ekibini planla, <span class="text-brand-500">zamanını kazan.</span>
      </h1>
      <p class="max-w-xl text-lg text-slate-300">
        Restoran, kafe, otel, mağaza ve klinikler için haftalık vardiya planlama.
        Planı telefonundan birkaç dakikada hazırla, WhatsApp grubuna tek dokunuşla gönder.
      </p>
      <div class="flex flex-wrap gap-3">
        <NuxtLink to="/design-system">
          <UiButton size="lg">
            Tasarım sistemini gör
          </UiButton>
        </NuxtLink>
      </div>
    </section>
  </main>
</template>
