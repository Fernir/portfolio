<template>
   <section class="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-5 sm:pb-8 sm:pt-8">
      <p class="mb-2 text-xs uppercase tracking-wider text-ink-muted sm:mb-3">
         {{ heroEyebrow }}
      </p>
      <h1 class="font-heading text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
         {{ heroLine1 }}
      </h1>
      <p class="mb-5 mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:mb-6 sm:text-base">
         {{ heroLead }}
      </p>
   </section>
</template>

<script setup lang="ts">
import { stripAsteriskFootnotes } from '~/utils/stripFootnoteMarkers';

const { messages } = useLandingLocale();

const heroEyebrow = computed(() => stripAsteriskFootnotes(messages.value.hero.eyebrow));
const heroLine1 = computed(() => stripAsteriskFootnotes(messages.value.hero.line1));
const heroLead = computed(() => stripAsteriskFootnotes(messages.value.hero.lead));
</script>
