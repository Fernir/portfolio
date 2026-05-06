/**
 * Генерирует `public/sprites/spritesheet-portfolio-tiles.png` —
 * пиксельный атлас 64×64 под игру (8 колонок × 3 ряда, без зазоров).
 *
 * Запуск: `yarn gen:sprites`
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'public/sprites/spritesheet-portfolio-tiles.png');

const N = 64;
const COLS = 8;
const ROWS = 3;

/** @typedef {[number,number,number]} RGB */
/** @typedef {[number,number,number,number]} RGBA */

const P = {
   grassL: /** @type {RGB} */ ([154, 214, 126]),
   grassM: /** @type {RGB} */ ([92, 176, 88]),
   grassD: /** @type {RGB} */ ([56, 132, 68]),
   dirtL: /** @type {RGB} */ ([206, 162, 118]),
   dirtM: /** @type {RGB} */ ([172, 124, 82]),
   dirtD: /** @type {RGB} */ ([132, 88, 54]),
   stoneL: /** @type {RGB} */ ([188, 194, 202]),
   stoneM: /** @type {RGB} */ ([138, 146, 158]),
   stoneD: /** @type {RGB} */ ([96, 104, 118]),
   brickL: /** @type {RGB} */ ([204, 118, 92]),
   brickD: /** @type {RGB} */ ([148, 72, 52]),
   brickM: /** @type {RGB} */ ([176, 92, 68]),
   yellowL: /** @type {RGB} */ ([255, 224, 92]),
   yellowD: /** @type {RGB} */ ([212, 158, 36]),
   goldL: /** @type {RGB} */ ([255, 214, 72]),
   goldM: /** @type {RGB} */ ([242, 178, 48]),
   goldD: /** @type {RGB} */ ([196, 130, 28]),
   woodL: /** @type {RGB} */ ([194, 146, 98]),
   woodM: /** @type {RGB} */ ([154, 108, 64]),
   woodD: /** @type {RGB} */ ([118, 78, 44]),
   purpleTop: /** @type {RGB} */ ([176, 132, 212]),
   purpleFill: /** @type {RGB} */ ([118, 88, 154]),
   sandTop: /** @type {RGB} */ ([238, 210, 148]),
   sandFill: /** @type {RGB} */ ([204, 156, 92]),
   outline: /** @type {RGB} */ ([42, 46, 52]),
   cloudW: /** @type {RGB} */ ([252, 252, 255]),
   cloudSh: /** @type {RGB} */ ([210, 218, 232]),
};

/** @param {Uint8ClampedArray} px */
function set(px, x, y, /** @type {RGBA} */ c) {
   if (x < 0 || x >= N || y < 0 || y >= N) return;
   const i = (y * N + x) * 4;
   px[i] = c[0];
   px[i + 1] = c[1];
   px[i + 2] = c[2];
   px[i + 3] = c[3] ?? 255;
}

/** @param {Uint8ClampedArray} px */
function blend(px, x, y, /** @type {RGB} */ rgb, a) {
   if (x < 0 || x >= N || y < 0 || y >= N) return;
   const i = (y * N + x) * 4;
   const o = px[i + 3] / 255 || 0;
   const na = a + o * (1 - a);
   if (na < 0.001) return;
   const nr = (rgb[0] * a + px[i] * o * (1 - a)) / na;
   const ng = (rgb[1] * a + px[i + 1] * o * (1 - a)) / na;
   const nb = (rgb[2] * a + px[i + 2] * o * (1 - a)) / na;
   px[i] = nr | 0;
   px[i + 1] = ng | 0;
   px[i + 2] = nb | 0;
   px[i + 3] = Math.min(255, (na * 255) | 0);
}

/** @param {Uint8ClampedArray} px */
function fill(px, /** @type {RGBA} */ c) {
   for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) set(px, x, y, c);
   }
}

/** @param {Uint8ClampedArray} px */
function rect(px, x0, y0, x1, y1, /** @type {RGBA} */ c) {
   for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) set(px, x, y, c);
   }
}

/** шум для текстуры грязи */
/** @param {Uint8ClampedArray} px */
function dirtTexture(px, y0 = 24) {
   for (let y = y0; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const w = ((x * 13 + y * 17) % 7) - 3;
         const base =
            y < N * 0.55 ? P.dirtM : y < N * 0.82 ? P.dirtD : [88, 58, 38];
         const v = base.map((c, i) =>
            Math.max(0, Math.min(255, c + w * 5 + ((x + y + i) % 3) * 4)),
         );
         set(px, x, y, [...v, 255]);
      }
   }
}

/** верхняя полоса земли с травой */
/** @param {Uint8ClampedArray} px */
function tileGrassTop(px) {
   fill(px, [...P.dirtM, 255]);
   dirtTexture(px, 28);
   for (let y = 0; y < 28; y++) {
      const band = y < 10 ? P.grassL : y < 18 ? P.grassM : P.grassD;
      for (let x = 0; x < N; x++) {
         const blade = (Math.sin(x * 0.45 + y * 0.3) * 3 + ((x + y * 3) % 5)) | 0;
         const g = band.map((c, i) =>
            Math.max(0, Math.min(255, c + blade * 3 + (i === 1 ? 6 : 0))),
         );
         set(px, x, y, [...g, 255]);
      }
   }
   for (let x = 0; x < N; x++) {
      const dip = ((Math.sin(x * 0.35) * 4 + 6) | 0) + 22;
      for (let y = dip; y < 30; y++) blend(px, x, y, P.grassD, 0.35);
   }
}

/** только почва */
/** @param {Uint8ClampedArray} px */
function tileDirt(px) {
   fill(px, [...P.dirtM, 255]);
   dirtTexture(px, 0);
}

/** узкая платформа: variant left | mid | right */
/** @param {Uint8ClampedArray} px */
function tilePlatform(px, part) {
   fill(px, [...[52, 46, 42], 255]);
   const top = 14;
   const bodyTop = top + 10;
   const leftCut = part === 'right' ? 10 : part === 'mid' ? 0 : 0;
   const rightCut = part === 'left' ? 10 : part === 'mid' ? 0 : 0;

   for (let y = bodyTop; y < N; y++) {
      for (let x = 0; x < N; x++) {
         let edge = 0;
         if (part === 'left' && x < 12) edge = 1;
         if (part === 'right' && x > N - 13) edge = 1;
         const brown = edge ? [96, 62, 42] : [118, 78, 52];
         set(px, x, y, [...brown, 255]);
      }
   }

   for (let y = top; y < bodyTop + 2; y++) {
      for (let x = leftCut; x < N - rightCut; x++) {
         let skip = false;
         if (part === 'left') {
            const cx = 12,
               cy = top + 7;
            const d = Math.hypot(x - cx, y - cy);
            if (d > 13 && x < cx) skip = true;
         }
         if (part === 'right') {
            const cx = N - 13,
               cy = top + 7;
            const d = Math.hypot(x - cx, y - cy);
            if (d > 13 && x > cx) skip = true;
         }
         if (skip) continue;
         const bb = y < top + 5 ? P.grassL : P.grassM;
         const tip = ((x + y * 2) % 4) - 1;
         set(px, x, y, [...bb.map((c, i) => c + tip * (i === 1 ? 8 : 4)), 255]);
      }
   }

   for (let x = 0; x < N; x++) {
      set(px, x, top + 9, [...P.grassD, 255]);
      set(px, x, bodyTop - 1, [...P.outline, 255]);
   }
}

/** камень тело */
/** @param {Uint8ClampedArray} px */
function tileStone(px) {
   for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const cell = ((x / 16) | 0) + ((y / 16) | 0);
         const base = cell % 2 === 0 ? P.stoneM : P.stoneL;
         const n = ((x * 3 + y * 5) % 9) - 4;
         set(px, x, y, [...base.map((c) => Math.min(255, c + n)), 255]);
      }
   }
   for (let x = 0; x < N; x++) {
      set(px, x, 0, [...P.stoneD, 255]);
      set(px, x, N - 1, [...P.outline, 255]);
   }
}

/** верх трубы — скругление */
/** @param {Uint8ClampedArray} px */
function tileStoneCap(px) {
   tileStone(px);
   for (let y = 0; y < 22; y++) {
      for (let x = 0; x < N; x++) {
         const cx = 31.5,
            cy = 22;
         const rx = (x - cx) / 30;
         const ry = (y - cy) / 18;
         if (rx * rx + ry * ry > 1.05) {
            set(px, x, y, [46, 52, 68, 255]);
         } else {
            const hi = [...P.stoneL.map((c, i) => c + (i === 2 ? 10 : 6)), 255];
            set(px, x, y, hi);
         }
      }
   }
   for (let x = 6; x < N - 6; x++) set(px, x, 20, [...P.stoneD, 255]);
}

/** кирпич */
/** @param {Uint8ClampedArray} px */
function tileBrick(px) {
   fill(px, [...P.brickD, 255]);
   const bh = 14;
   for (let row = 0; row < 5; row++) {
      const y0 = 6 + row * bh;
      const off = row % 2 === 0 ? 0 : 16;
      for (let col = -1; col < 6; col++) {
         const x0 = off + col * 32;
         rect(px, x0, y0, x0 + 30, y0 + bh - 2, [...P.brickM, 255]);
         for (let x = x0; x <= x0 + 30; x++) {
            set(px, x, y0, [...P.brickL, 255]);
            set(px, x, y0 + bh - 2, [...P.outline, 255]);
         }
         for (let y = y0; y <= y0 + bh - 2; y++) {
            set(px, x0, y, [...P.outline, 255]);
            set(px, x0 + 30, y, [...P.outline, 255]);
         }
      }
   }
}

/** блок «?» */
/** @param {Uint8ClampedArray} px */
function tileQuestion(px) {
   rect(px, 6, 6, N - 7, N - 7, [...P.yellowD, 255]);
   rect(px, 10, 10, N - 11, N - 11, [...P.yellowL, 255]);
   for (let i = 0; i < N; i++) {
      set(px, i, 6, [...P.outline, 255]);
      set(px, i, N - 7, [...P.outline, 255]);
      set(px, 6, i, [...P.outline, 255]);
      set(px, N - 7, i, [...P.outline, 255]);
   }
   const q = [
      '011111110',
      '011000110',
      '000001110',
      '000011100',
      '000111000',
      '000011100',
      '000001110',
      '000000110',
      '000000110',
      '000001110',
      '011111110',
   ];
   const ox = 18,
      oy = 24;
   for (let r = 0; r < q.length; r++) {
      const row = q[r];
      for (let c = 0; c < row.length; c++) {
         if (row[c] === '1') rect(px, ox + c * 3, oy + r * 3, ox + c * 3 + 2, oy + r * 3 + 2, [...P.outline, 255]);
      }
   }
}

/** блок с монетой */
/** @param {Uint8ClampedArray} px */
function tileCoinBlock(px) {
   rect(px, 8, 8, N - 9, N - 9, [...P.brickM, 255]);
   for (let i = 8; i < N - 8; i++) {
      set(px, i, 8, [...P.outline, 255]);
      set(px, i, N - 9, [...P.outline, 255]);
      set(px, 8, i, [...P.outline, 255]);
      set(px, N - 9, i, [...P.outline, 255]);
   }
   const cx = 32,
      cy = 32;
   for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const d = Math.hypot(x - cx, y - cy);
         if (d < 14 && d > 9) set(px, x, y, [...P.goldM, 255]);
         if (d <= 9) set(px, x, y, [...P.goldL, 255]);
         if (d < 17 && d >= 14) set(px, x, y, [...P.goldD, 255]);
      }
   }
   rect(px, 38, 22, 42, 26, [255, 255, 255, 255]);
}

/** деревянная доска */
/** @param {Uint8ClampedArray} px */
function tilePlank(px) {
   for (let y = 0; y < N; y++) {
      const wave = ((y / 8) | 0) % 2 === 0 ? P.woodL : P.woodM;
      for (let x = 0; x < N; x++) {
         const v = ((x * 11 + y * 3) % 6) - 2;
         set(px, x, y, [...wave.map((c) => c + v), 255]);
      }
      if (y % 8 === 0) {
         for (let x = 0; x < N; x++) set(px, x, y, [...P.woodD, 255]);
      }
   }
}

/** мост — две балки */
/** @param {Uint8ClampedArray} px */
function tileBridge(px) {
   fill(px, [...[135, 206, 235], 40]);
   rect(px, 6, 18, N - 7, 28, [...P.woodM, 255]);
   rect(px, 6, 38, N - 7, 48, [...P.woodM, 255]);
   for (let y = 18; y <= 28; y++) {
      set(px, 6, y, [...P.woodD, 255]);
      set(px, N - 7, y, [...P.woodD, 255]);
   }
   for (let y = 38; y <= 48; y++) {
      set(px, 6, y, [...P.woodD, 255]);
      set(px, N - 7, y, [...P.woodD, 255]);
   }
   for (let x = 8; x < N - 8; x += 14) {
      rect(px, x, 28, x + 4, 38, [...P.woodD, 255]);
   }
}

/** холм */
/** @param {Uint8ClampedArray} px */
function tileHill(px) {
   fill(px, [135, 206, 235, 0]);
   for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const nx = (x - 32) / 34;
         const curve = 52 - Math.sqrt(Math.max(0, 1 - nx * nx)) * 46;
         if (y > curve) {
            const dt = (y - curve) / (N - curve);
            const g =
               dt < 0.35 ? P.grassM : dt < 0.65 ? P.grassD : [48, 112, 58];
            const zz = ((x + y * 2) % 5) - 2;
            set(px, x, y, [...g.map((c) => c + zz), 255]);
         }
      }
   }
}

/** куст */
/** @param {Uint8ClampedArray} px */
function tileBush(px) {
   fill(px, [135, 206, 235, 0]);
   const blobs = [
      [22, 38, 14],
      [38, 34, 16],
      [46, 40, 12],
      [30, 44, 13],
   ];
   for (const [cx, cy, rr] of blobs) {
      for (let y = 0; y < N; y++) {
         for (let x = 0; x < N; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d < rr) {
               const c = d < rr * 0.55 ? P.grassL : P.grassD;
               blend(px, x, y, c, 1);
            }
         }
      }
   }
}

/** монета */
/** @param {Uint8ClampedArray} px */
function tileCoin(px) {
   fill(px, [135, 206, 235, 0]);
   const cx = 32,
      cy = 32;
   for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const d = Math.hypot(x - cx, y - cy);
         if (d < 20 && d > 15) set(px, x, y, [...P.goldD, 255]);
         if (d <= 15) set(px, x, y, [...P.goldL, 255]);
         if (d < 22 && d >= 20) set(px, x, y, [...P.outline, 255]);
      }
   }
   rect(px, 38, 22, 41, 28, [255, 255, 230, 255]);
}

/** облако */
/** @param {Uint8ClampedArray} px */
function tileCloud(px) {
   fill(px, [135, 206, 235, 0]);
   const blobs = [
      [20, 34, 18],
      [36, 30, 22],
      [52, 34, 20],
      [34, 38, 24],
   ];
   for (const [cx, cy, rr] of blobs) {
      for (let y = 0; y < N; y++) {
         for (let x = 0; x < N; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d < rr) {
               const c = d < rr * 0.65 ? P.cloudW : P.cloudSh;
               blend(px, x, y, c, 0.96);
            }
         }
      }
   }
}

/** фиолетовый биом — верхняя полоса */
/** @param {Uint8ClampedArray} px */
function tilePurpleTop(px) {
   fill(px, [...P.purpleFill, 255]);
   for (let y = 22; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const n = ((x + y * 7) % 11) - 5;
         set(px, x, y, [...P.purpleFill.map((c) => c + n), 255]);
      }
   }
   for (let y = 0; y < 24; y++) {
      for (let x = 0; x < N; x++) {
         const bb =
            y < 10 ? P.purpleTop : [P.purpleTop[0] - 28, P.purpleTop[1] - 22, P.purpleTop[2] - 18];
         set(px, x, y, [...bb.map((c) => Math.min(255, c)), 255]);
      }
   }
}

/** песок */
/** @param {Uint8ClampedArray} px */
function tileSandTop(px) {
   fill(px, [...P.sandFill, 255]);
   for (let y = 26; y < N; y++) {
      for (let x = 0; x < N; x++) {
         const n = ((x * 5 + y * 3) % 9) - 4;
         set(px, x, y, [...P.sandFill.map((c) => Math.min(255, c + n)), 255]);
      }
   }
   for (let y = 0; y < 28; y++) {
      for (let x = 0; x < N; x++) {
         const bump = ((Math.sin(x * 0.4) * 3 + y * 0.2) | 0) + ((x + y) % 3);
         set(px, x, y, [...P.sandTop.map((c) => Math.min(255, c + bump)), 255]);
      }
   }
}

/** Порядок тайлов на листе (совпадает с TILE_INDEX в tileSprites.ts). */
const MAKERS = [
   tileGrassTop, // 0
   tileDirt,
   (px) => tilePlatform(px, 'left'),
   (px) => tilePlatform(px, 'mid'),
   (px) => tilePlatform(px, 'right'),
   tileStone,
   tileStoneCap,
   tileBrick,
   tileQuestion,
   tileCoinBlock,
   tilePlank,
   tileBridge,
   tileHill,
   tileBush,
   tileCoin,
   tileCloud,
   tilePurpleTop,
   tileSandTop,
];

async function main() {
   const W = COLS * N;
   const H = ROWS * N;
   const atlas = new Uint8ClampedArray(W * H * 4);

   function blit(tileIndex, col, row) {
      const px = new Uint8ClampedArray(N * N * 4);
      MAKERS[tileIndex](px);
      const ox = col * N,
         oy = row * N;
      for (let y = 0; y < N; y++) {
         for (let x = 0; x < N; x++) {
            const si = (y * N + x) * 4;
            const di = ((oy + y) * W + (ox + x)) * 4;
            atlas[di] = px[si];
            atlas[di + 1] = px[si + 1];
            atlas[di + 2] = px[si + 2];
            atlas[di + 3] = px[si + 3];
         }
      }
   }

   blit(0, 0, 0);
   blit(1, 1, 0);
   blit(2, 2, 0);
   blit(3, 3, 0);
   blit(4, 4, 0);
   blit(5, 5, 0);
   blit(6, 6, 0);
   blit(7, 7, 0);
   blit(8, 0, 1);
   blit(9, 1, 1);
   blit(10, 2, 1);
   blit(11, 3, 1);
   blit(12, 4, 1);
   blit(13, 5, 1);
   blit(14, 6, 1);
   blit(15, 7, 1);
   blit(16, 0, 2);
   blit(17, 1, 2);

   await mkdir(dirname(OUT), { recursive: true });
   await sharp(Buffer.from(atlas.buffer, atlas.byteOffset, atlas.byteLength), {
      raw: { width: W, height: H, channels: 4 },
   })
      .png({ compressionLevel: 9 })
      .toFile(OUT);

   console.log(`Wrote ${OUT} (${W}×${H})`);
}

main().catch((e) => {
   console.error(e);
   process.exit(1);
});
