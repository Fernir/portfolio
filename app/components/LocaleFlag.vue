<script setup lang="ts">
import type { LandingLocale } from '~/i18n/localeUi';

const props = withDefaults(
   defineProps<{
      locale: LandingLocale;
      size?: 'sm' | 'md';
   }>(),
   { size: 'md' },
);

/** Stable fragment for SVG ids (Safari: duplicate clipPath ids break when several GB icons mount). */
const idFrag = useId().replace(/[^\w-]/g, '');
const clipFull = `lf-gb-full-${idFrag}`;
const clipTri = `lf-gb-tri-${idFrag}`;
</script>

<template>
   <span
      class="locale-flag inline-flex shrink-0 overflow-hidden rounded-sm"
      :class="props.size === 'sm' ? 'locale-flag--sm' : 'locale-flag--md'"
      aria-hidden="true"
   >
      <!-- GB — Union Jack, geometric (readable at ~22×14px); clip ids scoped per instance -->
      <svg
         v-if="props.locale === 'en'"
         class="locale-flag__svg block h-full w-full"
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 60 30"
         preserveAspectRatio="xMidYMid slice"
         focusable="false"
      >
         <defs>
            <clipPath :id="clipFull">
               <path d="M0 0v30h60V0z" />
            </clipPath>
            <clipPath :id="clipTri">
               <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
            </clipPath>
         </defs>
         <g :clip-path="`url(#${clipFull})`">
            <path fill="#012169" d="M0 0v30h60V0z" />
            <path stroke="#fff" stroke-width="6" d="M0 0l60 30M60 0L0 30" />
            <path
               stroke="#c8102e"
               stroke-width="4"
               d="M0 0l60 30M60 0L0 30"
               :clip-path="`url(#${clipTri})`"
            />
            <path stroke="#fff" stroke-width="10" d="M30 0v30M0 15h60" />
            <path stroke="#c8102e" stroke-width="6" d="M30 0v30M0 15h60" />
         </g>
      </svg>

      <!-- DE -->
      <svg
         v-else-if="props.locale === 'de'"
         class="locale-flag__svg block h-full w-full"
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 9 6"
         preserveAspectRatio="none"
         focusable="false"
      >
         <path fill="#000" d="M0 0h9v2H0z" />
         <path fill="#dd0000" d="M0 2h9v2H0z" />
         <path fill="#ffce00" d="M0 4h9v2H0z" />
      </svg>

      <!-- FR -->
      <svg
         v-else-if="props.locale === 'fr'"
         class="locale-flag__svg block h-full w-full"
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 9 6"
         preserveAspectRatio="none"
         focusable="false"
      >
         <path fill="#0055a4" d="M0 0h3v6H0z" />
         <path fill="#fff" d="M3 0h3v6H3z" />
         <path fill="#ef4135" d="M6 0h3v6H6z" />
      </svg>

      <!-- RU -->
      <svg
         v-else-if="props.locale === 'ru'"
         class="locale-flag__svg block h-full w-full"
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 9 6"
         preserveAspectRatio="none"
         focusable="false"
      >
         <path fill="#fff" d="M0 0h9v2H0z" />
         <path fill="#0039a6" d="M0 2h9v2H0z" />
         <path fill="#d52b1e" d="M0 4h9v2H0z" />
      </svg>

      <!-- CN — simplified (red field + central star); reads clearly at small sizes -->
      <svg
         v-else-if="props.locale === 'zh'"
         class="locale-flag__svg block h-full w-full"
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 30 20"
         preserveAspectRatio="none"
         focusable="false"
      >
         <rect width="30" height="20" fill="#de2910" />
         <path
            fill="#ffde00"
            d="M7 5.2 8.6 9.4 13.2 9.8 9.6 12.6 11 17 7 14.3 3 17 4.4 12.6 .8 9.8 5.4 9.4z"
         />
         <path
            fill="#ffde00"
            d="M13 3.2l.45 1.35 1.42.02-1.13.82.43 1.33L13 5.8l-1.17.94.43-1.33-1.13-.82 1.42-.02z"
         />
         <path
            fill="#ffde00"
            d="M15.5 6.6l.38 1.15 1.2.02-.96.7.36 1.12-1-.76-.98.76.36-1.12-.96-.7 1.2-.02z"
         />
         <path
            fill="#ffde00"
            d="M15.5 11l.38 1.15 1.2.02-.96.7.36 1.12-1-.76-.98.76.36-1.12-.96-.7 1.2-.02z"
         />
         <path
            fill="#ffde00"
            d="M13 14l.45 1.35 1.42.02-1.13.82.43 1.33L13 15.6l-1.17.94.43-1.33-1.13-.82 1.42-.02z"
         />
      </svg>
   </span>
</template>

<style scoped>
.locale-flag {
   box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
}

.locale-flag--md {
   width: 22px;
   height: 14px;
}

.locale-flag--sm {
   width: 18px;
   height: 12px;
}

.locale-flag__svg {
   shape-rendering: geometricPrecision;
}
</style>
