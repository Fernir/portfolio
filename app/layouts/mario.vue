<template>
   <div
      class="mario-layout flex min-h-dvh flex-col bg-gradient-to-b from-mario-sky via-mario-sky to-mario-grassDark font-sans antialiased text-mario-pageInk"
   >
      <header
         class="fixed inset-x-0 top-0 z-50 flex shrink-0 items-center justify-between gap-3 border-b border-black/20 bg-mario-chrome px-4 py-3 text-mario-chromeFg shadow-mario-header-bar sm:px-5"
      >
         <NuxtLink
            to="/"
            class="mc-btn inline-flex items-center gap-2 rounded border-2 border-mario-btnBorder bg-mario-btnFace px-3 py-1.5 text-sm font-semibold text-mario-btnInk no-underline shadow-mario-btn transition-transform hover:-translate-y-px active:translate-y-0.5"
         >
            <span aria-hidden="true" class="text-base leading-none">←</span>
            Site
         </NuxtLink>
         <div />
         <span class="text-xs text-mario-chromeMuted">Wheel / swipe →</span>
      </header>
      <main class="relative flex min-h-0 flex-1 flex-col pt-14">
         <slot />
      </main>
   </div>
</template>

<style scoped>
.mc-btn:focus-visible {
   outline: 2px solid #f5d76e;
   outline-offset: 2px;
}
</style>
