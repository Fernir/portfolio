<template>
   <div
      class="mario-page flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-mario-sky via-mario-sky to-mario-grass"
   >

      <ClientOnly>
         <template #fallback>
            <div
               class="pointer-events-none fixed inset-x-0 bottom-0 top-14 z-40 bg-mario-sky"
               aria-hidden="true"
            />
         </template>
         <div
            v-if="level"
            class="mario-viewport pointer-events-none fixed inset-x-0 bottom-0 top-14 z-40 overflow-hidden bg-mario-sky"
         >
            <div class="mario-layer relative h-full w-full overflow-hidden">
               <div
                  class="world-strip relative flex h-full will-change-transform"
                  :style="worldStripStyle"
               >
                  <div
                     class="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
                     aria-hidden="true"
                     :style="{ background: level.worldSkyBackground }"
                  />
                  <WorldPixiTiles
                     :screens="level.screens"
                     :segment-width-px="level.segmentWidthPx"
                     :view-height-px="gameViewportH"
                     :collected-coin-ids="collectedCoinIds"
                     :reduce-motion="reduceMotion"
                     :parallax-shift="parallaxShift"
                     :mario-x-world="marioXWorld"
                     :mario-feet-y-from-bottom="feetY"
                     :mario-pose="marioPose"
                     :mario-facing="marioFacing"
                     :coin-popups="coinPopups"
                     :camera-px="cameraPx"
                     :viewport-width-px="vw"
                     :coins-collected="coinsCollected"
                     :coins-total="coinsTotal"
                     :scroll-pct="scrollPct"
                     @site-collision="onSiteCollision"
                  />
                  <LevelScreen
                     v-for="(screen, i) in level.screens"
                     :key="`${screen.zoneIndex}-${i}`"
                     :screen-index="i"
                     :segment-width-px="level.segmentWidthPx"
                  />
               </div>
            </div>
         </div>
      </ClientOnly>

      <article class="sr-only" :aria-label="landingEn.nav.portfolioArticleAria">
         <h1>{{ landingEn.hero.line1 }} — {{ landingEn.hero.line2 }}</h1>
         <p>{{ landingEn.hero.lead }}</p>
         <section>
            <h2>{{ landingEn.sections.about.heading }}</h2>
            <div v-for="c in landingEn.aboutCards" :key="c.title">
               <h3>{{ c.title }}</h3>
               <p>{{ c.body }}</p>
            </div>
         </section>
         <section>
            <h2>{{ landingEn.sections.skills.heading }}</h2>
            <div v-for="s in landingEn.skillGroups" :key="s.title">
               <h3>{{ s.title }}</h3>
               <ul>
                  <li v-for="item in s.items" :key="item">{{ item }}</li>
               </ul>
            </div>
         </section>
         <section>
            <h2>{{ landingEn.sections.work.heading }}</h2>
            <div v-for="p in marioPortfolioProjects" :key="p.id">
               <h3>{{ p.title }}</h3>
               <p>{{ p.desc }}</p>
               <a :href="p.url">{{ p.url }}</a>
            </div>
         </section>
         <p>
            {{ landingEn.contact.lead }}
            <a :href="`mailto:${contactCredentials.email}`">{{ contactCredentials.email }}</a>
            <a :href="contactCredentials.telegramUrl">{{ landingEn.contact.telegramLabel }}</a>
         </p>
      </article>
   </div>
</template>

<script setup lang="ts">
import LevelScreen from '~/components/mario/LevelScreen.vue';
import WorldPixiTiles from '~/components/mario/WorldPixiTiles.vue';
import { contactCredentials, projectsCore } from '~/data/site';
import { landingEn } from '~/i18n/landing';
import type { CollisionSurface, GeneratedLevel } from '~/utils/levelGen';
import { generateMarioLevel } from '~/utils/levelGen';
import { groundWalkSurfaceYFromBottomPx } from '~/utils/worldPixiVector';

const marioPortfolioProjects = projectsCore.map((p) => ({
   ...p,
   title: landingEn.projects[p.id].title,
   desc: landingEn.projects[p.id].desc,
}));

/** Совпадает с `top-14` игрового вьюпорта — высота под шапкой layout */
const MARIO_GAME_TOP_OFFSET_PX = 56;

/** Есть ли на этой опоре несобранная монета (по X/Y как в levelGen) */
function surfaceHasUncollectedCoin(
   surf: CollisionSurface,
   coinsWorld: GeneratedLevel['coinsWorld'],
   collected: readonly string[],
): boolean {
      const padX = 40;
   for (let i = 0; i < coinsWorld.length; i++) {
      const c = coinsWorld[i]!;
      if (collected.includes(c.id)) continue;
      if (c.xCenter < surf.x0 - padX || c.xCenter > surf.x1 + padX) continue;
      if (c.centerYFromBottom < surf.surfaceY - 16) continue;
      if (c.centerYFromBottom > surf.surfaceY + 290) continue;
      return true;
   }
   return false;
}

definePageMeta({
   layout: 'mario',
});

useHead({
   title: 'Block level',
   meta: [{ name: 'description', content: landingEn.siteMeta.description }],
});

const LEVEL_SEED = 42;

type Pose = 'idle' | 'walk' | 'jump' | 'fall';

const reduceMotion = ref(false);
const scrollPct = ref(0);
const marioFacing = ref<1 | -1>(1);
const marioPose = ref<Pose>('idle');
const level = shallowRef<GeneratedLevel | null>(null);

/** Коллизии верхушек сайтовых панелей (Pixi); сливаются с level.collision в физике */
const siteBlockCollision = shallowRef<CollisionSurface[]>([]);

function onSiteCollision(surfaces: CollisionSurface[]) {
   siteBlockCollision.value = surfaces;
}

function mergedCollision(): CollisionSurface[] {
   const lv = level.value;
   if (!lv) return [];
   return [...lv.collision, ...siteBlockCollision.value];
}

/** Собранные монеты (id из levelGen) */
const collectedCoinIds = ref<string[]>([]);

/** Всплывающие «+100» при сборе монеты (мировые координаты) */
const coinPopups = ref<{ uid: string; worldX: number; bottomPx: number }[]>([]);
let coinPopupSerial = 0;

const coinsTotal = computed(() => level.value?.coinsWorld.length ?? 0);
const coinsCollected = computed(() => collectedCoinIds.value.length);

const marioXWorld = ref(0);
/** Сглаженная цель по X — без резких переключений при монетах сзади (иначе дёрганье на месте) */
const smoothGoalXWorld = ref(0);
const feetY = ref(0);
const vy = ref(0);
const grounded = ref(true);

let physicsRaf = 0;
let lastPhysicsT = 0;
let hopCooldownMs = 0;
/** Виртуальный скролл: накопленная дистанция в px (вместо длинной страницы) */
let scrollAccumulator = 0;
/** Время последнего жеста скролла — автопрыжок только при намерении продвинуть уровень */
let lastScrollIntentAt = 0;

/** Удержание ←/→ — непрерывный виртуальный скролл */
let keysHeldLeft = false;
let keysHeldRight = false;
/** Одиночный прыжок по пробелу (обрабатывается в physicsLoop) */
let jumpQueued = false;

const vw = ref(375);
/** Высота области `.mario-viewport` / `.level-screen` (не полный innerHeight — проценты в CSS от этой высоты). */
const gameViewportH = ref(611);

const worldWidthPx = computed(() => {
   const n = level.value?.screens.length ?? 0;
   const seg = level.value?.segmentWidthPx ?? vw.value;
   return n * seg;
});

/** Цель по горизонтали — только виртуальный скролл (без возврата за монетами) */
const goalXWorld = computed(() => {
   const w = worldWidthPx.value;
   if (w <= 0) return 0;
   const margin = 48;
   const gx = margin + scrollPct.value * Math.max(0, w - 2 * margin);
   return Math.max(margin, Math.min(w - margin, gx));
});

const cameraPx = computed(() => {
   const w = worldWidthPx.value;
   const inner = vw.value;
   if (w <= 0 || inner <= 0) return 0;
   const raw = marioXWorld.value - 0.22 * inner;
   const maxCam = Math.max(0, w - inner);
   return Math.min(Math.max(raw, 0), maxCam);
});

const worldStripStyle = computed(() => {
   const n = level.value?.screens.length ?? 0;
   const seg = level.value?.segmentWidthPx ?? vw.value;
   return {
      width: `${n * seg}px`,
      transform: `translateX(${-cameraPx.value}px)`,
   };
});

const parallaxShift = computed(() => cameraPx.value * 0.06 + scrollPct.value * 80);

/** Линия стопы на «земле» — как в Pixi `createGroundStripGraphics` / levelGen */
function walkSurfaceYPx() {
   return groundWalkSurfaceYFromBottomPx(gameViewportH.value);
}

/** Длина «жеста» до конца уровня (~как раньше с длинным spacer), от высоты экрана */
function scrollRangePx() {
   if (import.meta.server) return 1;
   return Math.max(1, window.innerHeight * 28);
}

/** Привести wheel delta к пикселям (line/page режимы у мыши vs трекпада). */
function wheelDeltaToPixels(e: WheelEvent): number {
   let y = e.deltaY;
   if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      y *= 16;
   } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      y *= window.innerHeight;
   }
   return y;
}

/** Меньше — медленнее продвигается цель; инерция трекпада даёт серию больших deltaY. */
const WHEEL_SCROLL_SENS = 0.09;
/** Ограничение одного события (доля высоты окна), чтобы рывки не съедали уровень. */
const WHEEL_MAX_STEP_FRAC = 0.045;
const TOUCH_SCROLL_SENS = 0.38;

function syncVirtualScrollFromAccumulator() {
   const max = scrollRangePx();
   scrollAccumulator = Math.max(0, Math.min(max, scrollAccumulator));
   scrollPct.value = scrollAccumulator / max;
}

function rebuildLevel() {
   if (import.meta.server) return;
   vw.value = window.innerWidth;
   gameViewportH.value = Math.max(200, window.innerHeight - MARIO_GAME_TOP_OFFSET_PX);
   level.value = generateMarioLevel(LEVEL_SEED, vw.value, gameViewportH.value);
   siteBlockCollision.value = [];
   collectedCoinIds.value = [];
   coinPopups.value = [];
   const gy = walkSurfaceYPx();
   const seg = level.value.segmentWidthPx;
   marioXWorld.value = Math.min(220, seg * 0.06);
   feetY.value = gy;
   vy.value = 0;
   grounded.value = true;
   hopCooldownMs = 0;
   smoothGoalXWorld.value = goalXWorld.value;
}

function physicsLoop(t: number) {
   if (import.meta.server) {
      return;
   }
   if (!level.value) {
      physicsRaf = requestAnimationFrame(physicsLoop);
      return;
   }

   const dt = Math.min(0.033, Math.max(0.008, (t - lastPhysicsT) / 1000));
   lastPhysicsT = t;
   const now = performance.now();

   const srKb = scrollRangePx();
   /** Доля полного диапазона скролла в секунду при удержании ←/→ */
   const kbScrollPerSec = srKb * 0.08;
   if (keysHeldRight) {
      scrollAccumulator += kbScrollPerSec * dt;
      lastScrollIntentAt = now;
      syncVirtualScrollFromAccumulator();
   }
   if (keysHeldLeft) {
      scrollAccumulator -= kbScrollPerSec * dt;
      lastScrollIntentAt = now;
      syncVirtualScrollFromAccumulator();
   }

   const coll = mergedCollision();
   const gy = walkSurfaceYPx();
   const rawGoal = goalXWorld.value;
   {
      let s = smoothGoalXWorld.value;
      const err = rawGoal - s;
      const fastCatch =
         err < -28 || Math.abs(err) > Math.max(90, vw.value * 0.22);
      const alpha = fastCatch ? 52 : 26;
      if (Math.abs(err) > 200) {
         s = rawGoal;
      } else {
         s += err * Math.min(1, alpha * dt);
      }
      smoothGoalXWorld.value = s;
   }
   const goal = smoothGoalXWorld.value;
   /** Бег к цели скролла — без паузы между жестами трекпада (иначе кажется «очень медленно»). */
   const RUN = 580;
   /** Горизонтальный запас стопы над платформой — шире, чтобы приземление не промахивалось */
   const HALF = 30;

   const dx = goal - marioXWorld.value;
   const step = Math.sign(dx) * Math.min(RUN * dt, Math.abs(dx));

   const SCROLL_INTENT_MS = 720;
   const scrollIntentActive = now - lastScrollIntentAt < SCROLL_INTENT_MS;

   const maxX = Math.max(HALF, worldWidthPx.value - HALF);
   marioXWorld.value = Math.max(HALF, Math.min(maxX, marioXWorld.value + step));
   if (Math.abs(step) > 0.02) {
      marioFacing.value = step >= 0 ? 1 : -1;
   }

   hopCooldownMs = Math.max(0, hopCooldownMs - dt * 1000);

   const GRAVITY = 2800;
   const MAX_PLATFORM_JUMP_VY = 1420;
   /** Длинный прыжок через моба — выше потолок и можно подвинуть виртуальный скролл вперёд */
   const ENEMY_HOP_MAX_VY = 1820;
   const requiredVyForGap = (gap: number, tight = 1.09) =>
      Math.sqrt(Math.max(0, 2 * GRAVITY * gap)) * tight;

   const mx = marioXWorld.value;

   if (jumpQueued) {
      if (
         grounded.value &&
         hopCooldownMs <= 0 &&
         vy.value <= 95 &&
         vy.value >= -48
      ) {
         vy.value = Math.min(MAX_PLATFORM_JUMP_VY, 1380);
         grounded.value = false;
         hopCooldownMs = 380;
         lastScrollIntentAt = now;
      }
      jumpQueued = false;
   }

   /* Прыжок через моба: без скролла/цели — куда смотрит и идёт Марио */
   const canEnemyHop =
      grounded.value &&
      hopCooldownMs <= 0 &&
      vy.value <= 95 &&
      vy.value >= -48;

   if (canEnemyHop) {
      const toward = marioFacing.value;
      const mobs = level.value.monstersWorld;
      let hopMob: (typeof mobs)[0] | null = null;
      let hopAlong = Infinity;
      for (let mi = 0; mi < mobs.length; mi++) {
         const mob = mobs[mi]!;
         if (!mob.hopOver) continue;
         /** Только в упор: моб чуть впереди или слегка перекрывается по X */
         const along = (mob.xCenter - mx) * toward;
         if (along < -34 || along > 62) continue;
         /* Моб заметно выше или ниже по опоре — не перепрыгиваем */
         if (Math.abs(feetY.value - mob.feetYFromBottom) > 42) continue;
         const headY = mob.feetYFromBottom + mob.hitH;
         const needClear = headY - feetY.value + 64;
         if (needClear < 8 || needClear > 410) continue;
         const needVy = requiredVyForGap(needClear, 1.14);
         if (needVy > ENEMY_HOP_MAX_VY * 1.02) continue;
         /* Ближайший по лучу движения (вплоть до слегка перекрывающегося по X) */
         if (along < hopAlong) {
            hopAlong = along;
            hopMob = mob;
         }
      }
      if (hopMob) {
         const headY = hopMob.feetYFromBottom + hopMob.hitH;
         const needClear = headY - feetY.value + 64;
         const needVy = requiredVyForGap(needClear, 1.14);
         vy.value = Math.min(
            ENEMY_HOP_MAX_VY,
            Math.max(needVy, needVy * 1.05),
         );
         grounded.value = false;
         hopCooldownMs = 420;
         /* Подкрутка скролла только при движении вправо — иначе при ходьбе назад цель рвётся вперёд и кажется «отскок назад» */
         if (toward === 1) {
            const sr = scrollRangePx();
            scrollAccumulator = Math.min(sr, scrollAccumulator + 520);
            syncVirtualScrollFromAccumulator();
            smoothGoalXWorld.value = goalXWorld.value;
         }
      }
   }

   const collected = collectedCoinIds.value;

   /** Прыжок за монетой над головой — если хватает высоты платформенного прыжка */
   const canCoinArcHop =
      scrollIntentActive &&
      grounded.value &&
      hopCooldownMs <= 0 &&
      vy.value <= 95 &&
      vy.value >= -48;

   if (canCoinArcHop) {
      const coinsW = level.value.coinsWorld;
      const feet = feetY.value;
      const bodyMid = feet + 28;
      let bestNeedVy = 0;
      let bestPick = false;
      let bestPri = Infinity;
      for (let ci = 0; ci < coinsW.length; ci++) {
         const c = coinsW[ci]!;
         if (collected.includes(c.id)) continue;
         const hDist = Math.abs(mx - c.xCenter);
         if (hDist > 74) continue;
         const riseBody = c.centerYFromBottom - bodyMid;
         if (riseBody < 14) continue;
         const gapFeet = c.centerYFromBottom - 28 - feet;
         const needVy = requiredVyForGap(gapFeet + 40, 1.08);
         if (needVy > MAX_PLATFORM_JUMP_VY) continue;
         const pri = hDist * 2.5 + riseBody * 0.35;
         if (pri < bestPri) {
            bestPri = pri;
            bestNeedVy = needVy;
            bestPick = true;
         }
      }
      if (bestPick) {
         vy.value = Math.min(MAX_PLATFORM_JUMP_VY, bestNeedVy);
         grounded.value = false;
         hopCooldownMs = 450;
      }
   }

   const canPlatformHop =
      scrollIntentActive &&
      grounded.value &&
      hopCooldownMs <= 0 &&
      vy.value <= 95 &&
      vy.value >= -48;

   if (canPlatformHop) {
      let bestGap = 9999;
      let targetSurf: number | null = null;
      for (const p of coll) {
         if (mx < p.x0 - HALF || mx > p.x1 + HALF) continue;
         const gap = p.surfaceY - feetY.value;
         if (gap > 14 && gap < 330 && gap < bestGap) {
            if (
               !surfaceHasUncollectedCoin(
                  p,
                  level.value.coinsWorld,
                  collected,
               )
            ) {
               continue;
            }
            bestGap = gap;
            targetSurf = p.surfaceY;
         }
      }
      if (targetSurf != null) {
         const gap = targetSurf - feetY.value;
         const needVy = requiredVyForGap(gap, 1.09);
         if (needVy <= MAX_PLATFORM_JUMP_VY) {
            vy.value = Math.min(MAX_PLATFORM_JUMP_VY, needVy);
            grounded.value = false;
            hopCooldownMs = 480;
         }
      }
   }

   vy.value -= GRAVITY * dt;

   const feetBefore = feetY.value;
   feetY.value += vy.value * dt;

   /* Сбор монет: шире зона, чтобы авто-движение собирало монеты по дуге */
   const coins = level.value.coinsWorld;
   for (let ci = 0; ci < coins.length; ci++) {
      const coin = coins[ci]!;
      if (collectedCoinIds.value.includes(coin.id)) continue;
      const bodyCx = mx;
      const bodyCy = feetY.value + 28;
      const dxC = Math.abs(bodyCx - coin.xCenter);
      const dyC = Math.abs(bodyCy - coin.centerYFromBottom);
      if (dxC < 54 && dyC < 56) {
         collectedCoinIds.value = [...collectedCoinIds.value, coin.id];
         coinPopupSerial += 1;
         const uid = `cs-${coin.id}-${coinPopupSerial}`;
         coinPopups.value = [
            ...coinPopups.value,
            { uid, worldX: coin.xCenter, bottomPx: coin.centerYFromBottom },
         ];
         const rmUid = uid;
         window.setTimeout(() => {
            coinPopups.value = coinPopups.value.filter((q) => q.uid !== rmUid);
         }, 820);
      }
   }

   if (vy.value <= 0) {
      let landAt: number | null = null;
      for (const p of coll) {
         if (mx < p.x0 - HALF || mx > p.x1 + HALF) continue;
         const crossedDown =
            feetBefore > p.surfaceY - 4 && feetY.value <= p.surfaceY + 16;
         if (crossedDown) {
            landAt = landAt === null ? p.surfaceY : Math.max(landAt, p.surfaceY);
         }
      }
      if (landAt !== null) {
         feetY.value = landAt;
         vy.value = 0;
         grounded.value = true;
      } else if (feetY.value < gy) {
         feetY.value = gy;
         vy.value = 0;
         grounded.value = true;
      }
   }

   /* поза */
   if (reduceMotion.value) {
      marioPose.value = 'idle';
   } else if (vy.value > 140) {
      marioPose.value = 'jump';
   } else if (vy.value < -160 || (!grounded.value && vy.value < -80)) {
      marioPose.value = 'fall';
   } else if (Math.abs(step) > 0.04 && Math.abs(dx) > 2) {
      marioPose.value = 'walk';
   } else {
      marioPose.value = grounded.value ? 'idle' : 'fall';
   }

   physicsRaf = requestAnimationFrame(physicsLoop);
}

function onWheel(e: WheelEvent) {
   e.preventDefault();
   const px = wheelDeltaToPixels(e) * WHEEL_SCROLL_SENS;
   const cap = window.innerHeight * WHEEL_MAX_STEP_FRAC;
   scrollAccumulator += Math.max(-cap, Math.min(cap, px));
   lastScrollIntentAt = performance.now();
   syncVirtualScrollFromAccumulator();
}

let touchScrollArm = false;
let touchLastY = 0;

function onTouchStart(e: TouchEvent) {
   if (e.touches.length !== 1) return;
   const t0 = e.touches.item(0);
   if (!t0) return;
   touchScrollArm = true;
   touchLastY = t0.clientY;
}

function onTouchMove(e: TouchEvent) {
   if (e.touches.length !== 1) return;
   const t0 = e.touches.item(0);
   if (!t0) return;
   const y = t0.clientY;

   if (!touchScrollArm) return;
   const dy = touchLastY - y;
   touchLastY = y;
   e.preventDefault();
   scrollAccumulator += dy * TOUCH_SCROLL_SENS;
   lastScrollIntentAt = performance.now();
   syncVirtualScrollFromAccumulator();
}

function onTouchEnd() {
   touchScrollArm = false;
}

function isTypingInField(t: EventTarget | null): boolean {
   if (!(t instanceof HTMLElement)) return false;
   const tag = t.tagName;
   if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
   return t.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
   if (isTypingInField(e.target)) return;

   const k = e.key;

   if (k === 'ArrowLeft') {
      keysHeldLeft = true;
      lastScrollIntentAt = performance.now();
      e.preventDefault();
      return;
   }
   if (k === 'ArrowRight') {
      keysHeldRight = true;
      lastScrollIntentAt = performance.now();
      e.preventDefault();
      return;
   }

   if (k === ' ' || k === 'Spacebar') {
      if (!e.repeat) {
         jumpQueued = true;
      }
      e.preventDefault();
      return;
   }

   if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowUp' || k === 'PageUp') {
      const dir = k === 'ArrowUp' || k === 'PageUp' ? -1 : 1;
      scrollAccumulator += dir * window.innerHeight * 0.06;
      lastScrollIntentAt = performance.now();
      syncVirtualScrollFromAccumulator();
      e.preventDefault();
   }
}

function onKeyUp(e: KeyboardEvent) {
   if (isTypingInField(e.target)) return;
   const k = e.key;
   if (k === 'ArrowLeft') keysHeldLeft = false;
   if (k === 'ArrowRight') keysHeldRight = false;
}

function onWindowBlur() {
   keysHeldLeft = false;
   keysHeldRight = false;
}

function lockPageScroll() {
   const html = document.documentElement;
   html.dataset.marioScrollLock = '';
   html.style.overflow = 'hidden';
   html.style.height = '100%';
   html.style.overscrollBehavior = 'none';
   document.body.style.overflow = 'hidden';
   document.body.style.height = '100%';
   document.body.style.overscrollBehavior = 'none';
}

function unlockPageScroll() {
   const html = document.documentElement;
   delete html.dataset.marioScrollLock;
   html.style.overflow = '';
   html.style.height = '';
   html.style.overscrollBehavior = '';
   document.body.style.overflow = '';
   document.body.style.height = '';
   document.body.style.overscrollBehavior = '';
}

onMounted(() => {
   reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   lockPageScroll();
   rebuildLevel();
   syncVirtualScrollFromAccumulator();
   lastPhysicsT = performance.now();
   physicsRaf = requestAnimationFrame(physicsLoop);

   window.addEventListener('wheel', onWheel, { passive: false });
   window.addEventListener('touchstart', onTouchStart, { passive: true });
   window.addEventListener('touchmove', onTouchMove, { passive: false });
   window.addEventListener('touchend', onTouchEnd, { passive: true });
   window.addEventListener('keydown', onKeyDown);
   window.addEventListener('keyup', onKeyUp);
   window.addEventListener('blur', onWindowBlur);

   window.addEventListener('resize', () => {
      const pct = scrollPct.value;
      rebuildLevel();
      scrollAccumulator = pct * scrollRangePx();
      syncVirtualScrollFromAccumulator();
   });
});

onUnmounted(() => {
   if (import.meta.client) {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      unlockPageScroll();
      cancelAnimationFrame(physicsRaf);
   }
});
</script>

<style scoped>
.world-strip {
   position: relative;
   flex-wrap: nowrap;
}

@media (prefers-reduced-motion: reduce) {
   .world-strip {
      transition: none;
   }
}
</style>
