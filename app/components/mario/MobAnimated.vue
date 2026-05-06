<template>
   <div
      class="mob-anim"
      :class="{ 'mob-anim--spin': isSpinActive }"
      :style="spinStyle"
   >
      <div
         class="mob-anim-inner"
         :class="{
            'mob-anim-inner--bob': bobActive,
            'mob-anim-inner--float': floatActive,
         }"
      >
         <div class="mob-anim-face" :style="faceFlipStyle">
            <div class="mob-anim-sheet" :style="sheetInnerStyle" aria-hidden="true" />
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import type { MonsterSpec } from '~/data/marioScreens';
import { MOB_ANIM } from '~/data/mobSprites';

const props = defineProps<{
   variant: MonsterSpec['type'];
   reduceMotion?: boolean;
   /** Секунды цикла блуждания из данных экрана — для поворота спрайта по направлению */
   wanderSec?: number;
   phaseSec?: number;
}>();

const cfg = computed(() => MOB_ANIM[props.variant]);

/** Чтобы синхронизировать разворот с mob-wander-x (первая половина цикла — движение вправо) */
const wanderClockMs = ref(0);
let wanderClockRaf = 0;
function wanderClockTick() {
   wanderClockMs.value = performance.now();
   wanderClockRaf = requestAnimationFrame(wanderClockTick);
}

const tick = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

const animating = computed(() => {
   if (props.reduceMotion) return false;
   const c = cfg.value;
   return c.kind === 'strip-h' || c.kind === 'grid' || c.kind === 'atlas';
});

watch(
   () => [animating.value, cfg.value] as const,
   () => {
      if (timer) {
         clearInterval(timer);
         timer = undefined;
      }
      if (!animating.value) return;
      const c = cfg.value;
      const fps =
         c.kind === 'strip-h' || c.kind === 'grid' || c.kind === 'atlas'
            ? c.fps
            : 8;
      timer = setInterval(() => {
         tick.value += 1;
      }, 1000 / fps);
   },
   { immediate: true },
);

onMounted(() => {
   wanderClockRaf = requestAnimationFrame(wanderClockTick);
});

onUnmounted(() => {
   if (timer) clearInterval(timer);
   cancelAnimationFrame(wanderClockRaf);
});

/** Атлас enemies-default: персонажи смотрят влево — при wander вправо отражаем по X */
const faceFlipStyle = computed(() => {
   const origin = 'bottom center' as const;
   const rm = props.reduceMotion ?? false;
   const ws = props.wanderSec;
   if (rm || ws == null || ws <= 0) {
      return { transform: 'scaleX(1)', transformOrigin: origin };
   }
   const tSec = wanderClockMs.value / 1000 - (props.phaseSec ?? 0);
   const p = ((tSec % ws) + ws) % ws;
   const u = p / ws;
   const movingRight = u < 0.5;
   return {
      transform: `scaleX(${movingRight ? -1 : 1})`,
      transformOrigin: origin,
   };
});

const bobActive = computed(() => props.variant === 'piranha' && !props.reduceMotion);

const floatActive = computed(
   () =>
      !props.reduceMotion &&
      ((cfg.value.kind === 'static' && cfg.value.fx === 'float') ||
         (cfg.value.kind === 'atlas' && cfg.value.fx === 'float')),
);

const isSpinActive = computed(
   () =>
      (cfg.value.kind === 'static-spin' || cfg.value.kind === 'atlas-spin') &&
      !props.reduceMotion,
);

const spinStyle = computed(() => {
   const c = cfg.value;
   if (
      (c.kind !== 'static-spin' && c.kind !== 'atlas-spin') ||
      props.reduceMotion
   ) {
      return {};
   }
   const dur = c.spinSec ?? 3;
   return { animationDuration: `${dur}s` };
});

const sheetInnerStyle = computed(() => {
   const c = cfg.value;
   const rm = props.reduceMotion;

   if (c.kind === 'atlas') {
      const fi = rm ? 0 : tick.value % c.frames.length;
      const fr = c.frames[fi]!;
      const s = c.scale;
      return {
         width: `${c.frameW * s}px`,
         height: `${c.frameH * s}px`,
         backgroundImage: `url(${c.sheet})`,
         backgroundSize: `${c.sheetPxW * s}px ${c.sheetPxH * s}px`,
         backgroundPosition: `${-fr.x * s}px ${-fr.y * s}px`,
         backgroundRepeat: 'no-repeat',
         imageRendering: 'pixelated' as const,
      };
   }

   if (c.kind === 'atlas-spin') {
      const sc = c.scale;
      const fr = c.frame;
      return {
         width: `${c.frameW * sc}px`,
         height: `${c.frameH * sc}px`,
         backgroundImage: `url(${c.sheet})`,
         backgroundSize: `${c.sheetPxW * sc}px ${c.sheetPxH * sc}px`,
         backgroundPosition: `${-fr.x * sc}px ${-fr.y * sc}px`,
         backgroundRepeat: 'no-repeat',
         transformOrigin: 'center center',
         imageRendering: 'pixelated' as const,
      };
   }

   if (c.kind === 'strip-h') {
      const fi = rm ? 0 : tick.value % c.frames;
      return {
         width: `${c.frameW}px`,
         height: `${c.frameH}px`,
         backgroundImage: `url(${c.sheet})`,
         backgroundSize: `${c.frameW * c.frames}px ${c.frameH}px`,
         backgroundPosition: `${-fi * c.frameW}px 0`,
         backgroundRepeat: 'no-repeat',
         transform: `scale(${c.scale})`,
         transformOrigin: 'bottom center',
         imageRendering: 'pixelated' as const,
      };
   }

   if (c.kind === 'grid') {
      const seq = c.sequence;
      const si = rm ? 0 : seq[tick.value % seq.length]!;
      const col = si % c.cols;
      const row = Math.floor(si / c.cols);
      return {
         width: `${c.frameW}px`,
         height: `${c.frameH}px`,
         backgroundImage: `url(${c.sheet})`,
         backgroundSize: `${c.sheetPxW}px ${c.sheetPxH}px`,
         backgroundPosition: `${-col * c.frameW}px ${-row * c.frameH}px`,
         backgroundRepeat: 'no-repeat',
         transform: `scale(${c.scale})`,
         transformOrigin: 'bottom center',
         imageRendering: 'pixelated' as const,
      };
   }

   if (c.kind === 'static') {
      return {
         width: `${c.frameW}px`,
         height: `${c.frameH}px`,
         backgroundImage: `url(${c.sheet})`,
         backgroundSize: `${c.frameW}px ${c.frameH}px`,
         backgroundPosition: '0 0',
         backgroundRepeat: 'no-repeat',
         transform: `scale(${c.scale})`,
         transformOrigin: 'bottom center',
         imageRendering: 'pixelated' as const,
      };
   }

   if (c.kind === 'static-spin') {
      const sc = c.scale;
      return {
         width: `${c.frameW * sc}px`,
         height: `${c.frameH * sc}px`,
         backgroundImage: `url(${c.sheet})`,
         backgroundSize: `${c.frameW * sc}px ${c.frameH * sc}px`,
         backgroundPosition: '0 0',
         backgroundRepeat: 'no-repeat',
         transformOrigin: 'center center',
         imageRendering: 'pixelated' as const,
      };
   }

   return {};
});
</script>

<style scoped>
.mob-anim {
   display: flex;
   align-items: flex-end;
   justify-content: center;
}

.mob-anim-inner {
   display: flex;
   align-items: flex-end;
   justify-content: center;
}

.mob-anim-face {
   display: flex;
   align-items: flex-end;
   justify-content: center;
}

.mob-anim-inner--bob {
   animation: mob-bob-y 1.85s ease-in-out infinite;
}

@keyframes mob-bob-y {
   0%,
   100% {
      transform: translateY(0);
   }
   45% {
      transform: translateY(-10px);
   }
}

.mob-anim-inner--float {
   animation: mob-float-hint 2.6s ease-in-out infinite;
}

@keyframes mob-float-hint {
   0%,
   100% {
      transform: translate(0, 0);
   }
   45% {
      transform: translate(-3px, -5px);
   }
   72% {
      transform: translate(2px, 3px);
   }
}

.mob-anim--spin .mob-anim-sheet {
   animation: mob-ufo-spin linear infinite;
}

@keyframes mob-ufo-spin {
   from {
      transform: rotate(0deg);
   }
   to {
      transform: rotate(360deg);
   }
}
</style>
