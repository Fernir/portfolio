<script setup lang="ts">
import { useLandingLocale } from '../composables/useLandingLocale';
import { joinPublicAsset } from '~/utils/publicAsset';

/** Луп `public/audio/forest/ambient.mp3`; автозапуск зависит от политики браузера. */
const AUDIO_SRC = joinPublicAsset(
   useRuntimeConfig().app.baseURL || '/',
   '/audio/forest/ambient.mp3',
);
const STORAGE_KEY = 'port-forest-ambient';
const VOLUME = 0.38;

const { messages } = useLandingLocale();

const enabled = useState<boolean>('forest-ambient-enabled', () => true);
const audioRef = ref<HTMLAudioElement | null>(null);
const loadFailed = ref(false);

let initialized = false;

function noTransientActivation(): boolean {
   const ua = (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation;
   return ua ? !ua.isActive : true;
}

function persist() {
   if (!import.meta.client) return;
   try {
      localStorage.setItem(STORAGE_KEY, enabled.value ? '1' : '0');
   } catch {
      /* ignore */
   }
}

function pauseTrack(el: HTMLAudioElement) {
   el.muted = false;
   el.pause();
   try {
      el.currentTime = 0;
   } catch {
      /* ignore */
   }
}

function armAudio(el: HTMLAudioElement) {
   el.loop = true;
   el.volume = VOLUME;
}

/** Без недавнего жеста: muted play → снять mute после старта */
function tryMutedColdStart(el: HTMLAudioElement) {
   armAudio(el);

   if (!el.paused && !el.muted) return;
   if (!el.paused && el.muted) {
      el.muted = false;
      return;
   }

   el.muted = true;
   let done = false;

   const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('playing', onPlaying);
      el.muted = false;
      el.volume = VOLUME;
   };

   const onPlaying = () => finish();

   el.addEventListener('playing', onPlaying);

   const p = el.play();
   if (p === undefined) {
      el.removeEventListener('playing', onPlaying);
      return;
   }

   p.then(() => {
      if (!done && !el.paused) finish();
   }).catch(() => {
      el.removeEventListener('playing', onPlaying);
      el.muted = false;
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) tryPlayAudible(el);
   });
}

/** После жеста: сразу audible play(), при отказе — muted fallback */
function tryPlayAudible(el: HTMLAudioElement) {
   armAudio(el);
   el.muted = false;

   const first = el.play();
   if (first === undefined) return;

   first.catch(() => {
      const wasMuted = el.muted;
      el.muted = true;
      const second = el.play();
      if (second === undefined) {
         el.muted = wasMuted;
         return;
      }
      second
         .then(() => {
            el.muted = wasMuted;
            el.volume = VOLUME;
         })
         .catch(() => {
            el.muted = wasMuted;
         });
   });
}

function syncPlayback() {
   const el = audioRef.value;
   if (!el || !import.meta.client) return;

   if (!initialized) {
      initialized = true;
      if (!enabled.value || loadFailed.value) {
         pauseTrack(el);
         return;
      }
   }

   if (enabled.value && !loadFailed.value) {
      if (noTransientActivation()) tryMutedColdStart(el);
      else tryPlayAudible(el);
   } else {
      pauseTrack(el);
   }
}

function onReadyForPlayback() {
   const el = audioRef.value;
   if (!el || !enabled.value || loadFailed.value) return;
   if (el.paused) syncPlayback();
}

function onAudioError() {
   loadFailed.value = true;
}

function onAmbientButtonClick() {
   const el = audioRef.value;
   if (!enabled.value) {
      enabled.value = true;
      return;
   }
   if (el && !loadFailed.value && el.paused) {
      syncPlayback();
      return;
   }
   enabled.value = false;
}

watch(
   enabled,
   () => {
      persist();
      syncPlayback();
   },
   { flush: 'sync' },
);

function onVisibilityChange() {
   const el = audioRef.value;
   if (!el || !import.meta.client) return;
   if (document.hidden) {
      el.pause();
      return;
   }
   if (enabled.value) syncPlayback();
}

function onPageShow() {
   if (enabled.value && !loadFailed.value) syncPlayback();
}

onMounted(() => {
   if (!import.meta.client) return;
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === '0') enabled.value = false;
      else if (raw === '1') enabled.value = true;
   } catch {
      /* ignore */
   }
   document.addEventListener('visibilitychange', onVisibilityChange);
   window.addEventListener('pageshow', onPageShow);
   nextTick(syncPlayback);
});

onBeforeUnmount(() => {
   if (!import.meta.client) return;
   document.removeEventListener('visibilitychange', onVisibilityChange);
   window.removeEventListener('pageshow', onPageShow);
   audioRef.value?.pause();
});

const titleAttr = computed(() => {
   if (loadFailed.value) return messages.value.nav.forestAmbientUnavailable;
   return enabled.value ? messages.value.nav.forestAmbientPause : messages.value.nav.forestAmbientPlay;
});
</script>

<template>
   <audio
      ref="audioRef"
      class="forest-ambient-audio"
      :src="AUDIO_SRC"
      :preload="enabled && !loadFailed ? 'auto' : 'none'"
      playsinline
      @canplay="onReadyForPlayback"
      @loadeddata="onReadyForPlayback"
      @error="onAudioError"
   />
   <button
      type="button"
      class="forest-ambient-btn relative z-50 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink hover:opacity-90 sm:h-9 sm:w-9"
      :class="{ 'opacity-55': loadFailed }"
      :aria-pressed="enabled && !loadFailed"
      :aria-label="
         loadFailed ? messages.nav.forestAmbientUnavailable : enabled ? messages.nav.forestAmbientPause : messages.nav.forestAmbientPlay
      "
      :title="titleAttr"
      @click="onAmbientButtonClick"
   >
      <svg
         v-if="enabled && !loadFailed"
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round"
         class="forest-ambient-icon"
         aria-hidden="true"
      >
         <path d="M11 5 6 9H2v6h4l5 4V5z" />
         <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
         <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
      <svg
         v-else
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round"
         class="forest-ambient-icon"
         aria-hidden="true"
      >
         <path d="M11 5 6 9H2v6h4l5 4V5z" />
         <line x1="22" x2="16" y1="9" y2="15" />
         <line x1="16" x2="22" y1="9" y2="15" />
      </svg>
   </button>
</template>

<style scoped>
.forest-ambient-audio {
   position: absolute;
   width: 1px;
   height: 1px;
   padding: 0;
   margin: -1px;
   overflow: hidden;
   clip: rect(0, 0, 0, 0);
   white-space: nowrap;
   border: 0;
}

.forest-ambient-icon {
   width: 1.15rem;
   height: 1.15rem;
}

@media (min-width: 640px) {
   .forest-ambient-icon {
      width: 1.05rem;
      height: 1.05rem;
   }
}
</style>
