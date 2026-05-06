import { Assets, Rectangle, Texture } from 'pixi.js';
import { TILE_RECT, TILE_SHEET_URL, type TileKey } from '~/data/tileSprites';

let baseTexture: Texture | null = null;
const subCache = new Map<TileKey, Texture>();

export async function loadKenneyTilesBase(): Promise<Texture> {
   if (baseTexture) return baseTexture;
   baseTexture = await Assets.load<Texture>(TILE_SHEET_URL);
   /* Pixel-art atlas: linear filtering смешивает тексели → кажется «ужато» в клетке */
   baseTexture.source.style.scaleMode = 'nearest';
   return baseTexture;
}

export function kenneySubTexture(base: Texture, key: TileKey): Texture {
   let t = subCache.get(key);
   if (!t) {
      const r = TILE_RECT[key];
      t = new Texture({
         source: base.source,
         frame: new Rectangle(r.x, r.y, r.w, r.h),
      });
      subCache.set(key, t);
   }
   return t;
}

/** После смены файла атласа или ключей тайлов в dev */
export function resetKenneyPixiTextures(): void {
   subCache.clear();
   baseTexture = null;
}
