/**
 * Quake / Quake II–style animated lightmaps: each surface references up to 4
 * `style` indices; the engine maps an index to a looping lowercase pattern
 * (brightness per character). Defaults match classic Quake defaults where maps
 * omit custom strings in entities (common for Q2DM).
 *
 * @see id Software Quake `r_light.c` default `r_lightstyle[]` table (concept).
 */

const DEFAULT_STYLE_STRINGS: (string | undefined)[] = (() => {
   const a: (string | undefined)[] = new Array(64).fill(undefined);
   /* Index 0 — full bright strip (maps often use style 0 as “steady”). */
   a[0] = 'm';
   a[1] = 'mmnmmommommnonmmommom';
   a[2] = 'abcdefghijklmnopqrstuvwxyzyxwvutsrqponmlkjihgfedcba';
   a[3] = 'mmamammmmmmmama';
   a[4] = 'mmmmmaaaaammmmmaaaaaaaaammmm';
   a[5] = 'mmamammmamammmamammm';
   a[6] = 'mmamammmmmmmama';
   a[7] = 'mmamammmamammmamammm';
   a[8] = 'mmmmmmmmmmmmmmmm';
   a[9] = 'mmamammmamammmamammm';
   a[10] = 'mamamamamama';
   a[11] = 'mmamammmmmmmama';
   a[12] = 'mmaaaaaaaaaaaaama';
   return a;
})();

/** Optional per-index pattern from BSP `entities` (numeric key as string). */
export type Q2LightstyleTable = { patterns: (string | undefined)[] };

/** e.g. `"lightstyle3" "mmmmmaaaaammmmmaaaaaaaaammmm"` (rare in shipped maps). */
const RE_LIGHTSTYLE_KEY = /"lightstyle(\d{1,2})"\s+"([^"]+)"/gi;

/**
 * Pull optional `"lightstyleN" "pattern..."` from the entities lump.
 * Indices 0–63; later keys override earlier.
 */
export function parseLightstylePatternsFromEntities(entBlob: string): Q2LightstyleTable {
   const patterns: (string | undefined)[] = new Array(64).fill(undefined);
   let m: RegExpExecArray | null;
   const re = new RegExp(RE_LIGHTSTYLE_KEY.source, RE_LIGHTSTYLE_KEY.flags);
   while ((m = re.exec(entBlob)) !== null) {
      const idx = Number.parseInt(m[1]!, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx > 63) continue;
      const raw = m[2]!.trim().toLowerCase();
      if (raw.length > 0) patterns[idx] = raw;
   }
   return { patterns };
}

/** Resolve pattern for style index: entity override → built-in → steady full. */
export function resolveLightstylePattern(table: Q2LightstyleTable, styleIndex: number): string {
   const fromEnt = table.patterns[styleIndex];
   if (fromEnt && fromEnt.length > 0) return fromEnt;
   const def = DEFAULT_STYLE_STRINGS[styleIndex];
   if (def && def.length > 0) return def;
   return 'm';
}

/**
 * Brightness multiplier ~Quake: letters 'a'..'m' ≈ dark..bright, faster than 'n'..'z'.
 * Cycles through the pattern at ~10 chars/sec like ref_gl.
 */
export function sampleLightstyleMultiplier(pattern: string, timeSec: number): number {
   if (!pattern.length) return 1;
   const rate = 10;
   const pos = Math.floor((timeSec * rate) % pattern.length);
   const ch = pattern.charCodeAt(pos);
   let v = ch - 97; // 'a'
   if (v < 0) v = 0;
   if (v > 25) v = 25;
   /* 'a'≈0, 'm'≈1, continue ramp for n–z (slightly hotter for flicker tails). */
   const t = v <= 12 ? v / 12 : 0.92 + (v - 12) / 130;
   return Math.min(1.35, Math.max(0, t));
}

/** Fill `out[i]` = multiplier for style `i` at `timeSec`. */
export function buildLightstyleScalars(
   table: Q2LightstyleTable,
   timeSec: number,
   out: Float32Array,
): void {
   for (let i = 0; i < 64; i++) {
      const pat = resolveLightstylePattern(table, i);
      out[i] = sampleLightstyleMultiplier(pat, timeSec);
   }
}
