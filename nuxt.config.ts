import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({

  modules: ['@nuxt/eslint', '@nuxt/fonts', '@pinia/nuxt', '@nuxt/test-utils/module'],

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'tr' },
      title: 'Rotiqa — Ekibini planla, zamanını kazan.',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Vardiyalı çalışan işletmeler için vardiya planlama, puantaj ve personel yönetimi.' },
        { name: 'theme-color', content: '#0A1628' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  // Authenticated areas render on the client; the landing page stays server-rendered.
  routeRules: {
    '/app/**': { ssr: false },
    '/giris': { ssr: false },
    '/kayit': { ssr: false },
    '/hesap': { ssr: false },
    '/baslangic': { ssr: false },
    '/davet/**': { ssr: false },
  },
  compatibilityDate: '2026-11-25',

  nitro: {
    // Native module: keep it out of the server bundle so the platform binary is resolved at runtime.
    externals: { external: ['@resvg/resvg-js'] },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
    // Type-check every test suite, not only the Nuxt component tests.
    nodeTsConfig: {
      include: ['../tests/unit/**/*', '../tests/integration/**/*', '../tests/e2e/**/*'],
    },
  },

  eslint: {
    config: { stylistic: true },
  },

  // Self-host Inter from the installed @fontsource package: no runtime requests to third-party font CDNs.
  fonts: {
    families: [{ name: 'Inter', provider: 'npm', weights: [400, 500, 600, 700] }],
  },
})
