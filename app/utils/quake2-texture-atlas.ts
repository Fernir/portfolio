import { parseQuakePakBuffer, quakePakRead, type QuakePak } from '~/utils/quake2-pak';
import { decodeWalBuffer, peekWalDimensions, type WalImage } from '~/utils/quake2-wal';
import { joinPublicAsset } from '~/utils/publicAsset';

export type AtlasUvRect = { u0: number; v0: number; u1: number; v1: number; tw: number; th: number };

export type Q2AtlasBuild = {
   canvas: HTMLCanvasElement;
   /** Normalized UV rectangles in atlas [0,1], plus original WAL dimensions for lightmap-style scaling */
   rects: Map<string, AtlasUvRect>;
};

function checkerWal(name: string, w: number, h: number): WalImage {
   const rgba = new Uint8ClampedArray(w * h * 4);
   let hcode = 0;
   for (let i = 0; i < name.length; i++) hcode = (hcode * 31 + name.charCodeAt(i)) | 0;
   const a = [40 + (hcode & 31), 42 + ((hcode >> 5) & 31), 38 + ((hcode >> 10) & 31)];
   const b = [22, 20, 24];
   const cs = 16;
   for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
         const ix = x + y * w;
         const c = (Math.floor(x / cs) + Math.floor(y / cs)) % 2 === 0 ? a : b;
         rgba[ix * 4] = c[0]!;
         rgba[ix * 4 + 1] = c[1]!;
         rgba[ix * 4 + 2] = c[2]!;
         rgba[ix * 4 + 3] = 255;
      }
   }
   return { width: w, height: h, rgba };
}

/** Neutral slab when a WAL is missing (avoid rainbow checkers polluting the whole atlas view). */
function grayWalPlaceholder(name: string, w: number, h: number): WalImage {
   const rgba = new Uint8ClampedArray(w * h * 4);
   let hcode = 0;
   for (let i = 0; i < name.length; i++) hcode = (hcode * 31 + name.charCodeAt(i)) | 0;
   const base = 52 + (hcode % 9);
   for (let i = 0, n = w * h; i < n; i++) {
      const j = i * 4;
      const noise = ((hcode ^ i * 516072919) & 7) - 3;
      const g = Math.max(28, Math.min(88, base + noise));
      rgba[j] = g - 4;
      rgba[j + 1] = g;
      rgba[j + 2] = g - 2;
      rgba[j + 3] = 255;
   }
   return { width: w, height: h, rgba };
}

function normalizeWalPath(key: string): string[] {
   const k = key.trim().replace(/\\/g, '/').toLowerCase();
   const alt = key.trim().replace(/\\/g, '/');
   return k === alt ? [k] : [k, alt];
}

/** Убирает хвост `.wal`, чтобы URL не стал `…/tex.wal.wal` (ключи из BSP уже с расширением). */
function walPathStem(path: string): string {
   return path.trim().replace(/\\/g, '/').replace(/\.wal$/i, '');
}

function normalizeTextureStem(s: string): string {
   return s.trim().toLowerCase().replace(/\\/g, '/').replace(/\.wal$/i, '');
}

/** BSP stem → flat filename (no `.wal`) under `flatDir`; see `public/q2/texture-flat-map.json`. */
type TextureFlatMap = { flatDir: string; toFlatFile: Record<string, string> };

let textureFlatMap: TextureFlatMap | null | undefined;
let textureFlatMapLoadPromise: Promise<TextureFlatMap | null> | undefined;

async function getTextureFlatMap(appBaseURL?: string): Promise<TextureFlatMap | null> {
   if (textureFlatMap !== undefined) return textureFlatMap;
   if (textureFlatMapLoadPromise !== undefined) return textureFlatMapLoadPromise;
   textureFlatMapLoadPromise = (async () => {
      const urls = [...new Set([joinPublicAsset(appBaseURL || '/', '/q2/texture-flat-map.json'), '/q2/texture-flat-map.json'])];
      for (const url of urls) {
         try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const j: unknown = await res.json();
            if (!j || typeof j !== 'object') continue;
            const flatDir = (j as { flatDir?: unknown }).flatDir;
            const raw = (j as { toFlatFile?: unknown }).toFlatFile;
            if (typeof flatDir !== 'string' || !raw || typeof raw !== 'object') continue;
            const toFlatFile: Record<string, string> = {};
            for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
               const nk = normalizeTextureStem(k);
               if (nk && typeof v === 'string' && v.length > 0) toFlatFile[nk] = v;
            }
            textureFlatMap = { flatDir, toFlatFile };
            return textureFlatMap;
         } catch {
            /* ignore */
         }
      }
      textureFlatMap = null;
      return null;
   })();
   return textureFlatMapLoadPromise;
}

function tryDecodeWalBuffer(buf: ArrayBuffer, pathKey: string): WalImage | null {
   if (buf.byteLength < 100) return null;
   const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
   /* SPA / error HTML responses often start with `<`; WAL begins with texture path ASCII */
   if (head[0] === 0x3c) return null;
   const dec = decodeWalBuffer(buf);
   if (dec) return dec;
   const dims = peekWalDimensions(buf);
   if (dims) return grayWalPlaceholder(pathKey, dims.width, dims.height);
   return null;
}

async function tryFetchWalOnce(url: string, pathKey: string): Promise<WalImage | null> {
   try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return tryDecodeWalBuffer(buf, pathKey);
   } catch {
      return null;
   }
}

/** Список путей внутри `.pak` для одного stem (как в URL под `textures/`). */
function collectPakWalPaths(stem: string, flatMap: TextureFlatMap | null): string[] {
   const norm = normalizeTextureStem(stem);
   const withWal = (s: string) => (s.toLowerCase().endsWith('.wal') ? s : `${s}.wal`);
   const ordered: string[] = [];
   const seen = new Set<string>();
   const push = (p: string) => {
      const k = withWal(p).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      ordered.push(k);
   };
   if (!norm.startsWith('textures/')) {
      push(`textures/${norm}`);
      push(norm);
   } else {
      push(norm);
      push(norm.slice('textures/'.length));
   }
   if (flatMap?.toFlatFile[norm]) {
      const fb = flatMap.toFlatFile[norm]!;
      push(`textures/${flatMap.flatDir}/${fb}`);
      push(`${flatMap.flatDir}/${fb}`);
   }
   return ordered;
}

let texturePakPromise: Promise<QuakePak | null> | undefined;

function q2TexturePakUrlCandidates(appBaseURL?: string): string[] {
   const base = appBaseURL || '/';
   const fromEnv: string[] = [];
   try {
      const raw = import.meta.env?.NUXT_PUBLIC_Q2_TEXTURE_PAK;
      if (typeof raw === 'string' && raw.trim()) {
         fromEnv.push(
            ...raw
               .split(',')
               .map((s) => s.trim())
               .filter(Boolean)
               .flatMap((u) => {
                  if (u.startsWith('http://') || u.startsWith('https://')) return [u];
                  if (u.startsWith('/')) return [...new Set([joinPublicAsset(base, u), u])];
                  const withSlash = u.startsWith('/') ? u : `/${u}`;
                  return [...new Set([joinPublicAsset(base, withSlash), withSlash])];
               }),
         );
      }
   } catch {
      /* import.meta.env */
   }
   if (fromEnv.length > 0) return [...new Set(fromEnv)];
   /* По умолчанию — один архив из `public/q2/textures.pak` (см. `pnpm run q2:textures:pack`). */
   const def = '/q2/textures.pak';
   return [...new Set([joinPublicAsset(base, def), def])];
}

/**
 * `GET /api/q2/wal?path=…` — сервер отдаёт WAL из `Q2_TEXTURE_PAK_PATH` / `public/q2/textures.pak`.
 * По умолчанию включено; для чисто статического хоста без Nitro: `NUXT_PUBLIC_Q2_WAL_API=0`.
 */
function walApiBaseUrl(appBaseURL?: string): string | null {
   const base = appBaseURL || '/';
   try {
      const flag = import.meta.env?.NUXT_PUBLIC_Q2_WAL_API;
      if (flag === '0' || flag === 'false') return null;
      const b = import.meta.env?.NUXT_PUBLIC_Q2_WAL_API_BASE;
      if (typeof b === 'string' && b.trim()) {
         const t = b.trim().replace(/\/$/, '');
         return joinPublicAsset(base, t.startsWith('/') ? t : `/${t}`).replace(/\/?$/, '');
      }
   } catch {
      /* import.meta.env */
   }
   return joinPublicAsset(base, '/api/q2/wal').replace(/\/?$/, '');
}

async function loadTexturePakOnce(appBaseURL?: string): Promise<QuakePak | null> {
   if (texturePakPromise !== undefined) return texturePakPromise;
   const urls = [...new Set(q2TexturePakUrlCandidates(appBaseURL))];
   if (urls.length === 0) {
      texturePakPromise = Promise.resolve(null);
      return texturePakPromise;
   }
   texturePakPromise = (async () => {
      for (const url of urls) {
         try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            return parseQuakePakBuffer(buf);
         } catch {
            /* ignore */
         }
      }
      return null;
   })();
   return texturePakPromise;
}

/** WAL из клиентского `.pak`, затем с `GET /api/q2/wal` (тот же архив на сервере). Разложенные `.wal` в `public` не используются. */
async function fetchWalOrPlaceholder(pathKey: string, _bases: readonly string[], appBaseURL?: string): Promise<WalImage> {
   const pak = await loadTexturePakOnce(appBaseURL);
   const flatMap = await getTextureFlatMap(appBaseURL);

   if (pak) {
      for (const variant of normalizeWalPath(pathKey)) {
         const stem = walPathStem(variant);
         if (!stem) continue;
         for (const pakPath of collectPakWalPaths(stem, flatMap)) {
            const u8 = quakePakRead(pak, pakPath);
            if (!u8 || u8.byteLength < 56) continue;
            const copy = new Uint8Array(u8).buffer;
            const img = tryDecodeWalBuffer(copy, pathKey);
            if (img) return img;
         }
      }
   }

   const apiBase = walApiBaseUrl(appBaseURL);
   if (apiBase) {
      for (const variant of normalizeWalPath(pathKey)) {
         const stem = walPathStem(variant);
         if (!stem) continue;
         for (const pakPath of collectPakWalPaths(stem, flatMap)) {
            const url = `${apiBase}?path=${encodeURIComponent(pakPath)}`;
            const img = await tryFetchWalOnce(url, pathKey);
            if (img) return img;
         }
      }
   }

   return grayWalPlaceholder(pathKey, 128, 128);
}

/** Доп. корни для разложенных WAL (редко): только `NUXT_PUBLIC_Q2_TEXTURE_BASES`. По умолчанию пусто — только `.pak` и API. */
function textureSearchRoots(_appBaseURL?: string): string[] {
   let fromEnv: string[] = [];
   try {
      const raw = import.meta.env?.NUXT_PUBLIC_Q2_TEXTURE_BASES;
      if (typeof raw === 'string' && raw.length > 0) {
         fromEnv = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
   } catch {
      /* import.meta.env unavailable (SSR bundle tools) */
   }
   return [...new Set(fromEnv.map((b) => b.replace(/\/$/, '')))];
}

function potCeil(n: number, max: number) {
   let p = 256;
   while (p < n && p < max) p *= 2;
   return Math.min(p, max);
}

/** Shelf-pack WAL mip0 RGBA into one atlas (power-of-two side up to maxSide). */
export async function buildQ2WalAtlas(
   uniqueNames: string[],
   textureRoots?: string[],
   appBaseURL?: string,
): Promise<Q2AtlasBuild> {
   const roots = textureRoots?.length ? textureRoots : textureSearchRoots(appBaseURL);
   const sorted = [...new Set(uniqueNames)].filter(Boolean).sort();
   if (sorted.length === 0) {
      const img = checkerWal('_empty', 64, 64);
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2d context');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
      const rects = new Map<string, AtlasUvRect>();
      rects.set('_empty', { u0: 0, v0: 0, u1: img.width / 128, v1: img.height / 128, tw: img.width, th: img.height });
      return { canvas, rects };
   }
   const decoded = new Map<string, WalImage>();
   await Promise.all(
      sorted.map(async (name) => {
         decoded.set(name, await fetchWalOrPlaceholder(name, roots, appBaseURL));
      }),
   );

   const maxSide = 4096;
   /** Gutters between atlas tiles so LINEAR sampling does not pull neighbour WAL colours (was read as “rainbow”). */
   const pad = 8;
   type Pl = { name: string; img: WalImage; px: number; py: number };
   const placements: Pl[] = [];
   let x = 0,
      y = 0,
      rowH = 0;
   let maxX = 64,
      maxY = 64;

   let fallbackRect: AtlasUvRect | null = null;

   for (const name of sorted) {
      const img = decoded.get(name)!;
      const iw = img.width;
      const ih = img.height;

      if (x + iw > maxSide) {
         x = 0;
         y += rowH + pad;
         rowH = 0;
      }
      if (y + ih > maxSide) {
         if (!fallbackRect) {
            const cx = Math.max(0, maxSide - 72);
            const cy = Math.max(0, maxSide - 72);
            placements.push({ name: '__overflow__', img: checkerWal('missing', 64, 64), px: cx, py: cy });
            fallbackRect = {
               u0: cx / maxSide,
               v0: cy / maxSide,
               u1: (cx + 64) / maxSide,
               v1: (cy + 64) / maxSide,
               tw: 64,
               th: 64,
            };
         }
         continue;
      }

      placements.push({ name, img, px: x, py: y });
      rowH = Math.max(rowH, ih);
      maxX = Math.max(maxX, x + iw + pad);
      maxY = Math.max(maxY, y + ih + pad);
      x += iw + pad;
   }

   const atlasW = potCeil(maxX + 8, maxSide);
   const atlasH = potCeil(maxY + 8, maxSide);

   const canvas = document.createElement('canvas');
   canvas.width = atlasW;
   canvas.height = atlasH;
   const ctx = canvas.getContext('2d');
   if (!ctx) throw new Error('2d context');
   ctx.fillStyle = '#141816';
   ctx.fillRect(0, 0, atlasW, atlasH);

   const rects = new Map<string, AtlasUvRect>();
   for (const { name, img, px, py } of placements) {
      const id = new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height);
      ctx.putImageData(id, px, py);
      const r: AtlasUvRect = {
         u0: px / atlasW,
         v0: py / atlasH,
         u1: (px + img.width) / atlasW,
         v1: (py + img.height) / atlasH,
         tw: img.width,
         th: img.height,
      };
      rects.set(name, r);
      if (name === '__overflow__') fallbackRect = r;
   }

   const fb = fallbackRect ?? {
      u0: 0,
      v0: 0,
      u1: 64 / atlasW,
      v1: 64 / atlasH,
      tw: 64,
      th: 64,
   };
   for (const name of sorted) {
      if (!rects.has(name)) rects.set(name, fb);
   }

   return { canvas, rects };
}
