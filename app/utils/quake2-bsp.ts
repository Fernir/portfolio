/** Quake II `.bsp` (IBSP v38): mesh + collision + async WAL atlas. Quake Z-up → Y-up `(x,y,z)→(x,z,y)`. */

import { buildQ2WalAtlas } from '~/utils/quake2-texture-atlas';
import type { AtlasUvRect } from '~/utils/quake2-texture-atlas';
import { buildQ2CmClipFromLumps, cmLeafPvsCluster, cmPointLeafNum, type Q2CmClip } from '~/utils/quake2-cm';
import { parseQ2VisLumpInfo, type Q2VisChunk } from '~/utils/quake2-vis';
import { parseLightstylePatternsFromEntities, type Q2LightstyleTable } from '~/utils/quake2-lightstyles';

export type Q2Aabb = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
export type Q2HullPlane = { nx: number; ny: number; nz: number; d: number };
export type Q2FloorRect = { x0: number; z0: number; x1: number; z1: number; y: number };
export type Q2FloorPlane = { x0: number; x1: number; z0: number; z1: number; y00: number; dydx: number; dydz: number };
export type Q2WallSeg = { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };
export type Q2Light = {
   x: number;
   y: number;
   z: number;
   r: number;
   g: number;
   b: number;
   range: number;
   flicker: number;
};

/** Parsed movers (`func_plat`, `func_rotating`) — geometry split into `mobMeshes`. */
export type Q2MobSpec =
   | {
        kind: 'plat';
        modelIdx: number;
        speed: number;
        height?: number;
        /** Quake `lip` (default 8); only used when inferring travel from model bounds. */
        lip?: number;
        /** If set, plat stays at BSP “extended” pose until triggered (`SP_func_plat` + `targetname`). */
        startExtended?: boolean;
     }
   | { kind: 'rotate'; modelIdx: number; speedDegPerSec: number };

export type Q2MobMesh = {
   modelIdx: number;
   opaque: Float32Array;
   warp: Float32Array;
   /** `SURF_TRANS33`/`66` (non-liquid) mover faces. */
   trans: Float32Array;
};

/** Collision + motion params aligned to actual mover vertices (`base` from mesh bbox). */
export type Q2MobSolidDesc =
   | {
        modelIdx: number;
        kind: 'plat';
        base: Q2Aabb;
        travelHeight: number;
        speed: number;
        /** Matches `Q2MobSpec.startExtended` — initial mesh offset is 0 instead of `-travel`. */
        startExtended?: boolean;
     }
   | { modelIdx: number; kind: 'rotate'; base: Q2Aabb; speedDegPerSec: number };

/** Parsed from entities + model lump — used for gameplay wiring (`target` / `targetname`). */
export type Q2DoorDef = {
   targetname?: string;
   x: number;
   z: number;
   y0: number;
   y1: number;
   w: number;
   t: number;
};
export type Q2TriggerDef = {
   target: string;
   cx: number;
   cy: number;
   cz: number;
   radius: number;
   once: boolean;
};
/** `trigger_teleport` → `info_teleport_destination` (viewer-space). */
export type Q2TeleportDef = {
   cx: number;
   cy: number;
   cz: number;
   radius: number;
   destX: number;
   destY: number;
   destZ: number;
};
export type Q2ButtonDef = {
   target: string;
   x: number;
   y: number;
   z: number;
};
export type Q2EntityDebug = {
   classname: string;
   x: number;
   y: number;
   z: number;
};

const TEX_Q2_ATLAS = 7;

/** Interleaved BSP vertex float count — must match `pushTriVert` and `setupQ2Attribs` stride. */
export const Q2_MESH_VERT_FLOATS = 25;

/** Parsed from entity `worldspawn` when mapper-supplied fog keys exist. */
export type Q2WorldFog = {
   r: number;
   g: number;
   b: number;
   /** Exponential term in fragment shader (`1 - exp(-dist * density)`); 0 = linear only. */
   density: number;
   fogStartWU: number;
   fogSpanWU: number;
};

export type Q2LevelPack = {
   /** BSP triangles without `SURF_WARP`. */
   verts: Float32Array;
   /** `SURF_WARP` (+ flowing) faces — drawn with polygon offset to kill z-fighting. */
   warpVerts: Float32Array;
   /** `SURF_TRANS33`/`SURF_TRANS66` when not treated as liquid warp — alpha blended pass. */
   transVerts: Float32Array;
   solids: Q2Aabb[];
   /** Convex hull planes per solid brush (viewer space); same length as `solids`. */
   brushHulls: Q2HullPlane[][];
   floors: Q2FloorRect[];
   planes: Q2FloorPlane[];
   segs: Q2WallSeg[];
   lights: Q2Light[];
   spawn: { x: number; y: number; z: number };
   lifts: [];
   mobSpecs: Q2MobSpec[];
   mobMeshes: Q2MobMesh[];
   mobSolids: Q2MobSolidDesc[];
   /** True if any face used `SURF_SKY` (geometry skipped — viewer draws procedural sky). */
   hasSky?: boolean;
   doors?: Q2DoorDef[];
   triggers?: Q2TriggerDef[];
   /** Resolved `trigger_teleport` volumes → destination origins. */
   teleports?: Q2TeleportDef[];
   buttons?: Q2ButtonDef[];
   /** All entities with parsed `origin` — debug / crosshair inspect. */
   entityDebug?: Q2EntityDebug[];
   /** Packed WAL atlas for texId `7`; upload to GPU in viewer. */
   atlasCanvas: HTMLCanvasElement | null;
   /** If true, sample WAL atlas with `NEAREST` (point-sampled look). */
   walAtlasNearest?: boolean;
   /** Packed RGB lightmaps (`LUMP_LIGHTING`); same atlas UVs in vertex `aLmUv`. */
   lightmapCanvas: HTMLCanvasElement | null;
   /** Optional per-index lightstyle strings from `entities`; defaults used when absent. */
   lightstyleTable: Q2LightstyleTable;
   /** BSP clip model (`CM_RecursiveHullCheck`); `null` if node/leaf lumps missing or invalid. */
   cmClip: Q2CmClip | null;
   /** `dleaf_t::cluster` per leaf index (same indexing as stock `CM_PointLeafnum` / our `cmPointLeafNum`). */
   leafClusters: Int16Array | null;
   /** `dleaf_t::area` per leaf (same indexing as `leafClusters`); viewer uses for zone fog tint. */
   leafAreas: Int16Array | null;
   /** PVS + merged mesh chunk ranges; `null` when visibility lump invalid or clustering skipped. */
   visBake: null | {
      visLump: Uint8Array;
      numClusters: number;
      rowBytes: number;
      opaqueChunks: Q2VisChunk[];
      warpChunks: Q2VisChunk[];
      transChunks: Q2VisChunk[];
   };
   /** Optional distance / exponential fog from `worldspawn` (`fog`, `fog_color`, `distance`, …). */
   worldFog?: Q2WorldFog | null;
};

function boundsToPerimeterSegs(bb: Q2Aabb): Q2WallSeg[] {
   // A simple "keep-in" perimeter. Heights are generous so it blocks most movement.
   const y0 = bb.y0 - 128;
   const y1 = bb.y1 + 256;
   return [
      { x0: bb.x0, z0: bb.z0, x1: bb.x1, z1: bb.z0, y0, y1 },
      { x0: bb.x1, z0: bb.z0, x1: bb.x1, z1: bb.z1, y0, y1 },
      { x0: bb.x1, z0: bb.z1, x1: bb.x0, z1: bb.z1, y0, y1 },
      { x0: bb.x0, z0: bb.z1, x1: bb.x0, z1: bb.z0, y0, y1 },
   ];
}

function floorBoundsXZ(floors: Q2FloorRect[]): { x0: number; x1: number; z0: number; z1: number } | null {
   if (floors.length === 0) return null;
   let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
   for (const f of floors) {
      x0 = Math.min(x0, f.x0);
      x1 = Math.max(x1, f.x1);
      z0 = Math.min(z0, f.z0);
      z1 = Math.max(z1, f.z1);
   }
   if (!(x1 > x0 + 1 && z1 > z0 + 1)) return null;
   return { x0, x1, z0, z1 };
}

const LUMP_ENTITIES = 0;
const LUMP_PLANES = 1;
const LUMP_VERTEXES = 2;
const LUMP_VISIBILITY = 3;
const LUMP_NODES = 4;
const LUMP_TEXINFO = 5;
const LUMP_FACES = 6;
const LUMP_LIGHTING = 7;
const LUMP_LEAFS = 8;
const LUMP_LEAFBRUSHES = 10;
const LUMP_EDGES = 11;
const LUMP_SURFEDGES = 12;
const LUMP_MODELS = 13;
const LUMP_BRUSHES = 14;
const LUMP_BRUSHSIDES = 15;

const LM_ATLAS_SIZE = 2048;

type LmRectNorm = { u0: number; v0: number; u1: number; v1: number };
type LmPackRect = { rect: LmRectNorm; ok: boolean };
type LmStackPack = { rect: LmRectNorm; nLayers: number };

/** Pack per-face RGB lightmaps (Q2 `LUMP_LIGHTING`) into one atlas for WebGL. */
function createQ2LightmapPacker() {
   const S = LM_ATLAS_SIZE;
   const rgba = new Uint8ClampedArray(S * S * 4);
   let cx = 0;
   let cy = 0;
   let rowH = 0;

   const whiteRect: LmRectNorm = { u0: 0, v0: 0, u1: 1 / S, v1: 1 / S };
   const whiteMidU = (whiteRect.u0 + whiteRect.u1) * 0.5;
   const whiteMidV = (whiteRect.v0 + whiteRect.v1) * 0.5;

   function packRect(bw: number, bh: number, rgb: Uint8Array | null): LmPackRect {
      if (!rgb || bw < 1 || bh < 1 || rgb.byteLength < bw * bh * 3) return { rect: whiteRect, ok: false };
      if (cx + bw > S) {
         cx = 0;
         cy += rowH;
         rowH = 0;
      }
      if (cy + bh > S) return { rect: whiteRect, ok: false };
      for (let y = 0; y < bh; y++) {
         for (let x = 0; x < bw; x++) {
            const di = ((cy + y) * S + (cx + x)) * 4;
            const si = (y * bw + x) * 3;
            rgba[di] = rgb[si]!;
            rgba[di + 1] = rgb[si + 1]!;
            rgba[di + 2] = rgb[si + 2]!;
            rgba[di + 3] = 255;
         }
      }
      const u0 = cx / S;
      const v0 = cy / S;
      const u1 = (cx + bw) / S;
      const v1 = (cy + bh) / S;
      cx += bw;
      rowH = Math.max(rowH, bh);
      return { rect: { u0, v0, u1, v1 }, ok: true };
   }

   // Slot (0,0): neutral white for faces without lightmaps / overflow.
   packRect(1, 1, new Uint8Array([255, 255, 255]));

   return {
      /** Copy one face lightmap block; returns atlas UV rectangle in 0–1 space. */
      addFace(bw: number, bh: number, rgb: Uint8Array | null): LmRectNorm {
         return packRect(bw, bh, rgb).rect;
      },
      /** Stack N same-size RGB blocks vertically (one atlas column per face, Quake II style layers). */
      addFaceStacked(bw: number, bh: number, blocks: readonly Uint8Array[]): LmStackPack {
         if (blocks.length === 0) return { rect: whiteRect, nLayers: 0 };
         const bhTotal = bh * blocks.length;
         if (bw < 1 || bh < 1) return { rect: whiteRect, nLayers: 0 };
         for (const b of blocks) {
            if (b.byteLength < bw * bh * 3) return { rect: whiteRect, nLayers: 0 };
         }
         if (cx + bw > S) {
            cx = 0;
            cy += rowH;
            rowH = 0;
         }
         if (cy + bhTotal > S) {
            const pr = packRect(bw, bh, blocks[0]!);
            return { rect: pr.rect, nLayers: pr.ok ? 1 : 0 };
         }
         let layer = 0;
         for (const rgb of blocks) {
            const y0 = cy + layer * bh;
            for (let y = 0; y < bh; y++) {
               for (let x = 0; x < bw; x++) {
                  const di = ((y0 + y) * S + (cx + x)) * 4;
                  const si = (y * bw + x) * 3;
                  rgba[di] = rgb[si]!;
                  rgba[di + 1] = rgb[si + 1]!;
                  rgba[di + 2] = rgb[si + 2]!;
                  rgba[di + 3] = 255;
               }
            }
            layer++;
         }
         const u0 = cx / S;
         const v0 = cy / S;
         const u1 = (cx + bw) / S;
         const v1 = (cy + bhTotal) / S;
         cx += bw;
         rowH = Math.max(rowH, bhTotal);
         return { rect: { u0, v0, u1, v1 }, nLayers: blocks.length };
      },
      toCanvas(): HTMLCanvasElement {
         const c = document.createElement('canvas');
         c.width = S;
         c.height = S;
         const ctx = c.getContext('2d');
         if (ctx) ctx.putImageData(new ImageData(rgba, S, S), 0, 0);
         return c;
      },
      whiteMid(): readonly [number, number] {
         return [whiteMidU, whiteMidV];
      },
   };
}

// `q_shared.h` (Quake II). We only need enough to decide "solid to player".
const CONTENTS_SOLID = 1;
const CONTENTS_WINDOW = 2; // translucent but solid
const CONTENTS_AUX = 4; // helper solid (often used like solid)
const CONTENTS_AREAPORTAL = 0x8000; // not physically solid; used for vis
const CONTENTS_PLAYERCLIP = 0x10000;
const CONTENTS_MONSTERCLIP = 0x20000;

/** `q_shared.h` — liquids (leaf / brush contents bits). */
export const CONTENTS_LAVA_Q2 = 0x8;
export const CONTENTS_SLIME_Q2 = 0x10;
export const CONTENTS_WATER_Q2 = 0x20;
/** Combined mask for “in liquid volume” tests (`CM_PointContents` / leaf `contents`). */
export const Q2_LIQUID_MASK = CONTENTS_LAVA_Q2 | CONTENTS_SLIME_Q2 | CONTENTS_WATER_Q2;

/** Same mask as Q2 `MASK_PLAYERSOLID` for `CM_BoxTrace` / brush filtering. */
export const Q2_PLAYER_SOLID_MASK =
   CONTENTS_SOLID | CONTENTS_WINDOW | CONTENTS_AUX | CONTENTS_PLAYERCLIP | CONTENTS_MONSTERCLIP;

/** `game/q_shared.h` — sky draws via skybox; nodraw has no polygon (ref_gl skips these for surface texturing). */
const SURF_SKY = 0x4;
const SURF_WARP = 0x8;
const SURF_TRANS33 = 0x10;
const SURF_TRANS66 = 0x20;
const SURF_FLOWING = 0x40;
const SURF_NODRAW = 0x80;

/** Many maps use translucent water (`SURF_TRANS33`/`66`) without `SURF_WARP`; ref_gl still warps those. */
function looksLikeQ2LiquidTexture(texName: string): boolean {
   const s = texName.trim().toLowerCase().replace(/\\/g, '/');
   if (!s) return false;
   if (s.includes('caulk') || s.includes('hint') || s.includes('skip')) return false;
   if (/\b(s_water|water|watr|liquids)\b/.test(s)) return true;
   if (s.includes('bluw') || s.includes('lava') || s.includes('slime') || s.includes('sewage')) return true;
   return false;
}

const EPS = 1.0;
// Approximate player step height used by viewer (see `QuakeCanvas.vue` PM.STEP_UP = 30).
const PM_STEP_GUARD_H = 36;

function mapPos(q: readonly [number, number, number]): [number, number, number] {
   return [q[0], q[2], q[1]];
}

/** Plane normal / direction in viewer space (matches `mapPos` linear part). */
function mapDir(q: readonly [number, number, number]): [number, number, number] {
   return [q[0], q[2], q[1]];
}

function mapNormal(q: readonly [number, number, number]): [number, number, number] {
   const o = mapDir(q as [number, number, number]);
   const l = Math.hypot(o[0], o[1], o[2]) || 1;
   return [o[0] / l, o[1] / l, o[2] / l];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
   const [ax = 0, ay = 0, az = 0] = a;
   const [bx = 0, by = 0, bz = 0] = b;
   return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function dot(a: readonly number[], b: readonly number[]): number {
   const [ax = 0, ay = 0, az = 0] = a;
   const [bx = 0, by = 0, bz = 0] = b;
   return ax * bx + ay * by + az * bz;
}

function intersectThreePlanes(
   n1: readonly number[],
   d1: number,
   n2: readonly number[],
   d2: number,
   n3: readonly number[],
   d3: number,
): [number, number, number] | null {
   const c23 = cross(n2, n3);
   const det = dot(n1, c23);
   if (Math.abs(det) < 1e-8) return null;
   const p: [number, number, number] = [
      d1 * cross(n2, n3)[0] + d2 * cross(n3, n1)[0] + d3 * cross(n1, n2)[0],
      d1 * cross(n2, n3)[1] + d2 * cross(n3, n1)[1] + d3 * cross(n1, n2)[1],
      d1 * cross(n2, n3)[2] + d2 * cross(n3, n1)[2] + d3 * cross(n1, n2)[2],
   ];
   return [p[0] / det, p[1] / det, p[2] / det];
}

function insideBrushQuake(
   p: readonly number[],
   planeNormals: readonly number[][],
   planeDists: readonly number[],
): boolean {
   for (let i = 0; i < planeNormals.length; i++) {
      const n = planeNormals[i]!;
      const d = planeDists[i]!;
      if (dot(n, p) > d + EPS) return false;
   }
   return true;
}

function expandAabb(a: Q2Aabb, pad: number): Q2Aabb {
   return {
      x0: a.x0 - pad,
      y0: a.y0 - pad,
      z0: a.z0 - pad,
      x1: a.x1 + pad,
      y1: a.y1 + pad,
      z1: a.z1 + pad,
   };
}

/** True if `bb` (broad-phase CM AABB) lies inside expanded mover volume — used to drop duplicate static brushes. */
function _brushAabbInsideMoverSuppressVolume(bb: Q2Aabb, vol: Q2Aabb, slop: number): boolean {
   return (
      bb.x0 >= vol.x0 - slop &&
      bb.x1 <= vol.x1 + slop &&
      bb.y0 >= vol.y0 - slop &&
      bb.y1 <= vol.y1 + slop &&
      bb.z0 >= vol.z0 - slop &&
      bb.z1 <= vol.z1 + slop
   );
}

/** Quake axial mins/maxs → viewer AABB (`mapPos`: `(qx,qy,qz)→(qx,qz,qy)`). */
function quakeBbToViewerAabb(minsQ: readonly number[], maxsQ: readonly number[]): Q2Aabb {
   const mx0 = Math.min(minsQ[0]!, maxsQ[0]!);
   const mx1 = Math.max(minsQ[0]!, maxsQ[0]!);
   const my0 = Math.min(minsQ[1]!, maxsQ[1]!);
   const my1 = Math.max(minsQ[1]!, maxsQ[1]!);
   const mz0 = Math.min(minsQ[2]!, maxsQ[2]!);
   const mz1 = Math.max(minsQ[2]!, maxsQ[2]!);
   return { x0: mx0, x1: mx1, y0: mz0, y1: mz1, z0: my0, z1: my1 };
}

function spawnOriginFromKeyvals(kv: Record<string, string>): { x: number; y: number; z: number } | null {
   const raw = kv.origin?.trim();
   if (!raw) return null;
   const parts = raw.split(/\s+/).map(Number);
   if (parts.length < 3 || !parts.every((x) => Number.isFinite(x))) return null;
   const q = parts as number[];
   const [x, y, z] = mapPos([q[0]!, q[1]!, q[2]!]);
   return { x, y, z };
}

/** Prefer SP/coop start; many maps only ship `info_player_deathmatch`. */
function parseEntitiesSpawn(entBlob: string): { x: number; y: number; z: number } | null {
   const classes = [
      'info_player_start',
      'info_player_coop',
      'info_player_deathmatch',
      'info_player_intermission',
   ] as const;
   for (const want of classes) {
      for (const blk of entBlob.split('{')) {
         const kv = parseEntityKeyvals(blk);
         if (kv.classname?.trim() !== want) continue;
         const o = spawnOriginFromKeyvals(kv);
         if (o) return o;
      }
   }
   return null;
}

function parseColorTripletMaybe255(s: string): [number, number, number] | null {
   const p = s.trim().split(/\s+/).map(Number);
   if (p.length < 3 || !p.slice(0, 3).every((x) => Number.isFinite(x))) return null;
   let r = p[0]!,
      g = p[1]!,
      b = p[2]!;
   if (r > 1.01 || g > 1.01 || b > 1.01) {
      r /= 255;
      g /= 255;
      b /= 255;
   }
   return [clampLoHi(r, 0, 1), clampLoHi(g, 0, 1), clampLoHi(b, 0, 1)];
}

/** Optional fog from `worldspawn` (KMQ2-style `fog_color` / `fog_density`, single `fog` scalar, or `distance`). */
function parseWorldspawnFog(entBlob: string): Q2WorldFog | null {
   for (const blk of entBlob.split('{')) {
      const kv = parseEntityKeyvals(blk);
      if (kv.classname?.trim() !== 'worldspawn') continue;
      let touched = false;
      let r = 0.22,
         g = 0.24,
         b = 0.27;
      let density = 0;
      let fogStartWU = 200;
      let fogSpanWU = 5600;

      const fc = kv.fog_color?.trim() ?? kv.gl_fog_color?.trim();
      if (fc) {
         const rgb = parseColorTripletMaybe255(fc);
         if (rgb) {
            r = rgb[0]!;
            g = rgb[1]!;
            b = rgb[2]!;
            touched = true;
         }
      }
      const fdRaw = kv.fog_density?.trim() ?? kv.gl_fog_density?.trim();
      if (fdRaw) {
         const d = Number(fdRaw);
         if (Number.isFinite(d) && d > 0) {
            density = clampLoHi(d * 0.0022, 0, 0.06);
            touched = true;
         }
      }
      const fogKey = kv.fog?.trim();
      if (fogKey) {
         const parts = fogKey.split(/\s+/).map(Number);
         if (parts.length >= 4 && parts.every((n) => Number.isFinite(n))) {
            r = clampLoHi(parts[0]!, 0, 1);
            g = clampLoHi(parts[1]!, 0, 1);
            b = clampLoHi(parts[2]!, 0, 1);
            density = Math.max(density, clampLoHi(parts[3]! * 0.0022, 0, 0.08));
            touched = true;
         } else if (parts.length === 1 && Number.isFinite(parts[0]!)) {
            density = Math.max(density, clampLoHi(parts[0]! * 0.0025, 0, 0.12));
            touched = true;
         }
      }
      const distRaw = kv.distance?.trim();
      if (distRaw) {
         const dist = Number(distRaw);
         if (Number.isFinite(dist) && dist > 256) {
            fogSpanWU = clampLoHi(dist * 0.55, 400, 32000);
            fogStartWU = clampLoHi(dist * 0.12, 80, 8000);
            touched = true;
         }
      }
      if (!touched) return null;
      return { r, g, b, density, fogStartWU, fogSpanWU };
   }
   return null;
}

function clampLoHi(v: number, lo: number, hi: number): number {
   return Math.max(lo, Math.min(hi, v));
}

const MAX_PLANE_GRAD = 1.08;

/** Highest floor **not far above** entity height — avoids snapping to a ceiling / upper deck under the same `(x,z)`. */
function bestFloorBelowHint(
   x: number,
   z: number,
   spawnY: number,
   floors: Q2FloorRect[],
   planes: Q2FloorPlane[],
): number | null {
   const slack = 240;
   const ceilingY = spawnY + slack;
   let best = -Infinity;
   for (const f of floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      if (f.y > ceilingY) continue;
      if (f.y > best) best = f.y;
   }
   for (const p of planes) {
      if (Math.hypot(p.dydx, p.dydz) > MAX_PLANE_GRAD) continue;
      const xMin = Math.min(p.x0, p.x1);
      const xMax = Math.max(p.x0, p.x1);
      const zMin = Math.min(p.z0, p.z1);
      const zMax = Math.max(p.z0, p.z1);
      if (x < xMin || x > xMax || z < zMin || z > zMax) continue;
      const y = p.y00 + p.dydx * (x - p.x0) + p.dydz * (z - p.z0);
      if (y > ceilingY) continue;
      if (y > best) best = y;
   }
   return best === -Infinity ? null : best;
}

/** Highest walkable floor under `(x,z)` (axis rects + shallow slopes). */
function bestFloorYAt(x: number, z: number, floors: Q2FloorRect[], planes: Q2FloorPlane[]): number | null {
   let best = -Infinity;
   for (const f of floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      if (f.y > best) best = f.y;
   }
   for (const p of planes) {
      if (Math.hypot(p.dydx, p.dydz) > MAX_PLANE_GRAD) continue;
      const xMin = Math.min(p.x0, p.x1);
      const xMax = Math.max(p.x0, p.x1);
      const zMin = Math.min(p.z0, p.z1);
      const zMax = Math.max(p.z0, p.z1);
      if (x < xMin || x > xMax || z < zMin || z > zMax) continue;
      const y = p.y00 + p.dydx * (x - p.x0) + p.dydz * (z - p.z0);
      if (y > best) best = y;
   }
   return best === -Infinity ? null : best;
}

/** Nearest floor patch in XZ when spawn sits over void / gap (demo BSP, irregular layouts). */
function nearestFloorY(
   x: number,
   z: number,
   floors: Q2FloorRect[],
   planes: Q2FloorPlane[],
   maxDist: number,
): number | null {
   const maxD2 = maxDist * maxDist;
   let bestY: number | null = null;
   let bestD2 = maxD2;
   for (const f of floors) {
      const px = clampLoHi(x, f.x0, f.x1);
      const pz = clampLoHi(z, f.z0, f.z1);
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < bestD2 || (d2 === bestD2 && bestY !== null && f.y > bestY)) {
         bestD2 = d2;
         bestY = f.y;
      }
   }
   for (const p of planes) {
      if (Math.hypot(p.dydx, p.dydz) > MAX_PLANE_GRAD) continue;
      const xMin = Math.min(p.x0, p.x1);
      const xMax = Math.max(p.x0, p.x1);
      const zMin = Math.min(p.z0, p.z1);
      const zMax = Math.max(p.z0, p.z1);
      const px = clampLoHi(x, xMin, xMax);
      const pz = clampLoHi(z, zMin, zMax);
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      const y = p.y00 + p.dydx * (px - p.x0) + p.dydz * (pz - p.z0);
      if (d2 < bestD2 || (d2 === bestD2 && bestY !== null && y > bestY)) {
         bestD2 = d2;
         bestY = y;
      }
   }
   return bestY;
}

/** Clamp spawn into world bounds and snap feet onto geometry so players don't fall in void. */
function snapSpawnToWorld(
   spawn: { x: number; y: number; z: number },
   floors: Q2FloorRect[],
   planes: Q2FloorPlane[],
   worldBb: Q2Aabb | null,
): { x: number; y: number; z: number } {
   const pad = 64;
   let x = spawn.x;
   let z = spawn.z;
   if (worldBb && worldBb.x1 > worldBb.x0 + pad * 2 && worldBb.z1 > worldBb.z0 + pad * 2) {
      x = clampLoHi(x, worldBb.x0 + pad, worldBb.x1 - pad);
      z = clampLoHi(z, worldBb.z0 + pad, worldBb.z1 - pad);
   }
   const fy =
      bestFloorBelowHint(x, z, spawn.y, floors, planes) ??
      bestFloorYAt(x, z, floors, planes) ??
      nearestFloorY(x, z, floors, planes, 12288);
   if (fy !== null) {
      return { x, y: fy + 8, z };
   }
   if (worldBb && worldBb.y1 > worldBb.y0) {
      return {
         x,
         z,
         y: clampLoHi(spawn.y, worldBb.y0 + 16, worldBb.y1 - 120),
      };
   }
   return { x, y: spawn.y, z };
}

/** Quake II point entities (`light`, …). Static bounce is in surface lightmaps (`LUMP_LIGHTING` → `lightmapCanvas`). */
function parseEntityKeyvals(blk: string): Record<string, string> {
   const out: Record<string, string> = {};
   for (const m of blk.matchAll(/"([^"]+)"\s+"([^"]*)"/g)) {
      out[m[1]!] = m[2] ?? '';
   }
   return out;
}

/**
 * Submodels that should draw in the mover pass (nodraw/caulk sides still emit) but are not necessarily
 * in `mobSpecs` — e.g. `func_door` (sliding mesh stays at BSP pose; collision uses the separate door AABB).
 */
function parseExtraMoverMeshModelIndices(entBlob: string): number[] {
   const out: number[] = [];
   for (const blk of entBlob.split('{')) {
      const kv = parseEntityKeyvals(blk);
      const cn = kv.classname?.trim().toLowerCase();
      if (!cn) continue;
      const isDoor = cn.startsWith('func_door') || cn === 'func_secret';
      if (cn !== 'func_train' && !isDoor) continue;
      const modelStr = kv.model?.trim();
      if (!modelStr || modelStr[0] !== '*') continue;
      const modelIdx = Number.parseInt(modelStr.slice(1), 10);
      if (Number.isFinite(modelIdx) && modelIdx >= 1) out.push(modelIdx);
   }
   return out;
}

/** Every submodel that must draw in the mover pass (animated dy / rotation), not in static world mesh. */
function collectMoverMeshModelIndices(entBlob: string, mobSpecs: Q2MobSpec[]): Set<number> {
   const set = new Set<number>();
   for (const s of mobSpecs) set.add(s.modelIdx);
   for (const mi of parseExtraMoverMeshModelIndices(entBlob)) set.add(mi);
   for (const blk of entBlob.split('{')) {
      const kv = parseEntityKeyvals(blk);
      const cn = kv.classname?.trim().toLowerCase();
      if (!cn || !cn.startsWith('func_plat')) continue;
      const modelStr = kv.model?.trim();
      if (!modelStr || modelStr[0] !== '*') continue;
      const modelIdx = Number.parseInt(modelStr.slice(1), 10);
      if (Number.isFinite(modelIdx) && modelIdx >= 1) set.add(modelIdx);
   }
   return set;
}

/** `func_plat` / `func_rotating` with `model` `*N`, `N >= 1`. */
function parseMobSpecs(entBlob: string): Q2MobSpec[] {
   const out: Q2MobSpec[] = [];
   for (const blk of entBlob.split('{')) {
      const kv = parseEntityKeyvals(blk);
      const cn = kv.classname?.trim().toLowerCase();
      if (!cn) continue;
      const modelStr = kv.model?.trim();
      if (!modelStr || modelStr[0] !== '*') continue;
      const modelIdx = Number.parseInt(modelStr.slice(1), 10);
      if (!Number.isFinite(modelIdx) || modelIdx < 1) continue;

      if (cn.startsWith('func_plat')) {
         const speed = kv.speed ? Number.parseFloat(kv.speed) : 120;
         const heightRaw = kv.height ? Number.parseFloat(kv.height) : undefined;
         const lipRaw = kv.lip ? Number.parseFloat(kv.lip) : undefined;
         const plat: Q2MobSpec = {
            kind: 'plat',
            modelIdx,
            speed: Math.max(8, Number.isFinite(speed) ? speed : 120),
         };
         if (heightRaw !== undefined && Number.isFinite(heightRaw) && heightRaw > 1)
            plat.height = Math.max(8, heightRaw);
         if (lipRaw !== undefined && Number.isFinite(lipRaw) && lipRaw >= 0) plat.lip = lipRaw;
         if (kv.targetname?.trim()) plat.startExtended = true;
         out.push(plat);
      } else if (cn === 'func_rotating') {
         const spd = kv.speed ? Number.parseFloat(kv.speed) : 100;
         out.push({
            kind: 'rotate',
            modelIdx,
            speedDegPerSec: Math.max(1, Number.isFinite(spd) ? spd : 100),
         });
      }
   }
   return out;
}

function modelViewerAabbFromLump(dv: DataView, modelsBase: number, modelIdx: number): Q2Aabb | null {
   const mo = modelsBase + modelIdx * 48;
   const minsQ = [dv.getFloat32(mo, true), dv.getFloat32(mo + 4, true), dv.getFloat32(mo + 8, true)];
   const maxsQ = [dv.getFloat32(mo + 12, true), dv.getFloat32(mo + 16, true), dv.getFloat32(mo + 20, true)];
   return quakeBbToViewerAabb(minsQ, maxsQ);
}

function parseOriginViewer(kv: Record<string, string>): [number, number, number] | null {
   const raw = kv.origin?.trim();
   if (!raw) return null;
   const parts = raw.split(/\s+/).map(Number);
   if (parts.length < 3 || !parts.every((x) => Number.isFinite(x))) return null;
   const q = parts as number[];
   return mapPos([q[0]!, q[1]!, q[2]!]);
}

function parseInteractiveEntities(
   entBlob: string,
   dv: DataView,
   modelsBase: number,
): {
   doors: Q2DoorDef[];
   triggers: Q2TriggerDef[];
   teleports: Q2TeleportDef[];
   buttons: Q2ButtonDef[];
   entityDebug: Q2EntityDebug[];
} {
   const doors: Q2DoorDef[] = [];
   const triggers: Q2TriggerDef[] = [];
   const teleports: Q2TeleportDef[] = [];
   const buttons: Q2ButtonDef[] = [];
   const entityDebug: Q2EntityDebug[] = [];

   const teleportDestByName = new Map<string, { x: number; y: number; z: number }>();
   for (const blk of entBlob.split('{')) {
      const kv = parseEntityKeyvals(blk);
      if (kv.classname?.trim().toLowerCase() !== 'info_teleport_destination') continue;
      const tn = kv.targetname?.trim();
      const origin = parseOriginViewer(kv);
      if (!tn || !origin) continue;
      teleportDestByName.set(tn, { x: origin[0]!, y: origin[1]!, z: origin[2]! });
   }

   const isDoorClass = (cn: string) => cn.startsWith('func_door') || cn === 'func_secret';

   for (const blk of entBlob.split('{')) {
      const kv = parseEntityKeyvals(blk);
      const cn = kv.classname?.trim();
      if (!cn) continue;
      const cnLc = cn.toLowerCase();
      const tgt = kv.target?.trim();

      const origin = parseOriginViewer(kv);
      if (origin) {
         entityDebug.push({ classname: cn, x: origin[0]!, y: origin[1]!, z: origin[2]! });
      }

      const modelStr = kv.model?.trim();
      let modelIdx = -1;
      if (modelStr && modelStr[0] === '*') {
         modelIdx = Number.parseInt(modelStr.slice(1), 10);
      }

      if (isDoorClass(cnLc) && Number.isFinite(modelIdx) && modelIdx >= 1) {
         const bb = modelViewerAabbFromLump(dv, modelsBase, modelIdx);
         if (bb && bb.x1 > bb.x0 && bb.z1 > bb.z0) {
            const tw = bb.x1 - bb.x0;
            const td = bb.z1 - bb.z0;
            doors.push({
               targetname: kv.targetname?.trim() || undefined,
               x: (bb.x0 + bb.x1) * 0.5,
               z: (bb.z0 + bb.z1) * 0.5,
               y0: bb.y0,
               y1: bb.y1,
               w: Math.max(8, tw),
               t: Math.max(8, td),
            });
         }
      }

      if (tgt && (cnLc === 'trigger_multiple' || cnLc === 'trigger_once')) {
         const once = cnLc === 'trigger_once';
         let cx = 0;
         let cy = 0;
         let cz = 0;
         let radius = 96;
         if (Number.isFinite(modelIdx) && modelIdx >= 1) {
            const bb = modelViewerAabbFromLump(dv, modelsBase, modelIdx);
            if (bb && bb.x1 > bb.x0) {
               cx = (bb.x0 + bb.x1) * 0.5;
               cy = (bb.y0 + bb.y1) * 0.5;
               cz = (bb.z0 + bb.z1) * 0.5;
               radius = Math.max(48, 0.55 * Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0));
            }
         } else if (origin) {
            cx = origin[0]!;
            cy = origin[1]!;
            cz = origin[2]!;
            radius = 72;
         } else {
            continue;
         }
         triggers.push({ target: tgt, cx, cy, cz, radius, once });
      }

      if (tgt && (cnLc === 'trigger_teleport' || cnLc === 'misc_teleporter')) {
         const dest = teleportDestByName.get(tgt);
         if (!dest) continue;
         let tcx = 0;
         let tcy = 0;
         let tcz = 0;
         let tradius = 96;
         if (Number.isFinite(modelIdx) && modelIdx >= 1) {
            const bb = modelViewerAabbFromLump(dv, modelsBase, modelIdx);
            if (bb && bb.x1 > bb.x0) {
               tcx = (bb.x0 + bb.x1) * 0.5;
               tcy = (bb.y0 + bb.y1) * 0.5;
               tcz = (bb.z0 + bb.z1) * 0.5;
               tradius = Math.max(48, 0.55 * Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0));
            }
         } else if (origin) {
            tcx = origin[0]!;
            tcy = origin[1]!;
            tcz = origin[2]!;
            tradius = 72;
         } else {
            continue;
         }
         teleports.push({
            cx: tcx,
            cy: tcy,
            cz: tcz,
            radius: tradius,
            destX: dest.x,
            destY: dest.y,
            destZ: dest.z,
         });
      }

      if (tgt && (cnLc === 'func_button' || cnLc === 'misc_touchplate')) {
         if (!origin) continue;
         buttons.push({ target: tgt, x: origin[0]!, y: origin[1]!, z: origin[2]! });
      }
   }

   return { doors, triggers, teleports, buttons, entityDebug };
}

function parseEntityLights(entBlob: string, maxLights: number): Q2Light[] {
   const out: Q2Light[] = [];
   const blocks = entBlob.split('{');
   for (const blk of blocks) {
      if (!/"classname"\s+"light"/.test(blk)) continue;
      const om = /"origin"\s+"([^"]+)"/.exec(blk);
      if (!om?.[1]) continue;
      const parts = om[1].trim().split(/\s+/).map(Number);
      if (parts.length < 3 || !parts.every((x) => Number.isFinite(x))) continue;
      const [x, y, z] = mapPos([parts[0]!, parts[1]!, parts[2]!]);
      const lm = /"light"\s+"([^"]+)"/.exec(blk);
      const brightness = lm?.[1] ? Number.parseFloat(lm[1]) : 300;
      let r = 1;
      let g = 0.95;
      let b = 0.88;
      const cm = /"_color"\s+"([^"]+)"/.exec(blk);
      if (cm?.[1]) {
         const cs = cm[1].trim().split(/\s+/).map(Number);
         if (cs.length >= 3 && cs.every((x) => Number.isFinite(x))) {
            const mx = Math.max(cs[0]!, cs[1]!, cs[2]!);
            if (mx > 1.5) {
               r = cs[0]! / 255;
               g = cs[1]! / 255;
               b = cs[2]! / 255;
            } else {
               r = cs[0]!;
               g = cs[1]!;
               b = cs[2]!;
            }
         }
      }
      const br = Number.isFinite(brightness) ? Math.max(40, brightness) : 300;
      const range = 160 + Math.sqrt(br) * 7;
      const iMul = Math.min(4.2, br / 180);
      out.push({ x, y, z, r: r * iMul, g: g * iMul, b: b * iMul, range, flicker: 0.02 });
      if (out.length >= maxLights) break;
   }
   return out;
}

function readTexName(dv: DataView, texinfoBase: number, ti: number): string {
   const o = texinfoBase + ti * 76 + 40;
   let s = '';
   for (let i = 0; i < 32; i++) {
      const c = dv.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
   }
   return s.trim().toLowerCase().replace(/\\/g, '/');
}

type PendingTri = {
   /** BSP submodel index (`LUMP_MODELS`); worldspawn is `0`. */
   modelIndex: number;
   p0: [number, number, number];
   p1: [number, number, number];
   p2: [number, number, number];
   n: [number, number, number];
   texName: string;
   /** 0 diffuse, 1 `SURF_WARP`, 2 warp+`SURF_FLOWING`; 3 `SURF_TRANS33` (non-liquid), 4 `SURF_TRANS66` — alpha pass, no UV warp. */
   warpKind: number;
   /** Texture-space coords in pixels (mip0), before WAL dimensions applied */
   u0: number;
   v0: number;
   u1: number;
   v1: number;
   u2: number;
   v2: number;
   /** Lightmap: UV fraction within one layer (0–1), then shared atlas rect + style indices. */
   lmF0u: number;
   lmF0v: number;
   lmF1u: number;
   lmF1v: number;
   lmF2u: number;
   lmF2v: number;
   lmAu0: number;
   lmAv0: number;
   lmAu1: number;
   lmAv1: number;
   lmNLayers: number;
   lmS0: number;
   lmS1: number;
   lmS2: number;
   lmS3: number;
};

/**
 * Vertex layout must match QuakeCanvas: `fract`/`GL_REPEAT` for BSP is done in the fragment shader
 * so large triangles that cross UV wraps interpolate correctly (vertex-fract then interpolate is wrong).
 * Here we store continuous `uPx/tw`, `vPx/th` like ref_gl before repeat.
 */
function pushTriVert(
   mesh: number[],
   p: readonly number[],
   n: readonly number[],
   stContU: number,
   stContV: number,
   atlasU0: number,
   atlasV0: number,
   atlasU1: number,
   atlasV1: number,
   warpKind: number,
   texId: number,
   lmFu: number,
   lmFv: number,
   lmAu0: number,
   lmAv0: number,
   lmAu1: number,
   lmAv1: number,
   lmNLayers: number,
   lmS0: number,
   lmS1: number,
   lmS2: number,
   lmS3: number,
) {
   const [px = 0, py = 0, pz = 0] = p;
   const [nx = 0, ny = 0, nz = 0] = n;
   mesh.push(
      px,
      py,
      pz,
      nx,
      ny,
      nz,
      stContU,
      stContV,
      atlasU0,
      atlasV0,
      atlasU1,
      atlasV1,
      warpKind,
      texId,
      lmFu,
      lmFv,
      lmAu0,
      lmAv0,
      lmAu1,
      lmAv1,
      lmNLayers,
      lmS0,
      lmS1,
      lmS2,
      lmS3,
   );
}

function accMobPoint(bb: Map<number, Q2Aabb>, mi: number, p: readonly [number, number, number]) {
   let b = bb.get(mi);
   if (!b) {
      b = { x0: p[0], x1: p[0], y0: p[1], y1: p[1], z0: p[2], z1: p[2] };
      bb.set(mi, b);
      return;
   }
   b.x0 = Math.min(b.x0, p[0]);
   b.x1 = Math.max(b.x1, p[0]);
   b.y0 = Math.min(b.y0, p[1]);
   b.y1 = Math.max(b.y1, p[1]);
   b.z0 = Math.min(b.z0, p[2]);
   b.z1 = Math.max(b.z1, p[2]);
}

/** If a `func_plat` has no drawable BSP faces (all caulk/nodraw, or missing submodel), still emit a deck so the GPU has something to draw. */
function injectPlatFallbackMeshes(
   movers: readonly Q2MobMesh[],
   mobSolids: readonly Q2MobSolidDesc[],
   rects: ReadonlyMap<string, AtlasUvRect>,
   fallback: AtlasUvRect,
   moverVertexBoxes: Map<number, Q2Aabb>,
): Q2MobMesh[] {
   const r0 = rects.get('_missing') ?? fallback;
   const tw = Math.max(1, r0.tw);
   const th = Math.max(1, r0.th);
   const au0 = r0.u0;
   const av0 = r0.v0;
   const au1 = r0.u1;
   const av1 = r0.v1;
   const nUp: [number, number, number] = [0, 1, 0];
   const lmu0 = 0;
   const lmv0 = 0;
   const lmu1 = 1 / LM_ATLAS_SIZE;
   const lmv1 = 1 / LM_ATLAS_SIZE;
   const byIdx = new Map<number, Q2MobMesh>();
   for (const m of movers) {
      byIdx.set(m.modelIdx, {
         modelIdx: m.modelIdx,
         opaque: new Float32Array(m.opaque),
         warp: new Float32Array(m.warp),
         trans: new Float32Array(m.trans),
      });
   }
   for (const s of mobSolids) {
      if (s.kind !== 'plat') continue;
      const cur = byIdx.get(s.modelIdx);
      const nz = (cur?.opaque.length ?? 0) + (cur?.warp.length ?? 0) + (cur?.trans.length ?? 0);
      if (nz > 0) continue;
      const { x0, y0, z0, x1, y1, z1 } = s.base;
      const y = Math.max(y0 + 0.5, y1 - 1.5);
      const mesh: number[] = [];
      pushTriVert(
         mesh,
         [x0, y, z0],
         nUp,
         0,
         0,
         au0,
         av0,
         au1,
         av1,
         0,
         TEX_Q2_ATLAS,
         0.5,
         0.5,
         lmu0,
         lmv0,
         lmu1,
         lmv1,
         0,
         -1,
         -1,
         -1,
         -1,
      );
      pushTriVert(
         mesh,
         [x1, y, z0],
         nUp,
         tw,
         0,
         au0,
         av0,
         au1,
         av1,
         0,
         TEX_Q2_ATLAS,
         0.5,
         0.5,
         lmu0,
         lmv0,
         lmu1,
         lmv1,
         0,
         -1,
         -1,
         -1,
         -1,
      );
      pushTriVert(
         mesh,
         [x1, y, z1],
         nUp,
         tw,
         th,
         au0,
         av0,
         au1,
         av1,
         0,
         TEX_Q2_ATLAS,
         0.5,
         0.5,
         lmu0,
         lmv0,
         lmu1,
         lmv1,
         0,
         -1,
         -1,
         -1,
         -1,
      );
      pushTriVert(
         mesh,
         [x0, y, z0],
         nUp,
         0,
         0,
         au0,
         av0,
         au1,
         av1,
         0,
         TEX_Q2_ATLAS,
         0.5,
         0.5,
         lmu0,
         lmv0,
         lmu1,
         lmv1,
         0,
         -1,
         -1,
         -1,
         -1,
      );
      pushTriVert(
         mesh,
         [x1, y, z1],
         nUp,
         tw,
         th,
         au0,
         av0,
         au1,
         av1,
         0,
         TEX_Q2_ATLAS,
         0.5,
         0.5,
         lmu0,
         lmv0,
         lmu1,
         lmv1,
         0,
         -1,
         -1,
         -1,
         -1,
      );
      pushTriVert(
         mesh,
         [x0, y, z1],
         nUp,
         0,
         th,
         au0,
         av0,
         au1,
         av1,
         0,
         TEX_Q2_ATLAS,
         0.5,
         0.5,
         lmu0,
         lmv0,
         lmu1,
         lmv1,
         0,
         -1,
         -1,
         -1,
         -1,
      );
      const midx = s.modelIdx;
      byIdx.set(midx, { modelIdx: midx, opaque: new Float32Array(mesh), warp: new Float32Array(0), trans: new Float32Array(0) });
      for (const p of [
         [x0, y, z0],
         [x1, y, z0],
         [x1, y, z1],
         [x0, y, z1],
      ] as const) {
         accMobPoint(moverVertexBoxes, midx, p);
      }
   }
   return [...byIdx.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => m);
}

type ClusterTriBucket = { opaque: number[]; warp: number[]; trans: number[] };

function mergeVisClusterLayerSorted(
   byCluster: Map<number, ClusterTriBucket>,
   layer: keyof ClusterTriBucket,
): { merged: Float32Array; chunks: Q2VisChunk[] } {
   const keys = [...byCluster.keys()].sort((a, b) => a - b);
   const acc: number[] = [];
   const chunks: Q2VisChunk[] = [];
   let voff = 0;
   const STRIDE = Q2_MESH_VERT_FLOATS;
   for (const c of keys) {
      const raw = byCluster.get(c)![layer];
      if (raw.length === 0) continue;
      if (raw.length % STRIDE !== 0) continue;
      const nv = raw.length / STRIDE;
      chunks.push({ cluster: c, first: voff, count: nv });
      voff += nv;
      for (let i = 0; i < raw.length; i++) acc.push(raw[i]!);
   }
   return { merged: new Float32Array(acc), chunks };
}

function finalizeMesh(
   tris: PendingTri[],
   rects: Map<string, AtlasUvRect>,
   fallback: AtlasUvRect,
   moverMeshIndices: ReadonlySet<number>,
   worldCluster?: (tri: PendingTri) => number,
): {
   staticOpaque: Float32Array;
   staticWarp: Float32Array;
   staticTrans: Float32Array;
   movers: Q2MobMesh[];
   moverVertexBoxes: Map<number, Q2Aabb>;
   visChunks?: { opaque: Q2VisChunk[]; warp: Q2VisChunk[]; trans: Q2VisChunk[] };
} {
   const staticOpaque: number[] = [];
   const staticWarp: number[] = [];
   const staticTrans: number[] = [];
   const byCluster = worldCluster ? new Map<number, ClusterTriBucket>() : null;
   const moverBuckets = new Map<number, ClusterTriBucket>();
   const moverVertexBoxes = new Map<number, Q2Aabb>();

   for (const t of tris) {
      const r = rects.get(t.texName) ?? fallback;
      const tw = Math.max(1, r.tw);
      const th = Math.max(1, r.th);
      const su0 = t.u0 / tw;
      const sv0 = t.v0 / th;
      const su1 = t.u1 / tw;
      const sv1 = t.v1 / th;
      const su2 = t.u2 / tw;
      const sv2 = t.v2 / th;
      const u0 = r.u0;
      const v0 = r.v0;
      const u1 = r.u1;
      const v1 = r.v1;
      const wk = t.warpKind;
      const isWarp = wk === 1 || wk === 2;
      const isTrans = wk === 3 || wk === 4;

      let destMesh: number[];
      if (moverMeshIndices.has(t.modelIndex)) {
         let b = moverBuckets.get(t.modelIndex);
         if (!b) {
            b = { opaque: [], warp: [], trans: [] };
            moverBuckets.set(t.modelIndex, b);
         }
         destMesh = isWarp ? b.warp : isTrans ? b.trans : b.opaque;
         accMobPoint(moverVertexBoxes, t.modelIndex, t.p0);
         accMobPoint(moverVertexBoxes, t.modelIndex, t.p1);
         accMobPoint(moverVertexBoxes, t.modelIndex, t.p2);
      } else if (worldCluster && byCluster) {
         const wc = worldCluster(t);
         let bc = byCluster.get(wc);
         if (!bc) {
            bc = { opaque: [], warp: [], trans: [] };
            byCluster.set(wc, bc);
         }
         destMesh = isWarp ? bc.warp : isTrans ? bc.trans : bc.opaque;
      } else {
         destMesh = isWarp ? staticWarp : isTrans ? staticTrans : staticOpaque;
      }

      pushTriVert(
         destMesh,
         t.p0,
         t.n,
         su0,
         sv0,
         u0,
         v0,
         u1,
         v1,
         wk,
         TEX_Q2_ATLAS,
         t.lmF0u,
         t.lmF0v,
         t.lmAu0,
         t.lmAv0,
         t.lmAu1,
         t.lmAv1,
         t.lmNLayers,
         t.lmS0,
         t.lmS1,
         t.lmS2,
         t.lmS3,
      );
      pushTriVert(
         destMesh,
         t.p1,
         t.n,
         su1,
         sv1,
         u0,
         v0,
         u1,
         v1,
         wk,
         TEX_Q2_ATLAS,
         t.lmF1u,
         t.lmF1v,
         t.lmAu0,
         t.lmAv0,
         t.lmAu1,
         t.lmAv1,
         t.lmNLayers,
         t.lmS0,
         t.lmS1,
         t.lmS2,
         t.lmS3,
      );
      pushTriVert(
         destMesh,
         t.p2,
         t.n,
         su2,
         sv2,
         u0,
         v0,
         u1,
         v1,
         wk,
         TEX_Q2_ATLAS,
         t.lmF2u,
         t.lmF2v,
         t.lmAu0,
         t.lmAv0,
         t.lmAu1,
         t.lmAv1,
         t.lmNLayers,
         t.lmS0,
         t.lmS1,
         t.lmS2,
         t.lmS3,
      );
   }

   const movers: Q2MobMesh[] = [...moverBuckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([modelIdx, b]) => ({
         modelIdx,
         opaque: new Float32Array(b.opaque),
         warp: new Float32Array(b.warp),
         trans: new Float32Array(b.trans),
      }));

   if (worldCluster && byCluster && byCluster.size > 0) {
      const o = mergeVisClusterLayerSorted(byCluster, 'opaque');
      const w = mergeVisClusterLayerSorted(byCluster, 'warp');
      const tr = mergeVisClusterLayerSorted(byCluster, 'trans');
      return {
         staticOpaque: o.merged,
         staticWarp: w.merged,
         staticTrans: tr.merged,
         movers,
         moverVertexBoxes,
         visChunks: { opaque: o.chunks, warp: w.chunks, trans: tr.chunks },
      };
   }

   return {
      staticOpaque: new Float32Array(staticOpaque),
      staticWarp: new Float32Array(staticWarp),
      staticTrans: new Float32Array(staticTrans),
      movers,
      moverVertexBoxes,
   };
}

function modelLumpFallbackAabb(dv: DataView, modelsBase: number, modelIdx: number): Q2Aabb {
   const mo = modelsBase + modelIdx * 48;
   const minsQ = [dv.getFloat32(mo, true), dv.getFloat32(mo + 4, true), dv.getFloat32(mo + 8, true)];
   const maxsQ = [dv.getFloat32(mo + 12, true), dv.getFloat32(mo + 16, true), dv.getFloat32(mo + 20, true)];
   return expandAabb(quakeBbToViewerAabb(minsQ, maxsQ), 2);
}

/** Quake `height` when present; else `SP_func_plat`: `(maxs−mins) − lip` on the submodel (viewer Y span). */
function platTravelWorldUnits(s: Extract<Q2MobSpec, { kind: 'plat' }>, meshSpanY: number, lumpSpanY: number): number {
   if (s.height !== undefined && Number.isFinite(s.height) && s.height > 1) {
      return Math.max(16, Math.min(s.height, 4096));
   }
   const lip = s.lip !== undefined && Number.isFinite(s.lip) && s.lip >= 0 ? s.lip : 8;
   const spanY = Math.max(meshSpanY, lumpSpanY);
   const travel = spanY - lip;
   return Math.max(16, Math.min(travel, 4096));
}

function buildMobSolidDescriptors(
   mobSpecs: Q2MobSpec[],
   moverVertexBoxes: Map<number, Q2Aabb>,
   dv: DataView,
   modelsBase: number,
): Q2MobSolidDesc[] {
   const out: Q2MobSolidDesc[] = [];
   for (const s of mobSpecs) {
      const vb = moverVertexBoxes.get(s.modelIdx);
      const base = vb ? expandAabb(vb, 2) : modelLumpFallbackAabb(dv, modelsBase, s.modelIdx);
      if (s.kind === 'plat') {
         const lumpBb = modelViewerAabbFromLump(dv, modelsBase, s.modelIdx);
         const meshSpanY = vb ? vb.y1 - vb.y0 : base.y1 - base.y0;
         const lumpSpanY = lumpBb ? lumpBb.y1 - lumpBb.y0 : meshSpanY;
         const travel = platTravelWorldUnits(s, meshSpanY, lumpSpanY);
         const spd = Math.max(12, s.speed);
         out.push({
            modelIdx: s.modelIdx,
            kind: 'plat',
            base,
            travelHeight: travel,
            speed: spd,
            startExtended: s.startExtended,
         });
      } else {
         out.push({
            modelIdx: s.modelIdx,
            kind: 'rotate',
            base,
            speedDegPerSec: Math.max(2, s.speedDegPerSec),
         });
      }
   }
   return out;
}

export async function buildQ2LevelFromBufferAsync(
   buf: ArrayBuffer,
   textureRoots?: string[],
   appBaseURL?: string,
): Promise<Q2LevelPack | null> {
   const dv = new DataView(buf);
   const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
   const ver = dv.getInt32(4, true);
   if (magic !== 'IBSP' || ver !== 38) return null;

   const lump = (idx: number) => {
      const o = 8 + idx * 8;
      return { ofs: dv.getInt32(o, true), len: dv.getInt32(o + 4, true) };
   };

   const eLump = lump(LUMP_ENTITIES);
   const planesL = lump(LUMP_PLANES);
   const vertL = lump(LUMP_VERTEXES);
   const texL = lump(LUMP_TEXINFO);
   const faceL = lump(LUMP_FACES);
   const lightL = lump(LUMP_LIGHTING);
   const edgeL = lump(LUMP_EDGES);
   const surfEdgeL = lump(LUMP_SURFEDGES);
   const modelL = lump(LUMP_MODELS);
   const brushL = lump(LUMP_BRUSHES);
   const brushSideL = lump(LUMP_BRUSHSIDES);

   const entBlob = new TextDecoder('latin1').decode(new Uint8Array(buf, eLump.ofs, eLump.len)).replace(/\0+$/, '');
   const lightstyleTable = parseLightstylePatternsFromEntities(entBlob);
   const worldFog = parseWorldspawnFog(entBlob);

   const modelsBase = modelL.ofs;
   const worldBb = modelViewerAabbFromLump(dv, modelsBase, 0);
   const parsedSpawn = parseEntitiesSpawn(entBlob);
   let spawn: { x: number; y: number; z: number } =
      parsedSpawn ??
      (worldBb && worldBb.x1 > worldBb.x0 + 2 && worldBb.z1 > worldBb.z0 + 2
         ? {
              x: (worldBb.x0 + worldBb.x1) * 0.5,
              z: (worldBb.z0 + worldBb.z1) * 0.5,
              y: worldBb.y0 + 100,
           }
         : { x: 0, y: 48, z: 8 });
   const entityLights = parseEntityLights(entBlob, 640);
   const numModels = Math.floor(modelL.len / 48);
   const mobSpecs = parseMobSpecs(entBlob);
   const moverMeshIndices = collectMoverMeshModelIndices(entBlob, mobSpecs);
   // Every BSP submodel (mi>=1) is separate from worldspawn; faces must not stay in static mesh or lifts look frozen.
   for (let mi = 1; mi < numModels; mi++) moverMeshIndices.add(mi);
   const interactive = parseInteractiveEntities(entBlob, dv, modelsBase);

   const vertsBase = vertL.ofs;
   const edgesBase = edgeL.ofs;
   const surfEdgesBase = surfEdgeL.ofs;
   const facesBase = faceL.ofs;
   const planesBase = planesL.ofs;
   const texBase = texL.ofs;

   const getPlane = (pi: number): { nx: number; ny: number; nz: number; d: number } => {
      const o = planesBase + pi * 20;
      return {
         nx: dv.getFloat32(o, true),
         ny: dv.getFloat32(o + 4, true),
         nz: dv.getFloat32(o + 8, true),
         d: dv.getFloat32(o + 12, true),
      };
   };

   const pending: PendingTri[] = [];
   const lmPacker = createQ2LightmapPacker();
   const lightBase = lightL.ofs;
   const lightLen = lightL.len;
   const texNames = new Set<string>();
   const floors: Q2FloorRect[] = [];
   const planesCol: Q2FloorPlane[] = [];
   const segs: Q2WallSeg[] = [];

   // Used for "wall segment" collision polish.
   // Too small makes step risers behave like solid walls (you can only climb stairs by jumping).
   const minEdgeLenSq = 96 * 96;

   let levelHasSky = false;
   for (let mi = 0; mi < numModels; mi++) {
      const mo = modelsBase + mi * 48;
      const faceStart = dv.getInt32(mo + 40, true);
      const faceCount = dv.getInt32(mo + 44, true);
      if (faceCount <= 0) continue;

      for (let fi = faceStart; fi < faceStart + faceCount; fi++) {
         const fo = facesBase + fi * 20;
         const planenum = dv.getUint16(fo, true);
         const side = dv.getInt16(fo + 2, true);
         const firstedge = dv.getInt32(fo + 4, true);
         const numedges = dv.getUint16(fo + 8, true);
         const texinfoIn = dv.getInt16(fo + 10, true);
         if (texinfoIn < 0) continue;
         const texinfo = texinfoIn;

         const pl = getPlane(planenum);
         let pnQ: [number, number, number] = [pl.nx, pl.ny, pl.nz];
         let dPlane = pl.d;
         if (side) {
            pnQ = [-pnQ[0], -pnQ[1], -pnQ[2]];
            dPlane = -pl.d;
         }
         const faceNormal = mapNormal(pnQ);

         const tio = texBase + texinfo * 76;
         const texFlags = dv.getInt32(tio + 32, true);
         const isNoDraw = (texFlags & SURF_NODRAW) !== 0;
         const isSky = (texFlags & SURF_SKY) !== 0;
         if (isSky) levelHasSky = true;

         const polyQ: [number, number, number][] = [];
         for (let e = 0; e < numedges; e++) {
            const sei = dv.getInt32(surfEdgesBase + (firstedge + e) * 4, true);
            const absSe = Math.abs(sei);
            const eo = edgesBase + absSe * 4;
            const v0 = dv.getUint16(eo, true);
            const v1 = dv.getUint16(eo + 2, true);
            const vi = sei >= 0 ? v0 : v1;
            const qo = vertsBase + vi * 12;
            polyQ.push([dv.getFloat32(qo, true), dv.getFloat32(qo + 4, true), dv.getFloat32(qo + 8, true)]);
         }
         if (polyQ.length < 3) continue;

         const poly: [number, number, number][] = polyQ.map((q) => mapPos(q));

         // Render triangles are skipped for nodraw/sky on static world geometry. Mover submodels often use
         // `SURF_NODRAW`/`caulk` on sides — we still emit those faces into the mover mesh so lifts are visible.
         if (!isSky && (!isNoDraw || moverMeshIndices.has(mi))) {
            const texName = readTexName(dv, texBase, texinfo);
            texNames.add(texName || '_missing');

            let warpKind = 0;
            if (texFlags & SURF_WARP) {
               warpKind = texFlags & SURF_FLOWING ? 2 : 1;
            } else if (
               looksLikeQ2LiquidTexture(texName) &&
               (texFlags & (SURF_TRANS33 | SURF_TRANS66)) !== 0
            ) {
               warpKind = texFlags & SURF_FLOWING ? 2 : 1;
            } else if (texFlags & SURF_TRANS33) {
               warpKind = 3;
            } else if (texFlags & SURF_TRANS66) {
               warpKind = 4;
            }

            const svec = [dv.getFloat32(tio, true), dv.getFloat32(tio + 4, true), dv.getFloat32(tio + 8, true)];
            const soff = dv.getFloat32(tio + 12, true);
            const tvec = [dv.getFloat32(tio + 16, true), dv.getFloat32(tio + 20, true), dv.getFloat32(tio + 24, true)];
            const toff = dv.getFloat32(tio + 28, true);

            const lightofs = dv.getInt32(fo + 16, true);

            const uvPx = (pw: readonly number[]): [number, number] => {
               const u = dot(pw, svec as number[]) + soff;
               const v = dot(pw, tvec as number[]) + toff;
               return [u, v];
            };

            let minU = Infinity,
               maxU = -Infinity,
               minV = Infinity,
               maxV = -Infinity;
            for (const pq of polyQ) {
               const [uu, vv] = uvPx(pq);
               minU = Math.min(minU, uu);
               maxU = Math.max(maxU, uu);
               minV = Math.min(minV, vv);
               maxV = Math.max(maxV, vv);
            }
            const minUfloor = Math.floor(minU / 16);
            const maxUceil = Math.ceil(maxU / 16);
            const minVfloor = Math.floor(minV / 16);
            const maxVceil = Math.ceil(maxV / 16);
            const bw = maxUceil - minUfloor + 1;
            const bh = maxVceil - minVfloor + 1;
            const needLmBytes = bw * bh * 3;
            const dimsOk =
               bw > 0 &&
               bh > 0 &&
               bw <= 64 &&
               bh <= 64 &&
               needLmBytes > 0 &&
               lightofs >= 0 &&
               lightofs + needLmBytes <= lightLen;

            const styleB = [dv.getUint8(fo + 12), dv.getUint8(fo + 13), dv.getUint8(fo + 14), dv.getUint8(fo + 15)];
            const blocks: Uint8Array[] = [];
            const bstyles: number[] = [];
            if (dimsOk) {
               let ro = lightBase + lightofs;
               for (let si = 0; si < 4; si++) {
                  const sb = styleB[si]!;
                  if (sb === 255) continue;
                  if (ro + needLmBytes > lightBase + lightLen) break;
                  blocks.push(new Uint8Array(buf, ro, needLmBytes));
                  bstyles.push(sb);
                  ro += needLmBytes;
               }
               if (blocks.length === 0) {
                  blocks.push(new Uint8Array(buf, lightBase + lightofs, needLmBytes));
                  bstyles.push(styleB[0] !== 255 ? styleB[0]! : 0);
               }
            }

            let lmRectN: LmRectNorm;
            let nLayers = 0;
            const zs = [-1, -1, -1, -1];
            if (blocks.length > 0) {
               const stacked = lmPacker.addFaceStacked(bw, bh, blocks);
               lmRectN = stacked.rect;
               nLayers = stacked.nLayers;
               for (let k = 0; k < nLayers && k < bstyles.length && k < 4; k++) zs[k] = bstyles[k]!;
            } else {
               lmRectN = { u0: 0, v0: 0, u1: 1 / LM_ATLAS_SIZE, v1: 1 / LM_ATLAS_SIZE };
               nLayers = 0;
            }
            const hasLm = nLayers > 0;
            const lmFracForPq = (pq: readonly number[]): readonly [number, number] => {
               if (!hasLm) return [0.5, 0.5];
               const [uTex, vTex] = uvPx(pq);
               const s = (uTex / 16 - minUfloor + 0.5) / bw;
               const t = (vTex / 16 - minVfloor + 0.5) / bh;
               return [Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, t))];
            };

            const p0 = poly[0]!;
            const pq0 = polyQ[0]!;
            const uv0 = uvPx(pq0);
            for (let i = 1; i < poly.length - 1; i++) {
               const p1 = poly[i]!;
               const p2 = poly[i + 1]!;
               const pq1 = polyQ[i]!;
               const pq2 = polyQ[i + 1]!;
               const uvp1 = uvPx(pq1);
               const uvp2 = uvPx(pq2);
               const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
               const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
               let cn = cross(e1, e2);
               const cl = Math.hypot(cn[0], cn[1], cn[2]) || 1;
               cn = [cn[0] / cl, cn[1] / cl, cn[2] / cl];
               const tbase = texName || '_missing';
               const f0 = lmFracForPq(pq0);
               const f1 = lmFracForPq(pq1);
               const f2 = lmFracForPq(pq2);
               const lmAu0 = lmRectN.u0;
               const lmAv0 = lmRectN.v0;
               const lmAu1 = lmRectN.u1;
               const lmAv1 = lmRectN.v1;
               const lmNLayers = nLayers;
               const lmS0 = zs[0]!;
               const lmS1 = zs[1]!;
               const lmS2 = zs[2]!;
               const lmS3 = zs[3]!;
               if (dot(cn, faceNormal) < 0) {
                  pending.push({
                     modelIndex: mi,
                     p0,
                     p1: p2,
                     p2: p1,
                     n: faceNormal,
                     texName: tbase,
                     warpKind,
                     u0: uv0[0],
                     v0: uv0[1],
                     u1: uvp2[0],
                     v1: uvp2[1],
                     u2: uvp1[0],
                     v2: uvp1[1],
                     lmF0u: f0[0],
                     lmF0v: f0[1],
                     lmF1u: f2[0],
                     lmF1v: f2[1],
                     lmF2u: f1[0],
                     lmF2v: f1[1],
                     lmAu0,
                     lmAv0,
                     lmAu1,
                     lmAv1,
                     lmNLayers,
                     lmS0,
                     lmS1,
                     lmS2,
                     lmS3,
                  });
               } else {
                  pending.push({
                     modelIndex: mi,
                     p0,
                     p1,
                     p2,
                     n: faceNormal,
                     texName: tbase,
                     warpKind,
                     u0: uv0[0],
                     v0: uv0[1],
                     u1: uvp1[0],
                     v1: uvp1[1],
                     u2: uvp2[0],
                     v2: uvp2[1],
                     lmF0u: f0[0],
                     lmF0v: f0[1],
                     lmF1u: f1[0],
                     lmF1v: f1[1],
                     lmF2u: f2[0],
                     lmF2v: f2[1],
                     lmAu0,
                     lmAv0,
                     lmAu1,
                     lmAv1,
                     lmNLayers,
                     lmS0,
                     lmS1,
                     lmS2,
                     lmS3,
                  });
               }
            }
         }

         if (!moverMeshIndices.has(mi)) {
            const ny = faceNormal[1];
            const fp0 = poly[0]!;
            const [x0 = 0, y0 = 0, z0 = 0] = fp0;
            let xmin = x0,
               xmax = x0,
               zmin = z0,
               zmax = z0,
               ymin = y0,
               ymax = y0;
            for (const pt of poly) {
               const [x = 0, y = 0, z = 0] = pt;
               xmin = Math.min(xmin, x);
               xmax = Math.max(xmax, x);
               zmin = Math.min(zmin, z);
               zmax = Math.max(zmax, z);
               ymin = Math.min(ymin, y);
               ymax = Math.max(ymax, y);
            }

            const horiz = Math.hypot(faceNormal[0], faceNormal[2]);
            if (ny > 0.42 && horiz < 0.35) {
               floors.push({ x0: xmin, z0: zmin, x1: xmax, z1: zmax, y: ymin });
            } else if (ny > 0.22 && horiz > 0.1 && Math.abs(faceNormal[1]) > 0.12) {
               const nxf = faceNormal[0],
                  nyf = faceNormal[1],
                  nzf = faceNormal[2];
               const d = dPlane;
               const x0 = xmin;
               const z0 = zmin;
               const y00 = (d - nxf * x0 - nzf * z0) / nyf;
               planesCol.push({ x0: xmin, x1: xmax, z0: zmin, z1: zmax, y00, dydx: -nxf / nyf, dydz: -nzf / nyf });
            }

            if (Math.abs(ny) < 0.45) {
               const faceH = ymax - ymin;
               // Ignore short vertical faces (stair risers / trim) — they should be handled by step-up logic.
               if (faceH < PM_STEP_GUARD_H) {
                  // skip segment emission, still keep floors/planes
               } else {
                  for (let i = 0; i < poly.length; i++) {
                     const a = poly[i]!;
                     const b = poly[(i + 1) % poly.length]!;
                     const dx = b[0] - a[0];
                     const dz = b[2] - a[2];
                     if (dx * dx + dz * dz < minEdgeLenSq) continue;
                     segs.push({ x0: a[0], z0: a[2], x1: b[0], z1: b[2], y0: ymin - 4, y1: ymax + 4 });
                  }
               }
            }
         }
      }
   }

   const atlas = await buildQ2WalAtlas([...texNames], textureRoots, appBaseURL);
   const fb =
      atlas.rects.values().next().value ?? ({ u0: 0, v0: 0, u1: 0.02, v1: 0.02, tw: 64, th: 64 } satisfies AtlasUvRect);

   const brushBase = brushL.ofs;
   const nBrush = Math.floor(brushL.len / 12);
   const bsBase = brushSideL.ofs;
   const brushHullByIndex: (Q2HullPlane[] | null)[] = new Array(nBrush);
   const brushContentsByIndex = new Int32Array(nBrush);
   const aabbByBrush: (Q2Aabb | null)[] = new Array(nBrush);
   for (let bi = 0; bi < nBrush; bi++) {
      brushHullByIndex[bi] = null;
      aabbByBrush[bi] = null;
   }

   for (let bi = 0; bi < nBrush; bi++) {
      const bo = brushBase + bi * 12;
      const firstside = dv.getInt32(bo, true);
      const nsides = dv.getInt32(bo + 4, true);
      const contents = dv.getInt32(bo + 8, true);
      if ((contents & CONTENTS_AREAPORTAL) !== 0) continue;
      // `qbsp` allows up to `MAX_BRUSH_SIDES` (128) after bevels; skipping high side-count brushes leaves holes.
      if ((contents & Q2_PLAYER_SOLID_MASK) === 0 || nsides < 4 || nsides > 128) continue;

      const normals: number[][] = [];
      const dists: number[] = [];
      const hullV: Q2HullPlane[] = [];
      for (let s = 0; s < nsides; s++) {
         const so = bsBase + (firstside + s) * 4;
         const pn = dv.getUint16(so, true);
         const p = getPlane(pn);
         normals.push([p.nx, p.ny, p.nz]);
         dists.push(p.d);
         const Lq = Math.hypot(p.nx, p.ny, p.nz) || 1;
         const dir = mapNormal([p.nx, p.ny, p.nz]);
         hullV.push({ nx: dir[0], ny: dir[1], nz: dir[2], d: p.d / Lq });
      }

      let bx0 = Infinity,
         by0 = Infinity,
         bz0 = Infinity,
         bx1 = -Infinity,
         by1 = -Infinity,
         bz1 = -Infinity;
      let any = false;

      for (let i = 0; i < nsides; i++) {
         for (let j = i + 1; j < nsides; j++) {
            for (let k = j + 1; k < nsides; k++) {
               const n1 = normals[i]!,
                  d1 = dists[i]!;
               const n2 = normals[j]!,
                  d2 = dists[j]!;
               const n3 = normals[k]!,
                  d3 = dists[k]!;
               const pt = intersectThreePlanes(n1, d1, n2, d2, n3, d3);
               if (!pt) continue;
               if (!insideBrushQuake(pt, normals, dists)) continue;
               const mp = mapPos(pt);
               bx0 = Math.min(bx0, mp[0]);
               bx1 = Math.max(bx1, mp[0]);
               by0 = Math.min(by0, mp[1]);
               by1 = Math.max(by1, mp[1]);
               bz0 = Math.min(bz0, mp[2]);
               bz1 = Math.max(bz1, mp[2]);
               any = true;
            }
         }
      }

      if (any && bx1 > bx0 && by1 > by0 && bz1 > bz0) {
         const tight: Q2Aabb = { x0: bx0, y0: by0, z0: bz0, x1: bx1, y1: by1, z1: bz1 };
         const eb = expandAabb(tight, 2);
         // Stock `CMod_LoadBrushSides` + `CM_ClipBoxToBrush`: use compiled planes only (`qbsp` already ran `AddBrushBevels`).
         brushHullByIndex[bi] = hullV;
         brushContentsByIndex[bi] = contents;
         aabbByBrush[bi] = eb;
      } else if (hullV.length >= 4) {
         const fallback = worldBb ?? { x0: -32768, y0: -32768, z0: -32768, x1: 32768, y1: 32768, z1: 32768 };
         const eb = expandAabb(fallback, 2);
         // No tight vertex AABB — avoid merging caps to the whole map bounds.
         brushHullByIndex[bi] = hullV;
         brushContentsByIndex[bi] = contents;
         aabbByBrush[bi] = eb;
      }
   }

   const brushSuppressed = new Uint8Array(nBrush);
   // NOTE: Do not suppress static brushes near movers. It can create holes in collision (e.g. shaft walls in `tastydm2`).

   const solids: Q2Aabb[] = [];
   const brushHulls: Q2HullPlane[][] = [];
   for (let bi = 0; bi < nBrush; bi++) {
      const h = brushHullByIndex[bi];
      if (!h || brushSuppressed[bi]) continue;
      solids.push(aabbByBrush[bi]!);
      brushHulls.push(h);
   }

   const nodesL = lump(LUMP_NODES);
   const leafsL = lump(LUMP_LEAFS);
   const leafBrushesL = lump(LUMP_LEAFBRUSHES);
   const cmClip = buildQ2CmClipFromLumps(
      dv,
      buf,
      planesL.ofs,
      planesL.len,
      nodesL.ofs,
      nodesL.len,
      leafsL.ofs,
      leafsL.len,
      leafBrushesL.ofs,
      leafBrushesL.len,
      modelsBase,
      brushHullByIndex,
      brushContentsByIndex,
      brushSuppressed,
   );

   /** Per-leaf PVS cluster (`dleaf_t::cluster`); same leaf indexing as `cmPointLeafNum` from node `0`. */
   let leafClusters: Int16Array | null = null;
   let leafAreas: Int16Array | null = null;
   if (cmClip && leafsL.len >= 28) {
      const nLf = Math.floor(leafsL.len / 28);
      leafClusters = new Int16Array(nLf);
      leafAreas = new Int16Array(nLf);
      for (let i = 0; i < nLf; i++) {
         const lo = leafsL.ofs + i * 28;
         leafClusters[i] = dv.getInt16(lo + 4, true);
         leafAreas[i] = dv.getInt16(lo + 6, true);
      }
   }

   const visL = lump(LUMP_VISIBILITY);
   const visBytes =
      visL.len > 0 && visL.ofs >= 0 && visL.ofs + visL.len <= buf.byteLength
         ? new Uint8Array(buf, visL.ofs, visL.len)
         : new Uint8Array(0);
   const visParsed = parseQ2VisLumpInfo(visBytes);
   const visHeaderBytes =
      visParsed && visParsed.numClusters > 0 ? 4 + visParsed.numClusters * 8 : 0;
   const usePvsCluster =
      !!cmClip &&
      !!leafClusters &&
      !!visParsed &&
      visParsed.numClusters > 0 &&
      visParsed.rowBytes > 0 &&
      visBytes.byteLength >= visHeaderBytes;

   let meshBuffers: ReturnType<typeof finalizeMesh>;
   let visBake: Q2LevelPack['visBake'] = null;
   if (usePvsCluster && cmClip && leafClusters) {
      const lc = leafClusters;
      const cm = cmClip;
      const worldCluster = (tri: PendingTri) => {
         const cx = (tri.p0[0] + tri.p1[0] + tri.p2[0]) / 3;
         const cy = (tri.p0[1] + tri.p1[1] + tri.p2[1]) / 3;
         const cz = (tri.p0[2] + tri.p1[2] + tri.p2[2]) / 3;
         const lf = cmPointLeafNum(cm, cx, cy, cz);
         return cmLeafPvsCluster(lc, lf);
      };
      meshBuffers = finalizeMesh(pending, atlas.rects, fb, moverMeshIndices, worldCluster);
      const vch = meshBuffers.visChunks;
      const nVisChunks = vch ? vch.opaque.length + vch.warp.length + vch.trans.length : 0;
      if (vch && visParsed && nVisChunks > 0) {
         visBake = {
            visLump: new Uint8Array(visBytes),
            numClusters: visParsed.numClusters,
            rowBytes: visParsed.rowBytes,
            opaqueChunks: vch.opaque,
            warpChunks: vch.warp,
            transChunks: vch.trans,
         };
      } else {
         meshBuffers = finalizeMesh(pending, atlas.rects, fb, moverMeshIndices);
      }
   } else {
      meshBuffers = finalizeMesh(pending, atlas.rects, fb, moverMeshIndices);
   }

   const mobSolids = buildMobSolidDescriptors(mobSpecs, meshBuffers.moverVertexBoxes, dv, modelsBase);
   const mobMeshesFinal = injectPlatFallbackMeshes(
      meshBuffers.movers,
      mobSolids,
      atlas.rects,
      fb,
      meshBuffers.moverVertexBoxes,
   );

   spawn = snapSpawnToWorld(spawn, floors, planesCol, worldBb);

   // If wall segments are missing/too sparse on map borders (common with sky/nodraw),
   // add a simple perimeter so the player cannot exit the playable bounds.
   const floorBb = floorBoundsXZ(floors);
   if (floorBb) {
      segs.push(...boundsToPerimeterSegs({ ...worldBb, ...floorBb } as Q2Aabb));
   } else if (worldBb) {
      segs.push(...boundsToPerimeterSegs(worldBb));
   }

   return {
      verts: meshBuffers.staticOpaque,
      warpVerts: meshBuffers.staticWarp,
      transVerts: meshBuffers.staticTrans,
      solids,
      brushHulls,
      floors,
      planes: planesCol,
      segs,
      lights: entityLights,
      spawn,
      lifts: [],
      mobSpecs,
      mobMeshes: mobMeshesFinal,
      mobSolids,
      hasSky: levelHasSky,
      doors: interactive.doors,
      triggers: interactive.triggers,
      teleports: interactive.teleports,
      buttons: interactive.buttons,
      entityDebug: interactive.entityDebug,
      atlasCanvas: atlas.canvas,
      lightmapCanvas: lmPacker.toCanvas(),
      lightstyleTable,
      cmClip,
      leafClusters,
      leafAreas,
      visBake,
      worldFog,
   };
}
