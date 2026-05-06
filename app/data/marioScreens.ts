/** Типы экрана уровня (данные приходят из `generateMarioLevel`) */

export interface CloudSpec {
   left: string;
   top: string;
   width: number;
   opacity?: number;
   /** CSS-анимация дрейфа */
   driftDurationSec?: number;
   driftPx?: number;
}

export type MonsterKind =
   | 'goomba'
   | 'koopa'
   | 'piranha'
   | 'boo'
   | 'bullet'
   | 'slime_fire'
   | 'slime_spike'
   | 'ladybug'
   | 'mouse'
   | 'frog'
   | 'worm'
   | 'worm_ring'
   | 'bee';

export interface MonsterSpec {
   type: MonsterKind;
   left: string;
   bottom: string;
   wanderSec?: number;
   wanderPx?: number;
   phaseSec?: number;
}

export interface PipeSpec {
   left: string;
   height: number;
}

export interface HillSpec {
   left: string;
   width: number;
   variant: 'green' | 'teal' | 'brown';
}

export interface BushSpec {
   left: string;
   variant: 1 | 2 | 3;
}

export interface CoinSpec {
   left: string;
   bottom: string;
}

export interface PlatformSpec {
   left: string;
   width: string;
   bottom: string;
   height?: string;
}

/** Одна «плашка» портфолио на экране уровня */
export interface SitePanelSpec {
   kicker: string;
   title: string;
   body: string;
}

export interface SiteClusterSpec {
   left: string;
   bottom: string;
   maxWidth?: string;
   /** Несколько отдельных блоков вместо одной простыни */
   panels: SitePanelSpec[];
}

export interface MarioScreenData {
   zoneIndex: number;
   sky: 'day' | 'sunset' | 'dusk' | 'cave' | 'night';
   clouds: CloudSpec[];
   cloudsExtra?: CloudSpec[];
   monsters: MonsterSpec[];
   pipes: PipeSpec[];
   hills: HillSpec[];
   bushes: BushSpec[];
   coins: CoinSpec[];
   pillarDecor?: { count: number; variant: 'grass' | 'stone' | 'wood' | 'brick' | 'gold' };
   platforms: PlatformSpec[];
   siteCluster: SiteClusterSpec;
}

/** Четыре горизонтальных слоя неба (сверху вниз) — для плавного смешения зон по X */
export const SKY_BAND_COLORS: Record<
   MarioScreenData['sky'],
   readonly [string, string, string, string]
> = {
   day: ['#7ec8ea', '#9bd4ef', '#c5e8f2', '#d8efd8'],
   sunset: ['#ff9a6b', '#ffb587', '#f0c8a8', '#c8e0c8'],
   dusk: ['#5c6bc8', '#7e91d4', '#a8b0c8', '#8a9a88'],
   cave: ['#2c3e50', '#3d5668', '#5a7068', '#5d7a62'],
   night: ['#0d1426', '#1a2744', '#2a3848', '#3d5248'],
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
   const h = hex.replace('#', '');
   return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
   };
}

function rgbToHex(r: number, g: number, b: number): string {
   const c = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
         .toString(16)
         .padStart(2, '0');
   return `#${c(r)}${c(g)}${c(b)}`;
}

export function mixHex(a: string, b: string, t: number): string {
   const A = hexToRgb(a);
   const B = hexToRgb(b);
   return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

/** Горизонтальный градиент одного «ряда» неба: плавный переход между погодами соседних зон */
export function buildSmoothSkyBand(skies: MarioScreenData['sky'][], rowIndex: number): string {
   const STEPS = 72;
   const n = skies.length;
   if (n === 0) {
      return 'linear-gradient(90deg, #7ec8ea 0%, #7ec8ea 100%)';
   }
   const stops: string[] = [];
   for (let k = 0; k <= STEPS; k++) {
      const u = k / STEPS;
      const pos = n <= 1 ? 0 : u * (n - 1);
      const i = Math.min(Math.floor(pos), n - 1);
      const frac = n <= 1 ? 0 : pos - i;
      const s0 = skies[i]!;
      const s1 = skies[Math.min(i + 1, n - 1)]!;
      const c0 = SKY_BAND_COLORS[s0][rowIndex]!;
      const c1 = SKY_BAND_COLORS[s1][rowIndex]!;
      const c = mixHex(c0, c1, frac);
      stops.push(`${c} ${(u * 100).toFixed(2)}%`);
   }
   return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function buildWorldSkyLayers(skies: MarioScreenData['sky'][]): [
   string,
   string,
   string,
   string,
] {
   return [
      buildSmoothSkyBand(skies, 0),
      buildSmoothSkyBand(skies, 1),
      buildSmoothSkyBand(skies, 2),
      buildSmoothSkyBand(skies, 3),
   ];
}

/** Одно небо на весь мир: вертикальная «дымка» поверх плавного горизонтального перехода зон (без горизонтальных полос-слоёв). */
export function buildWorldSkyBackground(skies: MarioScreenData['sky'][]): string {
   const hue = buildSmoothSkyBand(skies, 1);
   const wash = `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(92,148,252,0.08) 38%, rgba(80,160,72,0.28) 72%, rgba(52,104,48,0.45) 100%)`;
   return `${wash}, ${hue}`;
}

export function getSkyGradient(sky: MarioScreenData['sky']): string {
   switch (sky) {
      case 'sunset':
         return 'linear-gradient(180deg, #ff9a6b 0%, #ffd194 38%, #a8d8f0 72%, #c8e8c0 100%)';
      case 'dusk':
         return 'linear-gradient(180deg, #5c6bc8 0%, #9fa8da 35%, #b0bec5 65%, #8d9e87 100%)';
      case 'cave':
         return 'linear-gradient(180deg, #2c3e50 0%, #4a6278 45%, #6d8a75 100%)';
      case 'night':
         return 'linear-gradient(180deg, #0d1426 0%, #1a2744 40%, #2d3d52 70%, #3d5248 100%)';
      default:
         return 'linear-gradient(180deg, #5c94fc 0%, #5c94fc 46%, #88c070 100%)';
   }
}
