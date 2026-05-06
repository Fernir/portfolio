<template>
   <div ref="hostRef" class="world-pixi-tiles pointer-events-none absolute inset-0 z-mario-pixi" />
</template>

<script setup lang="ts">
import type { MarioScreenData, MonsterSpec, SiteClusterSpec, SitePanelSpec } from '~/data/marioScreens';
import { MOB_ANIM } from '~/data/mobSprites';
import { tileBlockScreenPx } from '~/data/tileSprites';
import type { CollisionSurface } from '~/utils/levelGen';
import { mobFeetYFromBottom, parsePercentLeft } from '~/utils/levelGen';
import {
   createBushTreeGraphics,
   createCollectibleCoinContainer,
   createGroundStripGraphics,
   createHillGraphics,
   createPipeGraphics,
   createPlatformGraphics,
   createPillarGraphics,
   drawHudCoinIcon,
   grassStripTopPixiY,
   groundWalkSurfaceYFromBottomPx,
   PIPE_CAP_SCREEN_PX,
   type MarioHillVariant,
   type PillarVariantDraw,
} from '~/utils/worldPixiVector';

type MarioPose = 'idle' | 'walk' | 'jump' | 'fall';

const MARIO_URL = '/sprites/spritesheet-characters-default.png';
const MARIO_CELL = 128;
const MARIO_SCALE = 0.56;

const MARIO_FRAMES = {
   idle: { x: 0, y: 258 },
   jump: { x: 129, y: 258 },
   walk_a: { x: 258, y: 258 },
   walk_b: { x: 387, y: 258 },
   duck: { x: 516, y: 129 },
} as const;

const HILL_H = 48;
const HILL_BOTTOM_OFF_PX = 8;
const DECOR_BOTTOM_PAD_PX = 14;
const PILLAR_GAP_PX = 4;

/** HUD в экранных координатах внутри мирового канваса (скролл DOM = −cameraPx) */
const HUD_BAND_H = 48;
const HUD_BOTTOM_PAD = 12;
const HUD_SIDE_PAD = 12;
const HUD_INNER_GAP = 12;
const HUD_COIN_ICON_PX = 22;

type CoinPopupWorld = { uid: string; worldX: number; bottomPx: number };

const emit = defineEmits<{
   siteCollision: [surfaces: CollisionSurface[]];
}>();

const props = defineProps<{
   screens: MarioScreenData[];
   segmentWidthPx: number;
   viewHeightPx: number;
   collectedCoinIds: readonly string[];
   /** Облака + параллакс как SegmentClouds */
   parallaxShift: number;
   marioXWorld: number;
   marioFeetYFromBottom: number;
   marioPose: MarioPose;
   marioFacing: 1 | -1;
   /** Всплывающие «+100» в мировых координатах */
   coinPopups?: readonly CoinPopupWorld[];
   /** Один канвас: HUD привязан к вьюпорту */
   cameraPx: number;
   viewportWidthPx: number;
   coinsCollected: number;
   coinsTotal: number;
   scrollPct: number;
   reduceMotion?: boolean;
}>();

const hostRef = ref<HTMLElement | null>(null);

let app: import('pixi.js').Application | null = null;
let building = false;

let activeCoinSprites: Map<string, import('pixi.js').Container> | null = null;
let pillarGoldSprites: import('pixi.js').Graphics[] = [];
let marioSprite: import('pixi.js').Sprite | null = null;
let marioTextures: {
   idle: import('pixi.js').Texture;
   jump: import('pixi.js').Texture;
   walk_a: import('pixi.js').Texture;
   walk_b: import('pixi.js').Texture;
   duck: import('pixi.js').Texture;
} | null = null;

type MobRT = {
   wanderLayer: import('pixi.js').Container;
   fxLayer: import('pixi.js').Container;
   face: import('pixi.js').Sprite;
   spec: MonsterSpec;
   animMs: number;
   baseX: number;
   feetTopY: number;
};
let mobRuntimes: MobRT[] = [];

type CloudRT = {
   root: import('pixi.js').Container;
   baseX: number;
   baseY: number;
   driftPx: number;
   driftSec: number;
   phase: number;
   /** Фаза дрейфа от deltaMS — без привязки к wall-clock и без round по X */
   driftPhaseRad: number;
   parallaxFactor: number;
};
let cloudRuntimes: CloudRT[] = [];

let mainTicker: (() => void) | null = null;
let coinFlipAccumMs = 0;
let marioWalkAccumMs = 0;

/** Обновление HUD без полного rebuild (при счётчике / ширине вьюпорта) */
let hudLayoutFn: (() => void) | null = null;
let hudFillFn: (() => void) | null = null;

function clamp01(x: number): number {
   return Math.max(0, Math.min(1, x));
}

function parsePctBottom(bottom: string): number | null {
   const m = /^([\d.]+)%\s*$/.exec(bottom.trim());
   return m ? parseFloat(m[1]) : null;
}

function parseTopPct(top: string): number | null {
   const m = /^([\d.]+)%\s*$/.exec(top.trim());
   return m ? parseFloat(m[1]) : null;
}

function parseLeftPx(left: string, segW: number): number {
   const t = left.trim();
   if (t === '0') return 0;
   const pct = /^(-?[\d.]+)%\s*$/.exec(t);
   if (pct?.[1] != null) return (parseFloat(pct[1]) / 100) * segW;
   const px = /^(-?[\d.]+)px\s*$/.exec(t);
   if (px?.[1] != null) return parseFloat(px[1]);
   return 0;
}

function clusterCenterX(left: string, ox: number, segW: number): number {
   const pct = /^([\d.]+)%\s*$/.exec(left.trim());
   if (pct?.[1] != null) return ox + (parseFloat(pct[1]) / 100) * segW;
   const px = /^([\d.]+)px\s*$/.exec(left.trim());
   if (px?.[1] != null) return ox + parseFloat(px[1]);
   return ox + 0.5 * segW;
}

function parseClusterMaxWidthPx(spec: string | undefined, vwIn: number): number {
   if (spec == null || spec.trim() === '') return Math.min(vwIn * 0.7, 400);
   const m = /min\s*\(\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)/i.exec(spec.trim());
   if (m) {
      return Math.min(vwIn * (parseFloat(m[1]) / 100), parseFloat(m[2]));
   }
   const px = /^([\d.]+)px\s*$/.exec(spec.trim());
   if (px?.[1] != null) return parseFloat(px[1]);
   return Math.min(vwIn * 0.7, 400);
}

function splitSitePanelBody(body: string): string[] {
   return body
      .split(/\n\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
}

function pillarReservePxForScreen(screen: MarioScreenData, tw: number): number {
   const pd = screen.pillarDecor;
   if (!pd || pd.count <= 0) return 0;
   return pd.count * tw + Math.max(0, pd.count - 1) * PILLAR_GAP_PX;
}

function decorBottomPx(H: number): number {
   return H * 0.18 + DECOR_BOTTOM_PAD_PX;
}

function hillBottomPx(H: number): number {
   return H * 0.18 - HILL_BOTTOM_OFF_PX;
}

function pillarVariantDraw(v: NonNullable<MarioScreenData['pillarDecor']>['variant']): PillarVariantDraw {
   switch (v) {
      case 'gold':
         return 'gold';
      case 'brick':
         return 'brick';
      case 'stone':
         return 'stone';
      case 'wood':
         return 'wood';
      default:
         return 'grass';
   }
}

function hillVariantDraw(variant: MarioScreenData['hills'][number]['variant']): MarioHillVariant {
   if (variant === 'teal') return 'teal';
   if (variant === 'brown') return 'brown';
   return 'green';
}

function wanderShift(
   wanderSec: number | undefined,
   wanderPx: number | undefined,
   phaseSec: number | undefined,
   tSec: number,
): number {
   const ws = wanderSec ?? 0;
   if (ws <= 0) return 0;
   const mw = wanderPx ?? 22;
   const p = (((tSec - (phaseSec ?? 0)) % ws) + ws) % ws;
   const u = p / ws;
   if (u < 0.5) return u * 2 * mw;
   return (1 - (u - 0.5) * 2) * mw;
}

function syncCoinCollectedVisibility() {
   if (!activeCoinSprites) return;
   const taken = new Set(props.collectedCoinIds);
   activeCoinSprites.forEach((spr, id) => {
      spr.visible = !taken.has(id);
   });
}

async function rebuild() {
   const host = hostRef.value;
   const H = props.viewHeightPx;
   const seg = props.segmentWidthPx;
   const screens = props.screens;
   if (!host || import.meta.server || H < 80 || seg < 32 || screens.length === 0) {
      return;
   }

   if (building) return;
   building = true;
   try {
      emit('siteCollision', []);
      if (app && mainTicker) {
         app.ticker.remove(mainTicker);
         mainTicker = null;
      }
      coinFlipAccumMs = 0;
      marioWalkAccumMs = 0;
      hudLayoutFn = null;
      hudFillFn = null;
      activeCoinSprites = null;
      pillarGoldSprites = [];
      marioSprite = null;
      marioTextures = null;
      mobRuntimes = [];
      cloudRuntimes = [];

      app?.destroy(true);
      app = null;
      host.innerHTML = '';

      const { Application, Container, Sprite, Graphics, Texture, Rectangle, Assets, Text } = await import('pixi.js');

      /** Один полигон по контуру объединения кругов (лучи из внутренней точки) — как «шарики», без двойной альфы. */
      function pointInCircleUnion(px: number, py: number, blobs: { cx: number; cy: number; r: number }[]): boolean {
         for (const b of blobs) {
            const dx = px - b.cx;
            const dy = py - b.cy;
            if (dx * dx + dy * dy <= b.r * b.r + 0.5) return true;
         }
         return false;
      }

      function rayMaxTOnCircleUnion(
         ox: number,
         oy: number,
         ux: number,
         uy: number,
         blobs: { cx: number; cy: number; r: number }[],
         tMax: number,
      ): number {
         let lo = 0;
         let hi = tMax;
         for (let iter = 0; iter < 30; iter++) {
            const mid = (lo + hi) * 0.5;
            if (pointInCircleUnion(ox + ux * mid, oy + uy * mid, blobs)) lo = mid;
            else hi = mid;
         }
         return lo;
      }

      function buildCloudGraphicInner(width: number, hh: number, opacity: number): InstanceType<typeof Graphics> {
         const g = new Graphics({ roundPixels: true });
         const o = opacity;
         const fill = { color: 0xffffff, alpha: o * 0.96 };
         const rim = { width: 1.15, color: 0xb4cce8, alpha: Math.min(1, o * 0.52) };

         const hubY = hh * 0.52;
         const r0 = Math.max(10, hh * 0.42);
         const r1 = Math.max(9, hh * 0.36);
         const r2 = Math.max(8, hh * 0.34);
         const blobs: { cx: number; cy: number; r: number }[] = [
            { cx: width * 0.22, cy: hubY, r: r0 },
            { cx: width * 0.52, cy: hubY * 0.92, r: Math.max(r0, hh * 0.46) },
            { cx: width * 0.82, cy: hubY * 1.02, r: r1 },
            { cx: width * 0.38, cy: hubY * 0.72, r: r2 },
            { cx: width * 0.68, cy: hubY * 0.78, r: r2 * 0.92 },
         ];

         let ox = 0;
         let oy = 0;
         for (const b of blobs) {
            ox += b.cx;
            oy += b.cy;
         }
         ox /= blobs.length;
         oy /= blobs.length;
         if (!pointInCircleUnion(ox, oy, blobs)) {
            let best = blobs[0]!;
            for (const b of blobs) {
               if (b.r > best.r) best = b;
            }
            ox = best.cx;
            oy = best.cy;
         }

         let tMax = 0;
         for (const b of blobs) {
            const dx = b.cx - ox;
            const dy = b.cy - oy;
            tMax = Math.max(tMax, Math.hypot(dx, dy) + b.r);
         }
         tMax += 28;

         const nAng = 96;
         const poly: number[] = [];
         for (let i = 0; i < nAng; i++) {
            const ang = (i / nAng) * Math.PI * 2;
            const ux = Math.cos(ang);
            const uy = Math.sin(ang);
            const t = rayMaxTOnCircleUnion(ox, oy, ux, uy, blobs, tMax);
            poly.push(ox + ux * t, oy + uy * t);
         }

         if (poly.length < 6) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const b of blobs) {
               minX = Math.min(minX, b.cx - b.r);
               minY = Math.min(minY, b.cy - b.r);
               maxX = Math.max(maxX, b.cx + b.r);
               maxY = Math.max(maxY, b.cy + b.r);
            }
            const pad = 2;
            g.roundRect(minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad, hh * 0.35)
               .fill(fill)
               .stroke(rim);
            return g;
         }

         g.poly(poly, true).fill(fill).stroke(rim);

         return g;
      }

      const n = screens.length;
      const totalW = n * seg;
      const TW = tileBlockScreenPx();

      const application = new Application();
      await application.init({
         width: totalW,
         height: H,
         resolution: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
         autoDensity: true,
         backgroundAlpha: 0,
         antialias: true,
         roundPixels: true,
      });

      const canv = application.canvas as HTMLCanvasElement;
      host.appendChild(canv);
      app = application;

      const groundWalkSurfacePx = groundWalkSurfaceYFromBottomPx(H);

      const enemyRaw = await Assets.load<InstanceType<typeof Texture>>(MOB_ANIM.goomba.sheet);
      enemyRaw.source.style.scaleMode = 'nearest';

      const enemyTexCache = new Map<string, InstanceType<typeof Texture>>();
      function enemySubTex(
         enemyBase: InstanceType<typeof Texture>,
         x: number,
         y: number,
         fw: number,
         fh: number,
      ): InstanceType<typeof Texture> {
         const key = `${x}|${y}|${fw}|${fh}`;
         let t = enemyTexCache.get(key);
         if (!t) {
            t = new Texture({
               source: enemyBase.source,
               frame: new Rectangle(x, y, fw, fh),
            });
            enemyTexCache.set(key, t);
         }
         return t;
      }

      const charRaw = await Assets.load<InstanceType<typeof Texture>>(MARIO_URL);
      charRaw.source.style.scaleMode = 'nearest';

      function marioTex(rect: { x: number; y: number }): InstanceType<typeof Texture> {
         return new Texture({
            source: charRaw.source,
            frame: new Rectangle(rect.x, rect.y, MARIO_CELL, MARIO_CELL),
         });
      }
      marioTextures = {
         idle: marioTex(MARIO_FRAMES.idle),
         jump: marioTex(MARIO_FRAMES.jump),
         walk_a: marioTex(MARIO_FRAMES.walk_a),
         walk_b: marioTex(MARIO_FRAMES.walk_b),
         duck: marioTex(MARIO_FRAMES.duck),
      };

      const root = new Container();
      application.stage.addChild(root);

      const hudScreenRoot = new Container();
      application.stage.addChild(hudScreenRoot);

      const cloudsRoot = new Container();
      /** Холмы, кусты, трубы, столбы, блоки сайта — позади земли и геймплея */
      const decorBackLayer = new Container();
      root.addChild(cloudsRoot);
      root.addChild(decorBackLayer);

      const stripH = H * 0.18;
      const groundTop = Math.round(H - stripH);

      /* Облака */
      for (let si = 0; si < n; si++) {
         const ox = si * seg;
         const screen = screens[si]!;
         const addCloud = (c: MarioScreenData['clouds'][number], layer: 'far' | 'near') => {
            const lp = parseLeftPx(c.left, seg);
            const tp = parseTopPct(c.top);
            if (tp == null) return;
            const wPx = c.width;
            const hPx = Math.round(wPx * 0.38);
            const opacity = c.opacity ?? 0.9;
            const parallaxFactor = layer === 'far' ? -0.08 : -0.14;
            const driftPx = c.driftPx ?? 22;
            const driftSec = c.driftDurationSec ?? 22;

            const worldX = ox + lp;
            const worldY = (tp / 100) * H;

            const cc = new Container();
            const gfx = buildCloudGraphicInner(wPx, hPx, opacity);
            gfx.position.set(0, 0);
            cc.addChild(gfx);
            cc.position.set(Math.round(worldX), Math.round(worldY));
            if (layer === 'far') cc.alpha = 0.92;
            cloudsRoot.addChild(cc);

            cloudRuntimes.push({
               root: cc,
               baseX: worldX,
               baseY: worldY,
               driftPx,
               driftSec,
               phase: Math.random() * Math.PI * 2,
               driftPhaseRad: Math.random() * Math.PI * 2,
               parallaxFactor,
            });
         };

         for (const c of screen.cloudsExtra ?? []) addCloud(c, 'far');
         for (const c of screen.clouds) addCloud(c, 'near');
      }

      const allCoinSprites = new Map<string, InstanceType<typeof Container>>();

      root.addChild(createGroundStripGraphics(Graphics, 0, groundTop, totalW, H, TW));

      const mobLayer = new Container();
      root.addChild(mobLayer);

      const coinsFrontLayer = new Container();
      root.addChild(coinsFrontLayer);

      for (let si = 0; si < n; si++) {
         const ox = si * seg;

         const screen = screens[si]!;
         for (const h of screen.hills) {
            const hb = hillBottomPx(H);
            const leftPx = parseLeftPx(h.left, seg);
            const wPx = h.width;
            const topY = Math.round(H - hb - HILL_H);
            decorBackLayer.addChild(
               createHillGraphics(Graphics, ox + leftPx, topY, wPx, HILL_H, hillVariantDraw(h.variant)),
            );
         }

         const bb = decorBottomPx(H);
         for (const b of screen.bushes) {
            const leftPx = parseLeftPx(b.left, seg);
            const topY = Math.round(H - bb - TW);
            decorBackLayer.addChild(createBushTreeGraphics(Graphics, ox + leftPx + TW * 0.5, topY, TW, b.variant));
         }

         const grassTopY = grassStripTopPixiY(H);
         for (const pipe of screen.pipes) {
            const leftPx = parseLeftPx(pipe.left, seg);
            const totalH = pipe.height;
            const topY = Math.round(grassTopY - totalH);
            decorBackLayer.addChild(createPipeGraphics(Graphics, ox + leftPx, topY, TW, PIPE_CAP_SCREEN_PX, totalH));
         }

         const pd = screen.pillarDecor;
         if (pd && pd.count > 0) {
            const sc = screen.siteCluster;
            const cbPct = parsePctBottom(sc.bottom);
            if (cbPct != null) {
               const clusterBottomPx = (cbPct / 100) * H;
               const cx = clusterCenterX(sc.left, ox, seg);
               const pvDraw = pillarVariantDraw(pd.variant);
               const isGold = pd.variant === 'gold';

               for (let bi = 0; bi < pd.count; bi++) {
                  const topY = Math.round(H - clusterBottomPx - (bi + 1) * TW - bi * PILLAR_GAP_PX);
                  const bx = Math.round(cx - TW / 2);
                  const pillarG = createPillarGraphics(Graphics, 0, 0, TW, pvDraw);
                  pillarG.position.set(Math.round(bx + TW / 2), Math.round(topY + TW / 2));
                  pillarG.pivot.set(TW / 2, TW / 2);
                  decorBackLayer.addChild(pillarG);
                  if (isGold) pillarGoldSprites.push(pillarG);
               }
            }
         }

         for (let ci = 0; ci < screen.coins.length; ci++) {
            const co = screen.coins[ci]!;
            const pctB = parsePctBottom(co.bottom);
            if (pctB == null) continue;
            const bottomPx = (pctB / 100) * H;
            const leftPx = parseLeftPx(co.left, seg);
            const topY = Math.round(H - bottomPx - TW);
            const id = `coin-${si}-${ci}`;
            const coinC = createCollectibleCoinContainer(
               Graphics,
               Container,
               Math.round(ox + leftPx + TW / 2),
               Math.round(topY + TW / 2),
               TW,
            );
            coinsFrontLayer.addChild(coinC);
            allCoinSprites.set(id, coinC);
         }

         /* Враги */
         for (const m of screen.monsters) {
            const cfg = MOB_ANIM[m.type];
            const cx = ox + parsePercentLeft(m.left) * seg + 28;
            const feetBottom = mobFeetYFromBottom(m, H, groundWalkSurfacePx);
            const feetTopY = H - feetBottom;

            const wanderLayer = new Container();
            wanderLayer.position.set(Math.round(cx), Math.round(feetTopY));
            const fxLayer = new Container();
            wanderLayer.addChild(fxLayer);

            let initialTex: InstanceType<typeof Texture>;
            const fw = cfg.frameW;
            const fh = cfg.frameH;

            if (cfg.kind === 'atlas') {
               const fr = cfg.frames[0]!;
               initialTex = enemySubTex(enemyRaw, fr.x, fr.y, fw, fh);
            } else {
               const fr = cfg.frame;
               initialTex = enemySubTex(enemyRaw, fr.x, fr.y, fw, fh);
            }

            const face = new Sprite({ texture: initialTex, roundPixels: true });
            face.anchor.set(0.5, 1);
            face.scale.set(cfg.scale, cfg.scale);
            fxLayer.addChild(face);

            mobLayer.addChild(wanderLayer);
            mobRuntimes.push({
               wanderLayer,
               fxLayer,
               face,
               spec: m,
               animMs: 0,
               baseX: Math.round(cx),
               feetTopY: Math.round(feetTopY),
            });
         }
      }

      const PANEL_STACK_GAP = 8;
      const CLUSTER_TOP_SAFE_PX = 12;

      function measureSitePanelIntrinsicOuterW(
         panel: SitePanelSpec,
         Href: number,
         fontScale: number,
         capOuter: number,
      ): number {
         const fs = Math.max(0.48, fontScale);
         const rimPad = 3;
         const bodyPad = 9;
         const textX = rimPad + bodyPad;
         const innerPad = 2 * textX;

         const kickerFS = Math.max(8, Math.round(Href * 0.015 * fs));
         const titleFS = Math.max(9, Math.round(Href * 0.024 * fs));
         const paraFS = Math.max(9, Math.round(Href * 0.021 * fs));

         let maxTw = 0;

         function meas(line: string, style: Record<string, unknown>) {
            if (!line) return;
            const t = new Text({
               text: line,
               style: { ...style, wordWrap: false },
               roundPixels: true,
            });
            maxTw = Math.max(maxTw, t.width);
            t.destroy();
         }

         if (panel.kicker.trim()) {
            meas(panel.kicker.trim().toUpperCase(), {
               fontFamily: 'system-ui, sans-serif',
               fontSize: kickerFS,
               fontWeight: '700',
               fill: 0x5c4a38,
               letterSpacing: kickerFS * 0.08,
            });
         }
         if (panel.title.trim()) {
            meas(panel.title.trim(), {
               fontFamily: 'system-ui, sans-serif',
               fontSize: titleFS,
               fontWeight: '800',
               fill: 0x2a1810,
               lineHeight: titleFS * 1.2,
            });
         }
         for (const para of splitSitePanelBody(panel.body)) {
            meas(para, {
               fontFamily: 'system-ui, sans-serif',
               fontSize: paraFS,
               fill: 0x3d3228,
               lineHeight: paraFS * 1.5,
            });
         }

         const outer = Math.ceil(maxTw + innerPad);
         return Math.min(capOuter, Math.max(120, outer));
      }

      function buildSitePanelPixi(panel: SitePanelSpec, outerMaxW: number, Href: number, fontScale: number) {
         const fs = Math.max(0.48, fontScale);
         const rimPad = 3;
         const bodyPad = 9;
         const textX = rimPad + bodyPad;
         const textW = Math.max(40, outerMaxW - 2 * textX);
         /** Отступ сверху под «губку» платформы как у игровых блоков */
         const lipGap = 14;

         const rootPc = new Container();
         const kickerFS = Math.max(8, Math.round(Href * 0.015 * fs));
         const titleFS = Math.max(9, Math.round(Href * 0.024 * fs));
         const paraFS = Math.max(9, Math.round(Href * 0.021 * fs));

         let ty = lipGap + rimPad + bodyPad;
         const textNodes: InstanceType<typeof Text>[] = [];

         if (panel.kicker.trim()) {
            const t = new Text({
               text: panel.kicker.trim().toUpperCase(),
               style: {
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: kickerFS,
                  fontWeight: '700',
                  fill: 0x5c4a38,
                  letterSpacing: kickerFS * 0.08,
                  wordWrap: true,
                  wordWrapWidth: textW,
               },
               roundPixels: true,
            });
            t.position.set(textX, ty);
            ty += Math.ceil(t.height) + 4;
            textNodes.push(t);
         }
         if (panel.title.trim()) {
            const t = new Text({
               text: panel.title.trim(),
               style: {
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: titleFS,
                  fontWeight: '800',
                  fill: 0x2a1810,
                  lineHeight: titleFS * 1.2,
                  wordWrap: true,
                  wordWrapWidth: textW,
               },
               roundPixels: true,
            });
            t.position.set(textX, ty);
            ty += Math.ceil(t.height) + 8;
            textNodes.push(t);
         }
         for (const para of splitSitePanelBody(panel.body)) {
            const t = new Text({
               text: para,
               style: {
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: paraFS,
                  fill: 0x3d3228,
                  lineHeight: paraFS * 1.5,
                  wordWrap: true,
                  wordWrapWidth: textW,
               },
               roundPixels: true,
            });
            t.position.set(textX, ty);
            ty += Math.ceil(t.height) + 7;
            textNodes.push(t);
         }

         const panelH = ty + bodyPad + rimPad;

         rootPc.addChild(createPlatformGraphics(Graphics, 0, 0, outerMaxW, panelH));

         const paper = new Graphics({ roundPixels: true });
         paper
            .roundRect(rimPad + 6, lipGap + 4, outerMaxW - 2 * (rimPad + 6), panelH - lipGap - rimPad - 10, 8)
            .fill({ color: 0xfafff8, alpha: 0.92 })
            .stroke({ width: 1, color: 0x256941, alpha: 0.28 });
         rootPc.addChild(paper);

         for (const tn of textNodes) rootPc.addChild(tn);

         return { root: rootPc, height: panelH };
      }

      function destroyClusterStack(st: { h: number; c: InstanceType<typeof Container> }[]) {
         for (const it of st) {
            it.c.destroy({ children: true });
         }
      }

      function buildClusterStackAtScale(
         clusterSpec: SiteClusterSpec,
         pillarReserve: number,
         scale: number,
         capOuter: number,
      ): {
         stack: { h: number; c: InstanceType<typeof Container> }[];
         totalContentH: number;
         clusterW: number;
      } {
         let clusterW = 120;
         for (const pan of clusterSpec.panels) {
            clusterW = Math.max(clusterW, measureSitePanelIntrinsicOuterW(pan, H, scale, capOuter));
         }

         const stack: { h: number; c: InstanceType<typeof Container> }[] = [];
         if (pillarReserve > 0) {
            stack.push({ h: pillarReserve, c: new Container() });
         }
         for (const pan of clusterSpec.panels) {
            const built = buildSitePanelPixi(pan, clusterW, H, scale);
            stack.push({ h: built.height, c: built.root });
         }
         const totalContentH = stack.reduce((s, it) => s + it.h, 0) + Math.max(0, stack.length - 1) * PANEL_STACK_GAP;
         return { stack, totalContentH, clusterW };
      }

      const siteCollisionSurfaces: CollisionSurface[] = [];

      for (let sci = 0; sci < n; sci++) {
         const screen = screens[sci]!;
         const ox = sci * seg;
         const sc = screen.siteCluster;
         const cbPct = parsePctBottom(sc.bottom);
         if (cbPct == null) continue;

         const cx = clusterCenterX(sc.left, ox, seg);
         const capOuter = Math.min(
            Math.round(parseClusterMaxWidthPx(sc.maxWidth, props.viewportWidthPx)),
            Math.max(120, seg - 16),
         );
         const pillarReserve = pillarReservePxForScreen(screen, TW);

         const maxClusterBottomY = H - (HUD_BAND_H + HUD_BOTTOM_PAD + 18);
         let clusterBottomEdgeY = Math.min(H - (cbPct / 100) * H, maxClusterBottomY);
         const maxAllowedContentH = Math.max(120, clusterBottomEdgeY - CLUSTER_TOP_SAFE_PX);

         let chosenStack: { h: number; c: InstanceType<typeof Container> }[] | null = null;
         let totalContentH = 0;
         let clusterW = capOuter;

         for (let scale = 1; scale >= 0.22 - 1e-9; scale -= 0.065) {
            const built = buildClusterStackAtScale(sc, pillarReserve, scale, capOuter);
            if (built.totalContentH <= maxAllowedContentH) {
               chosenStack = built.stack;
               totalContentH = built.totalContentH;
               clusterW = built.clusterW;
               break;
            }
            destroyClusterStack(built.stack);
         }

         if (!chosenStack) {
            const built = buildClusterStackAtScale(sc, pillarReserve, 0.18, capOuter);
            chosenStack = built.stack;
            totalContentH = built.totalContentH;
            clusterW = built.clusterW;
         }

         const contentH = totalContentH;
         const fits = contentH <= maxAllowedContentH + 2;
         const viewH = fits ? Math.ceil(contentH) : Math.floor(maxAllowedContentH);
         clusterBottomEdgeY = Math.min(Math.max(clusterBottomEdgeY, CLUSTER_TOP_SAFE_PX + viewH), maxClusterBottomY);
         const topY = clusterBottomEdgeY - viewH;

         const outer = new Container();
         outer.position.set(Math.round(cx - clusterW / 2), Math.round(topY));

         const maskShape = new Graphics({ roundPixels: true });
         maskShape.rect(0, 0, clusterW, viewH).fill({ color: 0xffffff });
         outer.addChild(maskShape);
         outer.mask = maskShape;

         const inner = new Container();
         outer.addChild(inner);

         let bottom = totalContentH;
         for (let i = 0; i < chosenStack.length; i++) {
            if (i > 0) bottom -= PANEL_STACK_GAP;
            const item = chosenStack[i]!;
            bottom -= item.h;
            item.c.position.set(0, bottom);
            inner.addChild(item.c);
         }

         const padSurfX = 14;
         const oxWorld = outer.position.x;
         for (let si = 0; si < chosenStack.length; si++) {
            if (pillarReserve > 0 && si === 0) continue;
            const item = chosenStack[si]!;

            const walkPixiY = outer.position.y + item.c.position.y;
            siteCollisionSurfaces.push({
               x0: Math.round(oxWorld + padSurfX),
               x1: Math.round(oxWorld + clusterW - padSurfX),
               surfaceY: Math.round(H - walkPixiY),
            });
         }

         decorBackLayer.addChild(outer);
      }

      emit('siteCollision', siteCollisionSurfaces);

      activeCoinSprites = allCoinSprites;
      syncCoinCollectedVisibility();

      /* Марио */
      const ms = new Sprite({
         texture: marioTextures.idle,
         roundPixels: true,
      });
      ms.anchor.set(0.5, 1);
      ms.position.set(Math.round(props.marioXWorld), Math.round(H - props.marioFeetYFromBottom));
      ms.scale.set(props.marioFacing * MARIO_SCALE, MARIO_SCALE);
      root.addChild(ms);
      marioSprite = ms;

      const popupLayer = new Container();
      root.addChild(popupLayer);
      const popupRTMap = new Map<string, { text: InstanceType<typeof Text>; birthMs: number }>();

      /* HUD (тот же canvas; следует за cameraPx) */
      const hudPanel = new Graphics({ roundPixels: true });
      const hudTrack = new Graphics({ roundPixels: true });
      const hudFill = new Graphics({ roundPixels: true });
      const hudCoin = new Graphics({ roundPixels: true });
      const hudLabel = new Text({
         text: `× ${props.coinsCollected} / ${props.coinsTotal}`,
         style: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 14,
            fill: 0xffe082,
            letterSpacing: 0.5,
         },
         roundPixels: true,
      });
      hudScreenRoot.addChild(hudPanel);
      hudScreenRoot.addChild(hudTrack);
      hudScreenRoot.addChild(hudFill);
      hudScreenRoot.addChild(hudCoin);
      hudScreenRoot.addChild(hudLabel);

      let hudTrackGeom = { x: 0, y: 0, w: 0, h: 0 };

      function refreshHudProgressFill() {
         hudFill.clear();
         const pct = clamp01(props.scrollPct);
         const tg = hudTrackGeom;
         const inner = 2;
         const tw = tg.w - inner * 2;
         const th = tg.h - inner * 2;
         const x0 = tg.x + inner;
         const y0 = tg.y + inner;
         if (tw <= 0 || th <= 0) return;
         const wFill = Math.max(0, Math.round(tw * pct));
         if (wFill <= 0) return;
         hudFill.roundRect(x0, y0, wFill, th, th * 0.45).fill({ color: 0x7dce9a });
      }

      function layoutHudOverlay() {
         hudPanel.clear();
         hudTrack.clear();
         hudFill.clear();

         const bandH = HUD_BAND_H;
         const W = Math.max(120, props.viewportWidthPx - HUD_SIDE_PAD * 2);

         hudLabel.text = `× ${props.coinsCollected} / ${props.coinsTotal}`;

         const panelPadY = 8;
         const labelH = hudLabel.height || 18;
         const panelH = Math.max(36, Math.round(labelH + panelPadY * 2));
         const panelY = Math.round((bandH - panelH) * 0.5);

         const labelW = hudLabel.width;
         const panelW = Math.round(12 + HUD_COIN_ICON_PX + 8 + labelW + 12);

         hudPanel
            .roundRect(0, panelY, panelW, panelH, 8)
            .fill({ color: 0x1a120c, alpha: 0.88 })
            .stroke({ width: 2, color: 0x2a1810 });

         hudCoin.position.set(Math.round(12 + HUD_COIN_ICON_PX * 0.5), Math.round(panelY + panelH * 0.5));
         hudCoin.clear();
         drawHudCoinIcon(hudCoin, 0, 0, HUD_COIN_ICON_PX);

         hudLabel.position.set(12 + HUD_COIN_ICON_PX + 8, Math.round(panelY + panelH * 0.5));
         hudLabel.anchor.set(0, 0.5);

         const trackX = panelW + HUD_INNER_GAP;
         const trackW = Math.max(48, W - trackX);
         const trackH = 10;
         const trackY = Math.round((bandH - trackH) * 0.5);

         hudTrack.roundRect(trackX, trackY, trackW, trackH, 5).fill({ color: 0x1a120c, alpha: 0.42 }).stroke({
            width: 2,
            color: 0x2a1810,
         });

         hudTrackGeom = { x: trackX, y: trackY, w: trackW, h: trackH };
         refreshHudProgressFill();
      }

      layoutHudOverlay();
      hudLayoutFn = layoutHudOverlay;
      hudFillFn = refreshHudProgressFill;

      const motionOff = props.reduceMotion ?? false;

      mainTicker = () => {
         const deltaMS = application.ticker.deltaMS;
         const tWallMs = performance.now();
         const tSec = tWallMs / 1000;
         const Hloc = props.viewHeightPx;
         const rm = props.reduceMotion ?? false;

         hudScreenRoot.position.set(
            Math.round(props.cameraPx + HUD_SIDE_PAD),
            Math.round(Hloc - HUD_BAND_H - HUD_BOTTOM_PAD),
         );

         /* Облака — фаза от delta, без округления X (плавнее). */
         const par = props.parallaxShift;
         const dt = deltaMS / 1000;
         for (const cr of cloudRuntimes) {
            const period = Math.max(6, cr.driftSec);
            cr.driftPhaseRad += dt * ((Math.PI * 2) / period);
            const drift = Math.sin(cr.driftPhaseRad + cr.phase) * cr.driftPx * 0.4;
            cr.root.position.set(cr.baseX + par * cr.parallaxFactor + drift, cr.baseY);
         }

         /* Монеты + золотой столб */
         if (!rm && (allCoinSprites.size > 0 || pillarGoldSprites.length > 0)) {
            coinFlipAccumMs += deltaMS;
            const tPulse = coinFlipAccumMs / 1000;
            const spin = Math.max(0.26, Math.abs(Math.cos(tPulse * 7.4)));
            const bob = 1 + 0.035 * Math.sin(tPulse * 9.2);
            allCoinSprites.forEach((c) => {
               if (c.visible) c.scale.set(spin * bob, bob);
            });
            const gPulse = 1 + 0.052 * Math.sin(tPulse * 7);
            for (const pg of pillarGoldSprites) {
               pg.scale.set(gPulse);
            }
         }

         /* Враги */
         for (const mr of mobRuntimes) {
            const m = mr.spec;
            const cfg = MOB_ANIM[m.type];
            const ws = m.wanderSec;
            const wx = wanderShift(ws, m.wanderPx, m.phaseSec, tSec);
            mr.wanderLayer.position.set(mr.baseX + Math.round(wx), mr.feetTopY);

            const sc = cfg.scale;
            if (!rm && ws != null && ws > 0 && cfg.kind !== 'atlas-spin') {
               const p = (((tSec - (m.phaseSec ?? 0)) % ws) + ws) % ws;
               const u = p / ws;
               const movingRight = u < 0.5;
               mr.face.scale.x = (movingRight ? -1 : 1) * sc;
               mr.face.scale.y = sc;
            } else {
               mr.face.scale.set(sc, sc);
            }

            mr.fxLayer.position.set(0, 0);

            if (m.type === 'piranha' && !rm) {
               mr.fxLayer.y = Math.sin(tSec * ((Math.PI * 2) / 1.85)) * -9;
            }

            const floatFx = cfg.kind === 'atlas' && cfg.fx === 'float';
            if (floatFx && !rm) {
               mr.fxLayer.x = Math.sin(tSec * 2.1) * 3.5;
               mr.fxLayer.y += Math.cos(tSec * 2.6) * 5;
            }

            if (cfg.kind === 'atlas-spin' && !rm) {
               const dur = cfg.spinSec ?? 3;
               mr.face.rotation += (deltaMS / 1000) * ((Math.PI * 2) / dur);
            } else {
               mr.face.rotation = 0;
            }

            if (!rm && cfg.kind === 'atlas') {
               mr.animMs += deltaMS;
               const fi = Math.floor((mr.animMs / 1000) * cfg.fps) % cfg.frames.length;
               const fr = cfg.frames[fi]!;
               mr.face.texture = enemySubTex(enemyRaw, fr.x, fr.y, cfg.frameW, cfg.frameH);
            }
         }

         /* Марио */
         if (marioSprite && marioTextures) {
            const mx = Math.round(props.marioXWorld);
            const my = Math.round(Hloc - props.marioFeetYFromBottom);
            marioSprite.position.set(mx, my);
            marioSprite.scale.x = props.marioFacing * MARIO_SCALE;
            marioSprite.scale.y = MARIO_SCALE;

            const pose = props.marioPose;
            if (rm) {
               marioSprite.texture = marioTextures.idle;
            } else if (pose === 'walk') {
               marioWalkAccumMs += deltaMS;
               const ph = Math.floor(marioWalkAccumMs / 95) % 2;
               marioSprite.texture = ph === 0 ? marioTextures.walk_a : marioTextures.walk_b;
            } else if (pose === 'jump') {
               marioSprite.texture = marioTextures.jump;
            } else if (pose === 'fall') {
               marioSprite.texture = marioTextures.duck;
            } else {
               marioSprite.texture = marioTextures.idle;
            }
         }

         /* Всплывающие очки при сборе монеты */
         const pops = props.coinPopups ?? [];
         const seen = new Set(pops.map((p) => p.uid));
         for (const p of pops) {
            let rt = popupRTMap.get(p.uid);
            if (!rt) {
               const tx = new Text({
                  text: '+100',
                  style: {
                     fontFamily: 'ui-rounded, "Segoe UI", system-ui, sans-serif',
                     fontSize: 19,
                     fontWeight: '900',
                     fill: 0xfff8e1,
                     stroke: { color: 0x2a1810, width: 4 },
                     letterSpacing: 0.3,
                  },
                  roundPixels: true,
               });
               tx.anchor.set(0.5, 1);
               popupLayer.addChild(tx);
               rt = { text: tx, birthMs: performance.now() };
               popupRTMap.set(p.uid, rt);
            }
            const age = performance.now() - rt.birthMs;
            const u = Math.min(1, age / 820);
            const baseY = Hloc - p.bottomPx;
            if (rm) {
               rt.text.position.set(Math.round(p.worldX), Math.round(baseY - 20));
               rt.text.alpha = 0.92;
               rt.text.scale.set(1, 1);
            } else if (u < 0.12) {
               const t = u / 0.12;
               const dy = 10 * (1 - t) + -4 * t;
               const alpha = t;
               const sc = 0.25 + t * (1.18 - 0.25);
               rt.text.position.set(Math.round(p.worldX), Math.round(baseY + dy));
               rt.text.alpha = alpha;
               rt.text.scale.set(sc, sc);
            } else {
               const tt = (u - 0.12) / 0.88;
               const e = tt * tt * (3 - 2 * tt);
               const dy = -4 + (-58 + 4) * e;
               const alpha = 1 - tt * tt;
               const sc = 1.18 + (1 - 1.18) * tt;
               rt.text.position.set(Math.round(p.worldX), Math.round(baseY + dy));
               rt.text.alpha = alpha;
               rt.text.scale.set(sc, sc);
            }
         }
         for (const uid of [...popupRTMap.keys()]) {
            if (!seen.has(uid)) {
               popupRTMap.get(uid)?.text.destroy();
               popupRTMap.delete(uid);
            }
         }
      };

      application.ticker.add(mainTicker);
      if (motionOff) {
         /* один кадр облака без дрейфа */
         mainTicker();
      }
   } finally {
      building = false;
   }
}

watch(
   () => [props.segmentWidthPx, props.viewHeightPx, props.screens, props.reduceMotion] as const,
   () => {
      void rebuild();
   },
   { deep: true },
);

watch(
   () => props.collectedCoinIds,
   () => {
      syncCoinCollectedVisibility();
   },
   { deep: true },
);

watch(
   () => [props.coinsCollected, props.coinsTotal, props.viewportWidthPx] as const,
   () => {
      hudLayoutFn?.();
   },
);

watch(
   () => props.scrollPct,
   () => {
      hudFillFn?.();
   },
);

onMounted(() => {
   void rebuild();
});

onUnmounted(() => {
   if (app && mainTicker) {
      app.ticker.remove(mainTicker);
      mainTicker = null;
   }
   activeCoinSprites = null;
   pillarGoldSprites = [];
   mobRuntimes = [];
   cloudRuntimes = [];
   marioSprite = null;
   marioTextures = null;
   hudLayoutFn = null;
   hudFillFn = null;
   app?.destroy(true);
   app = null;
});
</script>

<style scoped>
.world-pixi-tiles :deep(canvas) {
   display: block;
}
</style>
