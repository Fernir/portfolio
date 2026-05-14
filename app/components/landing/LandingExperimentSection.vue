<template>
   <section :id="messages.sections.experiment.id" class="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-5 sm:pb-12 sm:pt-3">
      <h2 class="mb-3 font-heading text-xs font-medium uppercase tracking-wider text-ink-muted sm:mb-4">
         {{ stripAsteriskFootnotes(messages.sections.experiment.kicker) }}
      </h2>
      <NuxtLink
         to="/quake"
         class="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-ink no-underline hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forest-deep"
         :aria-label="messages.aria.webQuake"
      >
         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="h-5 w-5 shrink-0" aria-hidden="true" focusable="false">
            <path
               fill="currentColor"
               d="M16 3c7.18 0 13 5.82 13 13s-5.82 13-13 13S3 23.18 3 16 8.82 3 16 3zm0 2.6C10.26 5.6 5.6 10.26 5.6 16S10.26 26.4 16 26.4 26.4 21.74 26.4 16 21.74 5.6 16 5.6zm0 5.2c2.08 0 3.96.84 5.32 2.2a7.46 7.46 0 0 1 2.18 5.3c0 1.7-.56 3.27-1.52 4.54l2.12 2.12-1.84 1.84-2.12-2.12A7.44 7.44 0 0 1 16 23.46c-2.08 0-3.96-.84-5.32-2.2A7.46 7.46 0 0 1 8.5 16c0-2.08.84-3.96 2.2-5.32A7.46 7.46 0 0 1 16 8.8zm0 2.6c-1.36 0-2.58.55-3.47 1.43A4.86 4.86 0 0 0 11.1 16c0 1.36.55 2.58 1.43 3.47A4.86 4.86 0 0 0 16 20.9c1.36 0 2.58-.55 3.47-1.43A4.86 4.86 0 0 0 20.9 16c0-1.36-.55-2.58-1.43-3.47A4.86 4.86 0 0 0 16 11.4z"
            />
         </svg>
         {{ messages.sections.experiment.webQuake }}
      </NuxtLink>
   </section>
</template>

<script setup lang="ts">
import { stripAsteriskFootnotes } from '~/utils/stripFootnoteMarkers';

const { messages } = useLandingLocale();
</script>
