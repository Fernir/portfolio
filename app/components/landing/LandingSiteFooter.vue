<template>
   <footer id="contact" class="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-5 text-center sm:px-5 sm:pt-6">
      <div class="relative z-10 mx-auto max-w-6xl">
         <p v-if="contactLead" class="mx-auto mb-2 max-w-md text-sm text-ink-muted sm:mb-2.5">
            {{ contactLead }}
         </p>
         <nav class="flex flex-col items-center gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-2 sm:gap-y-1" :aria-label="messages.nav.contactFooterAria">
            <a
               :href="`mailto:${contactCredentials.email}`"
               class="inline-flex max-w-full min-h-9 break-all items-center justify-center rounded px-3 py-1.5 text-center font-medium text-white no-underline hover:opacity-90 sm:min-h-0 sm:break-normal sm:px-3 sm:py-1.5"
               >{{ contactCredentials.email }}</a
            >
            <span class="hidden text-ink-muted opacity-50 sm:mx-1.5 sm:inline" aria-hidden="true">·</span>
            <a
               :href="contactCredentials.telegramUrl"
               class="inline-flex min-h-9 items-center justify-center rounded px-3 py-1.5 font-medium text-white/85 no-underline hover:text-white sm:min-h-0 sm:px-2.5 sm:py-1.5"
               target="_blank"
               rel="noopener noreferrer"
               >{{ messages.contact.telegramLabel }}</a
            >
         </nav>
      </div>
   </footer>
</template>

<script setup lang="ts">
import { contactCredentials } from '~/data/site';
import { stripAsteriskFootnotes } from '~/utils/stripFootnoteMarkers';

const { messages } = useLandingLocale();

const contactLead = computed(() => stripAsteriskFootnotes(messages.value.contact.lead).trim());
</script>
