<template>
   <div class="segment-clouds pointer-events-none">
      <div
         v-for="(c, i) in screen.cloudsExtra"
         :key="`far-${i}`"
         class="cloud-anchor"
         :style="cloudAnchorStyle(c, 'far')"
      >
         <div class="cloud cloud--far cloud-drift" :style="cloudInnerStyle(c)" />
      </div>
      <div
         v-for="(c, i) in screen.clouds"
         :key="`near-${i}`"
         class="cloud-anchor"
         :style="cloudAnchorStyle(c, 'near')"
      >
         <div class="cloud cloud--near cloud-drift" :style="cloudInnerStyle(c)" />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { MarioScreenData } from '~/data/marioScreens';

const props = defineProps<{
   screen: MarioScreenData;
   parallaxX: number;
}>();

function cloudAnchorStyle(c: MarioScreenData['clouds'][number], layer: 'far' | 'near') {
   const parallax = layer === 'far' ? props.parallaxX * -0.08 : props.parallaxX * -0.14;
   return {
      left: c.left,
      top: c.top,
      transform: `translateX(${parallax}px)`,
   };
}

function cloudInnerStyle(c: MarioScreenData['clouds'][number]) {
   const w = c.width;
   const driftPx = c.driftPx ?? 22;
   const dur = c.driftDurationSec ?? 22;
   return {
      width: `${w}px`,
      height: `${Math.round(w * 0.38)}px`,
      opacity: c.opacity ?? 0.9,
      '--drift': `${driftPx}px`,
      animationDuration: `${dur}s`,
   };
}
</script>

<style scoped>
.segment-clouds {
   position: absolute;
   inset: 0;
   overflow: visible;
}

.cloud-anchor {
   position: absolute;
   pointer-events: none;
}

.cloud {
   position: relative;
   border-radius: 999px;
   background: rgba(255, 255, 255, 0.92);
   box-shadow:
      22px 8px 0 -4px rgba(255, 255, 255, 0.85),
      -16px 10px 0 -5px rgba(255, 255, 255, 0.8);
   pointer-events: none;
}

.cloud-drift {
   animation: cloud-drift ease-in-out infinite;
}

@keyframes cloud-drift {
   0%,
   100% {
      transform: translateX(0);
   }
   50% {
      transform: translateX(var(--drift, 18px));
   }
}

.cloud--far {
   filter: blur(0.3px);
}

.cloud--near {
   filter: blur(0);
}

@media (prefers-reduced-motion: reduce) {
   .cloud-drift {
      animation: none !important;
   }
}
</style>
