<template>
   <div class="qc-host" v-bind="$attrs">
      <canvas ref="canvasEl" class="qc-root" />
      <pre v-if="debugOverlay" class="qc-debug-hud">{{ debugHudText }}</pre>
   </div>
</template>

<script setup lang="ts">
import {
   buildQ2LevelFromBufferAsync,
   CONTENTS_LAVA_Q2,
   CONTENTS_SLIME_Q2,
   CONTENTS_WATER_Q2,
   Q2_LIQUID_MASK,
   Q2_MESH_VERT_FLOATS,
   Q2_PLAYER_SOLID_MASK,
   type Q2EntityDebug,
   type Q2HullPlane,
   type Q2LevelPack,
   type Q2MobSolidDesc,
   type Q2TeleportDef,
   type Q2WorldFog,
} from '~/utils/quake2-bsp';
import { cmBoxTrace, cmPointLeafContents, cmPointLeafNum, type Q2CmClip } from '~/utils/quake2-cm';
import { buildLightstyleScalars, type Q2LightstyleTable } from '~/utils/quake2-lightstyles';
import { q2ClusterVisibleInPvs, q2DecompressPvsRow } from '~/utils/quake2-vis';
import {
   aabbToHullPlanes,
   mergeBrushClipHits,
   obbYRotationHullPlanes,
   traceSegmentThroughSolidBrushes,
   type Q2BrushClipHit,
} from '~/utils/quake2-trace';
import { pmove, type PmCmd, type PmEnv, type PmParams, type PmState } from '~/utils/quake2-pmove';
import { joinPublicAsset } from '~/utils/publicAsset';
import { DEFAULT_BSP_FALLBACK_CHAIN } from '~/utils/quake-local-maps';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
   defineProps<{
      /** Path under site `public/` for BSP (optional; otherwise query / fallback chain). */
      bspUrl?: string;
   }>(),
   {
      bspUrl: undefined,
   },
);
const route = useRoute();

type Vec3 = [number, number, number];
type Aabb = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
type FloorRect = { x0: number; z0: number; x1: number; z1: number; y: number };
type FloorPlane = { x0: number; x1: number; z0: number; z1: number; y00: number; dydx: number; dydz: number };
type Light = { x: number; y: number; z: number; r: number; g: number; b: number; range: number; flicker: number };
type Door = {
   id: string;
   targetname?: string;
   x: number;
   z: number;
   y0: number;
   y1: number;
   w: number;
   t: number;
   open: boolean;
   pct: number;
};
type TriggerRun = {
   target: string;
   cx: number;
   cy: number;
   cz: number;
   radius: number;
   once: boolean;
   fired: boolean;
   wasInside: boolean;
};
type TeleportRun = Q2TeleportDef & { wasInside: boolean };
type ButtonRun = { target: string; x: number; y: number; z: number };
type Lift = { id: string; x0: number; x1: number; z0: number; z1: number; yA: number; yB: number; y: number; dir: 1 | -1; moving: boolean };

const canvasEl = ref<HTMLCanvasElement | null>(null);
const debugOverlay = ref(false);
const debugHudText = ref('');

let raf = 0;
let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let vao: WebGLVertexArrayObject | null = null;
let uniforms: null | {
   uMvp: WebGLUniformLocation | null;
   uCamPos: WebGLUniformLocation | null;
   uEmissivePass: WebGLUniformLocation | null;
   uLightCount: WebGLUniformLocation | null;
   uLightPos: WebGLUniformLocation | null;
   uLightCol: WebGLUniformLocation | null;
   uLightRange: WebGLUniformLocation | null;
   uTexWallCode: WebGLUniformLocation | null;
   uTexWallStone: WebGLUniformLocation | null;
   uTexFloorStone: WebGLUniformLocation | null;
   uTexFloorMetal: WebGLUniformLocation | null;
   uTexCeil: WebGLUniformLocation | null;
   uTexQ2: WebGLUniformLocation | null;
   uTexLM: WebGLUniformLocation | null;
   uLmStyleVal: WebGLUniformLocation | null;
   uAmb: WebGLUniformLocation | null;
   uFogStart: WebGLUniformLocation | null;
   uFogSpan: WebGLUniformLocation | null;
   uFogRgb: WebGLUniformLocation | null;
   uFogDensity: WebGLUniformLocation | null;
   uExposure: WebGLUniformLocation | null;
   uWaterView: WebGLUniformLocation | null;
   uTime: WebGLUniformLocation | null;
   /** BSP `SURF_TRANS33`/`66` pass — outputs premultiplied-friendly alpha in `outColor.a`. */
   uAlphaBlendPass: WebGLUniformLocation | null;
   /** Vertical shift for `func_plat` mover mesh (BSP verts stay at extended pose; matches CM `shiftAabbY`). */
   uMobYShift: WebGLUniformLocation | null;
} = null;
let skyUniforms: null | {
   uInvMvp: WebGLUniformLocation | null;
   uCamPos: WebGLUniformLocation | null;
   uWaterView: WebGLUniformLocation | null;
   uTime: WebGLUniformLocation | null;
} = null;
let texWallCode: WebGLTexture | null = null;
/** Incremented on unmount so async `init` from a previous mount does not stomp the new GL context. */
let glMountSession = 0;
let texWallStone: WebGLTexture | null = null;
let texFloorStone: WebGLTexture | null = null;
let texFloorMetal: WebGLTexture | null = null;
let texCeil: WebGLTexture | null = null;
/** Packed WAL atlas drawn when `aTexId == 7` */
let texQ2Atlas: WebGLTexture | null = null;
/** Packed BSP lightmaps (`LUMP_LIGHTING`). */
let texQ2Lightmap: WebGLTexture | null = null;
let vbo: WebGLBuffer | null = null;
/** BSP lava/water (`SURF_WARP`) — separate draw + `polygonOffset`. */
let vboWarp: WebGLBuffer | null = null;
let vaoWarp: WebGLVertexArrayObject | null = null;
let vboTrans: WebGLBuffer | null = null;
let vaoTrans: WebGLVertexArrayObject | null = null;
let vaoDyn: WebGLVertexArrayObject | null = null;
let vboDyn: WebGLBuffer | null = null;

// Фиксированный профиль качества: низкий DPR, меньше нагрузка на GPU.
const DPR_CAP_LOCKED = 0.6;
const DPR_CAP_IDLE = 0.55;
let renderPaused = false;
let vertCountOpaque = 0;
let vertCountWarp = 0;
let vertCountTrans = 0;
let vertCountDyn = 0;
let dynVboCapacityFloats = 0;

const COLLISION_REBUILD_INTERVAL_IDLE_SEC = 1 / 20; // 20 Hz max (idle)
const COLLISION_REBUILD_INTERVAL_LOCKED_SEC = 1 / 60; // 60 Hz max (avoid tunneling/clipping)
const DYN_UPLOAD_INTERVAL_SEC = 0; // every frame (doors / lifts must match collision pose)
const MOB_UPLOAD_INTERVAL_SEC = 0; // every frame (plat dy must not lag vs 30 Hz cap)
let collisionDirty = true;
let dynDirty = true;
let lastCollisionRebuildT = 0;
let lastDynUploadT = 0;
let lastMobUploadT = 0;

// Avoid per-frame allocations for light uniforms (allocated in `init`).
let lightPosArr = new Float32Array(0);
let lightColArr = new Float32Array(0);
let lightRngArr = new Float32Array(0);
const lmStyleFloats = new Float32Array(64);
/** Последний `floor(now * 10)` для lightmap styles — совпадает с шагом в `sampleLightstyleMultiplier` (10 симв/с). */
let lastLmStyleTick10 = -1;
let levelLightstyles: Q2LightstyleTable = { patterns: new Array(64).fill(undefined) };
/** 1 только когда глаза в liquid (как Q2 `waterlevel >= 3`); до этого без подводного шейдера. */
let viewWaterBlend = 0;
/** Which `levelLights` index occupies GPU slot `i`; `-1` = unused. */
let lightSlotActiveLi: Int32Array = new Int32Array(maxLightsRuntime());
/** Fade-in 0→1 when a new light enters a slot (avoids pop when approaching). */
let lightSlotBlend: Float32Array = new Float32Array(maxLightsRuntime());
lightSlotActiveLi.fill(-1);
lightSlotBlend.fill(0);
/** `func_plat` / `func_rotating`: GPU + staging (same stride as BSP). */
let mobVaosOpaque: WebGLVertexArrayObject[] = [];
let mobVbosOpaque: WebGLBuffer[] = [];
let mobVaosTrans: WebGLVertexArrayObject[] = [];
let mobVbosTrans: WebGLBuffer[] = [];
let mobVaosWarp: WebGLVertexArrayObject[] = [];
let mobVbosWarp: WebGLBuffer[] = [];
let mobBaseOpaque: Float32Array[] = [];
let mobBaseTrans: Float32Array[] = [];
let mobBaseWarp: Float32Array[] = [];
let mobStagingOpaque: Float32Array[] = [];
let mobStagingTrans: Float32Array[] = [];
let mobStagingWarp: Float32Array[] = [];
let mobModelIdxList: number[] = [];
let mobSolidsStatic: Q2MobSolidDesc[] = [];
const mobSolidByIdx = new Map<number, Q2MobSolidDesc>();
const mobPivotXz = new Map<number, { cx: number; cz: number }>();
const mobPlatDy = new Map<number, number>();
/** Previous frame `dy` per plat — used to move the player with the deck (ground-entity). */
const mobPlatDyPrev = new Map<number, number>();
const mobRotateRad = new Map<number, number>();
type PlatState = { dy: number; targetDy: number; wait: number; phase: 'atBottom' | 'movingUp' | 'atTop' | 'movingDown' };
const mobPlatState = new Map<number, PlatState>();
/** Pose last merged into collision rebuild (plat dy / rotate angle). */
const lastMobPlatDyForCollision = new Map<number, number>();
const lastMobRotateRadForCollision = new Map<number, number>();

function rememberMobCollisionPoseAfterRebuild() {
   lastMobPlatDyForCollision.clear();
   lastMobRotateRadForCollision.clear();
   for (const d of mobSolidsStatic) {
      if (d.kind === 'plat') lastMobPlatDyForCollision.set(d.modelIdx, mobPlatDy.get(d.modelIdx) ?? 0);
      else lastMobRotateRadForCollision.set(d.modelIdx, mobRotateRad.get(d.modelIdx) ?? 0);
   }
}

function mobBspMoverPoseChangedSinceLastRebuild(): boolean {
   for (const d of mobSolidsStatic) {
      if (d.kind === 'plat') {
         const dy = mobPlatDy.get(d.modelIdx) ?? 0;
         const prev = lastMobPlatDyForCollision.get(d.modelIdx);
         if (prev === undefined || Math.abs(prev - dy) > 1e-4) return true;
      } else {
         const ang = mobRotateRad.get(d.modelIdx) ?? 0;
         const prev = lastMobRotateRadForCollision.get(d.modelIdx);
         if (prev === undefined || Math.abs(prev - ang) > 1e-5) return true;
      }
   }
   return false;
}

const Q2_VERT_STRIDE_FLOATS = Q2_MESH_VERT_FLOATS;
/** Edge of 1×1 neutral slot in lightmap atlas (`LM_ATLAS_SIZE` in quake2-bsp). */
const Q2_LM_ATLAS_EDGE = 1 / 2048;
/** Center sample for non-BSP verts (doors / lifts). */
const Q2_LM_FRAC_CENTER = 0.5;

function shiftAabbY(b: Aabb, dy: number): Aabb {
   return { ...b, y0: b.y0 + dy, y1: b.y1 + dy };
}

/** Axis-aligned bounds of `base` after rotation around Y through `(cx, cz)` by `ang` radians. */
function rotateMobAabbXZ(b: Aabb, cx: number, cz: number, ang: number): Aabb {
   const co = Math.cos(ang);
   const si = Math.sin(ang);
   const corners: [number, number][] = [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x1, b.z1],
      [b.x0, b.z1],
   ];
   let xmin = Infinity;
   let xmax = -Infinity;
   let zmin = Infinity;
   let zmax = -Infinity;
   for (const [x, z] of corners) {
      const dx = x - cx;
      const dz = z - cz;
      const x2 = cx + dx * co - dz * si;
      const z2 = cz + dx * si + dz * co;
      xmin = Math.min(xmin, x2);
      xmax = Math.max(xmax, x2);
      zmin = Math.min(zmin, z2);
      zmax = Math.max(zmax, z2);
   }
   return { x0: xmin, x1: xmax, y0: b.y0, y1: b.y1, z0: zmin, z1: zmax };
}

/** Quake speeds are in map units/sec; these scales keep motion readable in the viewer. */
const MOB_ROT_VIS_SCALE = 0.25;

function xzPivotFromMobVerts(v: Float32Array): { cx: number; cz: number } {
   const st = Q2_VERT_STRIDE_FLOATS;
   if (v.length < st) return { cx: 0, cz: 0 };
   let xmin = Infinity;
   let xmax = -Infinity;
   let zmin = Infinity;
   let zmax = -Infinity;
   for (let i = 0; i < v.length; i += st) {
      xmin = Math.min(xmin, v[i]!);
      xmax = Math.max(xmax, v[i]!);
      zmin = Math.min(zmin, v[i + 2]!);
      zmax = Math.max(zmax, v[i + 2]!);
   }
   return { cx: (xmin + xmax) * 0.5, cz: (zmin + zmax) * 0.5 };
}

function rotateMobVertsY(dst: Float32Array, src: Float32Array, ang: number, cx: number, cz: number) {
   dst.set(src);
   const c = Math.cos(ang);
   const s = Math.sin(ang);
   const st = Q2_VERT_STRIDE_FLOATS;
   for (let o = 0; o < dst.length; o += st) {
      let px = dst[o]!;
      let pz = dst[o + 2]!;
      let nx = dst[o + 3]!;
      let nz = dst[o + 5]!;
      const dx = px - cx;
      const dz = pz - cz;
      px = cx + dx * c - dz * s;
      pz = cz + dx * s + dz * c;
      const ndx = nx;
      const ndz = nz;
      nx = ndx * c - ndz * s;
      nz = ndx * s + ndz * c;
      dst[o] = px;
      dst[o + 2] = pz;
      dst[o + 3] = nx;
      dst[o + 5] = nz;
   }
}

function simulateMobEntities(dt: number) {
   mobPlatDy.clear();
   for (const d of mobSolidsStatic) {
      if (d.kind === 'plat') {
         const st = mobPlatState.get(d.modelIdx);
         if (!st) {
            // BSP draws plats at the extended (top) pose; `SP_func_plat` moves origin to `pos2` unless
            // `targetname` is set (then stays up until triggered). Match that with dy.
            const travel = Math.abs(d.travelHeight || 0);
            const dy0 = d.startExtended ? 0 : -travel;
            mobPlatState.set(d.modelIdx, { dy: dy0, targetDy: dy0, wait: 0, phase: 'atBottom' });
            mobPlatDy.set(d.modelIdx, dy0);
            continue;
         }
         const speed = Math.max(24, d.speed);
         const travel = Math.abs(d.travelHeight || 0);
         const bot = -travel;
         const top = 0;
         // Basic Quake II-ish loop: bottom (rest) -> move up on activation -> wait -> move down.
         if (st.wait > 0) st.wait = Math.max(0, st.wait - dt);
         if (st.phase === 'movingUp') {
            st.dy = Math.min(top, st.dy + speed * dt);
            if (st.dy >= top - 0.01) {
               st.dy = top;
               st.phase = 'atTop';
               st.wait = 1.0;
            }
         } else if (st.phase === 'movingDown') {
            st.dy = Math.max(bot, st.dy - speed * dt);
            if (st.dy <= bot + 0.01) {
               st.dy = bot;
               st.phase = 'atBottom';
            }
         } else if (st.phase === 'atTop' && st.wait <= 0) {
            st.phase = 'movingDown';
         }
         mobPlatDy.set(d.modelIdx, st.dy);
      } else {
         const prev = mobRotateRad.get(d.modelIdx) ?? 0;
         const radPerSec = ((d.speedDegPerSec * MOB_ROT_VIS_SCALE) * Math.PI) / 180;
         mobRotateRad.set(d.modelIdx, prev + radPerSec * dt);
      }
   }
}

function uploadMobBuffers(glc: WebGL2RenderingContext) {
   for (let i = 0; i < mobModelIdxList.length; i++) {
      const mid = mobModelIdxList[i]!;
      const spec = mobSolidByIdx.get(mid);
      // `func_plat` position uses `uMobYShift` (same `dy` as CM `shiftAabbY`); only rotators stream CPU verts.
      if (spec?.kind !== 'rotate') continue;

      const srcO = mobBaseOpaque[i]!;
      const srcT = mobBaseTrans[i]!;
      const srcW = mobBaseWarp[i]!;
      const dstO = mobStagingOpaque[i]!;
      const dstT = mobStagingTrans[i]!;
      const dstW = mobStagingWarp[i]!;
      const ang = mobRotateRad.get(mid) ?? 0;
      const piv = mobPivotXz.get(mid) ?? { cx: 0, cz: 0 };
      rotateMobVertsY(dstO, srcO, ang, piv.cx, piv.cz);
      rotateMobVertsY(dstT, srcT, ang, piv.cx, piv.cz);
      rotateMobVertsY(dstW, srcW, ang, piv.cx, piv.cz);

      glc.bindBuffer(glc.ARRAY_BUFFER, mobVbosOpaque[i]!);
      glc.bufferSubData(glc.ARRAY_BUFFER, 0, dstO);
      glc.bindBuffer(glc.ARRAY_BUFFER, mobVbosTrans[i]!);
      glc.bufferSubData(glc.ARRAY_BUFFER, 0, dstT);
      glc.bindBuffer(glc.ARRAY_BUFFER, mobVbosWarp[i]!);
      glc.bufferSubData(glc.ARRAY_BUFFER, 0, dstW);
   }
   glc.bindBuffer(glc.ARRAY_BUFFER, null);
}

// Camera + controls (simple quake-like feel)
const camPos = { x: 0, y: 1.65, z: 4.1 };
/** Eye used only for drawing (view / fog / billboards); lags `camPos` slightly to kill micro-jitter from seams. */
const camRender = { x: 0, y: 1.65, z: 4.1 };
let yaw = Math.PI;
let pitch = 0;
let locked = false;
const keys = new Set<string>();
const justPressed = new Set<string>();

/**
 * Vertical motion matches id `qcommon/pmove.c` (`sv_gravity` 800, jump ~+288) in Quake units/sec.
 * Horizontal accel/friction use higher gains because our wish-dir integration is not identical to Q2 `PM_Accelerate`.
 */
/** Collision matches stock Q2 standing trace box (~±15 × ±15 horizontal, ~56 tall in map units). */
const PM = {
   EYE_H: 38,
   EYE_H_DUCK: 24,
   PLAYER_R: 15,
   STEP_UP: 30,
   BODY_HI: 56,
   BODY_HI_DUCK: 38,
   FLOOR_CAST: 30,
   GRAVITY: 800,
   JUMP: 288,
   SPEED: 300,
   SPRINT: 420,
   FRICTION: 42,
   ACCEL_G: 175,
   ACCEL_AIR: 10,
   AIR_CTL: 1.35,
} as const;

/** Vertical field of view (degrees). Lower = narrower picture, less wide-angle stretch at screen edges. */
const CAM_FOV_Y_DEG = 78;

const PLAYER_BOX_MIN = [-PM.PLAYER_R, 0, -PM.PLAYER_R] as const;

/** tan(45°): grounding ignores tilted floors steeper than this gradient in XZ. */
const MAX_WALKABLE_SLOPE_GRAD = 1;
let feetY = 0;
let velY = 0;
let velX = 0;
let velZ = 0;
const pmState: PmState = {
   origin: [0, 0, 0],
   velocity: [0, 0, 0],
   onGround: true,
   jumpHeld: false,
};

function maxLightsRuntime(): number {
   return 4;
}
let levelLights: Light[] = [];
let levelSolidsStatic: Aabb[] = [];
let levelFloorsStatic: FloorRect[] = [];
let levelPlanesStatic: FloorPlane[] = [];
let doors: Door[] = [];
let triggersRuntime: TriggerRun[] = [];
let teleportsRuntime: TeleportRun[] = [];
let buttonsRuntime: ButtonRun[] = [];
let entityDebugStatic: Q2EntityDebug[] = [];
let levelHasSky = false;
let lifts: Lift[] = [];
let levelSpawn = { x: 0, y: 56, z: 320 };
let levelBounds: Aabb | null = null;
/** Procedural sky pass when BSP contained `SURF_SKY`. */
let skyProgram: WebGLProgram | null = null;
let skyVao: WebGLVertexArrayObject | null = null;
let skyVbo: WebGLBuffer | null = null;
let levelBrushHullsStatic: Q2HullPlane[][] = [];
/** Stock Q2 `CM_BoxTrace` clip model (BSP nodes + leaf brushes); null = linear brush list only. */
let levelCm: Q2CmClip | null = null;
/** PVS chunk draw + `visLump` for `q2DecompressPvsRow`. */
let levelVisBake: Q2LevelPack['visBake'] = null;
/** `dleaf_t::cluster` table; same indexing as `cmPointLeafNum`. */
let levelLeafClusters: Int16Array | null = null;
/** `dleaf_t::area` per leaf (same index as `leafClusters`). */
let levelLeafAreas: Int16Array | null = null;
/** Optional `worldspawn` fog. */
let levelWorldFog: Q2WorldFog | null = null;
let pvsScratch = new Uint8Array(8192);
/** Linear distance fog color + optional exponential density (shader). */
let fogRgbR = 0.045;
let fogRgbG = 0.052;
let fogRgbB = 0.048;
let fogExpDensity = 0;
/** Smoothed fog sent to GPU (avoids pops when `area` / leaf changes). */
let fogSmoothR = 0.045;
let fogSmoothG = 0.052;
let fogSmoothB = 0.048;
let fogSmoothStartWU = 6;
let fogSmoothSpanWU = 36;
let fogSmoothExpDen = 0;
/** Doors / lift rails / BSP movers — merged with `levelCm` each trace. */
let levelSolidsDyn: Aabb[] = [];
let levelBrushHullsDyn: Q2HullPlane[][] = [];

/** Perspective far plane; widened when a BSP level loads. */
let projFar = 80;
/** Vertical FOV (radians), baked each frame into projection. */
let camFovYRad = (CAM_FOV_Y_DEG * Math.PI) / 180;
/** Fragment shading: ambient multiplier + fog distance (world units). */
let levelAmb = 0.48;
let fogStartWU = 6;
let fogSpanWU = 36;

function clamp(v: number, lo: number, hi: number) {
   return Math.max(lo, Math.min(hi, v));
}

/** BSP `dleaf_t::area` only (no leaf index) → stable tint per area; leaf lookup is just to read `area`. */
function fogTargetFromArea(
   ar: number,
   br: number,
   bg: number,
   bb: number,
   bStart: number,
   bSpan: number,
   bDen: number,
): { r: number; g: number; b: number; start: number; span: number; d: number } {
   const ph = ar * 0.318309886;
   return {
      r: clamp(br + Math.sin(ph * 1.4) * 0.038 + Math.sin(ar * 0.07) * 0.014, 0, 1),
      g: clamp(bg + Math.cos(ph * 1.1) * 0.032 - Math.sin(ar * 0.05) * 0.01, 0, 1),
      b: clamp(bb + Math.cos(ph * 0.9) * 0.028, 0, 1),
      start: Math.max(48, bStart * (0.88 + ((ar * 3) & 15) * 0.009)),
      span: bSpan * (0.9 + ((ar * 5) % 9) * 0.015),
      d: bDen > 0 ? bDen * (0.92 + (ar & 3) * 0.04) : 0,
   };
}

function fogFromLeafArea(
   cm: Q2CmClip,
   leafAreas: Int16Array,
   px: number,
   py: number,
   pz: number,
   br: number,
   bg: number,
   bb: number,
   bStart: number,
   bSpan: number,
   bDen: number,
): { r: number; g: number; b: number; start: number; span: number; d: number } {
   const lf = cmPointLeafNum(cm, px, py, pz);
   if (lf < 0 || lf >= leafAreas.length) {
      return { r: br, g: bg, b: bb, start: bStart, span: bSpan, d: bDen };
   }
   const ar = leafAreas[lf]!;
   if (ar < 0) return { r: br, g: bg, b: bb, start: bStart, span: bSpan, d: bDen };
   return fogTargetFromArea(ar, br, bg, bb, bStart, bSpan, bDen);
}

function mat4Identity(): Float32Array {
   return new Float32Array([1, 0, 0, 0,
                            0, 1, 0, 0,
                            0, 0, 1, 0,
                            0, 0, 0, 1]);
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
   const out = new Float32Array(16);
   const g = (arr: Float32Array, idx: number) => arr[idx] ?? 0;
   for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
         out[c * 4 + r] =
            g(a, 0 * 4 + r) * g(b, c * 4 + 0) +
            g(a, 1 * 4 + r) * g(b, c * 4 + 1) +
            g(a, 2 * 4 + r) * g(b, c * 4 + 2) +
            g(a, 3 * 4 + r) * g(b, c * 4 + 3);
      }
   }
   return out;
}

function mat4Perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
   const f = 1.0 / Math.tan(fovyRad / 2);
   const nf = 1 / (near - far);
   const out = new Float32Array(16);
   out[0] = f / aspect;
   out[5] = f;
   out[10] = (far + near) * nf;
   out[11] = -1;
   out[14] = (2 * far * near) * nf;
   return out;
}

function mat4Look(yawRad: number, pitchRad: number, pos: { x: number; y: number; z: number }): Float32Array {
   // View matrix (world -> camera) for column-vector math.
   // Important: basis vectors are ROWS (dot products).
   const cy = Math.cos(yawRad);
   const sy = Math.sin(yawRad);
   const cp = Math.cos(pitchRad);
   const sp = Math.sin(pitchRad);

   const fx = sy * cp;
   const fy = sp;
   const fz = cy * cp;

   // right = normalize(cross(worldUp(0,1,0), forward))
   // (keeps right-handed coords)
   let rx = fz;
   let ry = 0;
   let rz = -fx;
   const rLen = Math.hypot(rx, ry, rz) || 1;
   rx /= rLen; ry /= rLen; rz /= rLen;

   // up = cross(forward, right)
   let ux = fy * rz - fz * ry;
   let uy = fz * rx - fx * rz;
   let uz = fx * ry - fy * rx;
   const uLen = Math.hypot(ux, uy, uz) || 1;
   ux /= uLen; uy /= uLen; uz /= uLen;

   // Rows are (right, up, -forward)
   const out = mat4Identity();
   // row 0 = right
   out[0] = rx; out[4] = ry; out[8] = rz;
   // row 1 = up
   out[1] = ux; out[5] = uy; out[9] = uz;
   // row 2 = -forward
   out[2] = -fx; out[6] = -fy; out[10] = -fz;
   // translation (last column)
   out[12] = -(rx * pos.x + ry * pos.y + rz * pos.z);
   out[13] = -(ux * pos.x + uy * pos.y + uz * pos.z);
   out[14] = (fx * pos.x + fy * pos.y + fz * pos.z);
   return out;
}

/** Column-major 4×4 inverse (`uniformMatrix4fv` layout). From gl-matrix `mat4.invert` (MIT). */
function mat4Invert(a: Float32Array): Float32Array | null {
   const out = new Float32Array(16);
   const m = a;
   const m00 = m[0]!;
   const m01 = m[4]!;
   const m02 = m[8]!;
   const m03 = m[12]!;
   const m10 = m[1]!;
   const m11 = m[5]!;
   const m12 = m[9]!;
   const m13 = m[13]!;
   const m20 = m[2]!;
   const m21 = m[6]!;
   const m22 = m[10]!;
   const m23 = m[14]!;
   const m30 = m[3]!;
   const m31 = m[7]!;
   const m32 = m[11]!;
   const m33 = m[15]!;
   const b00 = m00 * m11 - m01 * m10;
   const b01 = m00 * m12 - m02 * m10;
   const b02 = m00 * m13 - m03 * m10;
   const b03 = m01 * m12 - m02 * m11;
   const b04 = m01 * m13 - m03 * m11;
   const b05 = m02 * m13 - m03 * m12;
   const b06 = m20 * m31 - m21 * m30;
   const b07 = m20 * m32 - m22 * m30;
   const b08 = m20 * m33 - m23 * m30;
   const b09 = m21 * m32 - m22 * m31;
   const b10 = m21 * m33 - m23 * m31;
   const b11 = m22 * m33 - m23 * m32;
   const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
   if (det === 0 || !Number.isFinite(det)) return null;
   const invDet = 1 / det;
   out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * invDet;
   out[1] = (-m10 * b11 + m12 * b08 - m13 * b07) * invDet;
   out[2] = (m10 * b10 - m11 * b08 + m13 * b06) * invDet;
   out[3] = (-m10 * b09 + m11 * b07 - m12 * b06) * invDet;
   out[4] = (-m01 * b11 + m02 * b10 - m03 * b09) * invDet;
   out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * invDet;
   out[6] = (-m00 * b10 + m01 * b08 - m03 * b06) * invDet;
   out[7] = (m00 * b09 - m01 * b07 + m02 * b06) * invDet;
   out[8] = (m31 * b05 - m32 * b04 + m33 * b03) * invDet;
   out[9] = (-m30 * b05 + m32 * b02 - m33 * b01) * invDet;
   out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * invDet;
   out[11] = (-m30 * b03 + m31 * b01 - m32 * b00) * invDet;
   out[12] = (-m21 * b05 + m22 * b04 - m23 * b03) * invDet;
   out[13] = (m20 * b05 - m22 * b02 + m23 * b01) * invDet;
   out[14] = (-m20 * b04 + m21 * b02 - m23 * b00) * invDet;
   out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * invDet;
   return out;
}

function compileShader(glc: WebGL2RenderingContext, type: GLenum, src: string) {
   const sh = glc.createShader(type);
   if (!sh) throw new Error('shader alloc failed');
   glc.shaderSource(sh, src);
   glc.compileShader(sh);
   if (!glc.getShaderParameter(sh, glc.COMPILE_STATUS)) {
      const msg = glc.getShaderInfoLog(sh) || 'shader compile failed';
      glc.deleteShader(sh);
      throw new Error(msg);
   }
   return sh;
}

function createProgram(glc: WebGL2RenderingContext, vsSrc: string, fsSrc: string) {
   const vs = compileShader(glc, glc.VERTEX_SHADER, vsSrc);
   const fs = compileShader(glc, glc.FRAGMENT_SHADER, fsSrc);
   const p = glc.createProgram();
   if (!p) throw new Error('program alloc failed');
   glc.attachShader(p, vs);
   glc.attachShader(p, fs);
   glc.linkProgram(p);
   glc.deleteShader(vs);
   glc.deleteShader(fs);
   if (!glc.getProgramParameter(p, glc.LINK_STATUS)) {
      const msg = glc.getProgramInfoLog(p) || 'program link failed';
      glc.deleteProgram(p);
      throw new Error(msg);
   }
   return p;
}

function makeTextureFromCanvas(
   glc: WebGL2RenderingContext,
   c: HTMLCanvasElement,
   opts?: { mipmap?: boolean; flipY?: boolean; clamp?: boolean; nearest?: boolean; maxAnisotropy?: number },
) {
   const t = glc.createTexture();
   if (!t) throw new Error('texture alloc failed');
   glc.bindTexture(glc.TEXTURE_2D, t);
   glc.pixelStorei(glc.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
   glc.pixelStorei(glc.UNPACK_FLIP_Y_WEBGL, opts?.flipY ? 1 : 0);
   const wrap = opts?.clamp ? glc.CLAMP_TO_EDGE : glc.REPEAT;
   glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_S, wrap);
   glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_T, wrap);
   const smoothMin = opts?.mipmap ? glc.LINEAR_MIPMAP_LINEAR : glc.LINEAR;
   const minF = opts?.nearest ? glc.NEAREST : smoothMin;
   const magF = opts?.nearest ? glc.NEAREST : glc.LINEAR;
   glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MIN_FILTER, minF);
   glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAG_FILTER, magF);
   glc.texImage2D(glc.TEXTURE_2D, 0, glc.RGBA, glc.RGBA, glc.UNSIGNED_BYTE, c);
   glc.pixelStorei(glc.UNPACK_FLIP_Y_WEBGL, 0);
   if (opts?.mipmap) {
      glc.generateMipmap(glc.TEXTURE_2D);
      const wantA = opts?.maxAnisotropy;
      if (wantA != null && wantA > 0) {
         const ext = glc.getExtension('EXT_texture_filter_anisotropic') as {
            TEXTURE_MAX_ANISOTROPY_EXT: number;
            MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
         } | null;
         if (ext) {
            const cap = glc.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
            glc.texParameteri(glc.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(wantA, cap));
         }
      }
   } else {
      /* Single-level RGBA: pin mip range so the texture stays complete without mipmaps. */
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_BASE_LEVEL, 0);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAX_LEVEL, 0);
   }
   glc.bindTexture(glc.TEXTURE_2D, null);
   return t;
}

/** Light grainy asphalt / macadam for procedural walls (tex id 2). */
function makeStoneCanvas(size = 256) {
   const c = document.createElement('canvas');
   c.width = size;
   c.height = size;
   const ctx = c.getContext('2d');
   if (!ctx) return c;
   ctx.fillStyle = '#c3c5c1';
   ctx.fillRect(0, 0, size, size);
   const img = ctx.getImageData(0, 0, size, size);
   const d = img.data;
   for (let i = 0; i < d.length; i += 4) {
      const g = ((Math.random() - 0.5) * 26) | 0;
      const r = ((Math.random() - 0.5) * 18) | 0;
      const speck = Math.random() < 0.085 ? ((Math.random() - 0.5) * 38) | 0 : 0;
      d[i] = clamp((d[i] ?? 0) + g + speck * 0.7, 0, 255);
      d[i + 1] = clamp((d[i + 1] ?? 0) + r + speck * 0.65, 0, 255);
      d[i + 2] = clamp((d[i + 2] ?? 0) + g * 0.85 + speck * 0.8, 0, 255);
      d[i + 3] = 255;
   }
   ctx.putImageData(img, 0, 0);
   ctx.globalAlpha = 0.11;
   for (let k = 0; k < size * 4; k++) {
      const px = (Math.random() * size) | 0;
      const py = (Math.random() * size) | 0;
      const w = 1 + ((Math.random() * 2.4) | 0);
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(40,42,38,0.35)' : 'rgba(255,255,252,0.2)';
      ctx.fillRect(px, py, w, w);
   }
   ctx.globalAlpha = 1;
   return c;
}

function makeMetalCanvas(size = 256) {
   const c = document.createElement('canvas');
   c.width = size;
   c.height = size;
   const ctx = c.getContext('2d');
   if (!ctx) return c;
   const g = ctx.createLinearGradient(0, 0, size, 0);
   g.addColorStop(0, '#171a18');
   g.addColorStop(0.25, '#242a27');
   g.addColorStop(0.6, '#111413');
   g.addColorStop(1, '#2a2f2c');
   ctx.fillStyle = g;
   ctx.fillRect(0, 0, size, size);
   ctx.globalAlpha = 0.25;
   for (let i = 0; i < 180; i++) {
      const y = Math.random() * size;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(0, y, size, 1);
   }
   ctx.globalAlpha = 1;
   // rivets grid
   ctx.fillStyle = 'rgba(0,0,0,0.35)';
   const step = Math.max(28, Math.floor(size / 6));
   for (let y = step / 2; y < size; y += step) {
      for (let x = step / 2; x < size; x += step) {
         ctx.beginPath();
         ctx.arc(x, y, 2.2, 0, Math.PI * 2);
         ctx.fill();
      }
   }
   return c;
}

function makePlasterCeilCanvas(size = 256) {
   const c = document.createElement('canvas');
   c.width = size;
   c.height = size;
   const ctx = c.getContext('2d');
   if (!ctx) return c;
   // Smooth, even ceiling texture (subtle noise only).
   ctx.fillStyle = '#f6f5f2';
   ctx.fillRect(0, 0, size, size);
   const img = ctx.getImageData(0, 0, size, size);
   const d = img.data;
   for (let i = 0; i < d.length; i += 4) {
      const n = ((Math.random() - 0.5) * 10) | 0;
      d[i] = clamp((d[i] ?? 0) + n, 0, 255);
      d[i + 1] = clamp((d[i + 1] ?? 0) + n, 0, 255);
      d[i + 2] = clamp((d[i + 2] ?? 0) + n, 0, 255);
      d[i + 3] = 255;
   }
   ctx.putImageData(img, 0, 0);
   return c;
}

function makeTileFloorCanvas(size = 256) {
   const c = document.createElement('canvas');
   c.width = size;
   c.height = size;
   const ctx = c.getContext('2d');
   if (!ctx) return c;
   ctx.fillStyle = '#232522';
   ctx.fillRect(0, 0, size, size);
   const tile = Math.max(18, Math.floor(size / 8));
   for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
         const v = 26 + ((Math.random() * 18) | 0);
         ctx.fillStyle = `rgb(${v},${v + 4},${v})`;
         ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
   }
   ctx.strokeStyle = 'rgba(0,0,0,0.55)';
   ctx.lineWidth = 1;
   for (let i = 0; i <= size; i += tile) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
   }
   ctx.globalAlpha = 0.25;
   for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
   }
   ctx.globalAlpha = 1;
   return c;
}

function makeCodeWallCanvas(code: string, size = 512) {
   const c = document.createElement('canvas');
   c.width = size;
   c.height = size;
   const ctx = c.getContext('2d');
   if (!ctx) return c;

   // Quake-ish palette: warm dark stone + green/yellow console ink.
   ctx.fillStyle = '#2a241c';
   ctx.fillRect(0, 0, size, size);

   // Slight noise overlay (cheap)
   const img = ctx.getImageData(0, 0, size, size);
   const d = img.data;
   for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() * 14) | 0;
      d[i] = clamp((d[i] ?? 0) + n, 0, 255);
      d[i + 1] = clamp((d[i + 1] ?? 0) + n, 0, 255);
      d[i + 2] = clamp((d[i + 2] ?? 0) + n, 0, 255);
   }
   ctx.putImageData(img, 0, 0);

   // Pixelly text: render to small offscreen then scale up with nearest-neighbor
   const mini = document.createElement('canvas');
   mini.width = size / 2;
   mini.height = size / 2;
   const mctx = mini.getContext('2d');
   if (!mctx) return c;
   mctx.imageSmoothingEnabled = false;
   mctx.fillStyle = 'rgba(0,0,0,0.15)';
   mctx.fillRect(0, 0, mini.width, mini.height);

   const lines = code.replace(/\t/g, '   ').split('\n');
   const pad = 10;
   const fontSize = 14;
   const lineH = Math.floor(fontSize * 1.35);
   mctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
   mctx.textBaseline = 'top';

   const maxLines = Math.floor((mini.height - pad * 2) / lineH);
   const view = lines.slice(0, Math.max(1, maxLines));

   for (let i = 0; i < view.length; i++) {
      const y = pad + i * lineH;
      const line = view[i] ?? '';
      // crude syntax-ish: keywords
      const kw = /\b(const|let|var|function|return|if|else|for|while|class|new|import|from|export|type)\b/g;
      const str = /(["'`].*?["'`])/g;

      let x = pad;
      const parts: { text: string; color: string }[] = [];
      // quick tokenizer by splitting strings first
      const chunks = line.split(str);
      for (let ci = 0; ci < chunks.length; ci++) {
         const ch = chunks[ci] ?? '';
         if (ci % 2 === 1) {
            parts.push({ text: ch, color: '#e7d79a' });
            continue;
         }
         const kwChunks = ch.split(kw);
         for (let ki = 0; ki < kwChunks.length; ki++) {
            const kch = kwChunks[ki] ?? '';
            const isKw = ki % 2 === 1;
            parts.push({ text: kch, color: isKw ? '#9fe6b1' : 'rgba(242,235,214,0.92)' });
         }
      }

      for (const p of parts) {
         if (!p.text) continue;
         mctx.fillStyle = 'rgba(0,0,0,0.45)';
         mctx.fillText(p.text, x + 1, y + 1);
         mctx.fillStyle = p.color;
         mctx.fillText(p.text, x, y);
         x += mctx.measureText(p.text).width;
         if (x > mini.width - pad) break;
      }
   }

   ctx.imageSmoothingEnabled = false;
   ctx.globalAlpha = 0.95;
   ctx.drawImage(mini, 0, 0, size, size);
   ctx.globalAlpha = 1;

   // Subtle vignette
   const g = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.2, size * 0.5, size * 0.5, size * 0.62);
   g.addColorStop(0, 'rgba(0,0,0,0)');
   g.addColorStop(1, 'rgba(0,0,0,0.42)');
   ctx.fillStyle = g;
   ctx.fillRect(0, 0, size, size);

   return c;
}

/** Minimal scene when BSP is missing or fails to parse (no legacy proc-gen maze). */
function createEmptyFallbackLevel(): Q2LevelPack {
   return {
      verts: new Float32Array([]),
      warpVerts: new Float32Array([]),
      transVerts: new Float32Array([]),
      solids: [],
      floors: [{ x0: -8192, z0: -8192, x1: 8192, z1: 8192, y: 0 }],
      lights: [],
      segs: [],
      planes: [],
      spawn: { x: 0, y: 56, z: 320 },
      lifts: [],
      brushHulls: [],
      mobSpecs: [],
      mobMeshes: [],
      mobSolids: [],
      hasSky: false,
      doors: [],
      triggers: [],
      teleports: [],
      buttons: [],
      entityDebug: [],
      atlasCanvas: null,
      lightmapCanvas: null,
      lightstyleTable: { patterns: new Array(64).fill(undefined) },
      cmClip: null,
      leafClusters: null,
      leafAreas: null,
      visBake: null,
      worldFog: null,
   };
}

function buildDynamicEntitiesVerts(): Float32Array {
   const v: number[] = [];
   const pushQuad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, texId: number, uvScale = 1) => {
      const uv = (x: number, y: number) => [x * uvScale, y * uvScale];
      const tri = (p0: Vec3, p1: Vec3, p2: Vec3, t0: number[], t1: number[], t2: number[]) => {
         const [x0, y0, z0] = p0;
         const [x1, y1, z1] = p1;
         const [x2, y2, z2] = p2;
         const [nx, ny, nz] = n;
         const lmPad = [
            Q2_LM_FRAC_CENTER,
            Q2_LM_FRAC_CENTER,
            0,
            0,
            Q2_LM_ATLAS_EDGE,
            Q2_LM_ATLAS_EDGE,
            0,
            -1,
            -1,
            -1,
            -1,
         ];
         v.push(x0, y0, z0, nx, ny, nz, t0[0] ?? 0, t0[1] ?? 0, 0, 0, 0, 0, 0, texId, ...lmPad);
         v.push(x1, y1, z1, nx, ny, nz, t1[0] ?? 0, t1[1] ?? 0, 0, 0, 0, 0, 0, texId, ...lmPad);
         v.push(x2, y2, z2, nx, ny, nz, t2[0] ?? 0, t2[1] ?? 0, 0, 0, 0, 0, 0, texId, ...lmPad);
      };
      tri(a, b, c, uv(0, 0), uv(1, 0), uv(1, 1));
      tri(a, c, d, uv(0, 0), uv(1, 1), uv(0, 1));
   };

   const addBox = (b: Aabb, texWall: number, texTop: number, texBottom: number, uv = 1.0) => {
      const { x0, y0, z0, x1, y1, z1 } = b;
      pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], texWall, uv);
      pushQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], texWall, uv);
      pushQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], texWall, uv);
      pushQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], texWall, uv);
      pushQuad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], texTop, uv);
      pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0], texBottom, uv);
   };

   // Door geometry
   for (const d of doors) {
      const slide = d.pct * d.w;
      addBox(
         {
            x0: d.x - d.w * 0.5 + slide,
            x1: d.x + d.w * 0.5 + slide,
            y0: d.y0,
            y1: d.y1,
            z0: d.z - d.t * 0.5,
            z1: d.z + d.t * 0.5,
         },
         2,
         2,
         2,
         1.6,
      );
   }

   // Lift cabin: same stone as walls; deck uses tile (3).
   for (const l of lifts) {
      addBox({ x0: l.x0, x1: l.x1, y0: l.y - 0.12, y1: l.y, z0: l.z0, z1: l.z1 }, 2, 3, 3, 2.0);
   }

   return new Float32Array(v);
}

function resizeToDisplaySize(canvas: HTMLCanvasElement) {
   const cap = locked ? DPR_CAP_LOCKED : DPR_CAP_IDLE;
   const dpr = Math.max(1, Math.min(cap, window.devicePixelRatio || 1));
   const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
   const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
   if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
   }
   return false;
}

function onPointerLockChange() {
   locked = document.pointerLockElement === canvasEl.value;
}

function onVisibilityChange() {
   renderPaused = document.hidden;
   if (!renderPaused && gl) {
      lastT = 0;
      lastLmStyleTick10 = -1;
   }
}

function onMouseMove(e: MouseEvent) {
   if (!locked) return;
   const sens = 0.0020;
   const invertY = false;
   // Standard FPS: mouse right -> yaw right; mouse up -> look up (optional invert).
   yaw = (yaw + e.movementX * sens) % (Math.PI * 2);
   const dy = invertY ? e.movementY : -e.movementY;
   pitch = clamp(pitch + dy * sens, -1.35, 1.35);
}

function keyName(e: KeyboardEvent) {
   return e.code || e.key;
}

function onKeyDown(e: KeyboardEvent) {
   const k = keyName(e);
   if (!e.repeat) justPressed.add(k);
   keys.add(k);
   if (e.code === 'Space' || e.code === 'KeyE') e.preventDefault();
   if (e.code === 'F4') {
      e.preventDefault();
      debugOverlay.value = !debugOverlay.value;
   }
}

function onKeyUp(e: KeyboardEvent) {
   keys.delete(keyName(e));
}

let lastT = 0;
let levelSolids: Aabb[] = [];
let levelFloors: FloorRect[] = [];
let levelPlanes: FloorPlane[] = [];

function fireTarget(target: string) {
   const t = target.trim();
   if (!t) return;
   for (const d of doors) {
      if (d.targetname === t) d.open = !d.open;
   }
}

function rebuildDynamicCollision() {
   levelSolidsDyn = [];
   levelBrushHullsDyn = [];
   levelFloors = [...levelFloorsStatic];
   levelPlanes = [...levelPlanesStatic];

   for (const d of doors) {
      const slide = d.pct * d.w;
      const doorBox = {
         x0: d.x - d.w * 0.5 + slide,
         x1: d.x + d.w * 0.5 + slide,
         y0: d.y0,
         y1: d.y1,
         z0: d.z - d.t * 0.5,
         z1: d.z + d.t * 0.5,
      };
      levelSolidsDyn.push(doorBox);
      levelBrushHullsDyn.push(aabbToHullPlanes(doorBox));
   }

   for (const l of lifts) {
      levelFloors.push({ x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, y: l.y });
      const railT = 0.12;
      const railH = 0.55;
      const railL: Aabb = { x0: l.x0 - railT, x1: l.x0, y0: l.y, y1: l.y + railH, z0: l.z0, z1: l.z1 };
      levelSolidsDyn.push(railL);
      levelBrushHullsDyn.push(aabbToHullPlanes(railL));
      const railR: Aabb = { x0: l.x1, x1: l.x1 + railT, y0: l.y, y1: l.y + railH, z0: l.z0, z1: l.z1 };
      levelSolidsDyn.push(railR);
      levelBrushHullsDyn.push(aabbToHullPlanes(railR));
      const railN: Aabb = { x0: l.x0, x1: l.x1, y0: l.y, y1: l.y + railH, z0: l.z0 - railT, z1: l.z0 };
      levelSolidsDyn.push(railN);
      levelBrushHullsDyn.push(aabbToHullPlanes(railN));
      const railS: Aabb = { x0: l.x0, x1: l.x1, y0: l.y, y1: l.y + railH, z0: l.z1, z1: l.z1 + railT };
      levelSolidsDyn.push(railS);
      levelBrushHullsDyn.push(aabbToHullPlanes(railS));
   }

   for (const d of mobSolidsStatic) {
      if (d.kind === 'plat') {
         const dy = mobPlatDy.get(d.modelIdx) ?? 0;
         const b = shiftAabbY(d.base, dy);
         levelSolidsDyn.push(b);
         levelBrushHullsDyn.push(aabbToHullPlanes(b));
         levelFloors.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y: b.y1 });
      } else {
         const ang = mobRotateRad.get(d.modelIdx) ?? 0;
         const piv = mobPivotXz.get(d.modelIdx) ?? {
            cx: (d.base.x0 + d.base.x1) * 0.5,
            cz: (d.base.z0 + d.base.z1) * 0.5,
         };
         const b = rotateMobAabbXZ(d.base, piv.cx, piv.cz, ang);
         levelSolidsDyn.push(b);
         levelBrushHullsDyn.push(obbYRotationHullPlanes(d.base, piv.cx, piv.cz, ang));
         levelFloors.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y: b.y1 });
      }
   }

   if (levelCm) {
      levelSolids = levelSolidsDyn;
   } else {
      levelSolids = [...levelSolidsStatic, ...levelSolidsDyn];
   }
   rememberMobCollisionPoseAfterRebuild();
}

/** Q2 `CM_BoxTrace` on world clip + linear sweep on doors / lifts / movers. */
function tracePlayerVsWorldAndMovers(
   p1: readonly [number, number, number],
   p2: readonly [number, number, number],
   mins: readonly [number, number, number],
   maxs: readonly [number, number, number],
): Q2BrushClipHit | null {
   const dynHit = traceSegmentThroughSolidBrushes(p1, p2, mins, maxs, levelSolidsDyn, levelBrushHullsDyn);
   if (levelCm) {
      const cmh = cmBoxTrace(levelCm, p1, p2, mins, maxs, Q2_PLAYER_SOLID_MASK);
      const cmHit: Q2BrushClipHit = {
         fraction: cmh.fraction,
         nx: cmh.nx,
         ny: cmh.ny,
         nz: cmh.nz,
         startsolid: cmh.startsolid,
         allsolid: cmh.allsolid,
      };
      return mergeBrushClipHits(cmHit, dynHit);
   }
   const staticHit = traceSegmentThroughSolidBrushes(p1, p2, mins, maxs, levelSolidsStatic, levelBrushHullsStatic);
   return mergeBrushClipHits(staticHit, dynHit);
}

const PLAYER_BOX_MAX_STAND = [PM.PLAYER_R, PM.BODY_HI, PM.PLAYER_R] as const;

/** True if a standing hull at feet does not overlap solids (so we may leave crouch). */
function headClearForStanding(px: number, feet: number, pz: number): boolean {
   const h = tracePlayerVsWorldAndMovers([px, feet, pz], [px, feet, pz], PLAYER_BOX_MIN, PLAYER_BOX_MAX_STAND);
   return !h || (!h.startsolid && !h.allsolid);
}

function playerHull(duck: boolean): {
   mins: readonly [number, number, number];
   maxs: readonly [number, number, number];
   bodyHi: number;
   eyeH: number;
} {
   const bodyHi = duck ? PM.BODY_HI_DUCK : PM.BODY_HI;
   return {
      mins: PLAYER_BOX_MIN,
      maxs: [PM.PLAYER_R, bodyHi, PM.PLAYER_R] as const,
      bodyHi,
      eyeH: duck ? PM.EYE_H_DUCK : PM.EYE_H,
   };
}

/** Crouch (`KeyC`) or forced crouch when the standing hull would intersect geometry above. */
function playerHullEffective(): ReturnType<typeof playerHull> {
   if (keys.has('KeyC')) return playerHull(true);
   if (!headClearForStanding(camPos.x, feetY, camPos.z)) return playerHull(true);
   return playerHull(false);
}

/** Один пробой в глаз — для шейдера нужен только «глаз в liquid», без дубля `cmPointLeafContents` из `updateMove`. */
function refreshViewWaterBlend() {
   if (!levelCm) {
      viewWaterBlend = 0;
      return;
   }
   const cEye = cmPointLeafContents(levelCm, camPos.x, camPos.y, camPos.z);
   viewWaterBlend = (cEye & Q2_LIQUID_MASK) !== 0 ? 1 : 0;
}

/** Move feet with plat motion between frames (narrow snap alone cannot keep up). */
function carryPlayerWithMobPlatMotion() {
   type Cand = { dDy: number; prevTop: number };
   const cands: Cand[] = [];
   for (const d of mobSolidsStatic) {
      if (d.kind !== 'plat') continue;
      const mid = d.modelIdx;
      const dy = mobPlatDy.get(mid) ?? 0;
      const prevStored = mobPlatDyPrev.get(mid);
      const prevDy = prevStored === undefined ? dy : prevStored;
      const dDy = dy - prevDy;
      if (Math.abs(dDy) < 1e-4) continue;
      const b = shiftAabbY(d.base, dy);
      if (!aabbCircleOverlapXZ(b, camPos.x, camPos.z, PM.PLAYER_R * 1.12)) continue;
      const top = b.y1;
      const prevTop = top - dDy;
      if (velY > 52) continue;
      if (feetY < prevTop - 52 || feetY > prevTop + 14) continue;
      cands.push({ dDy, prevTop });
   }
   if (cands.length === 0) return;
   let best = cands[0]!;
   let bestScore = Math.abs(feetY - best.prevTop);
   for (let i = 1; i < cands.length; i++) {
      const c = cands[i]!;
      const sc = Math.abs(feetY - c.prevTop);
      if (sc < bestScore) {
         best = c;
         bestScore = sc;
      }
   }
   feetY += best.dDy;
   if (velY < 0) velY = 0;
}

function saveMobPlatDyPrev() {
   for (const d of mobSolidsStatic) {
      if (d.kind !== 'plat') continue;
      mobPlatDyPrev.set(d.modelIdx, mobPlatDy.get(d.modelIdx) ?? 0);
   }
}

/** Standing on a `func_plat`: lock feet to the deck top (same frame as CM rebuild), Quake II ground-entity style. */
function snapFeetToMobPlatTop() {
   // If we are actively jumping / moving up, do NOT glue feet to the platform this frame.
   // This was cancelling jumps while standing on `func_plat`.
   if (velY > 30) return;
   for (const d of mobSolidsStatic) {
      if (d.kind !== 'plat') continue;
      const dy = mobPlatDy.get(d.modelIdx) ?? 0;
      const b = shiftAabbY(d.base, dy);
      const top = b.y1;
      if (!aabbCircleOverlapXZ(b, camPos.x, camPos.z, PM.PLAYER_R * 1.06)) continue;
      // Small snap after carry — avoids float drift without huge "gravity stomp".
      if (feetY < top - 10 || feetY > top + 4) continue;
      feetY = top;
      if (velY < 0) velY = 0;
   }
}

function updateEntities(dt: number, now: number) {
   const usePressed = justPressed.has('KeyE');

   simulateMobEntities(dt);

   for (const tr of triggersRuntime) {
      if (tr.once && tr.fired) continue;
      const dx = camPos.x - tr.cx;
      const dy = camPos.y - tr.cy;
      const dz = camPos.z - tr.cz;
      const inside = dx * dx + dy * dy + dz * dz < tr.radius * tr.radius;
      if (inside && !tr.wasInside) {
         fireTarget(tr.target);
         if (tr.once) tr.fired = true;
      }
      tr.wasInside = inside;
   }

   const bodyCx = camPos.x;
   const phTp = playerHullEffective();
   const bodyCy = feetY + phTp.bodyHi * 0.48;
   const bodyCz = camPos.z;
   for (const tp of teleportsRuntime) {
      const dx = bodyCx - tp.cx;
      const dy = bodyCy - tp.cy;
      const dz = bodyCz - tp.cz;
      const inside = dx * dx + dy * dy + dz * dz < tp.radius * tp.radius;
      if (inside && !tp.wasInside) {
         camPos.x = tp.destX;
         camPos.z = tp.destZ;
         feetY = tp.destY;
         const th = playerHullEffective();
         camPos.y = feetY + th.eyeH;
         camRender.x = camPos.x;
         camRender.y = camPos.y;
         camRender.z = camPos.z;
         velX = 0;
         velY = 0;
         velZ = 0;
         pmState.origin = [camPos.x, feetY, camPos.z];
         pmState.velocity = [0, 0, 0];
         pmState.onGround = false;
         pmState.jumpHeld = false;
      }
      tp.wasInside = inside;
   }

   for (const btn of buttonsRuntime) {
      const dx = camPos.x - btn.x;
      const dy = camPos.y - btn.y;
      const dz = camPos.z - btn.z;
      if (usePressed && dx * dx + dy * dy + dz * dz < 96 * 96) fireTarget(btn.target);
   }

   let moversChanged = false;
   for (const d of doors) {
      const dist2 = (camPos.x - d.x) ** 2 + (camPos.z - d.z) ** 2;
      if (usePressed && dist2 < 2.2 * 2.2 && !d.targetname) d.open = !d.open;
      const target = d.open ? 1 : 0;
      const spd = 10.0;
      const prev = d.pct;
      d.pct += (target - d.pct) * Math.min(1, spd * dt);
      d.pct = clamp(d.pct, 0, 1);
      if (Math.abs(d.pct - prev) > 1e-4) moversChanged = true;
   }

   for (const l of lifts) {
      const cx = (l.x0 + l.x1) * 0.5;
      const cz = (l.z0 + l.z1) * 0.5;
      const dist2 = (camPos.x - cx) ** 2 + (camPos.z - cz) ** 2;
      if (usePressed && dist2 < 2.8 * 2.8) {
         l.moving = true;
         l.dir = l.y < (l.yA + l.yB) * 0.5 ? 1 : -1;
      }
      if (l.moving) {
         const prevY = l.y;
         const speed = 0.9;
         l.y += l.dir * speed * dt;
         if (l.y >= l.yB) { l.y = l.yB; l.moving = false; }
         if (l.y <= l.yA) { l.y = l.yA; l.moving = false; }
         if (Math.abs(l.y - prevY) > 1e-4) moversChanged = true;
      }
   }

   // Activate plats (basic Quake II feel): press E near a plat to send it up.
   if (usePressed) {
      for (const m of mobSolidsStatic) {
         if (m.kind !== 'plat') continue;
         const dyPlat = mobPlatDy.get(m.modelIdx) ?? 0;
         const b = shiftAabbY(m.base, dyPlat);
         const cx = (b.x0 + b.x1) * 0.5;
         const cz = (b.z0 + b.z1) * 0.5;
         const cy = b.y1; // current top surface (includes plat dy)
         const dx = camPos.x - cx;
         const dz = camPos.z - cz;
         const dy = camPos.y - cy;
         if (dx * dx + dz * dz + dy * dy > 260 * 260) continue;
         const st = mobPlatState.get(m.modelIdx);
         if (!st) continue;
         // Only toggle when fully at an endpoint; avoid spam-toggling up/down mid-move.
         if (st.phase === 'atBottom') {
            st.phase = 'movingUp';
            st.wait = 0;
         } else if (st.phase === 'atTop') {
            // allow manual return
            st.phase = 'movingDown';
            st.wait = 0;
         }
      }
   }

   const mobPoseChanged = mobBspMoverPoseChangedSinceLastRebuild();
   if (moversChanged || mobPoseChanged) {
      collisionDirty = true;
      dynDirty = true;
   }
   // When a BSP mover or door pose changes, rebuild CM immediately (same cadence as stock Q2 server physics).
   const rebuildInterval =
      mobPoseChanged || moversChanged ? 0
      : locked ? COLLISION_REBUILD_INTERVAL_LOCKED_SEC
      : COLLISION_REBUILD_INTERVAL_IDLE_SEC;
   if (collisionDirty && now - lastCollisionRebuildT >= rebuildInterval) {
      rebuildDynamicCollision();
      collisionDirty = false;
      lastCollisionRebuildT = now;
   }

   if (gl && mobVbosOpaque.length > 0 && now - lastMobUploadT >= MOB_UPLOAD_INTERVAL_SEC) {
      uploadMobBuffers(gl);
      lastMobUploadT = now;
   }

   // Update dynamic mesh buffer
   if (gl && vboDyn && dynDirty && now - lastDynUploadT >= DYN_UPLOAD_INTERVAL_SEC) {
      const verts = buildDynamicEntitiesVerts();
      gl.bindBuffer(gl.ARRAY_BUFFER, vboDyn);
      if (verts.length > dynVboCapacityFloats) {
         gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
         dynVboCapacityFloats = verts.length;
      } else {
         gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
      }
      vertCountDyn = verts.length / Q2_VERT_STRIDE_FLOATS;
      dynDirty = false;
      lastDynUploadT = now;
   }
}

function aabbCircleOverlapXZ(b: Aabb, x: number, z: number, r: number) {
   const cx = clamp(x, b.x0, b.x1);
   const cz = clamp(z, b.z0, b.z1);
   const dx = x - cx;
   const dz = z - cz;
   return dx * dx + dz * dz < r * r;
}

/** Keep capsule head below brush undersides (hanging geometry / door tops) — complements floor collision. */
function _clipFeetToCeiling(x: number, z: number, feetY: number): number {
   const headTop = feetY + PM.BODY_HI;
   const rad = PM.PLAYER_R;
   const EPS = 4;
   let fy = feetY;
   const solidsForCeiling = levelCm ? [...levelSolidsStatic, ...levelSolidsDyn] : levelSolids;
   for (let si = 0; si < solidsForCeiling.length; si++) {
      const b = solidsForCeiling[si]!;
      if (!aabbCircleOverlapXZ(b, x, z, rad)) continue;
      if (fy >= b.y1 - EPS) continue;
      if (fy + EPS >= b.y0) continue;
      if (headTop <= b.y0 + EPS) continue;
      const brushH = b.y1 - b.y0;
      // Tall vertical volumes (shaft walls) overlap XZ like a ceiling slab would; only treat as a lid when
      // the head is near the brush top (underside) or the brush is genuinely thin.
      if (brushH > 96 && headTop < b.y1 - 14) continue;
      fy = Math.min(fy, b.y0 - PM.BODY_HI - EPS);
   }
   return fy;
}

/**
 * First solid under the feet capsule along a short downward sweep (same brushes as XZ slide).
 * `gap` is feetY minus the hit surface Y (≈0 on flat ground, large when over a pit).
 */
function _feetDownGroundTrace(
   x: number,
   z: number,
   feetY: number,
): { gap: number; surfY: number } | null {
   const loft = 2;
   const drop = 96;
   const p1: [number, number, number] = [x, feetY + loft, z];
   const p2: [number, number, number] = [x, feetY - drop, z];
   const gh = tracePlayerVsWorldAndMovers(p1, p2, PLAYER_BOX_MIN, PLAYER_BOX_MAX_STAND);
   if (!gh || gh.fraction >= 0.999) return null;
   // Top of floor / ramp: upward normal. Side hits while edging a ledge should not count as standing.
   if (gh.ny < 0.18) return null;
   const surfY = feetY + loft + gh.fraction * (p2[1] - p1[1]);
   return { gap: feetY - surfY, surfY };
}

/** Highest walkable floor under `currentFeetY` at (x,z), or `-Infinity` if none (do not use `0` — real maps use y=0). */
function floorAt(x: number, z: number, currentFeetY: number) {
   const STEP = PM.FLOOR_CAST;
   let best = -Infinity;
   for (const f of levelFloors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      if (f.y > currentFeetY + STEP) continue;
      if (f.y > best) best = f.y;
   }
   for (const p of levelPlanes) {
      if (Math.hypot(p.dydx, p.dydz) > MAX_WALKABLE_SLOPE_GRAD + 0.03) continue;
      const xMin = Math.min(p.x0, p.x1);
      const xMax = Math.max(p.x0, p.x1);
      const zMin = Math.min(p.z0, p.z1);
      const zMax = Math.max(p.z0, p.z1);
      if (x < xMin || x > xMax || z < zMin || z > zMax) continue;
      // y00 is anchored at (p.x0, p.z0) as provided by level builder.
      const y = p.y00 + p.dydx * (x - p.x0) + p.dydz * (z - p.z0);
      if (y > currentFeetY + STEP) continue;
      if (y > best) best = y;
   }
   return best;
}

function clipVelocity(vx: number, vz: number, nx: number, nz: number, overbounce = 1.001) {
   const backoff = (vx * nx + vz * nz) * overbounce;
   const outX = vx - nx * backoff;
   const outZ = vz - nz * backoff;
   // avoid tiny oscillations
   return {
      x: Math.abs(outX) < 1e-4 ? 0 : outX,
      z: Math.abs(outZ) < 1e-4 ? 0 : outZ,
   };
}

function _collideSlideStepXZ(dt: number) {
   const STEP_H = PM.STEP_UP;

   // PM_StepSlideMove-ish (Quake II): sweep AABB against BSP brushes, bump & clip velocity.
   const tryMove = (startX: number, startZ: number, startFeetY: number, vX: number, vZ: number) => {
      let x = startX;
      let z = startZ;
      let vx = vX;
      let vz = vZ;
      let timeLeft = dt;

      const planes: { nx: number; nz: number }[] = [];

      for (let bump = 0; bump < 4; bump++) {
         if (timeLeft <= 1e-6) break;
         const gx = x + vx * timeLeft;
         const gz = z + vz * timeLeft;

         const hit = tracePlayerVsWorldAndMovers(
            [x, startFeetY, z],
            [gx, startFeetY, gz],
            PLAYER_BOX_MIN,
            PLAYER_BOX_MAX_STAND,
         );

         if (!hit || hit.fraction >= 1) {
            x = gx;
            z = gz;
            break;
         }

         // Move up to impact point (slightly before).
         const f = Math.max(0, hit.fraction - 1e-4);
         x = x + (gx - x) * f;
         z = z + (gz - z) * f;

         const nh = Math.hypot(hit.nx, hit.nz) || 1;
         const nX = hit.nx / nh;
         const nZ = hit.nz / nh;
         planes.push({ nx: nX, nz: nZ });

         // Reduce remaining time.
         timeLeft *= Math.max(0, 1 - hit.fraction);

         // Clip velocity by all planes we've hit this frame (Quake bump logic).
         for (let pi = 0; pi < planes.length; pi++) {
            const p = planes[pi]!;
            const into = vx * p.nx + vz * p.nz;
            if (into >= 0) continue;
            const clipped = clipVelocity(vx, vz, p.nx, p.nz);
            vx = clipped.x;
            vz = clipped.z;
         }

         if (Math.abs(vx) + Math.abs(vz) < 1e-6) {
            vx = 0;
            vz = 0;
            break;
         }
      }

      return { x, z, vx, vz };
   };

   // attempt without step
   const base = tryMove(camPos.x, camPos.z, feetY, velX, velZ);

   const wantX = camPos.x + velX * dt;
   const wantZ = camPos.z + velZ * dt;
   const blocked = Math.abs(base.x - wantX) + Math.abs(base.z - wantZ) > 1e-3;
   if (!blocked) {
      camPos.x = base.x;
      camPos.z = base.z;
      velX = base.vx;
      velZ = base.vz;
      return;
   }

   // step up then move then step down
   const upFeet = feetY + STEP_H;
   const upMove = tryMove(camPos.x, camPos.z, upFeet, velX, velZ);
   const downFloor = floorAt(upMove.x, upMove.z, upFeet);
   const finalFeet = Math.max(Number.isFinite(downFloor) ? downFloor : -Infinity, feetY);

   // choose better (farther) move
   const distBase = (base.x - camPos.x) ** 2 + (base.z - camPos.z) ** 2;
   const distStep = (upMove.x - camPos.x) ** 2 + (upMove.z - camPos.z) ** 2;
   if (distStep > distBase + 1e-4) {
      camPos.x = upMove.x;
      camPos.z = upMove.z;
      velX = upMove.vx;
      velZ = upMove.vz;
      feetY = finalFeet;
   } else {
      camPos.x = base.x;
      camPos.z = base.z;
      velX = base.vx;
      velZ = base.vz;
   }
}

/** BSP brush seams can leave the feet origin overlapping solids after pmove; pop the hull vertically out of brush overlap. */
function nudgePlayerHullOutOfBrushSeam(
   mins: readonly [number, number, number],
   maxs: readonly [number, number, number],
) {
   const base: [number, number, number] = [camPos.x, feetY, camPos.z];
   const probe = (p: readonly [number, number, number]): Q2BrushClipHit | null =>
      tracePlayerVsWorldAndMovers(p, p, mins, maxs);
   const pinned = (h: Q2BrushClipHit | null) => Boolean(h && (h.startsolid || h.allsolid));
   if (!pinned(probe(base))) return;

   const yScales = [0.12, 0.22, 0.38, 0.55, 0.85, 1.25, 1.85, 2.6] as const;
   let bestY: [number, number, number] | null = null;
   let bestAbsY = Infinity;
   for (const s of yScales) {
      for (const dy of [-0.42 * s, -0.14 * s, 0.2 * s, 0.44 * s, 0.72 * s, 1.05 * s] as const) {
         const p: [number, number, number] = [base[0], base[1] + dy, base[2]];
         if (pinned(probe(p))) continue;
         const ady = Math.abs(dy);
         if (ady < bestAbsY - 1e-9) {
            bestAbsY = ady;
            bestY = p;
         }
      }
   }
   if (bestY) {
      camPos.x = bestY[0];
      feetY = bestY[1];
      camPos.z = bestY[2];
   }
   const b2: [number, number, number] = [camPos.x, feetY, camPos.z];
   if (!pinned(probe(b2))) return;

   const vh = Math.hypot(velX, velZ);
   const wx = vh > 5 ? velX / vh : 0;
   const wz = vh > 5 ? velZ / vh : 0;
   const xzSteps = [0.045, 0.07, 0.1, 0.12, 0.14] as const;
   let bestXZ: [number, number, number] | null = null;
   let bestH2 = Infinity;
   let bestAlign = -Infinity;
   let bestK = 99;
   for (const s of xzSteps) {
      for (let k = 0; k < 16; k++) {
         const ang = (k / 16) * Math.PI * 2;
         const cdx = Math.cos(ang);
         const cdz = Math.sin(ang);
         const p: [number, number, number] = [b2[0] + cdx * s, b2[1], b2[2] + cdz * s];
         if (pinned(probe(p))) continue;
         const ox = p[0] - b2[0];
         const oz = p[2] - b2[2];
         const h2 = ox * ox + oz * oz;
         const al = ox * wx + oz * wz;
         if (
            h2 < bestH2 - 1e-10 ||
            (Math.abs(h2 - bestH2) < 1e-10 && al > bestAlign + 1e-9) ||
            (Math.abs(h2 - bestH2) < 1e-10 && Math.abs(al - bestAlign) < 1e-9 && k < bestK)
         ) {
            bestH2 = h2;
            bestAlign = al;
            bestK = k;
            bestXZ = p;
         }
      }
   }
   if (bestXZ) {
      camPos.x = bestXZ[0];
      feetY = bestXZ[1];
      camPos.z = bestXZ[2];
   }
}

function updateMove(dt: number) {
   carryPlayerWithMobPlatMotion();
   // Treat plats like ground entities: snap to deck BEFORE pmove so jumps work reliably on movers.
   snapFeetToMobPlatTop();

   let hull = playerHullEffective();

   const runSpeed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? PM.SPRINT : PM.SPEED;
   const yawRad = yaw;

   let waterLevel = 0;
   let swimKickVel = 100;
   if (levelCm) {
      const cFeet = cmPointLeafContents(levelCm, camPos.x, feetY + 4, camPos.z);
      const cWaist = cmPointLeafContents(levelCm, camPos.x, feetY + hull.bodyHi * 0.42, camPos.z);
      const cEye = cmPointLeafContents(levelCm, camPos.x, feetY + hull.eyeH * 0.85, camPos.z);
      if ((cFeet & Q2_LIQUID_MASK) !== 0) waterLevel = 1;
      if ((cWaist & Q2_LIQUID_MASK) !== 0) waterLevel = 2;
      if ((cEye & Q2_LIQUID_MASK) !== 0) waterLevel = 3;
      const cKick = cWaist || cFeet;
      if ((cKick & CONTENTS_LAVA_Q2) !== 0) swimKickVel = 50;
      else if ((cKick & CONTENTS_SLIME_Q2) !== 0) swimKickVel = 80;
      else if ((cKick & CONTENTS_WATER_Q2) !== 0) swimKickVel = 100;
   }

   const cmd: PmCmd = {
      msec: Math.max(1, Math.min(50, Math.round(dt * 1000))),
      forwardmove:
         (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) * runSpeed +
         (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0) * runSpeed,
      sidemove:
         (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) * runSpeed +
         (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0) * runSpeed,
      upmove: waterLevel >= 2 && keys.has('Space') ? runSpeed : 0,
      jump: keys.has('Space'),
      yawRad,
      pitchRad: pitch,
   };

   const env: PmEnv = {
      trace: (start, mins, maxs, end) => {
         const h = tracePlayerVsWorldAndMovers(start, end, mins, maxs);
         if (!h) {
            return {
               allsolid: false,
               startsolid: false,
               fraction: 1,
               endpos: [end[0], end[1], end[2]],
               planeNormal: [0, 1, 0],
            };
         }
         const endpos: [number, number, number] = [
            start[0] + (end[0] - start[0]) * h.fraction,
            start[1] + (end[1] - start[1]) * h.fraction,
            start[2] + (end[2] - start[2]) * h.fraction,
         ];
         return {
            allsolid: Boolean(h.allsolid),
            startsolid: Boolean(h.startsolid),
            fraction: h.fraction,
            endpos,
            planeNormal: [h.nx, h.ny, h.nz],
         };
      },
   };

   const params: PmParams = {
      mins: hull.mins,
      maxs: hull.maxs,
      gravity: PM.GRAVITY,
      waterLevel,
      swimKickVel,
   };

   pmState.origin = [camPos.x, feetY, camPos.z];
   pmState.velocity = [velX, velY, velZ];
   // `onGround` comes only from `PM_CatagorizePosition` inside `pmove` (stock Q2).

   pmove(pmState, cmd, env, params);

   camPos.x = pmState.origin[0];
   feetY = pmState.origin[1];
   camPos.z = pmState.origin[2];
   velX = pmState.velocity[0];
   velY = pmState.velocity[1];
   velZ = pmState.velocity[2];

   nudgePlayerHullOutOfBrushSeam(hull.mins, hull.maxs);

   // Void / out-of-world safety: if we fell far below the level bounds, respawn.
   // In stock Q2 you'd take fatal damage in a killbox or fall forever; this keeps the demo playable.
   if (levelBounds && feetY < levelBounds.y0 - 4096) {
      camPos.x = levelSpawn.x;
      camPos.z = levelSpawn.z;
      feetY = levelSpawn.y;
      velX = 0;
      velY = 0;
      velZ = 0;
      pmState.origin = [camPos.x, feetY, camPos.z];
      pmState.velocity = [0, 0, 0];
      pmState.onGround = true;
      saveMobPlatDyPrev();
      hull = playerHullEffective();
      camPos.y = feetY + hull.eyeH;
      camRender.x = camPos.x;
      camRender.y = camPos.y;
      camRender.z = camPos.z;
      refreshViewWaterBlend();
      return;
   }

   // Re-snap after move to stay glued while riding (but will skip while jumping).
   snapFeetToMobPlatTop();
   hull = playerHullEffective();
   nudgePlayerHullOutOfBrushSeam(hull.mins, hull.maxs);
   pmState.origin = [camPos.x, feetY, camPos.z];
   pmState.velocity = [velX, velY, velZ];
   saveMobPlatDyPrev();
   hull = playerHullEffective();
   camPos.y = feetY + hull.eyeH;
   refreshViewWaterBlend();

   const rdx = camPos.x - camRender.x;
   const rdy = camPos.y - camRender.y;
   const rdz = camPos.z - camRender.z;
   const r2 = rdx * rdx + rdy * rdy + rdz * rdz;
   if (r2 > 130 * 130) {
      camRender.x = camPos.x;
      camRender.y = camPos.y;
      camRender.z = camPos.z;
   } else {
      const a = 1 - Math.exp(-26 * Math.min(0.055, dt));
      camRender.x += rdx * a;
      camRender.y += rdy * a;
      camRender.z += rdz * a;
   }
}

function render(t: number) {
   const glc = gl;
   const c = canvasEl.value;
   if (!glc || !c || !program || !vao) return;

   const now = t * 0.001;
   if (renderPaused) {
      raf = requestAnimationFrame(render);
      return;
   }
   const dt = lastT === 0 ? 0.016 : Math.min(0.05, now - lastT);
   lastT = now;

   updateEntities(dt, now);
   updateMove(dt);
   justPressed.clear();

   const resized = resizeToDisplaySize(c);
   if (resized) glc.viewport(0, 0, c.width, c.height);

   glc.enable(glc.DEPTH_TEST);
   glc.depthFunc(glc.LEQUAL);
   glc.clearColor(0.03, 0.04, 0.035, 1);
   glc.clear(glc.COLOR_BUFFER_BIT | glc.DEPTH_BUFFER_BIT);

   /* Wider BSP far plane + very small zNear wastes depth precision → distant coplanar polys shimmer. */
   const zNear = projFar > 400 ? 7 : 0.08;
   const proj = mat4Perspective(camFovYRad, c.width / c.height, zNear, projFar);
   const view = mat4Look(yaw, pitch, camRender);
   const mvp = mat4Mul(proj, view);

   if (levelHasSky && skyProgram && skyVao) {
      const inv = mat4Invert(mvp);
      if (inv) {
         glc.disable(glc.DEPTH_TEST);
         glc.depthMask(false);
         glc.useProgram(skyProgram);
         glc.uniformMatrix4fv(skyUniforms?.uInvMvp ?? null, false, inv);
         glc.uniform3f(skyUniforms?.uCamPos ?? null, camRender.x, camRender.y, camRender.z);
         if (skyUniforms?.uWaterView != null) glc.uniform1f(skyUniforms.uWaterView, viewWaterBlend);
         if (skyUniforms?.uTime != null) glc.uniform1f(skyUniforms.uTime, now);
         glc.bindVertexArray(skyVao);
         glc.drawArrays(glc.TRIANGLES, 0, 3);
         glc.bindVertexArray(null);
         glc.enable(glc.DEPTH_TEST);
         glc.depthMask(true);
      }
   }

   if (debugOverlay.value) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      let hit = '';
      let best = Infinity;
      for (const ent of entityDebugStatic) {
         const dx = ent.x - camRender.x;
         const dz = ent.z - camRender.z;
         const dy = ent.y - camRender.y;
         const dist = dx * dx + dy * dy + dz * dz;
         if (dist > 420 * 420 || dist > best) continue;
         const fwd = dx * fx + dz * fz;
         if (fwd < 40) continue;
         best = dist;
         hit = ent.classname;
      }
      debugHudText.value = `F4 debug · solids ${levelSolids.length} · movers ${mobModelIdxList.length}\nlook-at: ${
         hit || '—'
      }`;
   }

   glc.useProgram(program);
   glc.bindVertexArray(vao);

   if (!uniforms) return;
   glc.uniformMatrix4fv(uniforms.uMvp, false, mvp);
   glc.uniform3f(uniforms.uCamPos, camRender.x, camRender.y, camRender.z);
   glc.uniform1f(uniforms.uTime, now);
   glc.uniform1f(uniforms.uAmb, levelAmb);
   let fogUStart = fogStartWU;
   let fogUSpan = fogSpanWU;
   let fogUR = fogRgbR;
   let fogUG = fogRgbG;
   let fogUB = fogRgbB;
   let fogUDen = fogExpDensity;
   if (levelCm && levelLeafAreas && projFar > 400) {
      const f = fogFromLeafArea(
         levelCm,
         levelLeafAreas,
         camRender.x,
         camRender.y,
         camRender.z,
         fogRgbR,
         fogRgbG,
         fogRgbB,
         fogStartWU,
         fogSpanWU,
         fogExpDensity,
      );
      fogUStart = f.start;
      fogUSpan = f.span;
      fogUR = f.r;
      fogUG = f.g;
      fogUB = f.b;
      fogUDen = f.d;
   }
   const fogLerp = 1 - Math.exp(-20 * dt);
   fogSmoothR += (fogUR - fogSmoothR) * fogLerp;
   fogSmoothG += (fogUG - fogSmoothG) * fogLerp;
   fogSmoothB += (fogUB - fogSmoothB) * fogLerp;
   fogSmoothStartWU += (fogUStart - fogSmoothStartWU) * fogLerp;
   fogSmoothSpanWU += (fogUSpan - fogSmoothSpanWU) * fogLerp;
   fogSmoothExpDen += (fogUDen - fogSmoothExpDen) * fogLerp;
   glc.uniform1f(uniforms.uFogStart, fogSmoothStartWU);
   glc.uniform1f(uniforms.uFogSpan, fogSmoothSpanWU);
   if (uniforms.uFogRgb) glc.uniform3f(uniforms.uFogRgb, fogSmoothR, fogSmoothG, fogSmoothB);
   if (uniforms.uFogDensity != null) glc.uniform1f(uniforms.uFogDensity, fogSmoothExpDen);
   glc.uniform1f(uniforms.uExposure, projFar > 400 ? 0.88 : 0.92);
   if (uniforms.uWaterView) glc.uniform1f(uniforms.uWaterView, viewWaterBlend);
   const lmTick10 = Math.floor(now * 10);
   if (lmTick10 !== lastLmStyleTick10) {
      lastLmStyleTick10 = lmTick10;
      buildLightstyleScalars(levelLightstyles, now, lmStyleFloats);
      if (uniforms.uLmStyleVal) glc.uniform1fv(uniforms.uLmStyleVal, lmStyleFloats);
   }
   const ml = maxLightsRuntime();
   const picks: { d2: number; l: Light; li: number }[] = [];
   for (let li = 0; li < levelLights.length; li++) {
      const a = levelLights[li]!;
      const d2 = (a.x - camRender.x) ** 2 + (a.y - camRender.y) ** 2 + (a.z - camRender.z) ** 2;
      if (picks.length < ml) {
         picks.push({ d2, l: a, li });
         picks.sort((x, y) => x.d2 - y.d2);
      } else if (d2 < picks[picks.length - 1]!.d2) {
         picks[picks.length - 1] = { d2, l: a, li };
         picks.sort((x, y) => x.d2 - y.d2);
      }
   }
   for (let i = picks.length; i < ml; i++) {
      lightSlotActiveLi[i] = -1;
      lightSlotBlend[i] = 0;
   }
   glc.uniform1i(uniforms.uLightCount, picks.length);
   const tt = now;
   for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      if (!pick) continue;
      const { l: q, li } = pick;
      if (lightSlotActiveLi[i] !== li) {
         lightSlotActiveLi[i] = li;
         lightSlotBlend[i] = 0;
      }
      lightSlotBlend[i] = Math.min(1, (lightSlotBlend[i] ?? 0) + dt * 2.75);
      const flick = 1 + q.flicker * (0.55 * Math.sin(tt * 9.1 + i * 1.7) + 0.45 * Math.sin(tt * 13.7 + i * 0.8));
      const b = lightSlotBlend[i] ?? 0;
      lightPosArr[i * 3 + 0] = q.x;
      lightPosArr[i * 3 + 1] = q.y;
      lightPosArr[i * 3 + 2] = q.z;
      lightColArr[i * 3 + 0] = q.r * flick * b;
      lightColArr[i * 3 + 1] = q.g * flick * b;
      lightColArr[i * 3 + 2] = q.b * flick * b;
      lightRngArr[i] = q.range;
   }
   glc.uniform3fv(uniforms.uLightPos, lightPosArr);
   glc.uniform3fv(uniforms.uLightCol, lightColArr);
   glc.uniform1fv(uniforms.uLightRange, lightRngArr);

   glc.activeTexture(glc.TEXTURE0);
   glc.bindTexture(glc.TEXTURE_2D, texWallCode);
   glc.uniform1i(uniforms.uTexWallCode, 0);
   glc.activeTexture(glc.TEXTURE2);
   glc.bindTexture(glc.TEXTURE_2D, texWallStone);
   glc.uniform1i(uniforms.uTexWallStone, 2);
   glc.activeTexture(glc.TEXTURE3);
   glc.bindTexture(glc.TEXTURE_2D, texFloorStone);
   glc.uniform1i(uniforms.uTexFloorStone, 3);
   glc.activeTexture(glc.TEXTURE4);
   glc.bindTexture(glc.TEXTURE_2D, texFloorMetal);
   glc.uniform1i(uniforms.uTexFloorMetal, 4);
   glc.activeTexture(glc.TEXTURE5);
   glc.bindTexture(glc.TEXTURE_2D, texCeil);
   glc.uniform1i(uniforms.uTexCeil, 5);
   glc.activeTexture(glc.TEXTURE6);
   glc.bindTexture(glc.TEXTURE_2D, texQ2Atlas ?? texWallStone);
   glc.uniform1i(uniforms.uTexQ2, 6);
   glc.activeTexture(glc.TEXTURE7);
   glc.bindTexture(glc.TEXTURE_2D, texQ2Lightmap ?? texWallStone);
   glc.uniform1i(uniforms.uTexLM, 7);

   const pvsReady =
      !!levelVisBake &&
      !!levelCm &&
      !!levelLeafClusters &&
      levelVisBake.rowBytes > 0 &&
      (() => {
         const vb = levelVisBake!;
         const rb = vb.rowBytes;
         if (pvsScratch.length < rb) pvsScratch = new Uint8Array(rb);
         const lf = cmPointLeafNum(levelCm!, camRender.x, camRender.y, camRender.z);
         let cl = -1;
         if (lf >= 0 && lf < levelLeafClusters!.length) cl = levelLeafClusters![lf]!;
         if (cl < 0 || cl >= vb.numClusters) return false;
         q2DecompressPvsRow(vb.visLump, cl, pvsScratch);
         return true;
      })();

   const drawVisTriChunk = (ch: { cluster: number; first: number; count: number }) => {
      if (ch.count <= 0) return;
      const v = levelVisBake;
      if (!v) return;
      if (pvsReady && ch.cluster >= 0 && !q2ClusterVisibleInPvs(pvsScratch, v.numClusters, ch.cluster)) return;
      glc.drawArrays(glc.TRIANGLES, ch.first, ch.count);
   };

   if (uniforms.uMobYShift) glc.uniform1f(uniforms.uMobYShift, 0);
   glc.uniform1i(uniforms.uEmissivePass, 0);
   glc.uniform1i(uniforms.uAlphaBlendPass, 0);

   glc.bindVertexArray(vao);
   if (levelVisBake?.opaqueChunks && levelVisBake.opaqueChunks.length > 0) {
      for (const ch of levelVisBake.opaqueChunks) drawVisTriChunk(ch);
   } else {
      glc.drawArrays(glc.TRIANGLES, 0, vertCountOpaque);
   }

   const vfMob = Q2_VERT_STRIDE_FLOATS;
   glc.enable(glc.POLYGON_OFFSET_FILL);
   for (let mi = 0; mi < mobVaosOpaque.length; mi++) {
      const mid = mobModelIdxList[mi]!;
      const platDy = mobPlatState.has(mid) ? (mobPlatDy.get(mid) ?? 0) : 0;
      if (uniforms.uMobYShift) glc.uniform1f(uniforms.uMobYShift, platDy);
      glc.polygonOffset(-2, -10);
      glc.bindVertexArray(mobVaosOpaque[mi]!);
      glc.bindBuffer(glc.ARRAY_BUFFER, mobVbosOpaque[mi]!);
      const nv = mobBaseOpaque[mi]!.length / vfMob;
      if (nv > 0) {
         glc.uniform1i(uniforms.uEmissivePass, 0);
         glc.uniform1i(uniforms.uAlphaBlendPass, 0);
         glc.drawArrays(glc.TRIANGLES, 0, nv);
      }
   }

   if (uniforms.uAlphaBlendPass) glc.uniform1i(uniforms.uAlphaBlendPass, 1);
   glc.depthMask(false);
   glc.enable(glc.BLEND);
   glc.blendFunc(glc.SRC_ALPHA, glc.ONE_MINUS_SRC_ALPHA);
   if (vaoTrans && vertCountTrans > 0) {
      glc.bindVertexArray(vaoTrans);
      if (levelVisBake?.transChunks && levelVisBake.transChunks.length > 0) {
         for (const ch of levelVisBake.transChunks) drawVisTriChunk(ch);
      } else {
         glc.drawArrays(glc.TRIANGLES, 0, vertCountTrans);
      }
   }
   for (let mi = 0; mi < mobVaosTrans.length; mi++) {
      const mid = mobModelIdxList[mi]!;
      const platDy = mobPlatState.has(mid) ? (mobPlatDy.get(mid) ?? 0) : 0;
      if (uniforms.uMobYShift) glc.uniform1f(uniforms.uMobYShift, platDy);
      glc.polygonOffset(-2, -10);
      glc.bindVertexArray(mobVaosTrans[mi]!);
      glc.bindBuffer(glc.ARRAY_BUFFER, mobVbosTrans[mi]!);
      const nt = mobBaseTrans[mi]!.length / vfMob;
      if (nt > 0) glc.drawArrays(glc.TRIANGLES, 0, nt);
   }
   glc.disable(glc.BLEND);
   glc.depthMask(true);
   glc.uniform1i(uniforms.uAlphaBlendPass, 0);

   if (vaoWarp && vboWarp) {
      glc.polygonOffset(-2, -22);
      glc.bindVertexArray(vaoWarp);
      if (vertCountWarp > 0) {
         if (levelVisBake?.warpChunks && levelVisBake.warpChunks.length > 0) {
            for (const ch of levelVisBake.warpChunks) drawVisTriChunk(ch);
         } else {
            glc.drawArrays(glc.TRIANGLES, 0, vertCountWarp);
         }
      }
   }

   for (let mi = 0; mi < mobVaosWarp.length; mi++) {
      const mid = mobModelIdxList[mi]!;
      const platDy = mobPlatState.has(mid) ? (mobPlatDy.get(mid) ?? 0) : 0;
      if (uniforms.uMobYShift) glc.uniform1f(uniforms.uMobYShift, platDy);
      glc.polygonOffset(-2, -22);
      glc.bindVertexArray(mobVaosWarp[mi]!);
      glc.bindBuffer(glc.ARRAY_BUFFER, mobVbosWarp[mi]!);
      const nw = mobBaseWarp[mi]!.length / vfMob;
      if (nw > 0) glc.drawArrays(glc.TRIANGLES, 0, nw);
   }
   if (uniforms.uMobYShift) glc.uniform1f(uniforms.uMobYShift, 0);
   glc.disable(glc.POLYGON_OFFSET_FILL);

   glc.bindVertexArray(null);

   // Dynamic entities draw (door + lift)
   if (vaoDyn && vboDyn) {
      glc.bindVertexArray(vaoDyn);
      if (vertCountDyn > 0) {
         glc.uniform1i(uniforms.uEmissivePass, 0);
         glc.drawArrays(glc.TRIANGLES, 0, vertCountDyn);
      }
      glc.bindVertexArray(null);
   }

   raf = requestAnimationFrame(render);
}

async function fetchExternalLevelBuffer(baseURL: string): Promise<ArrayBuffer | null> {
   try {
      const qb = route.query.bsp;
      const fromQuery = (Array.isArray(qb) ? qb[0] : typeof qb === 'string' ? qb : '')?.trim() ?? '';
      const explicit = props.bspUrl?.trim() || fromQuery;
      if (explicit) {
         const path = explicit.startsWith('/') ? explicit : `/${explicit}`;
         const res = await fetch(joinPublicAsset(baseURL, path));
         if (!res.ok) return null;
         return await res.arrayBuffer();
      }
      for (const path of DEFAULT_BSP_FALLBACK_CHAIN) {
         const res = await fetch(joinPublicAsset(baseURL, path));
         if (res.ok) return await res.arrayBuffer();
      }
      return null;
   } catch {
      return null;
   }
}

async function init(mountSession: number) {
   const c = canvasEl.value;
   if (!c || mountSession !== glMountSession) return;

   const glc = c.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
      desynchronized: true,
   });
   if (!glc) return;
   gl = glc;

   const vs = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aN;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aQ2Atlas;
layout(location=4) in float aQ2Warp;
layout(location=5) in float aTexId;
layout(location=6) in vec2 aLmFrac;
layout(location=7) in vec4 aLmAtlas;
layout(location=8) in float aLmNLayers;
layout(location=9) in vec4 aLmStyleIdx;
uniform mat4 uMvp;
uniform float uMobYShift;
out vec3 vN;
out highp vec2 vUv;
flat out vec4 vQ2Atlas;
flat out float vQ2Warp;
flat out int vTexId;
out vec3 vPos;
out vec2 vLmFrac;
flat out vec4 vLmAtlas;
flat out float vLmNLayers;
flat out vec4 vLmStyleIdx;
void main() {
  vec3 wpos = vec3(aPos.x, aPos.y + uMobYShift, aPos.z);
  /* Coplanar pool bottom + water: polygon offset alone still shimmers; nudge along face normal (world). */
  if (aQ2Warp > 0.5 && aQ2Warp < 2.5)
    wpos += aN * 0.9;
  vN = aN;
  vUv = aUv;
  vQ2Atlas = aQ2Atlas;
  vQ2Warp = aQ2Warp;
  vTexId = int(aTexId + 0.5);
  vPos = wpos;
  vLmFrac = aLmFrac;
  vLmAtlas = aLmAtlas;
  vLmNLayers = aLmNLayers;
  vLmStyleIdx = aLmStyleIdx;
  gl_Position = uMvp * vec4(wpos, 1.0);
}`;

   const mlShader = maxLightsRuntime();
   const fs = `#version 300 es
precision highp float;
#define MAX_LIGHTS ${mlShader}
in vec3 vN;
in highp vec2 vUv;
flat in vec4 vQ2Atlas;
flat in float vQ2Warp;
flat in int vTexId;
in vec3 vPos;
in vec2 vLmFrac;
flat in vec4 vLmAtlas;
flat in float vLmNLayers;
flat in vec4 vLmStyleIdx;
uniform float uTime;
uniform vec3 uCamPos;
uniform bool uEmissivePass;
uniform int uLightCount;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform float uLightRange[MAX_LIGHTS];
uniform sampler2D uTexWallCode;
uniform sampler2D uTexWallStone;
uniform sampler2D uTexFloorStone;
uniform sampler2D uTexFloorMetal;
uniform sampler2D uTexCeil;
uniform sampler2D uTexQ2;
uniform sampler2D uTexLM;
uniform float uLmStyleVal[64];
uniform float uAmb;
uniform float uFogStart;
uniform float uFogSpan;
uniform vec3 uFogRgb;
uniform float uFogDensity;
uniform float uExposure;
uniform float uWaterView;
uniform bool uAlphaBlendPass;
out vec4 outColor;
/* fract() tiling: implicit dFdx on fract UV blows up at tile edges → wrong mips / sparkle on distant grass walls. */
vec3 sampleQ2AtlasAlbedo(vec2 baseUv) {
  highp vec2 c = baseUv;
  if (vQ2Warp > 0.5 && vQ2Warp < 2.5) {
    float t = uTime;
    highp float ox = baseUv.x;
    highp float oy = baseUv.y;
    c.x = ox + 0.042 * sin(oy * 20.0 - t * 2.85);
    c.y = oy + 0.042 * cos(ox * 18.0 + t * 2.45);
    if (vQ2Warp > 1.5)
      c.x -= t * 0.28;
  }
  vec4 ar = vQ2Atlas;
  highp float sn = fract(c.x);
  highp float tn = fract(c.y);
  highp float au = mix(ar.x, ar.z, sn);
  highp float av = mix(ar.y, ar.w, tn);
  vec2 uvA = vec2(au, av);
  if (vQ2Warp > 0.5 && vQ2Warp < 2.5)
    return textureLod(uTexQ2, uvA, 0.0).rgb;
  /* Под водой UV качается по времени — dFdx/dFdy раздуваются → тяжёлый mip/фильтр; LOD по дистанции дешевле. */
  if (uWaterView > 0.5) {
    float dist = length(vPos - uCamPos);
    float lod = clamp(log2(max(dist, 6.0) * 0.0031) + 0.55, 0.0, 5.5);
    return textureLod(uTexQ2, uvA, lod).rgb;
  }
  vec2 su = vec2(ar.z - ar.x, ar.w - ar.y);
  vec2 dPdx = vec2(su.x * dFdx(c.x), su.y * dFdx(c.y));
  vec2 dPdy = vec2(su.x * dFdy(c.x), su.y * dFdy(c.y));
  return textureGrad(uTexQ2, uvA, dPdx, dPdy).rgb;
}
vec3 texColor(vec2 uvUse) {
  if (vTexId == 0) return texture(uTexWallCode, uvUse).rgb;
  if (vTexId == 1) return texture(uTexWallStone, uvUse).rgb;
  if (vTexId == 2) return texture(uTexWallStone, uvUse).rgb;
  if (vTexId == 3) return texture(uTexFloorStone, uvUse).rgb;
  if (vTexId == 4) return texture(uTexFloorMetal, uvUse).rgb;
  if (vTexId == 7)
    return sampleQ2AtlasAlbedo(uvUse);
  if (vTexId == 6) {
    // emissive halo: radial falloff from UV
    vec2 p = uvUse * 2.0 - 1.0;
    float d = dot(p, p);
    float a = smoothstep(1.0, 0.0, d);
    vec3 glow = vec3(1.25, 0.75, 0.28);
    return glow * a;
  }
  return texture(uTexCeil, uvUse).rgb;
}
void main() {
  float wv = step(0.5, uWaterView);
  vec3 rel = vPos - uCamPos;
  vec2 uvSh = vUv;
  if (wv > 0.5) {
    vec2 q = rel.xz * 0.022 + rel.yy * vec2(0.016, 0.012);
    uvSh += vec2(
      sin(uTime * 1.85 + q.x * 5.8) * 0.0046 + sin(uTime * 2.65 + q.y * 4.2) * 0.0022,
      cos(uTime * 2.05 + q.y * 6.0) * 0.0046 + cos(uTime * 1.48 + q.x * 3.85) * 0.0022
    );
  }
  vec3 posLt = mix(vPos, vPos + vec3(
    sin(uTime * 2.1 + vPos.x * 0.29 + vPos.z * 0.26) * 2.1,
    sin(uTime * 1.65 + vPos.x * -0.21 + vPos.z * 0.31) * 1.4,
    cos(uTime * 2.25 + vPos.x * 0.27 + vPos.z * 0.24) * 2.1
  ), wv);
  vec3 n = normalize(vN);
  /* Large warp water tris: per-vertex normals make moving specular “facets”; blend toward flat up. */
  if (vTexId == 7 && vQ2Warp > 0.5 && vQ2Warp < 2.5) {
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.45));
  }
  if (wv > 0.5) {
    vec3 nb = vec3(
      sin(uTime * 2.4 + vPos.y * 0.19 + vPos.z * 0.41),
      cos(uTime * 2.1 + vPos.x * 0.37 + vPos.z * 0.22),
      sin(uTime * 1.9 + vPos.x * 0.33 + vPos.y * 0.21)
    ) * 0.052;
    n = normalize(n + nb);
  }
  vec3 col = texColor(uvSh);
  // BSP (texId 7): baked lightmaps + animated lightstyles (multi-layer sum).
  if (vTexId == 7) {
    vec3 lmAcc = vec3(0.0);
    float nLay = vLmNLayers;
    if (nLay < 0.5) {
      lmAcc = vec3(1.0);
    } else {
      vec4 bb = vLmAtlas;
      for (int li = 0; li < 4; li++) {
        if (float(li) >= nLay - 0.001) break;
        float sidx = li == 0 ? vLmStyleIdx.x : (li == 1 ? vLmStyleIdx.y : (li == 2 ? vLmStyleIdx.z : vLmStyleIdx.w));
        if (sidx < -0.5) break;
        int si = clamp(int(floor(sidx + 0.5)), 0, 63);
        float w = uLmStyleVal[si];
        float vy = (float(li) + vLmFrac.y) / max(nLay, 1.0);
        vec2 uv = vec2(mix(bb.x, bb.z, vLmFrac.x), mix(bb.y, bb.w, vy));
        lmAcc += texture(uTexLM, uv).rgb * w;
      }
    }
    vec3 lm = max(lmAcc, vec3(0.001));
    /* Softer than full overbright — avoids “plastic” sheen vs stock Q2 look. */
    col = col * (lm * 1.72 + vec3(0.055));
  }
  // Two-pass: opaque first, emissive additive second (prevents "black edges").
  if (uEmissivePass) {
    if (vTexId != 6) discard;
    float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    if (a < 0.02) discard;
    outColor = vec4(col, a);
    return;
  } else {
    if (vTexId == 6) discard;
  }
  // ambient + point lights (uAmb scales outdoor / BSP visibility)
  float amb = uAmb;
  vec3 lightAcc = vec3(0.0);
  float wrap = 0.35;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) continue;
    vec3 lp = uLightPos[i];
    vec3 toL = lp - posLt;
    float dist = length(toL);
    vec3 l = toL / max(dist, 1e-3);
    float ndlWrap = clamp((dot(n, l) + wrap) / (1.0 + wrap), 0.0, 1.0);
    float attLin = clamp(1.0 - dist / max(uLightRange[i], 1.0), 0.0, 1.0);
    float att = attLin * attLin;
    float bounce = 0.2;
    lightAcc += uLightCol[i] * ((ndlWrap * (1.18 * att)) + (bounce * att));
  }
  if (vTexId == 7) {
    float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    float floorDamp = mix(1.0, 0.62, smoothstep(0.72, 0.98, n.y));
    col *= (amb * 0.5 + lightAcc * 0.38 * floorDamp * (0.82 + 0.18 * up));
  } else {
    col *= (amb + lightAcc);
  }
  // distance fog (air); optional exponential term when uFogDensity > 0 (worldspawn)
  float distFog = length(vPos - uCamPos);
  float fogLin = clamp((distFog - uFogStart) / max(uFogSpan, 1.0), 0.0, 1.0);
  float fogExp = uFogDensity > 1e-6 ? (1.0 - exp(-distFog * uFogDensity)) : 0.0;
  float fog = clamp(max(fogLin, fogExp), 0.0, 1.0);
  col = mix(col, uFogRgb, fog);
  /* Глаза под водой: бирюзовая глубина (поглощение), не «серый туман» + лёгкая живость */
  if (uWaterView > 0.5) {
    float absorb = 1.0 - exp(-distFog * 0.00095);
    vec3 waterFar = vec3(0.06, 0.38, 0.44);
    col = mix(col * vec3(0.92, 1.06, 1.05), waterFar, absorb * 0.52);
    float cau = sin(uTime * 2.2 + vPos.x * 0.48 + vPos.z * 0.44) * sin(uTime * 1.65 + vPos.x * -0.33 + vPos.z * 0.31);
    col *= 1.0 + 0.055 * cau;
    col *= 1.14;
  }
  col *= uExposure;
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(1.0 / 2.2));
  if (uAlphaBlendPass) {
    float outA = 1.0;
    if (vTexId == 7 && vQ2Warp > 2.5 && vQ2Warp < 3.5) outA = 0.33;
    else if (vTexId == 7 && vQ2Warp > 3.5 && vQ2Warp < 4.5) outA = 0.66;
    outColor = vec4(col, outA);
    return;
  }
  outColor = vec4(col, 1.0);
}`;

   program = createProgram(glc, vs, fs);
   uniforms = {
      uMvp: glc.getUniformLocation(program, 'uMvp'),
      uCamPos: glc.getUniformLocation(program, 'uCamPos'),
      uEmissivePass: glc.getUniformLocation(program, 'uEmissivePass'),
      uLightCount: glc.getUniformLocation(program, 'uLightCount'),
      uLightPos: glc.getUniformLocation(program, 'uLightPos'),
      uLightCol: glc.getUniformLocation(program, 'uLightCol'),
      uLightRange: glc.getUniformLocation(program, 'uLightRange'),
      uTexWallCode: glc.getUniformLocation(program, 'uTexWallCode'),
      uTexWallStone: glc.getUniformLocation(program, 'uTexWallStone'),
      uTexFloorStone: glc.getUniformLocation(program, 'uTexFloorStone'),
      uTexFloorMetal: glc.getUniformLocation(program, 'uTexFloorMetal'),
      uTexCeil: glc.getUniformLocation(program, 'uTexCeil'),
      uTexQ2: glc.getUniformLocation(program, 'uTexQ2'),
      uTexLM: glc.getUniformLocation(program, 'uTexLM'),
      uLmStyleVal: glc.getUniformLocation(program, 'uLmStyleVal[0]'),
      uAmb: glc.getUniformLocation(program, 'uAmb'),
      uFogStart: glc.getUniformLocation(program, 'uFogStart'),
      uFogSpan: glc.getUniformLocation(program, 'uFogSpan'),
      uFogRgb: glc.getUniformLocation(program, 'uFogRgb'),
      uFogDensity: glc.getUniformLocation(program, 'uFogDensity'),
      uExposure: glc.getUniformLocation(program, 'uExposure'),
      uWaterView: glc.getUniformLocation(program, 'uWaterView'),
      uTime: glc.getUniformLocation(program, 'uTime'),
      uAlphaBlendPass: glc.getUniformLocation(program, 'uAlphaBlendPass'),
      uMobYShift: glc.getUniformLocation(program, 'uMobYShift'),
   };

   const skyVs = `#version 300 es
precision highp float;
layout(location=0) in vec2 aNdc;
uniform mat4 uInvMvp;
uniform vec3 uCamPos;
out vec3 vRay;
void main() {
  gl_Position = vec4(aNdc, 0.99995, 1.0);
  vec4 w = uInvMvp * vec4(aNdc, 1.0, 1.0);
  vec3 p = w.xyz / max(w.w, 1e-5);
  vRay = normalize(p - uCamPos);
}`;
   const skyFs = `#version 300 es
precision highp float;
in vec3 vRay;
uniform float uWaterView;
uniform float uTime;
out vec4 outColor;
void main() {
  vec3 d = normalize(vRay);
  if (uWaterView > 0.5) {
    float w = uWaterView;
    vec2 wg = vec2(
      sin(uTime * 1.75 + d.x * 5.5 + d.y * 2.8 + d.z * 3.2),
      cos(uTime * 2.05 + d.z * 5.2 + d.x * 2.2)
    ) * 0.014 * w;
    d = normalize(d + vec3(wg.x * 0.9, wg.y * 0.65, wg.x * -0.55 + wg.y * 0.35));
  }
  float h = d.y * 0.5 + 0.5;
  /* Q2-ish: холодный зенит, тёплый «haze» у горизонта. */
  vec3 zenith = vec3(0.10, 0.18, 0.36);
  vec3 hor = vec3(0.12, 0.14, 0.11);
  float t = pow(clamp(h, 0.0, 1.0), 1.08);
  vec3 col = mix(hor, zenith, t);
  col += vec3(0.04, 0.05, 0.06) * (1.0 - abs(d.z)) * 0.28;
  if (uWaterView > 0.5) {
    float w = uWaterView;
    vec3 uw = vec3(0.18, 0.48, 0.55);
    col = mix(col, uw, w * 0.45);
    col *= mix(1.0, 0.68, w);
  }
  outColor = vec4(col, 1.0);
}`;
   skyProgram = createProgram(glc, skyVs, skyFs);
   if (skyProgram) {
      skyUniforms = {
         uInvMvp: glc.getUniformLocation(skyProgram, 'uInvMvp'),
         uCamPos: glc.getUniformLocation(skyProgram, 'uCamPos'),
         uWaterView: glc.getUniformLocation(skyProgram, 'uWaterView'),
         uTime: glc.getUniformLocation(skyProgram, 'uTime'),
      };
   }
   skyVao = glc.createVertexArray();
   skyVbo = glc.createBuffer();
   if (skyVao && skyVbo && skyProgram) {
      glc.bindVertexArray(skyVao);
      glc.bindBuffer(glc.ARRAY_BUFFER, skyVbo);
      glc.bufferData(
         glc.ARRAY_BUFFER,
         new Float32Array([-1, -1, 3, -1, -1, 3]),
         glc.STATIC_DRAW,
      );
      glc.enableVertexAttribArray(0);
      glc.vertexAttribPointer(0, 2, glc.FLOAT, false, 0, 0);
      glc.bindVertexArray(null);
      glc.bindBuffer(glc.ARRAY_BUFFER, null);
   }

   projFar = 80;
   levelAmb = 0.48;
   fogStartWU = 6;
   fogSpanWU = 38;
   camFovYRad = (CAM_FOV_Y_DEG * Math.PI) / 180;
   /** Same as `joinPublicAsset`: use Nuxt `app.baseURL` only (`NUXT_APP_BASE_URL` on subpath deploys). */
   const baseURL = useRuntimeConfig().app.baseURL || '/';
   const levelBuf = await fetchExternalLevelBuffer(baseURL);
   if (mountSession !== glMountSession) return;
   const q2 = levelBuf ? await buildQ2LevelFromBufferAsync(levelBuf, undefined, baseURL) : null;
   if (mountSession !== glMountSession) return;
   const level = q2 ?? createEmptyFallbackLevel();
   levelSpawn = { ...level.spawn };
   // Broad bounds for "void" protection & debug; use static solids if present.
   if (level.solids.length > 0) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (const b of level.solids) {
         x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); z0 = Math.min(z0, b.z0);
         x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); z1 = Math.max(z1, b.z1);
      }
      levelBounds = { x0, y0, z0, x1, y1, z1 };
   } else {
      levelBounds = null;
   }
   levelLightstyles = level.lightstyleTable ?? { patterns: new Array(64).fill(undefined) };
   lastLmStyleTick10 = -1;
   if (q2) {
      projFar = 8192;
      levelAmb = 0.42;
   } else {
      projFar = 1400;
      levelAmb = 0.46;
   }
   levelWorldFog = level.worldFog ?? null;
   if (levelWorldFog) {
      fogRgbR = levelWorldFog.r;
      fogRgbG = levelWorldFog.g;
      fogRgbB = levelWorldFog.b;
      fogExpDensity = levelWorldFog.density;
      fogStartWU = levelWorldFog.fogStartWU;
      fogSpanWU = levelWorldFog.fogSpanWU;
   } else if (q2) {
      fogRgbR = 0.045;
      fogRgbG = 0.052;
      fogRgbB = 0.048;
      fogExpDensity = 0;
      fogStartWU = 200;
      fogSpanWU = 5600;
   } else {
      fogRgbR = 0.045;
      fogRgbG = 0.052;
      fogRgbB = 0.048;
      fogExpDensity = 0;
      fogStartWU = 140;
      fogSpanWU = 1100;
   }
   fogSmoothR = fogRgbR;
   fogSmoothG = fogRgbG;
   fogSmoothB = fogRgbB;
   fogSmoothStartWU = fogStartWU;
   fogSmoothSpanWU = fogSpanWU;
   fogSmoothExpDen = fogExpDensity;
   levelSolidsStatic = level.solids;
   levelFloorsStatic = level.floors;
   levelPlanesStatic = level.planes;
   // Collision: `CM_BoxTrace` when `cmClip` is set; else merged AABB + per-brush hull sweeps.
   levelBrushHullsStatic = level.brushHulls ?? [];
   levelCm = level.cmClip ?? null;
   levelLeafClusters = level.leafClusters ?? null;
   levelLeafAreas = level.leafAreas ?? null;
   levelVisBake = level.visBake ?? null;
   levelFloors = [...levelFloorsStatic];
   levelLights = level.lights;
   levelHasSky = level.hasSky ?? false;
   const mlBuf = maxLightsRuntime();
   if (lightSlotActiveLi.length !== mlBuf) {
      lightSlotActiveLi = new Int32Array(mlBuf);
      lightSlotBlend = new Float32Array(mlBuf);
   }
   lightPosArr = new Float32Array(mlBuf * 3);
   lightColArr = new Float32Array(mlBuf * 3);
   lightRngArr = new Float32Array(mlBuf);
   lightSlotActiveLi.fill(-1);
   lightSlotBlend.fill(0);
   doors = (level.doors ?? []).map((d, i) => ({
      id: d.targetname ?? `door_${i}`,
      targetname: d.targetname,
      x: d.x,
      z: d.z,
      y0: d.y0,
      y1: d.y1,
      w: d.w,
      t: d.t,
      open: false,
      pct: 0,
   }));
   triggersRuntime = (level.triggers ?? []).map((t) => ({
      ...t,
      fired: false,
      wasInside: false,
   }));
   teleportsRuntime = (level.teleports ?? []).map((t) => ({ ...t, wasInside: false }));
   buttonsRuntime = [...(level.buttons ?? [])];
   entityDebugStatic = [...(level.entityDebug ?? [])];
   lifts = level.lifts ?? [];
   mobSolidsStatic = level.mobSolids ?? [];
   mobSolidByIdx.clear();
   for (const s of mobSolidsStatic) mobSolidByIdx.set(s.modelIdx, s);
   mobPlatDy.clear();
   mobPlatDyPrev.clear();
   mobPlatState.clear();
   mobRotateRad.clear();
   for (const m of mobSolidsStatic) {
      if (m.kind !== 'plat') continue;
      const travel = Math.abs(m.travelHeight || 0);
      const dy0 = m.startExtended ? 0 : -travel;
      mobPlatState.set(m.modelIdx, { dy: dy0, targetDy: dy0, wait: 0, phase: 'atBottom' });
      mobPlatDy.set(m.modelIdx, dy0);
   }
   rebuildDynamicCollision();
   collisionDirty = false;
   dynDirty = true;
   lastCollisionRebuildT = 0;
   lastDynUploadT = 0;
   lastMobUploadT = 0;
  feetY = level.spawn.y;
   velY = 0;
  camPos.x = level.spawn.x;
  camPos.z = level.spawn.z;
   camPos.y = feetY + playerHullEffective().eyeH;
   camRender.x = camPos.x;
   camRender.y = camPos.y;
   camRender.z = camPos.z;

   vbo = glc.createBuffer();
   if (!vbo) throw new Error('buffer alloc failed');
   vao = glc.createVertexArray();
   if (!vao) throw new Error('vao alloc failed');
   glc.bindVertexArray(vao);
   glc.bindBuffer(glc.ARRAY_BUFFER, vbo);
   glc.bufferData(glc.ARRAY_BUFFER, level.verts, glc.STATIC_DRAW);
   vertCountOpaque = level.verts.length / Q2_VERT_STRIDE_FLOATS;

   const stride = Q2_VERT_STRIDE_FLOATS * 4;
   function setupQ2Attribs(g: WebGL2RenderingContext) {
      let off = 0;
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 3, g.FLOAT, false, stride, off);
      off += 3 * 4;
      g.enableVertexAttribArray(1);
      g.vertexAttribPointer(1, 3, g.FLOAT, false, stride, off);
      off += 3 * 4;
      g.enableVertexAttribArray(2);
      g.vertexAttribPointer(2, 2, g.FLOAT, false, stride, off);
      off += 2 * 4;
      g.enableVertexAttribArray(3);
      g.vertexAttribPointer(3, 4, g.FLOAT, false, stride, off);
      off += 4 * 4;
      g.enableVertexAttribArray(4);
      g.vertexAttribPointer(4, 1, g.FLOAT, false, stride, off);
      off += 4;
      g.enableVertexAttribArray(5);
      g.vertexAttribPointer(5, 1, g.FLOAT, false, stride, off);
      off += 4;
      g.enableVertexAttribArray(6);
      g.vertexAttribPointer(6, 2, g.FLOAT, false, stride, off);
      off += 2 * 4;
      g.enableVertexAttribArray(7);
      g.vertexAttribPointer(7, 4, g.FLOAT, false, stride, off);
      off += 4 * 4;
      g.enableVertexAttribArray(8);
      g.vertexAttribPointer(8, 1, g.FLOAT, false, stride, off);
      off += 4;
      g.enableVertexAttribArray(9);
      g.vertexAttribPointer(9, 4, g.FLOAT, false, stride, off);
   }
   setupQ2Attribs(glc);
   glc.bindVertexArray(null);
   glc.bindBuffer(glc.ARRAY_BUFFER, null);

   vboWarp = glc.createBuffer();
   vaoWarp = glc.createVertexArray();
   if (!vboWarp || !vaoWarp) throw new Error('warp buffer alloc failed');
   glc.bindVertexArray(vaoWarp);
   glc.bindBuffer(glc.ARRAY_BUFFER, vboWarp);
   const warp = level.warpVerts ?? new Float32Array(0);
   glc.bufferData(glc.ARRAY_BUFFER, warp, glc.STATIC_DRAW);
   vertCountWarp = warp.length / Q2_VERT_STRIDE_FLOATS;
   setupQ2Attribs(glc);
   glc.bindVertexArray(null);
   glc.bindBuffer(glc.ARRAY_BUFFER, null);

   vboTrans = glc.createBuffer();
   vaoTrans = glc.createVertexArray();
   if (!vboTrans || !vaoTrans) throw new Error('trans buffer alloc failed');
   glc.bindVertexArray(vaoTrans);
   glc.bindBuffer(glc.ARRAY_BUFFER, vboTrans);
   const trans = level.transVerts ?? new Float32Array(0);
   glc.bufferData(glc.ARRAY_BUFFER, trans, glc.STATIC_DRAW);
   vertCountTrans = trans.length / Q2_VERT_STRIDE_FLOATS;
   setupQ2Attribs(glc);
   glc.bindVertexArray(null);
   glc.bindBuffer(glc.ARRAY_BUFFER, null);

   mobVaosOpaque = [];
   mobVbosOpaque = [];
   mobVaosTrans = [];
   mobVbosTrans = [];
   mobVaosWarp = [];
   mobVbosWarp = [];
   mobBaseOpaque = [];
   mobBaseTrans = [];
   mobBaseWarp = [];
   mobStagingOpaque = [];
   mobStagingTrans = [];
   mobStagingWarp = [];
   mobModelIdxList = [];
   mobPivotXz.clear();

   const mobMeshes = level.mobMeshes ?? [];
   for (const m of mobMeshes) {
      mobModelIdxList.push(m.modelIdx);
      mobPivotXz.set(m.modelIdx, xzPivotFromMobVerts(m.opaque));

      const bo = new Float32Array(m.opaque);
      const bt = new Float32Array(m.trans);
      const bw = new Float32Array(m.warp);
      mobBaseOpaque.push(bo);
      mobBaseTrans.push(bt);
      mobBaseWarp.push(bw);
      mobStagingOpaque.push(new Float32Array(bo.length));
      mobStagingTrans.push(new Float32Array(bt.length));
      mobStagingWarp.push(new Float32Array(bw.length));

      const vboMo = glc.createBuffer();
      const vaoMo = glc.createVertexArray();
      if (!vboMo || !vaoMo) throw new Error('mob opaque buffer failed');
      glc.bindVertexArray(vaoMo);
      glc.bindBuffer(glc.ARRAY_BUFFER, vboMo);
      glc.bufferData(glc.ARRAY_BUFFER, bo, glc.STATIC_DRAW);
      setupQ2Attribs(glc);
      glc.bindVertexArray(null);
      mobVbosOpaque.push(vboMo);
      mobVaosOpaque.push(vaoMo);

      const vboMt = glc.createBuffer();
      const vaoMt = glc.createVertexArray();
      if (!vboMt || !vaoMt) throw new Error('mob trans buffer failed');
      glc.bindVertexArray(vaoMt);
      glc.bindBuffer(glc.ARRAY_BUFFER, vboMt);
      glc.bufferData(glc.ARRAY_BUFFER, bt, glc.STATIC_DRAW);
      setupQ2Attribs(glc);
      glc.bindVertexArray(null);
      mobVbosTrans.push(vboMt);
      mobVaosTrans.push(vaoMt);

      const vboMw = glc.createBuffer();
      const vaoMw = glc.createVertexArray();
      if (!vboMw || !vaoMw) throw new Error('mob warp buffer failed');
      glc.bindVertexArray(vaoMw);
      glc.bindBuffer(glc.ARRAY_BUFFER, vboMw);
      glc.bufferData(glc.ARRAY_BUFFER, bw, glc.STATIC_DRAW);
      setupQ2Attribs(glc);
      glc.bindVertexArray(null);
      mobVbosWarp.push(vboMw);
      mobVaosWarp.push(vaoMw);
   }
   glc.bindBuffer(glc.ARRAY_BUFFER, null);
   if (mobVbosOpaque.length > 0) {
      uploadMobBuffers(glc);
      lastMobUploadT = performance.now();
   }

   // Dynamic VAO/VBO (door + lift)
   vboDyn = glc.createBuffer();
   vaoDyn = glc.createVertexArray();
   if (!vboDyn || !vaoDyn) throw new Error('dyn buffer alloc failed');
   glc.bindVertexArray(vaoDyn);
   glc.bindBuffer(glc.ARRAY_BUFFER, vboDyn);
   const dynInit = buildDynamicEntitiesVerts();
   glc.bufferData(glc.ARRAY_BUFFER, dynInit, glc.DYNAMIC_DRAW);
   dynVboCapacityFloats = dynInit.length;
   vertCountDyn = dynInit.length / Q2_VERT_STRIDE_FLOATS;
   dynDirty = false;
   setupQ2Attribs(glc);
   glc.bindVertexArray(null);
   glc.bindBuffer(glc.ARRAY_BUFFER, null);

   const code = `// quake lab
export function strafe(pos, yaw, input) {
  const f = [Math.sin(yaw), Math.cos(yaw)];
  const r = [f[1], -f[0]];
  let vx = 0, vz = 0;
  if (input.w) { vx += f[0]; vz += f[1]; }
  if (input.s) { vx -= f[0]; vz -= f[1]; }
  if (input.d) { vx += r[0]; vz += r[1]; }
  if (input.a) { vx -= r[0]; vz -= r[1]; }
  return { x: pos.x + vx, z: pos.z + vz };
}`;

   texWallCode = makeTextureFromCanvas(glc, makeCodeWallCanvas(code, 512), { mipmap: true });
   texWallStone = makeTextureFromCanvas(glc, makeStoneCanvas(256), { mipmap: true });
   texFloorStone = makeTextureFromCanvas(glc, makeTileFloorCanvas(256), { mipmap: true });
   texFloorMetal = makeTextureFromCanvas(glc, makeMetalCanvas(256), { mipmap: true });
   texCeil = makeTextureFromCanvas(glc, makePlasterCeilCanvas(256), { mipmap: true });

   const grayAtlas = document.createElement('canvas');
   grayAtlas.width = 8;
   grayAtlas.height = 8;
   const g2 = grayAtlas.getContext('2d');
   if (g2) {
      g2.fillStyle = '#3a3e3c';
      g2.fillRect(0, 0, 8, 8);
   }
   const lmFallback = document.createElement('canvas');
   lmFallback.width = 2;
   lmFallback.height = 2;
   const lf = lmFallback.getContext('2d');
   if (lf) {
      lf.fillStyle = '#ffffff';
      lf.fillRect(0, 0, 2, 2);
   }
   const q2Nearest = level.walAtlasNearest === true;
   texQ2Atlas = level.atlasCanvas
      ? makeTextureFromCanvas(glc, level.atlasCanvas, {
           /* Mip chain + aniso: steep grass/rock on WAL atlas was crawling without mips (not only z-fight). */
           mipmap: !q2Nearest,
           flipY: false,
           clamp: true,
           nearest: q2Nearest,
           maxAnisotropy: q2Nearest ? undefined : 8,
        })
      : makeTextureFromCanvas(glc, grayAtlas, { mipmap: false, clamp: true });

   texQ2Lightmap = level.lightmapCanvas
      ? makeTextureFromCanvas(glc, level.lightmapCanvas, { mipmap: false, flipY: false, clamp: true })
      : makeTextureFromCanvas(glc, lmFallback, { mipmap: false, clamp: true });

   const onClick = () => {
      if (!locked) {
         canvasEl.value?.requestPointerLock();
      }
   };
   c.addEventListener('click', onClick);

   document.addEventListener('pointerlockchange', onPointerLockChange);
   document.addEventListener('visibilitychange', onVisibilityChange);
   window.addEventListener('mousemove', onMouseMove);
   window.addEventListener('keydown', onKeyDown);
   window.addEventListener('keyup', onKeyUp);

   if (mountSession === glMountSession) {
      raf = requestAnimationFrame(render);
   }

   return () => {
      c.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
   };
}

let dispose: null | (() => void) = null;

onMounted(() => {
   const session = ++glMountSession;
   void init(session).then((fn) => {
      if (session !== glMountSession) return;
      dispose = fn ?? null;
   });
});

onBeforeUnmount(() => {
   glMountSession++;
   cancelAnimationFrame(raf);
   dispose?.();
   dispose = null;
   if (gl) {
      if (texWallCode) gl.deleteTexture(texWallCode);
      if (texWallStone) gl.deleteTexture(texWallStone);
      if (texFloorStone) gl.deleteTexture(texFloorStone);
      if (texFloorMetal) gl.deleteTexture(texFloorMetal);
      if (texCeil) gl.deleteTexture(texCeil);
      if (texQ2Atlas) gl.deleteTexture(texQ2Atlas);
      if (texQ2Lightmap) gl.deleteTexture(texQ2Lightmap);
      if (vao) gl.deleteVertexArray(vao);
      if (vaoDyn) gl.deleteVertexArray(vaoDyn);
      if (vaoWarp) gl.deleteVertexArray(vaoWarp);
      if (vaoTrans) gl.deleteVertexArray(vaoTrans);
      if (vbo) gl.deleteBuffer(vbo);
      if (vboDyn) gl.deleteBuffer(vboDyn);
      if (vboWarp) gl.deleteBuffer(vboWarp);
      if (vboTrans) gl.deleteBuffer(vboTrans);
      if (program) gl.deleteProgram(program);
      if (skyProgram) gl.deleteProgram(skyProgram);
      if (skyVao) gl.deleteVertexArray(skyVao);
      if (skyVbo) gl.deleteBuffer(skyVbo);
   }
   gl = null;
});
</script>

<style scoped>
.qc-host {
   position: relative;
   width: 100%;
   height: 100%;
   min-height: 0;
}

.qc-root {
   display: block;
   width: 100%;
   height: 100%;
   cursor: crosshair;
}

.qc-debug-hud {
   position: fixed;
   z-index: 20;
   bottom: 0.65rem;
   left: 0.65rem;
   margin: 0;
   padding: 0.45rem 0.55rem;
   max-width: min(96vw, 28rem);
   font-size: 11px;
   line-height: 1.45;
   font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
   color: rgba(210, 235, 220, 0.88);
   background: rgba(6, 10, 9, 0.72);
   border: 1px solid rgba(0, 0, 0, 0.45);
   border-radius: 6px;
   pointer-events: none;
   text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
   white-space: pre-wrap;
}

</style>

