/**
 * Kenney.nl «Spritesheets Tiles Default», CC0.
 * Лист: `/sprites/spritesheet-tiles-default.png` (1169×1169), кадры 64×64, шаг ячейки **65 px**, **18** колонок.
 */

export const TILE_SHEET_URL = '/sprites/spritesheet-tiles-default.png';

export const KENNEY_TILE_FRAME_PX = 64;
/** Центр кадра 64×64 от левого/нижнего края DOM-бокса спрайта */
export const KENNEY_TILE_HALF_PX = KENNEY_TILE_FRAME_PX / 2;
export const KENNEY_TILE_STRIDE_PX = 65;
export const TILES_PER_ROW = 18;

export const TILE_PIXEL_RATIO = 1;

export function tileBlockScreenPx(): number {
   return KENNEY_TILE_FRAME_PX * TILE_PIXEL_RATIO;
}

export const TILE_SHEET_PX = { w: 1169, h: 1169 } as const;

export type TileRect = { x: number; y: number; w: number; h: number };

export function tileIndexFromGrid(col: number, row: number): number {
   return row * TILES_PER_ROW + col;
}

export function tileRectFromIndex(index: number): TileRect {
   const col = index % TILES_PER_ROW;
   const row = Math.floor(index / TILES_PER_ROW);
   return {
      x: col * KENNEY_TILE_STRIDE_PX,
      y: row * KENNEY_TILE_STRIDE_PX,
      w: KENNEY_TILE_FRAME_PX,
      h: KENNEY_TILE_FRAME_PX,
   };
}

/**
 * Координаты сетки (col, row) как в Kenney-листе: x = col×65, y = row×65.
 *
 * Песок / оранжевый биом — верх земли и «тонкие» платформы в стиле промо Kenney.
 * Зелёный биом — для кустов/облаков и запасных спрайтов.
 */
export const TILE_INDEX = {
   /** Песок: верхняя кромка земли (середина верхнего ряда набора). */
   terrain_sand_horizontal_middle: tileIndexFromGrid(1, 9),
   /** Песок: заполнитель под кромкой (центр среднего ряда набора). */
   terrain_sand_block_center: tileIndexFromGrid(1, 10),
   /** Тонкая висячая платформа песка: левый / центр / правый (подряд под зелёным thin-row, Kenney). */
   terrain_sand_platform_left: tileIndexFromGrid(6, 11),
   terrain_sand_platform_middle: tileIndexFromGrid(7, 11),
   terrain_sand_platform_right: tileIndexFromGrid(8, 11),

   terrain_grass_horizontal_middle: tileIndexFromGrid(2, 10),
   terrain_grass_block_center: tileIndexFromGrid(2, 11),
   terrain_grass_block_top: tileIndexFromGrid(2, 10),

   terrain_grass_platform_left: tileIndexFromGrid(6, 10),
   terrain_grass_platform_middle: tileIndexFromGrid(7, 10),
   terrain_grass_platform_right: tileIndexFromGrid(8, 10),

   terrain_stone_vertical_middle: tileIndexFromGrid(7, 17),
   terrain_stone_block_top: tileIndexFromGrid(7, 16),
   terrain_stone_block: tileIndexFromGrid(7, 17),

   block_plank: tileIndexFromGrid(8, 0),
   bridge_logs: tileIndexFromGrid(12, 1),
   brick_brown: tileIndexFromGrid(5, 1),
   block_yellow: tileIndexFromGrid(2, 1),
   block_coin: tileIndexFromGrid(3, 1),

   hill_top: tileIndexFromGrid(11, 3),
   bush: tileIndexFromGrid(13, 1),
   /** Два кадра монеты подряд в листе Kenney (анимация без rotateY). */
   coin_gold: tileIndexFromGrid(0, 2),
   coin_gold_b: tileIndexFromGrid(1, 2),
   terrain_grass_cloud_middle: tileIndexFromGrid(17, 9),

   terrain_purple_horizontal_middle: tileIndexFromGrid(7, 12),
} as const;

export type TileKey = keyof typeof TILE_INDEX;

export const TILE_RECT: { [K in TileKey]: TileRect } = {} as { [K in TileKey]: TileRect };

for (const k of Object.keys(TILE_INDEX) as TileKey[]) {
   TILE_RECT[k] = tileRectFromIndex(TILE_INDEX[k]);
}

export function tileBgStyles(key: TileKey, scale: number): Record<string, string | number> {
   const r = TILE_RECT[key];
   const sw = TILE_SHEET_PX.w * scale;
   const sh = TILE_SHEET_PX.h * scale;
   return {
      backgroundImage: `url(${TILE_SHEET_URL})`,
      backgroundSize: `${sw}px ${sh}px`,
      backgroundPosition: `${-r.x * scale}px ${-r.y * scale}px`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
   };
}

export function tileStretchBgStyles(key: TileKey, widthPx: number, heightPx: number): Record<string, string | number> {
   const r = TILE_RECT[key];
   const bw = TILE_SHEET_PX.w;
   const bh = TILE_SHEET_PX.h;
   const sx = widthPx / r.w;
   const sy = heightPx / r.h;
   return {
      backgroundImage: `url(${TILE_SHEET_URL})`,
      backgroundSize: `${bw * sx}px ${bh * sy}px`,
      backgroundPosition: `${-r.x * sx}px ${-r.y * sy}px`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
   };
}

export function tileCellBox(key: TileKey, scale: number): Record<string, string> {
   const r = TILE_RECT[key];
   const w = `${r.w * scale}px`;
   const h = `${r.h * scale}px`;
   return {
      width: w,
      height: h,
      flex: '0 0 auto',
   };
}

/**
 * Один DOM-слой: два кадра монеты меняются через animation `background-position`
 * (два кадра монеты анимируются в Pixi: WorldPixiTiles.)
 */
export function kenneyCoinFlipStyle(scale: number): Record<string, string | number> {
   const rA = TILE_RECT.coin_gold;
   const rB = TILE_RECT.coin_gold_b;
   const sw = TILE_SHEET_PX.w * scale;
   const sh = TILE_SHEET_PX.h * scale;
   return {
      ...tileCellBox('coin_gold', scale),
      backgroundImage: `url(${TILE_SHEET_URL})`,
      backgroundSize: `${sw}px ${sh}px`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: `${-rA.x * scale}px ${-rA.y * scale}px`,
      imageRendering: 'pixelated',
      '--coin-pos-a-x': `${-rA.x * scale}px`,
      '--coin-pos-a-y': `${-rA.y * scale}px`,
      '--coin-pos-b-x': `${-rB.x * scale}px`,
      '--coin-pos-b-y': `${-rB.y * scale}px`,
   };
}
