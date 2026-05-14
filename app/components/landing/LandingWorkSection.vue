<template>
   <section :id="messages.sections.work.id" class="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-5 sm:pb-12 sm:pt-6">
      <h2 class="mb-3 font-heading text-xs font-medium uppercase tracking-wider text-ink-muted sm:mb-3.5">
         {{ stripAsteriskFootnotes(messages.sections.work.kicker) }}
      </h2>
      <div class="grid gap-3 sm:gap-4 md:grid-cols-2">
         <GlassCard v-for="p in projects" :key="p.title" class="flex h-full flex-col">
            <a
               :href="p.url"
               class="flex min-h-0 flex-1 flex-col text-inherit no-underline outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forest-deep"
               target="_blank"
               rel="noopener noreferrer"
               :aria-label="`${messages.aria.openSite} ${p.title}`"
            >
               <h3 class="mb-1.5 font-heading text-sm font-medium">{{ p.title }}</h3>
               <p class="m-0 flex-1 text-sm leading-snug text-ink-muted">{{ stripAsteriskFootnotes(p.desc) }}</p>
            </a>
         </GlassCard>
      </div>
   </section>
</template>

<script setup lang="ts">
import type { Project } from '~/data/site';
import { stripAsteriskFootnotes } from '~/utils/stripFootnoteMarkers';

defineProps<{
   projects: Project[];
}>();

const { messages } = useLandingLocale();
</script>
