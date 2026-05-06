import type {
   BushSpec,
   CloudSpec,
   CoinSpec,
   HillSpec,
   MarioScreenData,
   MonsterSpec,
   PipeSpec,
   PlatformSpec,
   SiteClusterSpec,
} from '~/data/marioScreens';
import { buildWorldSkyBackground } from '~/data/marioScreens';
import { KENNEY_TILE_HALF_PX, tileBlockScreenPx } from '~/data/tileSprites';
import { grassStripTopPixiY, groundWalkSurfaceYFromBottomPx } from '~/utils/worldPixiVector';
import { contactCredentials, projectsCore } from '~/data/site';
import { landingEn } from '~/i18n/landing';

const hero = landingEn.hero;
const sections = landingEn.sections;
const aboutCards = landingEn.aboutCards;
const skillGroups = landingEn.skillGroups;

const landingProjects = projectsCore.map((p) => ({
   ...p,
   title: landingEn.projects[p.id].title,
   desc: landingEn.projects[p.id].desc,
}));

/** Нижняя полоска-трамплин над травой — совпадает с `height` первого `platform-plank` в экране. */
export const GROUND_PLANK_PX = 14;

function mulberry32(seed: number) {
   return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   };
}

const SKIES: MarioScreenData['sky'][] = ['day', 'sunset', 'dusk', 'cave', 'night'];
const BLOCK_VARS: NonNullable<MarioScreenData['pillarDecor']>['variant'][] = [
   'grass',
   'stone',
   'wood',
   'brick',
   'gold',
];

function rnd(r: () => number, a: number, b: number) {
   return a + r() * (b - a);
}

function rndi(r: () => number, a: number, b: number) {
   return Math.floor(rnd(r, a, b + 1));
}

export function parsePercentLeft(s: string): number {
   const m = s.match(/([\d.]+)\s*%/);
   return m ? parseFloat(m[1]) / 100 : 0;
}

function parsePercentBottom(s: string): number {
   const m = s.match(/([\d.]+)\s*%/);
   return m ? parseFloat(m[1]) / 100 : 0.22;
}

/** Компактные блоки под один экран (= vw) без вертикального скролла в Pixi */
function siteClusterForZone(zoneIndex: number): SiteClusterSpec {
   switch (zoneIndex) {
      case 0:
         return {
            left: '50%',
            bottom: '22%',
            maxWidth: 'min(96vw, 1200px)',
            panels: [
               {
                  kicker: hero.eyebrow,
                  title: `${hero.line1} · ${hero.line2}`,
                  body: hero.lead,
               },
            ],
         };
      case 1:
         return {
            left: '50%',
            bottom: '24%',
            maxWidth: 'min(96vw, 1200px)',
            panels: [
               {
                  kicker: sections.about.kicker,
                  title: sections.about.heading,
                  body: aboutCards.map((c) => `— ${c.title}. ${c.body}`).join('\n\n'),
               },
            ],
         };
      case 2:
         return {
            left: '50%',
            bottom: '26%',
            maxWidth: 'min(96vw, 1200px)',
            panels: [
               {
                  kicker: sections.skills.kicker,
                  title: sections.skills.heading,
                  body: skillGroups
                     .map((g) => `${g.title}: ${g.items.join(' · ')}`)
                     .join('\n\n'),
               },
            ],
         };
      case 3:
      default:
         return {
            left: '50%',
            bottom: '24%',
            maxWidth: 'min(96vw, 1200px)',
            panels: [
               {
                  kicker: landingEn.contact.marioContactKicker,
                  title: landingEn.contact.marioContactTitle,
                  body: `${landingEn.contact.lead}\n${contactCredentials.email}\n${landingEn.contact.telegramLabel}`,
               },
               {
                  kicker: sections.work.kicker,
                  title: sections.work.heading,
                  body: landingProjects.map((p) => `• ${p.title} · ${p.stack}\n  ${p.url}`).join('\n\n'),
               },
            ],
         };
   }
}

function genClouds(r: () => number, count: number): CloudSpec[] {
   const list: CloudSpec[] = [];
   for (let i = 0; i < count; i++) {
      list.push({
         left: `${rnd(r, 4, 78)}%`,
         top: `${rnd(r, 6, 28)}%`,
         width: rndi(r, 44, 110),
         opacity: rnd(r, 0.45, 0.98),
         driftDurationSec: rnd(r, 14, 32),
         driftPx: rnd(r, 10, 36),
      });
   }
   return list;
}

/** Случайный наземный / платформенный моб (Kenney sheet) */
function rollWalkingMobType(r: () => number): MonsterSpec['type'] {
   const u = r();
   if (u < 0.11) return 'goomba';
   if (u < 0.2) return 'koopa';
   if (u < 0.31) return 'slime_fire';
   if (u < 0.41) return 'slime_spike';
   if (u < 0.53) return 'ladybug';
   if (u < 0.62) return 'mouse';
   if (u < 0.71) return 'frog';
   if (u < 0.79) return 'worm';
   if (u < 0.86) return 'worm_ring';
   if (u < 0.93) return 'bee';
   return 'mouse';
}

/** Мобы только на земле или на висячих платформах; не в воздухе */
function genMobsOnSurfaces(
   r: () => number,
   n: number,
   surfaces: CollisionSurface[],
   base: number,
   segmentWidthPx: number,
   h: number,
   groundWalkSurfacePx: number,
   coinLeftRatios: number[],
): MonsterSpec[] {
   const walkSurfaces = surfaces.filter((s) => s.x1 - s.x0 > 88);
   if (walkSurfaces.length === 0) return [];

   const out: MonsterSpec[] = [];
   const awayCoin = 0.06;
   const MIN_MOB_CENTER_SEP_PX = 96;
   const surfKey = (s: CollisionSurface) =>
      `${Math.round(s.surfaceY)}:${Math.round(s.x0)}:${Math.round(s.x1)}`;
   const mobsPerSurf = new Map<string, number>();
   let guard = 0;

   while (out.length < n && guard < 260) {
      guard += 1;
      const surf = walkSurfaces[rndi(r, 0, walkSurfaces.length - 1)]!;
      const sk = surfKey(surf);
      const wideGround =
         surf.surfaceY <= groundWalkSurfacePx + 6 &&
         surf.x1 - surf.x0 >= segmentWidthPx * 0.85;
      /* На узкой висачей платформе — не больше одного моба */
      if (!wideGround && (mobsPerSurf.get(sk) ?? 0) >= 1) continue;

      const x = rnd(r, surf.x0 + 48, surf.x1 - 48);
      const lr = (x - base) / segmentWidthPx;
      if (coinLeftRatios.some((cx) => Math.abs(cx - lr) < awayCoin)) continue;

      const feetY = surf.surfaceY;
      const elevated = feetY > groundWalkSurfacePx + 38;
      let type: MonsterSpec['type'];
      if (elevated) {
         const er = r();
         if (er < 0.38) type = 'piranha';
         else if (er < 0.52) type = 'frog';
         else type = rollWalkingMobType(r);
      } else {
         type = rollWalkingMobType(r);
      }

      const mobXWorld = base + lr * segmentWidthPx + 28;
      if (
         out.some((mo) => {
            const mlx = base + parsePercentLeft(mo.left) * segmentWidthPx + 28;
            return Math.abs(mlx - mobXWorld) < MIN_MOB_CENTER_SEP_PX;
         })
      ) {
         continue;
      }

      mobsPerSurf.set(sk, (mobsPerSurf.get(sk) ?? 0) + 1);
      out.push({
         type,
         left: `${(lr * 100).toFixed(1)}%`,
         /* как у collision.surfaceY — без округления, чтобы стопа Марио и моба совпадали */
         bottom: `${feetY}px`,
         wanderSec: rnd(r, 2.2, 5.6),
         wanderPx: rnd(r, 10, 34),
         phaseSec: rnd(r, 0, 4),
      });
   }
   return out;
}

/** Поверхности для физики: x0,x1 в px от начала мира, surfaceY — «bottom» стопы в px от низа viewport */
export interface CollisionSurface {
   x0: number;
   x1: number;
   surfaceY: number;
}

/** Монета в мировых координатах для сбора */
export interface CoinWorld {
   id: string;
   /** центр монеты по X в px от начала мира */
   xCenter: number;
   /** центр монеты по вертикали — px от низа viewport вверх */
   centerYFromBottom: number;
}

/** Враг для автопрыжка: те же оси, что у монет / стоп Марио */
export interface MobWorld {
   id: string;
   xCenter: number;
   /** Линия стоп (нижний край хитбокса), px от низа вьюпорта вверх */
   feetYFromBottom: number;
   /** Половина ширины по X (учёт блуждания — завышено) */
   halfW: number;
   /** Высота тела над стопами — чтобы рассчитать дугу прыжка */
   hitH: number;
   /** Перепрыгивать по земле / трубе; летуны не трогаем */
   hopOver: boolean;
}

export interface GeneratedLevel {
   screens: MarioScreenData[];
   collision: CollisionSurface[];
   coinsWorld: CoinWorld[];
   monstersWorld: MobWorld[];
   /** Ширина одного куска мира (сильно больше вьюпорта) — единица для % в LevelScreen. */
   segmentWidthPx: number;
   /** Одно составное небо (вертикальный градиент + смена зон по X) */
   worldSkyBackground: string;
}

/**
 * Генерация экранов + коллизии. seed фиксирует повторяемость (SSR/клиент).
 */
/** Совпадает с отображением монеты как полного кадра Kenney 64×64 в LevelScreen */
const COIN_HALF_W = KENNEY_TILE_HALF_PX;
const COIN_HALF_H = KENNEY_TILE_HALF_PX;
/** Монета по дуге не выше ~одного прыжка от земли */
const MAX_ARC_COIN_LIFT = 198;

function coinOverlapsPipeBody(
   cx: number,
   cyFromBottom: number,
   base: number,
   segmentWidthPx: number,
   h: number,
   grassTopY: number,
   pipes: readonly PipeSpec[],
   pipeTw: number,
): boolean {
   const grassFromBottom = h - grassTopY;
   const padX = 16;
   const padY = COIN_HALF_H + 10;
   for (const pipe of pipes) {
      const lx = base + parsePercentLeft(pipe.left) * segmentWidthPx;
      if (cx < lx - padX || cx > lx + pipeTw + padX) continue;
      const pipeTopFromBottom = grassFromBottom + pipe.height;
      if (cyFromBottom >= grassFromBottom - padY && cyFromBottom <= pipeTopFromBottom + padY) {
         return true;
      }
   }
   return false;
}

/** Грубый AABB сайтового кластера (совпадает по смыслу с Pixi, без точной вёрстки текста). */
function coinOverlapsSiteClusterBox(
   cx: number,
   cyFromBottom: number,
   base: number,
   segmentWidthPx: number,
   h: number,
   cluster: SiteClusterSpec,
): boolean {
   const m = cluster.bottom.trim().match(/^([\d.]+)%\s*$/);
   const pct = m ? parseFloat(m[1]) / 100 : 0.22;
   const clusterBottomFromBottom = pct * h;
   const cxCluster = base + parsePercentLeft(cluster.left) * segmentWidthPx;
   const halfW = Math.min(segmentWidthPx * 0.46, 220);
   const stackH = Math.min(Math.round(h * 0.42), 360);
   const topFromBottom = clusterBottomFromBottom - stackH;
   const padX = 14;
   const padY = COIN_HALF_H + 14;
   if (cx < cxCluster - halfW - padX || cx > cxCluster + halfW + padX) return false;
   return cyFromBottom >= topFromBottom - padY && cyFromBottom <= clusterBottomFromBottom + padY;
}

function coinPlacementOk(
   cx: number,
   cyFromBottom: number,
   base: number,
   segmentWidthPx: number,
   h: number,
   grassTopY: number,
   pipes: readonly PipeSpec[],
   pipeTw: number,
   cluster: SiteClusterSpec,
): boolean {
   if (coinOverlapsPipeBody(cx, cyFromBottom, base, segmentWidthPx, h, grassTopY, pipes, pipeTw)) {
      return false;
   }
   if (coinOverlapsSiteClusterBox(cx, cyFromBottom, base, segmentWidthPx, h, cluster)) {
      return false;
   }
   return true;
}

function pickSky(
   r: () => number,
   prev: MarioScreenData['sky'] | null,
): MarioScreenData['sky'] {
   const ix = rndi(r, 0, SKIES.length - 1);
   let sk = SKIES[ix]!;
   if (prev && sk === prev) {
      sk = SKIES[(ix + 1) % SKIES.length]!;
   }
   return sk;
}

function genCoinsSegment(
   r: () => number,
   si: number,
   base: number,
   segmentWidthPx: number,
   h: number,
   groundWalkSurfacePx: number,
   segmentCollision: CollisionSurface[],
   pipes: PipeSpec[],
   grassTopY: number,
   pipeTw: number,
   siteCluster: SiteClusterSpec,
): { coins: CoinSpec[]; coinsWorld: CoinWorld[] } {
   /* Узкие крышки труб не считаем «полкой» для монет */
   const narrowMax = pipeTw + 32;
   const floatPlats = segmentCollision.filter(
      (p) =>
         p.surfaceY > groundWalkSurfacePx + 8 &&
         p.x1 - p.x0 < segmentWidthPx * 0.91 &&
         p.x1 - p.x0 > narrowMax,
   );
   const coinN = rndi(r, 6, 10);
   const coins: CoinSpec[] = [];
   const coinsWorld: CoinWorld[] = [];

   let placed = 0;
   let tries = 0;
   while (placed < coinN && tries < 320) {
      tries += 1;
      const roll = r();
      let leftPct: number;
      let centerYFromBottom: number;

      if (roll < 0.36 && floatPlats.length > 0) {
         const pl = floatPlats[rndi(r, 0, floatPlats.length - 1)]!;
         const cx = rnd(r, pl.x0 + 28, pl.x1 - 28);
         leftPct = (cx - base) / segmentWidthPx;
         centerYFromBottom = Math.min(pl.surfaceY + rnd(r, 38, 58), groundWalkSurfacePx + 228);
      } else if (roll < 0.68) {
         leftPct = rnd(r, 0.09, 0.91);
         centerYFromBottom = Math.min(
            groundWalkSurfacePx + COIN_HALF_H + rnd(r, 28, MAX_ARC_COIN_LIFT),
            groundWalkSurfacePx + COIN_HALF_H + MAX_ARC_COIN_LIFT,
         );
      } else {
         leftPct = rnd(r, 0.07, 0.93);
         centerYFromBottom = groundWalkSurfacePx + COIN_HALF_H + rnd(r, 8, 52);
      }

      leftPct = Math.max(0.06, Math.min(0.94, leftPct));
      const cx = base + leftPct * segmentWidthPx + COIN_HALF_W;
      if (
         !coinPlacementOk(cx, centerYFromBottom, base, segmentWidthPx, h, grassTopY, pipes, pipeTw, siteCluster)
      ) {
         continue;
      }

      const bottomPx = centerYFromBottom - COIN_HALF_H;
      const bottomPct = (bottomPx / h) * 100;
      coins.push({
         left: `${(leftPct * 100).toFixed(1)}%`,
         bottom: `${bottomPct.toFixed(1)}%`,
      });
      coinsWorld.push({
         id: `coin-${si}-${placed}`,
         xCenter: cx,
         centerYFromBottom,
      });
      placed += 1;
   }

   return { coins, coinsWorld };
}

export function mobFeetYFromBottom(m: MonsterSpec, h: number, groundWalkSurfacePx: number): number {
   const px = m.bottom.trim().match(/^([\d.]+)px$/);
   if (px) return parseFloat(px[1]!);
   if (m.type === 'boo' || m.type === 'bullet') {
      return parsePercentBottom(m.bottom) * h;
   }
   if (m.type === 'piranha') {
      return groundWalkSurfacePx + 52;
   }
   return groundWalkSurfacePx;
}

function mobHitHeight(type: MonsterSpec['type']): number {
   switch (type) {
      case 'koopa':
         return 46;
      case 'piranha':
         return 54;
      case 'goomba':
         return 38;
      case 'boo':
      case 'bullet':
         return 32;
      case 'slime_fire':
      case 'slime_spike':
         return 44;
      case 'ladybug':
         return 42;
      case 'mouse':
         return 38;
      case 'frog':
         return 44;
      case 'worm':
      case 'worm_ring':
         return 36;
      case 'bee':
         return 40;
      default:
         return 40;
   }
}

/**
 * @param gameViewportHeight высота игровой области (как у `.level-screen`: без верхней шапки), не полный `innerHeight`.
 */
export function generateMarioLevel(seed: number, vw: number, gameViewportHeight: number): GeneratedLevel {
   const r = mulberry32(seed);
   const screenCount = 4;
   const screens: MarioScreenData[] = [];
   const collision: CollisionSurface[] = [];
   const coinsWorld: CoinWorld[] = [];
   const monstersWorld: MobWorld[] = [];

   /** Один сегмент = ширина вьюпорта — каждый «экран» как полноэкранная страница */
   const segmentWidthPx = Math.max(Math.round(vw), 320);

   const h = gameViewportHeight;
   /** Совпадает с Pixi-травой (`groundWalkSurfaceYFromBottomPx`). */
   const groundWalkSurfacePx = groundWalkSurfaceYFromBottomPx(h);

   let lastSky: MarioScreenData['sky'] | null = null;

   for (let si = 0; si < screenCount; si++) {
      const base = si * segmentWidthPx;
      const sky = pickSky(r, lastSky);
      lastSky = sky;

      const clouds = genClouds(r, rndi(r, 8, 14));
      const cloudsExtra = genClouds(r, rndi(r, 5, 9)).map((c) => ({
         ...c,
         opacity: (c.opacity ?? 0.8) * rnd(r, 0.35, 0.65),
      }));

      const hills: HillSpec[] = [];
      const hc = rndi(r, 3, 6);
      for (let hi = 0; hi < hc; hi++) {
         hills.push({
            left: `${rnd(r, -6, 88)}%`,
            width: rndi(r, 70, 130),
            variant: (['green', 'teal', 'brown'] as const)[rndi(r, 0, 2)]!,
         });
      }

      const bushes: BushSpec[] = [];
      for (let b = 0; b < rndi(r, 4, 9); b++) {
         bushes.push({ left: `${rnd(r, 8, 88)}%`, variant: rndi(r, 1, 3) as 1 | 2 | 3 });
      }

      const pipes: PipeSpec[] = [];
      for (let p = 0; p < rndi(r, 2, 5); p++) {
         /* Высота колонки: крышка ровно кадр Kenney 64px + ствол */
         pipes.push({ left: `${rnd(r, 4, 78)}%`, height: rndi(r, 92, 168) });
      }

      /** Визуальные платформы из Kenney не генерируем — «полки» для текста рисуются в Pixi как блоки сайта. */
      const platforms: PlatformSpec[] = [];

      const groundSurf: CollisionSurface = {
         x0: base,
         x1: base + segmentWidthPx,
         surfaceY: groundWalkSurfacePx,
      };
      collision.push(groundSurf);

      const segmentCollision: CollisionSurface[] = [groundSurf];

      const grassTopY = grassStripTopPixiY(h);
      const pipeTw = tileBlockScreenPx();
      const pipeXPad = 6;
      for (const pipe of pipes) {
         const leftPx = parsePercentLeft(pipe.left) * segmentWidthPx;
         const topY = Math.round(grassTopY - pipe.height);
         const walkPixi = Math.round(topY);
         const pipeSurf: CollisionSurface = {
            x0: Math.round(base + leftPx + pipeXPad),
            x1: Math.round(base + leftPx + pipeTw - pipeXPad),
            surfaceY: Math.round(h - walkPixi),
         };
         collision.push(pipeSurf);
         segmentCollision.push(pipeSurf);
      }

      const { coins, coinsWorld: cw } = genCoinsSegment(
         r,
         si,
         base,
         segmentWidthPx,
         h,
         groundWalkSurfacePx,
         segmentCollision,
         pipes,
         grassTopY,
         pipeTw,
         siteClusterForZone(si),
      );
      coinsWorld.push(...cw);

      const coinRatios = coins.map((co) => parsePercentLeft(co.left));
      const monsters = genMobsOnSurfaces(
         r,
         rndi(r, 3, 5),
         segmentCollision,
         base,
         segmentWidthPx,
         h,
         groundWalkSurfacePx,
         coinRatios,
      );

      for (let mi = 0; mi < monsters.length; mi++) {
         const m = monsters[mi]!;
         const leftPct = parsePercentLeft(m.left);
         const xCenter = base + leftPct * segmentWidthPx + 28;
         const feetYFromBottom = mobFeetYFromBottom(m, h, groundWalkSurfacePx);
         const hopOver = m.type !== 'boo' && m.type !== 'bullet';
         monstersWorld.push({
            id: `mob-${si}-${mi}`,
            xCenter,
            feetYFromBottom,
            halfW: 36,
            hitH: mobHitHeight(m.type),
            hopOver,
         });
      }

      screens.push({
         zoneIndex: si,
         sky,
         clouds,
         cloudsExtra,
         monsters,
         pipes,
         hills,
         bushes,
         coins,
         pillarDecor: {
            count: rndi(r, 2, 3),
            variant: BLOCK_VARS[rndi(r, 0, BLOCK_VARS.length - 1)]!,
         },
         platforms,
         siteCluster: siteClusterForZone(si),
      });
   }

   const worldSkyBackground = buildWorldSkyBackground(screens.map((s) => s.sky));

   return { screens, collision, coinsWorld, monstersWorld, segmentWidthPx, worldSkyBackground };
}

/** Наибольшая высота опоры под точкой x (мировые px). `groundWalkSurfacePx` — стопа на земной платформе. */
export function feetSurfaceAtX(x: number, collision: CollisionSurface[], groundWalkSurfacePx: number): number {
   let best = groundWalkSurfacePx;
   for (const p of collision) {
      if (x >= p.x0 && x <= p.x1) {
         best = Math.max(best, p.surfaceY);
      }
   }
   return best;
}
