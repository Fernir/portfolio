<template>
   <div class="relative min-h-screen font-sans text-ink antialiased">
      <!-- Background -->
      <div class="forest-canvas-host" aria-hidden="true">
         <ClientOnly>
            <ForestImmersion :light-forest="lightForest" />
         </ClientOnly>
         <div class="forest-shade forest-shade--dark" />
         <div class="forest-shade forest-shade--light" />
      </div>

      <div class="relative z-10">
         <header class="site-header">
            <nav
               class="site-header-nav mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 page-gutter py-3 sm:gap-x-4 sm:py-3.5"
               :aria-label="messages.nav.ariaMain"
            >
               <ul class="site-header-nav__links m-0 flex max-w-full grow list-none flex-wrap items-center gap-x-1 gap-y-2 p-0 sm:grow-0 sm:justify-start">
                  <li class="mr-1 flex items-center sm:mr-2">
                     <NuxtLink
                        to="/mario"
                        class="nav-icon-chip inline-flex h-10 w-10 items-center justify-center rounded-lg text-mario-red no-underline hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-accent focus-visible:ring-offset-2 ring-offset-bg-deep sm:h-9 sm:w-9"
                        :aria-label="messages.nav.marioAria"
                     >
                        <span class="sr-only">{{ messages.nav.marioSrOnly }}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="h-7 w-7" aria-hidden="true" focusable="false">
                           <path fill="#e52521" d="M8 10h16v6H8z" />
                           <path fill="#f2c09d" d="M10 16h12v8H10z" />
                           <path fill="#4a2818" d="M10 16h4v3h-4zm8 0h4v3h-4z" />
                           <path fill="#2244cc" d="M9 22h14v6H9z" />
                           <path fill="#f2c09d" d="M10 26h4v4h-4zm8 0h4v4h-4z" />
                        </svg>
                     </NuxtLink>
                  </li>
                  <li class="hidden text-ink-muted sm:flex sm:items-center" aria-hidden="true">
                     <span class="nav-menu-sep mx-2 inline-block w-px shrink-0 bg-current opacity-45" />
                  </li>
                  <li class="flex items-center">
                     <a href="#about" class="nav-link">{{ messages.nav.about }}</a>
                  </li>
                  <li class="hidden text-ink-muted sm:flex sm:items-center" aria-hidden="true">
                     <span class="nav-menu-sep mx-2 inline-block w-px shrink-0 bg-current opacity-45" />
                  </li>
                  <li class="flex items-center">
                     <a href="#skills" class="nav-link">{{ messages.nav.skills }}</a>
                  </li>
                  <li class="hidden text-ink-muted sm:flex sm:items-center" aria-hidden="true">
                     <span class="nav-menu-sep mx-2 inline-block w-px shrink-0 bg-current opacity-45" />
                  </li>
                  <li class="flex items-center">
                     <a href="#work" class="nav-link">{{ messages.nav.work }}</a>
                  </li>
                  <li class="ml-0 pl-1 sm:ml-3 sm:pl-0">
                     <a
                        href="#contact"
                        class="btn-glass btn-glass--nav nav-cta-link inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-1.5 font-semibold text-forest-accent no-underline sm:min-h-0"
                        >{{ messages.nav.contact }}</a
                     >
                  </li>
               </ul>
               <div class="site-header-nav__tools flex shrink-0 items-center gap-2 sm:gap-2.5 max-sm:w-full max-sm:justify-end">
                  <div ref="langDropdownRoot" class="relative z-nav-lang">
                        <button
                           type="button"
                           class="lang-dropdown-trigger btn-glass btn-glass--nav inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 hover:opacity-90 sm:h-9"
                           aria-haspopup="listbox"
                           :aria-expanded="langMenuOpen"
                           :aria-label="messages.nav.languageSwitcherAria"
                           @click="toggleLangMenu"
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
                              v-show="langMenuOpen"
                              role="listbox"
                              class="lang-dropdown-panel z-dropdown-menu absolute right-0 m-0 list-none p-1"
                              :aria-label="messages.nav.languageSwitcherAria"
                           >
                              <li v-for="opt in localeChoices" :key="opt.code" role="none" class="m-0 p-0">
                                 <button
                                    role="option"
                                    type="button"
                                    class="lang-dropdown-option flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
                                    :aria-selected="locale === opt.code"
                                    @click="selectLocale(opt.code)"
                                 >
                                    <LocaleFlag :locale="opt.code" />
                                    <span>{{ opt.nativeLabel }}</span>
                                 </button>
                              </li>
                           </ul>
                        </Transition>
                  </div>
                  <ForestAmbient />
                  <button
                        type="button"
                        class="theme-toggle-btn btn-glass btn-glass--nav relative z-nav-lang inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg hover:opacity-90 sm:h-9 sm:w-9"
                        :class="{ 'theme-toggle-btn--lit': lightForest }"
                        :aria-pressed="lightForest"
                        :aria-label="lightForest ? messages.theme.ariaDark : messages.theme.ariaLight"
                        :title="lightForest ? messages.theme.titleDark : messages.theme.titleLight"
                        @click="toggleLightForest"
                     >
                        <Transition mode="out-in" name="forest-theme-icon">
                           <svg
                              v-if="!lightForest"
                              key="sun"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              class="forest-theme-toggle-icon"
                              aria-hidden="true"
                           >
                              <circle cx="12" cy="12" r="4" />
                              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" />
                           </svg>
                           <svg
                              v-else
                              key="moon"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              class="forest-theme-toggle-icon"
                              aria-hidden="true"
                           >
                              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                           </svg>
                        </Transition>
                  </button>
               </div>
            </nav>
         </header>

         <main>
            <section class="portfolio-hero mx-auto max-w-6xl page-gutter pb-16 pt-8 sm:pb-24 sm:pt-12 md:pt-16">
               <p class="type-hero-eyebrow mb-3 reveal is-visible sm:mb-4">
                  {{ messages.hero.eyebrow }}
               </p>
               <h1 class="type-hero-title font-heading text-balance font-bold tracking-tight">
                  <span class="font-heading block reveal is-visible reveal-delay-1">{{ lightForest ? messages.hero.line1LightForest : messages.hero.line1 }}</span>
                  <span class="font-heading text-gradient block reveal is-visible reveal-delay-2">{{ lightForest ? messages.hero.line2LightForest : messages.hero.line2 }}</span>
               </h1>
               <p class="type-hero-lead mb-7 max-w-xl reveal is-visible reveal-delay-3 sm:mb-8">
                  {{ messages.hero.lead }}
               </p>
               <div class="hero-cta flex w-full max-w-md flex-col gap-3 reveal is-visible reveal-delay-4 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  <a
                     href="#work"
                     class="hero-cta-btn hero-cta-btn-text btn-glass btn-glass--cta inline-flex w-full items-center justify-center rounded-full px-6 py-3 font-semibold no-underline hover:-translate-y-0.5 sm:w-auto sm:px-7"
                     >{{ messages.cta.viewWork }}</a
                  >
                  <a
                     href="#contact"
                     class="hero-cta-btn hero-cta-btn-text btn-glass btn-glass--ghost inline-flex w-full items-center justify-center rounded-full px-6 py-3 font-semibold no-underline hover:-translate-y-0.5 sm:w-auto sm:px-7"
                     >{{ messages.cta.write }}</a
                  >
               </div>
            </section>

            <section :id="messages.sections.about.id" class="mx-auto max-w-6xl page-gutter py-12 reveal is-visible reveal-delay-1 sm:py-16">
               <div class="mb-6 sm:mb-8">
                  <span class="type-section-kicker mb-2 block text-forest-accent">{{ messages.sections.about.kicker }}</span>
                  <h2 class="type-section-heading font-heading font-semibold tracking-tight">{{ messages.sections.about.heading }}</h2>
               </div>
               <div class="grid gap-4 sm:gap-5 md:grid-cols-2">
                  <GlassCard v-for="c in messages.aboutCards" :key="c.title">
                     <h3 class="type-card-title font-heading mb-2.5 font-semibold tracking-tight">{{ c.title }}</h3>
                     <p class="type-card-body m-0 text-ink-muted">{{ c.body }}</p>
                  </GlassCard>
               </div>
            </section>

            <section :id="messages.sections.skills.id" class="mx-auto max-w-6xl page-gutter py-12 reveal is-visible reveal-delay-2 sm:py-16">
               <div class="mb-6 sm:mb-8">
                  <span class="type-section-kicker mb-2 block text-forest-accent">{{ messages.sections.skills.kicker }}</span>
                  <h2 class="type-section-heading font-heading font-semibold tracking-tight">{{ messages.sections.skills.heading }}</h2>
               </div>
               <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  <GlassCard v-for="s in messages.skillGroups" :key="s.title" padding="1.25rem 1.35rem">
                     <h3 class="type-skills-group-title mb-3 font-semibold uppercase text-forest-hot">{{ s.title }}</h3>
                     <ul class="type-skills-list m-0 list-none space-y-2.5 p-0 text-ink-muted">
                        <li v-for="item in s.items" :key="item" class="flex gap-2.5 leading-snug">
                           <span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-forest-accent opacity-75" aria-hidden="true" />
                           <span>{{ item }}</span>
                        </li>
                     </ul>
                  </GlassCard>
               </div>
            </section>

            <section :id="messages.sections.work.id" class="mx-auto max-w-6xl page-gutter pb-16 pt-12 reveal is-visible reveal-delay-1 sm:pb-20 sm:pt-16">
               <div class="mb-6 sm:mb-8">
                  <span class="type-section-kicker mb-2 block text-forest-accent">{{ messages.sections.work.kicker }}</span>
                  <h2 class="type-section-heading font-heading font-semibold tracking-tight">{{ messages.sections.work.heading }}</h2>
                  <p class="type-card-body mt-3 max-w-3xl text-ink-muted">{{ messages.sections.work.builtWith }}</p>
               </div>
               <div class="grid gap-4 sm:gap-5 md:grid-cols-2">
                  <GlassCard
                     v-for="p in projects"
                     :key="p.title"
                     padding="0"
                     class="project-card flex h-full flex-col overflow-hidden"
                  >
                     <a
                        :href="p.url"
                        class="project-card-link flex min-h-0 flex-1 flex-col text-inherit no-underline outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-accent focus-visible:ring-offset-2 ring-offset-bg-deep"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="`${messages.aria.openSite} ${p.title}`"
                     >
                        <div class="relative h-40 shrink-0 overflow-hidden rounded-t-card sm:h-36" :style="projectVisualStyle(p)">
                           <span class="project-stack-badge">{{ p.stack }}</span>
                        </div>
                        <div class="flex flex-1 flex-col px-4 pb-5 pt-4 sm:px-5 sm:pt-5">
                           <h3 class="type-project-title font-heading mb-2 font-semibold tracking-tight">{{ p.title }}</h3>
                           <p class="type-project-desc m-0 flex-1 text-ink-muted">{{ p.desc }}</p>
                        </div>
                     </a>
                  </GlassCard>
               </div>
            </section>
         </main>

         <footer id="contact" class="site-footer site-footer__safe-pad page-gutter pt-10 text-center sm:pt-12">
            <div class="mx-auto max-w-6xl">
               <p class="type-footer-lead mx-auto mb-4 max-w-md px-1 text-ink-muted">
                  {{ messages.contact.lead }}
               </p>
               <nav class="type-footer-nav flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-2 sm:gap-y-2" :aria-label="messages.nav.contactFooterAria">
                  <a
                     :href="`mailto:${contactCredentials.email}`"
                     class="inline-flex max-w-full min-h-11 break-all items-center justify-center rounded px-4 py-2 text-center font-medium text-forest-accent no-underline transition-colors hover:text-ink sm:min-h-0 sm:break-normal sm:py-2"
                     >{{ contactCredentials.email }}</a
                  >
                  <span class="footer-contact-sep hidden text-ink-muted sm:mx-2 sm:inline" aria-hidden="true">·</span>
                  <a
                     :href="contactCredentials.telegramUrl"
                     class="inline-flex min-h-11 items-center justify-center rounded px-4 py-2 font-medium text-ink-muted no-underline transition-colors hover:text-forest-accent sm:min-h-0 sm:px-3 sm:py-2"
                     target="_blank"
                     rel="noopener noreferrer"
                     >{{ messages.contact.telegramLabel }}</a
                  >
               </nav>
            </div>
         </footer>
      </div>
   </div>
</template>

<script setup lang="ts">
import type { Project } from '~/data/site';
import { contactCredentials, projectsCore } from '~/data/site';
import { localeChoices, type LandingLocale } from '~/i18n/localeUi';

const langMenuOpen = ref(false);
const langDropdownRoot = ref<HTMLElement | null>(null);

const { lightForest, toggleLightForest } = useLightForest();
const { locale, messages, setLocale } = useLandingLocale();

function selectLocale(code: LandingLocale) {
   setLocale(code);
   langMenuOpen.value = false;
}

function toggleLangMenu() {
   langMenuOpen.value = !langMenuOpen.value;
}

function closeLangMenuOutside(e: MouseEvent) {
   const root = langDropdownRoot.value;
   if (!root || !langMenuOpen.value) return;
   if (!root.contains(e.target as Node)) langMenuOpen.value = false;
}

onMounted(() => {
   document.addEventListener('click', closeLangMenuOutside);
});

onBeforeUnmount(() => {
   document.removeEventListener('click', closeLangMenuOutside);
});

const projects = computed<Project[]>(() =>
   projectsCore.map((core) => ({
      ...core,
      ...messages.value.projects[core.id],
   })),
);

watchEffect(() => {
   const m = messages.value;
   useHead({
      htmlAttrs: {
         lang: locale.value === 'zh' ? 'zh-Hans' : locale.value,
      },
      title: m.siteMeta.title,
      meta: [{ name: 'description', content: m.siteMeta.description }],
   });
});

function projectVisualStyle(p: Project) {
   const style: Record<string, string> = {};
   if (p.cover) {
      style.backgroundImage = `url(${p.cover})`;
      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
   }
   return style;
}
</script>

<style scoped>
.nav-menu-sep {
   height: 1.05em;
}

.lang-dropdown-panel {
   top: calc(100% + 6px);
   min-width: 12.5rem;
   border: 1px solid rgba(255, 255, 255, 0.14);
   background: rgba(8, 14, 11, 0.94);
   backdrop-filter: blur(14px);
   box-shadow: 0 14px 44px rgba(0, 0, 0, 0.38);
}

.lang-dropdown-option {
   color: rgba(238, 246, 240, 0.94);
}

.lang-dropdown-option:hover {
   background: rgba(255, 255, 255, 0.06);
}

.lang-dropdown-option[aria-selected='true'] {
   background: rgba(125, 207, 154, 0.2);
   color: rgba(252, 255, 252, 0.98);
}

.lang-dropdown-chevron {
   transition: transform 0.2s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
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

.forest-theme-icon-enter-active,
.forest-theme-icon-leave-active {
   transition:
      opacity 0.26s ease,
      transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

.forest-theme-icon-enter-from,
.forest-theme-icon-leave-to {
   opacity: 0;
   transform: scale(0.88);
}

@media (prefers-reduced-motion: reduce) {
   .forest-theme-icon-enter-active,
   .forest-theme-icon-leave-active {
      transition-duration: 0.01ms;
   }
}
</style>

<style>
/* Dropdown panel on light forest: readable contrast on pale chrome */
html.light-forest .lang-dropdown-panel {
   border-color: rgba(34, 110, 72, 0.26);
   background: rgba(252, 253, 252, 0.97);
   box-shadow: 0 14px 40px rgba(15, 48, 32, 0.14);
}

html.light-forest .lang-dropdown-option {
   color: rgba(15, 30, 22, 0.94);
}

html.light-forest .lang-dropdown-option:hover {
   background: rgba(34, 110, 72, 0.09);
}

html.light-forest .lang-dropdown-option[aria-selected='true'] {
   background: rgba(46, 140, 96, 0.16);
   color: rgba(7, 22, 14, 0.98);
}

html.light-forest .lang-dropdown-chevron {
   color: rgba(28, 52, 38, 0.72);
}
</style>
