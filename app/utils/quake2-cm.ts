/**
 * Quake II–style clip model trace: `CM_RecursiveHullCheck` + `CM_TraceToLeaf` + `CM_ClipBoxToBrush`
 * over BSP nodes/leafs/leafbrushes (IBSP 38). Brush geometry is the same convex hulls as the viewer build.
 */

import type { Q2HullPlane } from '~/utils/quake2-bsp';
import { clipSegmentToConvexHull, type Q2BrushClipHit } from '~/utils/quake2-trace';

/** Match `quake2-trace.ts` — softer contact at adjacent brush planes. */
const DIST_EPSILON = 3 / 64;

export type Q2CmClip = {
   headnode: number;
   /** `nodes[i*3+0]` = planenum, `+1` / `+2` = child0 / child1 (negative ⇒ leaf `-(child+1)`). */
   nodes: Int32Array;
   /** `leafData[i*3+0]` contents, `+1` firstLeafBrush word index, `+2` numLeafBrushes. */
   leafData: Int32Array;
   /** `LUMP_LEAFBRUSHES` as uint16 brush indices (same as `dleaf_t::firstleafbrush` indexing). */
   leafBrushes: Uint16Array;
   /** Per file brush index; `null` = not a player-solid brush. */
   brushHulls: (Q2HullPlane[] | null)[];
   brushContents: Int32Array;
   /** 1 = suppressed (mover duplicate strip), same indices as file brushes. */
   brushSuppressed: Uint8Array;
   /** Viewer-space BSP split planes: `planeNx[i]*x+… = planeD[i]`. */
   planeNx: Float32Array;
   planeNy: Float32Array;
   planeNz: Float32Array;
   planeD: Float32Array;
   /** Dedupes brushes shared by multiple leafs within one trace (`b->checkcount` in Q2). */
   brushStamp: Int32Array;
};

export type Q2CmTraceHit = Q2BrushClipHit;

/** Quake `(x,y,z)` linear part of `mapPos` / face normals — must match `quake2-bsp.ts`. */
function mapDirQuakeToViewer(q: readonly [number, number, number]): [number, number, number] {
   return [q[0], q[2], q[1]];
}

const DNODE_STRIDE = 28;
const DLEAF_STRIDE = 28;

export function buildQ2CmClipFromLumps(
   dv: DataView,
   buf: ArrayBuffer,
   planesOfs: number,
   planesLen: number,
   nodesOfs: number,
   nodesLen: number,
   leafsOfs: number,
   leafsLen: number,
   leafBrushesOfs: number,
   leafBrushesLen: number,
   modelsBase: number,
   brushHullByIndex: (Q2HullPlane[] | null)[],
   brushContents: Int32Array,
   brushSuppressed: Uint8Array,
): Q2CmClip | null {
   if (nodesLen < DNODE_STRIDE || leafsLen < DLEAF_STRIDE || leafBrushesLen < 2) return null;

   const nPlanes = Math.floor(planesLen / 20);
   if (nPlanes < 1) return null;

   const planeNx = new Float32Array(nPlanes);
   const planeNy = new Float32Array(nPlanes);
   const planeNz = new Float32Array(nPlanes);
   const planeD = new Float32Array(nPlanes);
   for (let i = 0; i < nPlanes; i++) {
      const o = planesOfs + i * 20;
      const qnx = dv.getFloat32(o, true);
      const qny = dv.getFloat32(o + 4, true);
      const qnz = dv.getFloat32(o + 8, true);
      const d = dv.getFloat32(o + 12, true);
      const [nx, ny, nz] = mapDirQuakeToViewer([qnx, qny, qnz]);
      planeNx[i] = nx;
      planeNy[i] = ny;
      planeNz[i] = nz;
      planeD[i] = d;
   }

   const nNodes = Math.floor(nodesLen / DNODE_STRIDE);
   const nodes = new Int32Array(nNodes * 3);
   for (let i = 0; i < nNodes; i++) {
      const o = nodesOfs + i * DNODE_STRIDE;
      nodes[i * 3] = dv.getInt32(o, true);
      nodes[i * 3 + 1] = dv.getInt32(o + 4, true);
      nodes[i * 3 + 2] = dv.getInt32(o + 8, true);
   }

   const nLeafs = Math.floor(leafsLen / DLEAF_STRIDE);
   const leafData = new Int32Array(nLeafs * 3);
   for (let i = 0; i < nLeafs; i++) {
      const o = leafsOfs + i * DLEAF_STRIDE;
      leafData[i * 3] = dv.getInt32(o, true);
      leafData[i * 3 + 1] = dv.getUint16(o + 24, true);
      leafData[i * 3 + 2] = dv.getUint16(o + 26, true);
   }

   const nLbU16 = Math.floor(leafBrushesLen / 2);
   const leafBrushes = new Uint16Array(buf, leafBrushesOfs, nLbU16);

   const headnode = dv.getInt32(modelsBase + 36, true);
   if (headnode < 0 || headnode >= nNodes) return null;

   const brushStamp = new Int32Array(brushHullByIndex.length);

   return {
      headnode,
      nodes,
      leafData,
      leafBrushes,
      brushHulls: brushHullByIndex,
      brushContents,
      brushSuppressed,
      planeNx,
      planeNy,
      planeNz,
      planeD,
      brushStamp,
   };
}

type TraceCtx = {
   cm: Q2CmClip;
   p1: readonly [number, number, number];
   p2: readonly [number, number, number];
   mins: readonly [number, number, number];
   maxs: readonly [number, number, number];
   contentsMask: number;
   traceExt: readonly [number, number, number];
   frac: number;
   nx: number;
   ny: number;
   nz: number;
   startsolid: boolean;
   allsolid: boolean;
   checkStamp: number;
};

function mergeHit(ctx: TraceCtx, hit: Q2BrushClipHit | null) {
   if (!hit) return;
   if (hit.allsolid) {
      ctx.frac = 0;
      ctx.nx = hit.nx;
      ctx.ny = hit.ny;
      ctx.nz = hit.nz;
      ctx.startsolid = true;
      ctx.allsolid = true;
      return;
   }
   if (hit.startsolid) ctx.startsolid = true;

   const fe = 1e-6;
   if (hit.fraction < ctx.frac - fe) {
      ctx.frac = hit.fraction;
      ctx.nx = hit.nx;
      ctx.ny = hit.ny;
      ctx.nz = hit.nz;
      return;
   }

   // No closer clip along the segment: stock `CM_ClipBoxToBrush` also leaves `plane` unset for pure startsolid
   // touches. Our trace still needs a **wall** normal for `PM_ClipVelocity` / wish helpers — keep `(0,1,0)` only
   // until a brush reports a stronger horizontal normal (same idea as `traceSegmentThroughSolidBrushes`).
   if (ctx.frac >= 1 - fe && hit.fraction >= 1 - fe && hit.startsolid) {
      const hHit = hit.nx * hit.nx + hit.nz * hit.nz;
      const hCtx = ctx.nx * ctx.nx + ctx.nz * ctx.nz;
      if (hHit > hCtx + 1e-8) {
         ctx.nx = hit.nx;
         ctx.ny = hit.ny;
         ctx.nz = hit.nz;
      }
   }
}

function traceToLeaf(ctx: TraceCtx, leafNum: number) {
   const nLeafs = (ctx.cm.leafData.length / 3) | 0;
   if (leafNum < 0 || leafNum >= nLeafs) return;
   const base = leafNum * 3;
   const contents = ctx.cm.leafData[base]!;
   if ((contents & ctx.contentsMask) === 0) return;

   const first = ctx.cm.leafData[base + 1]!;
   const n = ctx.cm.leafData[base + 2]!;
   for (let k = 0; k < n; k++) {
      const brushnum = ctx.cm.leafBrushes[first + k]!;
      if (brushnum >= ctx.cm.brushStamp.length) continue;
      if (ctx.cm.brushStamp[brushnum] === ctx.checkStamp) continue;
      ctx.cm.brushStamp[brushnum] = ctx.checkStamp;

      if (ctx.cm.brushSuppressed[brushnum]) continue;
      const hull = ctx.cm.brushHulls[brushnum];
      if (!hull || hull.length < 4) continue;
      if ((ctx.cm.brushContents[brushnum]! & ctx.contentsMask) === 0) continue;

      const hit = clipSegmentToConvexHull(ctx.p1, ctx.p2, ctx.mins, ctx.maxs, hull);
      mergeHit(ctx, hit);
      if (ctx.frac <= 0) return;
   }
}

function recursiveHullCheck(ctx: TraceCtx, nodeNum: number, p1f: number, p2f: number, p1: number[], p2: number[]) {
   if (ctx.frac <= p1f) return;

   if (nodeNum < 0) {
      traceToLeaf(ctx, -1 - nodeNum);
      return;
   }

   const no = nodeNum * 3;
   const planenum = ctx.cm.nodes[no]! >>> 0;
   if (planenum >= ctx.cm.planeNx.length) return;
   const nx = ctx.cm.planeNx[planenum]!;
   const ny = ctx.cm.planeNy[planenum]!;
   const nz = ctx.cm.planeNz[planenum]!;
   const dist = ctx.cm.planeD[planenum]!;

   const t1 = nx * p1[0]! + ny * p1[1]! + nz * p1[2]! - dist;
   const t2 = nx * p2[0]! + ny * p2[1]! + nz * p2[2]! - dist;
   const offset =
      Math.abs(ctx.traceExt[0]! * nx) + Math.abs(ctx.traceExt[1]! * ny) + Math.abs(ctx.traceExt[2]! * nz);

   let frac: number;
   let frac2: number;
   let side: number;

   if (t1 >= offset && t2 >= offset) {
      recursiveHullCheck(ctx, ctx.cm.nodes[no + 1]!, p1f, p2f, p1, p2);
      return;
   }
   if (t1 < -offset && t2 < -offset) {
      recursiveHullCheck(ctx, ctx.cm.nodes[no + 2]!, p1f, p2f, p1, p2);
      return;
   }

   if (t1 < t2) {
      const idist = 1 / (t1 - t2);
      side = 1;
      frac2 = (t1 + offset + DIST_EPSILON) * idist;
      frac = (t1 - offset + DIST_EPSILON) * idist;
   } else if (t1 > t2) {
      const idist = 1 / (t1 - t2);
      side = 0;
      frac2 = (t1 - offset - DIST_EPSILON) * idist;
      frac = (t1 + offset + DIST_EPSILON) * idist;
   } else {
      side = 0;
      frac = 1;
      frac2 = 0;
   }

   if (frac < 0) frac = 0;
   if (frac > 1) frac = 1;

   const midf = p1f + (p2f - p1f) * frac;
   const mid: number[] = [
      p1[0]! + frac * (p2[0]! - p1[0]!),
      p1[1]! + frac * (p2[1]! - p1[1]!),
      p1[2]! + frac * (p2[2]! - p1[2]!),
   ];
   recursiveHullCheck(ctx, ctx.cm.nodes[no + 1 + side]!, p1f, midf, p1, mid);

   if (frac2 < 0) frac2 = 0;
   if (frac2 > 1) frac2 = 1;
   const midf2 = p1f + (p2f - p1f) * frac2;
   const mid2: number[] = [
      p1[0]! + frac2 * (p2[0]! - p1[0]!),
      p1[1]! + frac2 * (p2[1]! - p1[1]!),
      p1[2]! + frac2 * (p2[2]! - p1[2]!),
   ];
   recursiveHullCheck(ctx, ctx.cm.nodes[no + 1 + (side ^ 1)]!, midf2, p2f, mid2, p2);
}

let cmCheckSerial = 1;

/** Stock Q2 `CM_BoxTrace` against the world clip model (no bevel expansion — same hulls as our brush build). */
export function cmBoxTrace(
   cm: Q2CmClip,
   p1: readonly [number, number, number],
   p2: readonly [number, number, number],
   mins: readonly [number, number, number],
   maxs: readonly [number, number, number],
   contentsMask: number,
): Q2CmTraceHit {
   const traceExt: [number, number, number] = [
      -mins[0] > maxs[0] ? -mins[0] : maxs[0],
      -mins[1] > maxs[1] ? -mins[1] : maxs[1],
      -mins[2] > maxs[2] ? -mins[2] : maxs[2],
   ];

   if (cmCheckSerial > 1_000_000_000) cmCheckSerial = 1;
   const checkStamp = ++cmCheckSerial;

   const ctx: TraceCtx = {
      cm,
      p1,
      p2,
      mins,
      maxs,
      contentsMask,
      traceExt,
      frac: 1,
      nx: 0,
      ny: 1,
      nz: 0,
      startsolid: false,
      allsolid: false,
      checkStamp,
   };

   const p1a = [p1[0], p1[1], p1[2]];
   const p2a = [p2[0], p2[1], p2[2]];
   recursiveHullCheck(ctx, cm.headnode, 0, 1, p1a, p2a);

   return {
      fraction: ctx.frac,
      nx: ctx.nx,
      ny: ctx.ny,
      nz: ctx.nz,
      startsolid: ctx.startsolid,
      allsolid: ctx.allsolid,
   };
}

/** Shared BSP walk: `startNode` is `0` for stock `CM_PointLeafnum` / PVS, or `cm.headnode` for `CM_PointContents` world traces. */
function cmPointLeafNumFrom(cm: Q2CmClip, px: number, py: number, pz: number, startNode: number): number {
   let nodeNum = startNode;
   for (let guard = 0; guard < 65536; guard++) {
      if (nodeNum < 0) {
         const leafNum = -1 - nodeNum;
         const nLeafs = (cm.leafData.length / 3) | 0;
         if (leafNum < 0 || leafNum >= nLeafs) return -1;
         return leafNum;
      }
      const no = nodeNum * 3;
      const planenum = cm.nodes[no]! >>> 0;
      if (planenum >= cm.planeNx.length) return -1;
      const nx = cm.planeNx[planenum]!;
      const ny = cm.planeNy[planenum]!;
      const nz = cm.planeNz[planenum]!;
      const dist = cm.planeD[planenum]!;
      const t = nx * px + ny * py + nz * pz - dist;
      nodeNum = t < 0 ? cm.nodes[no + 2]! : cm.nodes[no + 1]!;
   }
   return -1;
}

/** Stock `CM_PointLeafnum` — always enters the tree at node `0` (matches ref PVS / `dleaf` cluster indexing). */
export function cmPointLeafNum(cm: Q2CmClip, px: number, py: number, pz: number): number {
   return cmPointLeafNumFrom(cm, px, py, pz, 0);
}

/** `dleaf_t::cluster` for `leafNum` from `cmPointLeafNum`; `< 0` ⇒ no PVS (always visible). */
export function cmLeafPvsCluster(leafClusters: Int16Array | null, leafNum: number): number {
   if (!leafClusters || leafNum < 0 || leafNum >= leafClusters.length) return -1;
   return leafClusters[leafNum]!;
}

/**
 * Stock-style `CM_PointLeafnum` + leaf `contents` (viewer-space point, same planes as traces).
 * Uses `cm.headnode` like `CM_PointContents(p, map_cmodels[0].headnode)`.
 * Returns `0` (`CONTENTS_EMPTY`) if the tree walk fails.
 */
export function cmPointLeafContents(cm: Q2CmClip, px: number, py: number, pz: number): number {
   const leafNum = cmPointLeafNumFrom(cm, px, py, pz, cm.headnode);
   if (leafNum < 0) return 0;
   return cm.leafData[leafNum * 3]!;
}
