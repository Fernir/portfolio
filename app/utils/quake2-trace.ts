/** Convex brush clipping (`CM_ClipBoxToBrush`-style) for player-sized AABB swept segments. */

import type { Q2Aabb, Q2HullPlane } from '~/utils/quake2-bsp';

export type Q2BrushClipHit = {
   fraction: number;
   nx: number;
   ny: number;
   nz: number;
   startsolid?: boolean;
   allsolid?: boolean;
};

/**
 * Combine two brush traces (e.g. world CM + movers, or static + dynamic lists) like one `CM_BoxTrace`:
 * earliest `fraction` wins for plane/normal; `allsolid` dominates; `startsolid` ORs (touching / overlapping
 * at trace start is independent of which brush clips the segment first).
 */
export function mergeBrushClipHits(a: Q2BrushClipHit | null, b: Q2BrushClipHit | null): Q2BrushClipHit | null {
   if (!a && !b) return null;
   if (!a) return b;
   if (!b) return a;
   if (a.allsolid || b.allsolid) {
      const s = a.allsolid ? a : b;
      return {
         fraction: 0,
         nx: s.nx,
         ny: s.ny,
         nz: s.nz,
         allsolid: true,
         startsolid: true,
      };
   }
   const eps = 1e-7;
   const fe = 1e-6;
   let pick: Q2BrushClipHit;
   if (a.fraction < b.fraction - eps) pick = { ...a };
   else if (b.fraction < a.fraction - eps) pick = { ...b };
   else pick = { ...a };
   pick.startsolid = !!(a.startsolid || b.startsolid);
   // Tie at "no clip" (fraction≈1): prefer the hit whose normal is useful for vertical wall sliding.
   if (Math.abs(a.fraction - b.fraction) <= eps && a.fraction >= 1 - fe) {
      const ha = a.nx * a.nx + a.nz * a.nz;
      const hb = b.nx * b.nx + b.nz * b.nz;
      if (hb > ha + 1e-8) pick = { ...b, startsolid: pick.startsolid };
      else if (ha > hb + 1e-8) pick = { ...a, startsolid: pick.startsolid };
   }
   return pick;
}

/** Slightly above stock 1/32 — fewer false hits at brush seams (corners, wall joins). */
const DIST_EPSILON = 3 / 64;

/** Outward-facing hull half-spaces: interior iff `dot(n,p) <= adjustedDist` (CM convention). */
export function adjustedBrushPlaneDist(
   pl: Q2HullPlane,
   mins: readonly [number, number, number],
   maxs: readonly [number, number, number],
): number {
   const ofs: [number, number, number] = [
      pl.nx < 0 ? maxs[0] : mins[0],
      pl.ny < 0 ? maxs[1] : mins[1],
      pl.nz < 0 ? maxs[2] : mins[2],
   ];
   return pl.d - (ofs[0] * pl.nx + ofs[1] * pl.ny + ofs[2] * pl.nz);
}

/** Clip movement segment `p1→p2` against one convex brush; returns earliest hit along the segment. */
export function clipSegmentToConvexHull(
   p1: readonly [number, number, number],
   p2: readonly [number, number, number],
   mins: readonly [number, number, number],
   maxs: readonly [number, number, number],
   hull: readonly Q2HullPlane[],
): Q2BrushClipHit | null {
   if (hull.length === 0) return null;

   let enterfrac = -1;
   let leavefrac = 1;
   let clipplane: Q2HullPlane | null = null;
   let startout = false;
   let getout = false;

   for (const plane of hull) {
      const dist = adjustedBrushPlaneDist(plane, mins, maxs);
      const d1 = plane.nx * p1[0] + plane.ny * p1[1] + plane.nz * p1[2] - dist;
      const d2 = plane.nx * p2[0] + plane.ny * p2[1] + plane.nz * p2[2] - dist;

      if (d1 > 0) startout = true;
      if (d2 > 0) getout = true;

      if (d1 > 0 && d2 >= d1) return null;

      if (d1 <= 0 && d2 <= 0) continue;

      if (d1 > d2) {
         const f = (d1 - DIST_EPSILON) / (d1 - d2);
         if (f > enterfrac) {
            enterfrac = f;
            clipplane = plane;
         }
      } else {
         const f = (d1 + DIST_EPSILON) / (d1 - d2);
         if (f < leavefrac) leavefrac = f;
      }
   }

   // `CM_ClipBoxToBrush`: start position overlaps the brush (`!startout`). Stock returns without setting `plane`;
   // using the sweep direction as a normal is wrong for flush wall contact (wish is often nearly parallel to the
   // segment) and breaks wish-projection / slide. Prefer the least-penetrating hull face: max `d1` among planes.
   if (!startout) {
      const allsolid = !getout;
      if (allsolid) {
         return { fraction: 0, nx: 0, ny: 0, nz: 0, startsolid: true, allsolid: true };
      }
      let bestD1 = -Infinity;
      let bestPlane: Q2HullPlane | null = null;
      for (const plane of hull) {
         const dist = adjustedBrushPlaneDist(plane, mins, maxs);
         const d1 = plane.nx * p1[0] + plane.ny * p1[1] + plane.nz * p1[2] - dist;
         if (d1 > bestD1) {
            bestD1 = d1;
            bestPlane = plane;
         }
      }
      if (bestPlane) {
         return {
            fraction: 1,
            nx: bestPlane.nx,
            ny: bestPlane.ny,
            nz: bestPlane.nz,
            startsolid: true,
            allsolid: false,
         };
      }
      return { fraction: 1, nx: 0, ny: 1, nz: 0, startsolid: true, allsolid: false };
   }

   if (enterfrac < leavefrac && enterfrac > -1 && clipplane) {
      return {
         fraction: Math.max(0, Math.min(1, enterfrac)),
         nx: clipplane.nx,
         ny: clipplane.ny,
         nz: clipplane.nz,
      };
   }

   return null;
}

/** Earliest brush hit along `p1→p2` across all solids that overlap the sweep in XZ/Y (broad-phase). */
export function traceSegmentThroughSolidBrushes(
   p1: readonly [number, number, number],
   p2: readonly [number, number, number],
   mins: readonly [number, number, number],
   maxs: readonly [number, number, number],
   solids: readonly Q2Aabb[],
   hulls: readonly Q2HullPlane[][],
): Q2BrushClipHit | null {
   let best: Q2BrushClipHit | null = null;
   let bestFrac = 1;
   let anyStartSolid = false;
   /** Best `startsolid` + `fraction≈1` contact among brushes (avoids falling through to fake `(0,1,0)`). */
   let touchBest: Q2BrushClipHit | null = null;
   let touchHz = -1;

   // Envelope of the swept AABB in Y (CM_BoxTrace broad-phase): must cover both segment ends + box mins/maxs.
   // Using only `p1` missed floors/ceilings on vertical sweeps (e.g. `feetDownGroundTrace`).
   const yLo = Math.min(p1[1], p2[1]) + mins[1];
   const yHi = Math.max(p1[1], p2[1]) + maxs[1];

   const sxMin = Math.min(p1[0], p2[0]) + mins[0];
   const sxMax = Math.max(p1[0], p2[0]) + maxs[0];
   const szMin = Math.min(p1[2], p2[2]) + mins[2];
   const szMax = Math.max(p1[2], p2[2]) + maxs[2];

   for (let si = 0; si < solids.length; si++) {
      const b = solids[si]!;
      const hull = hulls[si];
      if (!hull || hull.length < 4) continue;

      if (yHi < b.y0 || yLo > b.y1) continue;
      if (sxMax < b.x0 || sxMin > b.x1 || szMax < b.z0 || szMin > b.z1) continue;

      const hit = clipSegmentToConvexHull(p1, p2, mins, maxs, hull);
      if (!hit) continue;
      if (hit.allsolid) {
         return {
            fraction: 0,
            nx: hit.nx,
            ny: hit.ny,
            nz: hit.nz,
            allsolid: true,
            startsolid: true,
         };
      }
      if (hit.startsolid) anyStartSolid = true;
      if (hit.startsolid && hit.fraction >= 1 - 1e-6) {
         const hz = hit.nx * hit.nx + hit.nz * hit.nz;
         if (hz > touchHz + 1e-10) {
            touchHz = hz;
            touchBest = {
               fraction: 1,
               nx: hit.nx,
               ny: hit.ny,
               nz: hit.nz,
               startsolid: true,
            };
         }
      }
      if (hit.fraction < bestFrac - 1e-9) {
         bestFrac = hit.fraction;
         best = {
            fraction: hit.fraction,
            nx: hit.nx,
            ny: hit.ny,
            nz: hit.nz,
            startsolid: hit.startsolid,
         };
      }
   }

   if (!best) {
      return touchBest ?? (anyStartSolid ? { fraction: 1, nx: 0, ny: 1, nz: 0, startsolid: true } : null);
   }
   if (anyStartSolid) best = { ...best, startsolid: true };
   if (best.fraction >= 1 - 1e-6) {
      const bh = best.nx * best.nx + best.nz * best.nz;
      if (touchBest && bh < 0.04 && touchHz > bh + 1e-6) {
         best = { ...touchBest, startsolid: true };
      }
   }
   return best;
}

/** Six planes for an axis-aligned brush (viewer-space AABB), matching CM inward inequalities. */
export function aabbToHullPlanes(b: Q2Aabb): Q2HullPlane[] {
   return [
      { nx: -1, ny: 0, nz: 0, d: -b.x0 },
      { nx: 1, ny: 0, nz: 0, d: b.x1 },
      { nx: 0, ny: -1, nz: 0, d: -b.y0 },
      { nx: 0, ny: 1, nz: 0, d: b.y1 },
      { nx: 0, ny: 0, nz: -1, d: -b.z0 },
      { nx: 0, ny: 0, nz: 1, d: b.z1 },
   ];
}

/**
 * Convex hull planes for a box that is axis-aligned at yaw=0 and rotated only around **viewer Y**
 * through `(cx, cz)` (horizontal pivot). Matches `aabbToHullPlanes` when `yawRad === 0` and pivot is bbox center.
 */
export function obbYRotationHullPlanes(b: Q2Aabb, cx: number, cz: number, yawRad: number): Q2HullPlane[] {
   const hx = (b.x1 - b.x0) * 0.5;
   const hz = (b.z1 - b.z0) * 0.5;
   const co = Math.cos(yawRad);
   const si = Math.sin(yawRad);
   const exx = co;
   const exz = si;
   const ezx = -si;
   const ezz = co;
   const dex = cx * co + cz * si;
   const dez = -cx * si + cz * co;
   return [
      { nx: -exx, ny: 0, nz: -exz, d: -dex + hx },
      { nx: exx, ny: 0, nz: exz, d: dex + hx },
      { nx: -ezx, ny: 0, nz: -ezz, d: -dez + hz },
      { nx: ezx, ny: 0, nz: ezz, d: dez + hz },
      { nx: 0, ny: -1, nz: 0, d: -b.y0 },
      { nx: 0, ny: 1, nz: 0, d: b.y1 },
   ];
}
