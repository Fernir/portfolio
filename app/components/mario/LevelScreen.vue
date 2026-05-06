<template>
   <!-- Ширина сегмента в flex-полосе мира; контент портфолио — в WorldPixiTiles -->
   <div class="level-screen relative z-mario-screen" :style="segmentBoxStyle" aria-hidden="true" />
</template>

<script setup lang="ts">
const props = defineProps<{
   screenIndex: number;
   segmentWidthPx: number;
}>();

const segmentBoxStyle = computed(() => {
   const w = props.segmentWidthPx;
   if (props.screenIndex === 0) {
      return {
         background: 'transparent',
         width: `${w}px`,
         minWidth: `${w}px`,
         flex: `0 0 ${w}px`,
         marginLeft: '0',
      };
   }
   const ww = w + 2;
   return {
      background: 'transparent',
      width: `${ww}px`,
      minWidth: `${ww}px`,
      flex: `0 0 ${ww}px`,
      marginLeft: '-2px',
   };
});
</script>

<style scoped>
.level-screen {
   position: relative;
   height: 100%;
   overflow: visible;
}
</style>
