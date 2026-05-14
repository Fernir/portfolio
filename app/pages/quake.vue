<template>
   <div class="quake-page">
      <header class="quake-hud px-4 sm:px-5">
         <NuxtLink
            to="/"
            class="inline-flex h-10 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-sm font-semibold text-white no-underline hover:opacity-90"
            aria-label="Back to site"
         >
            <span aria-hidden="true" class="text-base leading-none">←</span>
            Site
         </NuxtLink>

         <div class="quake-hud__hint text-xs">Mouse lock · WASDC · Shift · Space · Esc · F4</div>
      </header>

      <ClientOnly>
         <QuakeCanvas :key="quakeCanvasKey" class="quake-canvas" />
      </ClientOnly>
   </div>
</template>

<script setup lang="ts">
import QuakeCanvas from '~/components/quake/QuakeCanvas.vue';

useHead({
   title: 'Web Quake',
   meta: [{ name: 'description', content: 'WebGL2 BSP viewer in the browser.' }],
});

const quakeCanvasKey = 'quake-canvas';
</script>

<style scoped>
.quake-page {
   position: fixed;
   inset: 0;
   overflow: hidden;
   background: #000;
}

.quake-canvas {
   position: absolute;
   inset: 0;
}

.quake-hud {
   position: absolute;
   inset-inline: 0;
   top: 0;
   z-index: 10;
   display: grid;
   grid-template-columns: auto minmax(0, 1fr);
   align-items: center;
   gap: 0.75rem 1rem;
   padding-top: max(0.75rem, env(safe-area-inset-top, 0px));
   padding-bottom: 0.75rem;
   pointer-events: none;
}

@media (max-width: 52rem) {
   .quake-hud {
      grid-template-columns: 1fr;
      justify-items: stretch;
   }

   .quake-hud__hint {
      order: 2;
   }
}

.quake-hud :deep(a),
.quake-hud :deep(button) {
   pointer-events: auto;
}

.quake-hud__hint {
   justify-self: end;
   color: rgba(255, 255, 255, 0.88);
   user-select: none;
   pointer-events: none;
   text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55);
}
</style>
