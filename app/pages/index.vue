<template>
   <div class="relative flex min-h-dvh flex-col font-sans text-ink antialiased">
      <LandingForestBackdrop />

      <div class="relative z-10 flex min-h-0 flex-1 flex-col">
         <LandingSiteHeader />

         <main class="min-h-0 w-full flex-1">
            <LandingHero />
            <LandingWorkSection :projects="projects" />
            <LandingExperimentSection />
         </main>

         <LandingSiteFooter />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { Project } from '~/data/site';
import { projectsCore } from '~/data/site';

const { locale, messages } = useLandingLocale();

const projects = computed<Project[]>(() =>
   projectsCore.map((core) => ({
      ...core,
      ...messages.value.projects[core.id],
   })),
);

watchEffect(() => {
   const m = messages.value;
   useHead({
      htmlAttrs: {
         lang: locale.value === 'zh' ? 'zh-Hans' : locale.value,
      },
      title: m.siteMeta.title,
      meta: [{ name: 'description', content: m.siteMeta.description }],
   });
});
</script>
