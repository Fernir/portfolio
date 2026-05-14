/**
 * Quake II `qcommon/pmove.c` player move, adapted to viewer coordinates (Y-up).
 *
 * Axis map vs stock Q2 (Z-up): Q2 vel[2] / normal[2] / wishvel[2] → our [1] (Y).
 * Order matches `Pmove()`: categorize → checkjump → friction → (watermove | airmove) → categorize.
 *
 * References: id-Software/Quake-2 `qcommon/pmove.c` — `Pmove`, `PM_CatagorizePosition`, `PM_CheckJump`,
 * `PM_Friction`, `PM_AirMove`, `PM_WaterMove`, `PM_StepSlideMove`.
 */

export type PmCmd = {
  /** `usercmd_t::msec` */
  msec: number;
  forwardmove: number;
  sidemove: number;
  /** Swim vertical intent (Q2 `upmove`); jump uses `jump` / same binding in caller. */
  upmove: number;
  /** Bound jump (+jump): treated like `cmd.upmove >= 10` in `PM_CheckJump`. */
  jump: boolean;
  /** View yaw in radians (viewer: yaw around +Y). */
  yawRad: number;
  /**
   * View pitch in radians (look up/down). Stock `PM_AirMove` / water use `AngleVectors` with `angles[PITCH]/3`
   * before building `pml.forward` / `pml.right` — we divide this value by 3 inside `movementBasisFromView`.
   */
  pitchRad?: number;
};

type PmTrace = {
  allsolid: boolean;
  startsolid: boolean;
  fraction: number;
  endpos: [number, number, number];
  planeNormal: [number, number, number];
};

export type PmParams = {
  mins: readonly [number, number, number];
  maxs: readonly [number, number, number];
  /** `pmove_t::s.gravity` (e.g. 800). */
  gravity: number;
  /**
   * Q2 `waterlevel`: 0 dry, 1 feet, 2 waist, 3 eyes under.
   * `PM_WaterMove` runs when `>= 2`; shallow wading uses `PM_AirMove` + extra water friction in `PM_Friction`.
   */
  waterLevel?: number;
  /**
   * Vertical kick from `PM_CheckJump` when fully submerged (`waterlevel >= 2`), stock uses 100/80/50 by contents.
   */
  swimKickVel?: number;
};

export type PmState = {
  origin: [number, number, number];
  velocity: [number, number, number];
  onGround: boolean;
  /** `PMF_JUMP_HELD` — must release jump to jump again on land; not set by water swim path in Q2. */
  jumpHeld: boolean;
};

export type PmEnv = {
  trace: (
    start: readonly [number, number, number],
    mins: readonly [number, number, number],
    maxs: readonly [number, number, number],
    end: readonly [number, number, number],
  ) => PmTrace;
};

// ---- From `pmove.c` (defaults) ----
const pm_stopspeed = 100;
const pm_maxspeed = 300;
const _pm_duckspeed = 100;
const pm_accelerate = 10;
/** Stock SP is 0 → `PM_AirMove` uses `PM_Accelerate(..., 1, ...)` not `PM_AirAccelerate`. */
const pm_airaccelerate = 0;
const pm_friction = 6;
const pm_waterspeed = 400;
const pm_wateraccelerate = 10;
const pm_waterfriction = 1;
/** Standing jump impulse (Q2 stock 270; slightly higher for this port). */
const pm_jumpvel = 288;
const STEPSIZE = 18;
const STOP_EPSILON = 0.1;
const MAX_CLIP_PLANES = 5;
const MIN_STEP_NORMAL = 0.58;

function dot(a: readonly [number, number, number], b: readonly [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(v: readonly [number, number, number]) {
  return Math.hypot(v[0], v[1], v[2]);
}
function scale(v: readonly [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function add(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function normalize(v: readonly [number, number, number]): [number, number, number] {
  const L = len(v) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}

/**
 * Strip horizontal into-wall wish when a short hull probe hits a vertical surface. Stock Q2 `PM_AirMove`
 * does not do this; our CM + JS floats still pump `PM_Accelerate` into the wall each tick (“W stuck”).
 */
function clipWishAgainstTouchingVerticalWall(
  env: PmEnv,
  params: PmParams,
  origin: readonly [number, number, number],
  wishdir: readonly [number, number, number],
  wishspeed: number,
): { wishdir: [number, number, number]; wishspeed: number } {
  if (wishspeed < 1e-4) return { wishdir: [wishdir[0], wishdir[1], wishdir[2]], wishspeed };
  const probe = 4.25;
  const end: [number, number, number] = [
    origin[0] + wishdir[0] * probe,
    origin[1] + wishdir[1] * probe * 0.05,
    origin[2] + wishdir[2] * probe,
  ];
  const tr = env.trace(origin, params.mins, params.maxs, end);
  if (tr.allsolid) return { wishdir: [wishdir[0], wishdir[1], wishdir[2]], wishspeed };
  // Treat “almost open” as open so grazing brush faces don’t flip-strip wish every frame (camera / strafe jitter).
  if (!tr.startsolid && tr.fraction >= 0.9935) {
    return { wishdir: [wishdir[0], wishdir[1], wishdir[2]], wishspeed };
  }
  let nx = tr.planeNormal[0];
  let nyN = tr.planeNormal[1];
  let nz = tr.planeNormal[2];
  const nLen = Math.hypot(nx, nyN, nz);
  if (nLen < 0.12) return { wishdir: [wishdir[0], wishdir[1], wishdir[2]], wishspeed };
  nx /= nLen;
  nyN /= nLen;
  nz /= nLen;
  if (Math.abs(nyN) > 0.45) return { wishdir: [wishdir[0], wishdir[1], wishdir[2]], wishspeed };
  // Project *velocity* V = wishdir·wishspeed onto the wall plane. Old code kept full `wishspeed` on the unit
  // tangent → driving ~run speed along the wall even when almost head-on (felt like constant strafe).
  const vx = wishdir[0] * wishspeed;
  const vy = wishdir[1] * wishspeed;
  const vz = wishdir[2] * wishspeed;
  const vDotN = vx * nx + vy * nyN + vz * nz;
  const px = vx - vDotN * nx;
  const py = vy - vDotN * nyN;
  const pz = vz - vDotN * nz;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) return { wishdir: [0, 0, 0], wishspeed: 0 };
  const inv = 1 / pl;
  return { wishdir: [px * inv, py * inv, pz * inv], wishspeed: pl };
}

function clipVelocity(
  input: readonly [number, number, number],
  normal: readonly [number, number, number],
  overbounce: number,
): [number, number, number] {
  const backoff = dot(input, normal) * overbounce;
  const out: [number, number, number] = [
    input[0] - normal[0] * backoff,
    input[1] - normal[1] * backoff,
    input[2] - normal[2] * backoff,
  ];
  if (out[0] > -STOP_EPSILON && out[0] < STOP_EPSILON) out[0] = 0;
  if (out[1] > -STOP_EPSILON && out[1] < STOP_EPSILON) out[1] = 0;
  if (out[2] > -STOP_EPSILON && out[2] < STOP_EPSILON) out[2] = 0;
  return out;
}

/** `PM_Accelerate` */
function accelerate(
  state: PmState,
  wishdir: readonly [number, number, number],
  wishspeed: number,
  accel: number,
  frametime: number,
) {
  const currentspeed = dot(state.velocity, wishdir);
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * frametime * wishspeed;
  if (accelspeed > addspeed) accelspeed = addspeed;
  state.velocity[0] += accelspeed * wishdir[0];
  state.velocity[1] += accelspeed * wishdir[1];
  state.velocity[2] += accelspeed * wishdir[2];
}

/** `PM_AirAccelerate` — used only when `pm_airaccelerate != 0` (DM / some mods). */
function airAccelerate(
  state: PmState,
  wishdir: readonly [number, number, number],
  wishspeed: number,
  accel: number,
  frametime: number,
) {
  let wishspd = wishspeed;
  if (wishspd > 30) wishspd = 30;
  const currentspeed = dot(state.velocity, wishdir);
  const addspeed = wishspd - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * wishspeed * frametime;
  if (accelspeed > addspeed) accelspeed = addspeed;
  state.velocity[0] += accelspeed * wishdir[0];
  state.velocity[1] += accelspeed * wishdir[1];
  state.velocity[2] += accelspeed * wishdir[2];
}

/**
 * `PM_Friction` — 3D speed, ground friction when on ground (no SURF_SLICK in this port),
 * water friction scaled by `waterLevel`.
 */
function pmFriction(state: PmState, frametime: number, waterLevel: number, onGround: boolean) {
  const v = state.velocity;
  const speed = len(v);
  if (speed < 1) {
    // Stock clears XY at low speed; in air near corners total speed can dip <1 while tiny horizontal
    // motion still matters — only snap horizontal when grounded.
    if (onGround) {
      v[0] = 0;
      v[2] = 0;
    }
    return;
  }
  let drop = 0;
  if (onGround) {
    const control = speed < pm_stopspeed ? pm_stopspeed : speed;
    drop += control * pm_friction * frametime;
  }
  if (waterLevel > 0) {
    drop += speed * pm_waterfriction * waterLevel * frametime;
  }
  let newspeed = speed - drop;
  if (newspeed < 0) newspeed = 0;
  newspeed /= speed;
  v[0] *= newspeed;
  v[1] *= newspeed;
  v[2] *= newspeed;
}

function movementBasisFromView(yawRad: number, pitchRad: number): {
  forward: [number, number, number];
  right: [number, number, number];
} {
  const p = pitchRad / 3;
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const forward: [number, number, number] = [sy * cp, sp, cy * cp];
  let rx = cy * cp;
  let rz = -sy * cp;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-5) {
    return { forward, right: [cy, 0, -sy] };
  }
  rx /= rl;
  rz /= rl;
  const right: [number, number, number] = [rx, 0, rz];
  return { forward, right };
}

/**
 * Hull origin overlapping solids + slide killed HZ: smallest planar shift (≤~0.19) to a free hull point.
 * Tie-break toward current horizontal velocity so we don’t pick an arbitrary world axis.
 */
function tryPlanarHullUnstickSmall(
  env: PmEnv,
  params: PmParams,
  origin: readonly [number, number, number],
  relVx: number,
  relVz: number,
): [number, number, number] | null {
  const steps = [0.05, 0.08, 0.11, 0.14, 0.17, 0.19] as const;
  const vh = Math.hypot(relVx, relVz);
  const wx = vh > 5 ? relVx / vh : 0;
  const wz = vh > 5 ? relVz / vh : 0;
  let best: [number, number, number] | null = null;
  let bestH2 = Infinity;
  let bestAlign = -Infinity;
  let bestK = 99;
  for (const s of steps) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const cdx = Math.cos(ang);
      const cdz = Math.sin(ang);
      const p: [number, number, number] = [origin[0] + cdx * s, origin[1], origin[2] + cdz * s];
      const t = env.trace(p, params.mins, params.maxs, p);
      if (t.startsolid || t.allsolid) continue;
      const ox = p[0] - origin[0];
      const oz = p[2] - origin[2];
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
        best = p;
      }
    }
  }
  return best;
}

/** Grounded seam wedge: overlapping hull at origin, wish to move, but horizontal speed collapsed. */
function applyGroundHullPinUnstick(state: PmState, env: PmEnv, params: PmParams, cmd: PmCmd) {
  if (!state.onGround) return;
  if (Math.hypot(cmd.forwardmove, cmd.sidemove) < 22) return;
  const pin = env.trace(state.origin, params.mins, params.maxs, state.origin);
  if (!pin.startsolid && !pin.allsolid) return;
  const hz = Math.hypot(state.velocity[0], state.velocity[2]);
  if (hz > 38) return;
  const u = tryPlanarHullUnstickSmall(env, params, state.origin, state.velocity[0], state.velocity[2]);
  if (!u) return;
  state.origin[0] = u[0];
  state.origin[1] = u[1];
  state.origin[2] = u[2];
}

/** When slide dies in a corner seam, try small hull-only probes to pop the AABB out (any fast move, not only apex of jump). */
function trySlideCornerUnstick(
  env: PmEnv,
  params: PmParams,
  from: readonly [number, number, number],
): [number, number, number] | null {
  const steps = [1.1, 2.2, 3.4, 4.8, 6.2];
  const xz: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    xz.push([Math.cos(ang), Math.sin(ang)]);
  }
  for (const step of steps) {
    for (const [dx, dz] of xz) {
      const L = Math.hypot(dx, dz) || 1;
      const p: [number, number, number] = [from[0] + (dx / L) * step, from[1], from[2] + (dz / L) * step];
      const t = env.trace(p, params.mins, params.maxs, p);
      if (!t.startsolid && !t.allsolid) return p;
    }
    for (const dy of [2, 4, 7, 11, 15, 20] as const) {
      const p: [number, number, number] = [from[0], from[1] + dy, from[2]];
      const t = env.trace(p, params.mins, params.maxs, p);
      if (!t.startsolid && !t.allsolid) return p;
    }
  }
  return null;
}

/** After air `stepSlideMove`, second seam pop when slide killed speed but move keys still ask for motion. */
function applyAirCornerUnstick(
  state: PmState,
  env: PmEnv,
  params: PmParams,
  cmd: PmCmd,
  vBeforeSlide: readonly [number, number, number],
) {
  if (Math.hypot(cmd.forwardmove, cmd.sidemove) < 1) return;
  if (len(state.velocity) >= 26) return;
  if (len(vBeforeSlide) < 32) return;
  const o0: [number, number, number] = [state.origin[0], state.origin[1], state.origin[2]];
  const unstuck = trySlideCornerUnstick(env, params, o0);
  if (!unstuck) return;
  const ox = unstuck[0] - o0[0];
  const oz = unstuck[2] - o0[2];
  const oy = unstuck[1] - o0[1];
  const horiz = Math.hypot(ox, oz);
  state.origin = unstuck;
  if (horiz > 0.05) {
    // Position-only: large `105/horiz` kicks + first-hit unstick point caused visible camera jitter in air corners.
    state.velocity[1] = Math.max(state.velocity[1], Math.min(72, Math.abs(vBeforeSlide[1]) * 0.18));
  } else if (oy > 0.35) {
    state.velocity[1] = Math.max(state.velocity[1], 48);
  }
}

function stepSlideMove(state: PmState, env: PmEnv, params: PmParams, frametime: number) {
  const start_o: [number, number, number] = [...state.origin];
  const start_v: [number, number, number] = [...state.velocity];

  /** Stock clears `planes` on any `fraction>0`; tiny slides wipe the first wall before a second plane is stored — bad in corners (esp. jumping in). */
  const PLANE_STACK_CLEAR_FRAC = 0.04;

  const slide = (
    origOrigin: [number, number, number],
    origVel: [number, number, number],
    /** On ground, post-slide seam teleports fight steady wall slides every tick → camera shake. */
    onGround: boolean,
  ) => {
    let origin: [number, number, number] = [...origOrigin];
    let velocity: [number, number, number] = [...origVel];
    const primal_velocity: [number, number, number] = [...origVel];
    const planes: [number, number, number][] = [];
    let time_left = frametime;

    const pushClipPlane = (n: [number, number, number]) => {
      for (let k = 0; k < planes.length; k++) {
        if (Math.abs(dot(n, planes[k]!)) > 0.994) {
          planes[k] = n;
          return;
        }
      }
      if (planes.length >= MAX_CLIP_PLANES) planes.shift();
      planes.push(n);
    };

    for (let bumpcount = 0; bumpcount < 6; bumpcount++) {
      const end = add(origin, scale(velocity, time_left));
      const tr = env.trace(origin, params.mins, params.maxs, end);
      if (tr.allsolid) {
        velocity[1] = 0;
        break;
      }
      if (tr.fraction > 0) {
        origin = [
          origin[0] + (end[0] - origin[0]) * tr.fraction,
          origin[1] + (end[1] - origin[1]) * tr.fraction,
          origin[2] + (end[2] - origin[2]) * tr.fraction,
        ];
        if (tr.fraction >= PLANE_STACK_CLEAR_FRAC) planes.length = 0;
      }
      if (tr.fraction >= 1 - 1e-7) break;

      time_left -= time_left * tr.fraction;

      const pn = Math.hypot(tr.planeNormal[0], tr.planeNormal[1], tr.planeNormal[2]);
      if (pn < 1e-5) {
        time_left = 0;
        break;
      }
      const n: [number, number, number] = [
        tr.planeNormal[0] / pn,
        tr.planeNormal[1] / pn,
        tr.planeNormal[2] / pn,
      ];
      // Overlap / grazing hit: pop the hull a few mm along ±impact normal so the next bump isn't stuck at fraction 0.
      if (!tr.allsolid && (tr.startsolid || tr.fraction < 1e-5)) {
        let popped = false;
        const pv = primal_velocity;
        const vDot = dot(pv, n);
        /** Prefer the side that moves out of the hit first when both ±n are numerically free (reduces flip-flop). */
        const preferS: 1 | -1 = vDot < -1e-4 ? 1 : -1;
        for (const step of [0.055, 0.11, 0.17] as const) {
          for (const sg of [preferS, (-preferS as 1 | -1)] as const) {
            const px = origin[0] + n[0] * step * sg;
            const py = origin[1] + n[1] * step * sg;
            const pz = origin[2] + n[2] * step * sg;
            const q = env.trace([px, py, pz], params.mins, params.maxs, [px, py, pz]);
            if (!q.startsolid && !q.allsolid) {
               origin = [px, py, pz];
               popped = true;
               break;
            }
          }
          if (popped) break;
        }
      }
      pushClipPlane(n);

      // `PM_StepSlideMove_`: try clipping against each contacted plane; if no single-plane solution, slide along
      // the crease of two planes (corner). Our old `dot(vel, lastPlane) < 0` zeroed velocity and caused corner glue.
      let i = 0;
      for (; i < planes.length; i++) {
        velocity = clipVelocity(velocity, planes[i]!, 1.01);
        let j = 0;
        for (; j < planes.length; j++) {
          if (j === i) continue;
          // Match stock `< 0`; a too-tight epsilon was firing false "into plane" reads after clipVelocity.
          if (dot(velocity, planes[j]!) < 0) break;
        }
        if (j === planes.length) break;
      }
      if (i === planes.length) {
        if (planes.length < 2) {
          velocity = [velocity[0] * 0.42, velocity[1] * 0.42, velocity[2] * 0.42];
          break;
        }
        // With 3+ planes (micro-slides without clearing the stack) `planes[0]`×`planes[1]` can be ~0 even in a
        // real corner — pick the pair with the strongest cross product (true crease direction).
        let bestA = 0;
        let bestB = 1;
        let bestCl = -1;
        for (let a = 0; a < planes.length; a++) {
          for (let b = a + 1; b < planes.length; b++) {
            const q0 = planes[a]!;
            const q1 = planes[b]!;
            const bx = q0[1] * q1[2] - q0[2] * q1[1];
            const by = q0[2] * q1[0] - q0[0] * q1[2];
            const bz = q0[0] * q1[1] - q0[1] * q1[0];
            const bl = Math.hypot(bx, by, bz);
            if (bl > bestCl) {
              bestCl = bl;
              bestA = a;
              bestB = b;
            }
          }
        }
        if (bestCl < 1e-5) {
          velocity = [velocity[0] * 0.35, velocity[1] * 0.35, velocity[2] * 0.35];
          break;
        }
        const p0 = planes[bestA]!;
        const p1 = planes[bestB]!;
        const cx = p0[1] * p1[2] - p0[2] * p1[1];
        const cy = p0[2] * p1[0] - p0[0] * p1[2];
        const cz = p0[0] * p1[1] - p0[1] * p1[0];
        const cl = bestCl;
        const ux = cx / cl;
        const uy = cy / cl;
        const uz = cz / cl;
        const along = dot(velocity, [ux, uy, uz]);
        velocity = [ux * along, uy * along, uz * along];
      }

      // Stock uses `<= 0` to kill oscillations; after a corner clip the residual can slightly oppose `primal`
      // while still being a valid escape along a crease — damp instead of snapping to zero mid-jump.
      const dp = dot(velocity, primal_velocity);
      if (dp <= 0) {
        const damp = 0.65;
        velocity = [velocity[0] * damp, velocity[1] * damp, velocity[2] * damp];
        break;
      }
    }

    const v0 = len(origVel);
    const v1 = len(velocity);
    const horiz0 = Math.hypot(origVel[0], origVel[2]);
    // Grounded wall/corner slides often end with v1 in ~15–35 while still pushing — unstick then ran every frame
    // and jumped `origin` by ~1+ units (first free probe) → camera shake. Only run in air or when nearly stopped.
    if (
      !onGround &&
      v1 < 38 &&
      v0 > 40 &&
      (horiz0 > 48 || Math.abs(origVel[1]) > 38)
    ) {
      const unstuck = trySlideCornerUnstick(env, params, origin);
      if (unstuck) {
         const ox = unstuck[0] - origOrigin[0];
         const oz = unstuck[2] - origOrigin[2];
         const oy = unstuck[1] - origOrigin[1];
         const horiz = Math.hypot(ox, oz);
         if (horiz > 0.06) {
            // Position-only: horizontal velocity kicks here fought steady wall contact each frame → view jitter.
            origin = unstuck;
         } else if (oy > 0.4) {
            origin = unstuck;
            velocity[1] = Math.max(velocity[1], Math.min(52, velocity[1] + 10));
         }
      }
    }

    return { origin, velocity };
  };

  const down_o = slide(start_o, start_v, state.onGround);

  // Step-slide assumes mostly horizontal motion; strong vertical (jump / fast fall) + corner geometry can
  // pick the "up then down" path that replaces a good `down_o` slide with a worse result.
  if (Math.abs(start_v[1]) > 72) {
    state.origin = [...down_o.origin];
    state.velocity = [...down_o.velocity];
    return;
  }

  const up: [number, number, number] = [start_o[0], start_o[1] + STEPSIZE, start_o[2]];
  const trUp = env.trace(up, params.mins, params.maxs, up);
  // Raised hull must be free (not only `!allsolid`): `startsolid` under a sloped low ceiling + corner
  // used to still run the step-up slide and wedge the player.
  if (!trUp.allsolid && !trUp.startsolid) {
    const b1 = slide(up, start_v, state.onGround);
    const hullAtB1 = env.trace(b1.origin, params.mins, params.maxs, b1.origin);
    if (hullAtB1.startsolid || hullAtB1.allsolid) {
      state.origin = [...down_o.origin];
      state.velocity = [...down_o.velocity];
      return;
    }
    const down: [number, number, number] = [b1.origin[0], b1.origin[1] - STEPSIZE, b1.origin[2]];
    const trDown = env.trace(b1.origin, params.mins, params.maxs, down);
    const steppedOrigin = trDown.allsolid ? b1.origin : trDown.endpos;

    const down_dist =
      (down_o.origin[0] - start_o[0]) * (down_o.origin[0] - start_o[0]) +
      (down_o.origin[2] - start_o[2]) * (down_o.origin[2] - start_o[2]);
    const up_dist =
      (steppedOrigin[0] - start_o[0]) * (steppedOrigin[0] - start_o[0]) +
      (steppedOrigin[2] - start_o[2]) * (steppedOrigin[2] - start_o[2]);

    const nLenD = Math.hypot(trDown.planeNormal[0], trDown.planeNormal[1], trDown.planeNormal[2]);
    const downNy = nLenD > 0.08 ? trDown.planeNormal[1] / nLenD : 0;
    if (down_dist > up_dist || downNy < MIN_STEP_NORMAL) {
      state.origin = [...down_o.origin];
      state.velocity = [...down_o.velocity];
      return;
    }
    state.origin = [...steppedOrigin];
    state.velocity = [...b1.velocity];
    state.velocity[1] = down_o.velocity[1];
    return;
  }

  state.origin = [...down_o.origin];
  state.velocity = [...down_o.velocity];
}

/** `PM_CatagorizePosition` — ground probe only (water level comes from caller). */
function categorizePosition(state: PmState, env: PmEnv, params: PmParams) {
  const end: [number, number, number] = [state.origin[0], state.origin[1] - 0.25, state.origin[2]];
  if (state.velocity[1] > 180) {
    state.onGround = false;
    return;
  }
  const tr = env.trace(state.origin, params.mins, params.maxs, end);
  const noHit = tr.fraction >= 1 && !tr.startsolid && !tr.allsolid;
  if (noHit) {
    state.onGround = false;
    return;
  }
  const nLen = Math.hypot(tr.planeNormal[0], tr.planeNormal[1], tr.planeNormal[2]);
  if (nLen < 0.1) {
    state.onGround = false;
    return;
  }
  if (tr.planeNormal[1] < 0.7 && !tr.startsolid) {
    state.onGround = false;
    return;
  }
  state.onGround = true;
}

/** `PM_CheckJump` — `upmove` threshold 10 in stock; we use boolean `jump`. */
function checkJump(state: PmState, cmd: PmCmd, waterLevel: number, swimKickVel: number) {
  if (!cmd.jump) {
    state.jumpHeld = false;
    return;
  }
  if (state.jumpHeld) return;

  if (waterLevel >= 2) {
    state.onGround = false;
    if (state.velocity[1] <= -300) return;
    // Stock Q2 assigns ~100; that is weak for surfacing with our Y-up water move — add a clear breakout impulse.
    const breakout = swimKickVel >= 95 ? 175 : swimKickVel >= 78 ? 140 : 110;
    state.velocity[1] = Math.min(320, Math.max(state.velocity[1], swimKickVel) + breakout);
    return;
  }

  if (!state.onGround) return;

  state.jumpHeld = true;
  state.onGround = false;
  state.velocity[1] += pm_jumpvel;
  if (state.velocity[1] < pm_jumpvel) state.velocity[1] = pm_jumpvel;
}

/** `PM_WaterMove` */
function waterMove(
  state: PmState,
  cmd: PmCmd,
  env: PmEnv,
  params: PmParams,
  frametime: number,
  forward: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  const fmove = cmd.forwardmove;
  const smove = cmd.sidemove;
  let wishvel: [number, number, number] = [
    forward[0] * fmove + right[0] * smove,
    forward[1] * fmove + right[1] * smove,
    forward[2] * fmove + right[2] * smove,
  ];
  if (!fmove && !smove && !cmd.upmove) wishvel[1] -= 60;
  else wishvel[1] += cmd.upmove;

  let wishspeed = len(wishvel);
  if (wishspeed > pm_waterspeed) {
    wishvel = scale(wishvel, pm_waterspeed / wishspeed);
    wishspeed = pm_waterspeed;
  }
  wishspeed *= 0.5;

  let wishdir = wishspeed > 1e-4 ? normalize(wishvel) : ([0, 0, 0] as [number, number, number]);
  let ws = wishspeed;
  if (ws > 1e-4) {
    const wClip = clipWishAgainstTouchingVerticalWall(env, params, state.origin, wishdir, ws);
    wishdir = wClip.wishdir;
    ws = wClip.wishspeed;
    accelerate(state, wishdir, ws, pm_wateraccelerate, frametime);
  }

  stepSlideMove(state, env, params, frametime);
}

/** `PM_AirMove` (no ladder / currents / duck / negative gravity). */
function airMove(
  state: PmState,
  cmd: PmCmd,
  env: PmEnv,
  params: PmParams,
  frametime: number,
  forward: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  const fmove = cmd.forwardmove;
  const smove = cmd.sidemove;
  const wishvel: [number, number, number] = [
    forward[0] * fmove + right[0] * smove,
    0,
    forward[2] * fmove + right[2] * smove,
  ];
  let wishdir = normalize(wishvel);
  let wishspeed = len(wishvel);

  const maxspeed = pm_maxspeed;
  if (wishspeed > maxspeed) {
    const w = scale(wishvel, maxspeed / wishspeed);
    wishspeed = maxspeed;
    wishdir = normalize(w);
  }

  if (state.onGround) {
    state.velocity[1] = 0;
    const gClip = clipWishAgainstTouchingVerticalWall(env, params, state.origin, wishdir, wishspeed);
    wishdir = gClip.wishdir;
    wishspeed = gClip.wishspeed;
    accelerate(state, wishdir, wishspeed, pm_accelerate, frametime);
    if (params.gravity > 0) state.velocity[1] = 0;
    else state.velocity[1] -= params.gravity * frametime;
    // Stock Q2 skips `PM_StepSlideMove` when horizontal vel is 0 — but then wedged against a wall with
    // zero speed after friction/clips never runs slide again ("stuck on every wall"). Only skip when truly
    // idle: no wish and no horizontal motion (avoids degenerate zero-length traces when standing).
    const hz2 = state.velocity[0] * state.velocity[0] + state.velocity[2] * state.velocity[2];
    if (hz2 < 1e-12 && wishspeed < 1e-4) return;
    stepSlideMove(state, env, params, frametime);
    applyGroundHullPinUnstick(state, env, params, cmd);
  } else {
    const aClip = clipWishAgainstTouchingVerticalWall(env, params, state.origin, wishdir, wishspeed);
    wishdir = aClip.wishdir;
    wishspeed = aClip.wishspeed;
    if (pm_airaccelerate) airAccelerate(state, wishdir, wishspeed, pm_accelerate, frametime);
    else accelerate(state, wishdir, wishspeed, 1, frametime);
    state.velocity[1] -= params.gravity * frametime;
    const vPre = [state.velocity[0], state.velocity[1], state.velocity[2]] as [number, number, number];
    stepSlideMove(state, env, params, frametime);
    applyAirCornerUnstick(state, env, params, cmd, vPre);
  }
}

export function pmove(state: PmState, cmd: PmCmd, env: PmEnv, params: PmParams) {
  const msec = Math.max(1, Math.min(50, cmd.msec | 0));
  const frametime = msec * 0.001;
  const waterLevel = params.waterLevel ?? 0;
  const swimKickVel = params.swimKickVel ?? 100;

  const { forward, right } = movementBasisFromView(cmd.yawRad, cmd.pitchRad ?? 0);

  categorizePosition(state, env, params);
  checkJump(state, cmd, waterLevel, swimKickVel);
  pmFriction(state, frametime, waterLevel, state.onGround);

  if (waterLevel >= 2) waterMove(state, cmd, env, params, frametime, forward, right);
  else airMove(state, cmd, env, params, frametime, forward, right);

  categorizePosition(state, env, params);
}
