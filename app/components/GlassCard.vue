<template>
  <article class="surface-card" :style="cardStyle">
    <div class="glass-card__inner">
      <slot />
    </div>
  </article>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    padding?: string
  }>(),
  { padding: '1.5rem 1.75rem' },
)

const cardStyle = computed(() => ({
  padding: props.padding,
}))
</script>

<style scoped>
.glass-card__inner {
  position: relative;
  z-index: 1;
}
</style>
