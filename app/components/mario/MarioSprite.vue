<template>
   <div class="mario-root pointer-events-none" :class="{ 'rm-static': reduceMotion }" :style="facingWrapStyle">
      <div class="mario-sheet" :style="sheetStyle" aria-hidden="true" />
   </div>
</template>

<script setup lang="ts">
/**
 * Спрайты: Kenney.nl «Spritesheets Characters», CC0.
 * Текстура spritesheet-characters-default.png, разрешение листа 902×902, ячейка 128×128 (координаты из TextureAtlas).
 */
const SPRITE_URL = '/sprites/spritesheet-characters-default.png';
const SHEET_W = 902;
const SHEET_H = 902;
const CELL = 128;

/** Зелёный персонаж — координаты SubTexture из атласа */
const SHEET_GREEN = {
   idle: { x: 0, y: 258 },
   jump: { x: 129, y: 258 },
   walk_a: { x: 258, y: 258 },
   walk_b: { x: 387, y: 258 },
   duck: { x: 516, y: 129 },
} as const;

/** Визуальный размер ~как раньше у dude (32×2.35 по ширине) */
const DISPLAY_SCALE = 0.56;

const props = defineProps<{
   pose: 'idle' | 'walk' | 'jump' | 'fall';
   facing: 1 | -1;
   reduceMotion?: boolean;
}>();

const reduceMotion = computed(() => props.reduceMotion ?? false);

const walkPhase = ref(0);
let walkInterval: ReturnType<typeof setInterval> | undefined;

watch(
   () => [props.pose, reduceMotion.value] as const,
   () => {
      if (walkInterval) {
         clearInterval(walkInterval);
         walkInterval = undefined;
      }
      if (!reduceMotion.value && props.pose === 'walk') {
         walkInterval = setInterval(() => {
            walkPhase.value = (walkPhase.value + 1) % 2;
         }, 95);
      } else {
         walkPhase.value = 0;
      }
   },
   { immediate: true },
);

onUnmounted(() => {
   if (walkInterval) clearInterval(walkInterval);
});

type Rect = { x: number; y: number };

const frameRect = computed((): Rect => {
   const S = SHEET_GREEN;
   if (reduceMotion.value) return S.idle;
   switch (props.pose) {
      case 'walk':
         return walkPhase.value === 0 ? S.walk_a : S.walk_b;
      case 'jump':
         return S.jump;
      case 'fall':
         return S.duck;
      default:
         return S.idle;
   }
});

const sheetStyle = computed(() => {
   const { x, y } = frameRect.value;
   const s = DISPLAY_SCALE;
   /* Без transform:scale у листа — иначе блок остаётся 128×128 в потоке и его режет overflow:hidden у .mario-layer */
   const w = CELL * s;
   return {
      width: `${w}px`,
      height: `${w}px`,
      backgroundImage: `url(${SPRITE_URL})`,
      backgroundSize: `${SHEET_W * s}px ${SHEET_H * s}px`,
      backgroundPosition: `${-x * s}px ${-y * s}px`,
      backgroundRepeat: 'no-repeat' as const,
      imageRendering: 'pixelated' as const,
   };
});

const facingWrapStyle = computed(() => ({
   transform: `scaleX(${props.facing})`,
   width: `${CELL * DISPLAY_SCALE}px`,
   height: `${CELL * DISPLAY_SCALE}px`,
}));
</script>

<style scoped>
.mario-root {
   position: relative;
   display: flex;
   align-items: flex-end;
   justify-content: center;
   flex-shrink: 0;
   overflow: visible;
}

.mario-sheet {
   image-rendering: crisp-edges;
}

.rm-static .mario-sheet {
   animation: none !important;
}
</style>
