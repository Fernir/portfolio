// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
   compatibilityDate: '2025-07-15',
   devtools: { enabled: process.env.NODE_ENV !== 'production' },
   modules: ['@nuxt/eslint', '@nuxtjs/tailwindcss'],
   /* Unbounded с кириллицей — локальные woff2, не зависит от Google и блокировок */
   css: [
      '@fontsource/unbounded/500.css',
      '@fontsource/unbounded/600.css',
      '@fontsource/unbounded/700.css',
      '@fontsource/unbounded/800.css',
      '~/assets/css/main.css',
   ],
   app: {
      head: {
         htmlAttrs: { lang: 'en' },
         meta: [{ name: 'format-detection', content: 'telephone=no' }],
         link: [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            {
               rel: 'preconnect',
               href: 'https://fonts.gstatic.com',
               crossorigin: '',
            },
            {
               rel: 'stylesheet',
               href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap',
            },
         ],
      },
   },
})
