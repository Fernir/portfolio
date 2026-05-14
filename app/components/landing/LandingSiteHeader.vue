<template>
   <header class="bg-gradient-to-b from-black/50 to-transparent">
      <nav
         class="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-4 sm:px-5 sm:py-3.5"
         :aria-label="messages.nav.ariaMain"
      >
         <div class="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <LandingLangMenu />
            <ForestAmbient />
         </div>
      </nav>
   </header>
</template>

<script setup lang="ts">
const { messages } = useLandingLocale();
</script>
