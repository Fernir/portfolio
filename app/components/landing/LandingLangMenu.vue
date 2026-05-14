<template>
   <div ref="root" class="relative z-50">
      <button
         type="button"
         class="lang-dropdown-trigger inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-ink hover:opacity-90 sm:h-9"
         aria-haspopup="listbox"
         :aria-expanded="open"
         :aria-label="messages.nav.languageSwitcherAria"
         @click="toggle"
      >
         <LocaleFlag :locale="locale" />
         <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lang-dropdown-chevron h-3.5 w-3.5 text-ink-muted opacity-80"
            aria-hidden="true"
         >
            <path d="m6 9 6 6 6-6" />
         </svg>
      </button>
      <Transition name="lang-dropdown">
         <ul
            v-show="open"
            role="listbox"
            class="lang-dropdown-panel absolute right-0 z-50 m-0 list-none p-1"
            :aria-label="messages.nav.languageSwitcherAria"
         >
            <li v-for="opt in localeChoices" :key="opt.code" role="none" class="m-0 p-0">
               <button
                  role="option"
                  type="button"
                  class="lang-dropdown-option flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
                  :aria-selected="locale === opt.code"
                  @click="select(opt.code)"
               >
                  <LocaleFlag :locale="opt.code" />
                  <span>{{ opt.nativeLabel }}</span>
               </button>
            </li>
         </ul>
      </Transition>
   </div>
</template>

<script setup lang="ts">
import { localeChoices, type LandingLocale } from '~/i18n/localeUi';

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const { locale, messages, setLocale } = useLandingLocale();

function select(code: LandingLocale) {
   setLocale(code);
   open.value = false;
}

function toggle() {
   open.value = !open.value;
}

function onDocClick(e: MouseEvent) {
   const el = root.value;
   if (!el || !open.value) return;
   if (!el.contains(e.target as Node)) open.value = false;
}

onMounted(() => {
   document.addEventListener('click', onDocClick);
});

onBeforeUnmount(() => {
   document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
.lang-dropdown-panel {
   top: calc(100% + 6px);
   min-width: 12.5rem;
   border: none;
   background: rgba(8, 14, 11, 0.94);
   backdrop-filter: blur(14px);
   box-shadow: 0 14px 44px rgba(0, 0, 0, 0.38);
}

.lang-dropdown-option {
   color: #ffffff;
}

.lang-dropdown-option:hover {
   background: transparent;
   color: #ffffff;
}

.lang-dropdown-option[aria-selected='true'] {
   background: transparent;
   color: #ffffff;
}

.lang-dropdown-chevron {
   transition: transform 0.2s ease-out;
}

.lang-dropdown-trigger[aria-expanded='true'] .lang-dropdown-chevron {
   transform: rotate(180deg);
}

.lang-dropdown-enter-active,
.lang-dropdown-leave-active {
   transition:
      opacity 0.18s ease,
      transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.lang-dropdown-enter-from,
.lang-dropdown-leave-to {
   opacity: 0;
   transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
   .lang-dropdown-enter-active,
   .lang-dropdown-leave-active {
      transition-duration: 0.01ms;
   }

   .lang-dropdown-chevron {
      transition-duration: 0.01ms;
   }
}
</style>
