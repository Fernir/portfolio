/** Decode Quake II `.wal` (indexed mip0 + shared VGA palette from game `pics/colormap.pcx`). */

export type WalImage = { width: number; height: number; rgba: Uint8ClampedArray };

/** WAL mip0 width/height from header only (for UV scale when full decode fails). */
export function peekWalDimensions(buf: ArrayBuffer): { width: number; height: number } | null {
   if (buf.byteLength < 40) return null;
   const dv = new DataView(buf);
   const w = dv.getUint32(32, true);
   const h = dv.getUint32(36, true);
   if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 2048 || h > 2048) return null;
   return { width: w, height: h };
}

/**
 * RGB triplets (256×3) from pak `pics/colormap.pcx` tail — WAL indices reference this, not bytes after mips.
 * (Retail WALs end exactly after mip3; older decoders using `length - 768` read inside mip data → rainbow garbage.)
 */
const Q2_PALETTE_B64 =
   'AAAADw8PHx8fLy8vPz8/S0tLW1tba2tre3t7i4uLm5ubq6uru7u7y8vL29vb6+vrY0sjW0MfUz8fTzsbRzcbPy8XOysXMycTLyMTKx8TJxsPIxcPGxMLFw8LEw8HDwsHX19vW1tnW1NfV09bU0tTT0dLRz9DPzs7Ozc3My8vLysrJycnIyMjGxsbFxcXExMTj3dTe2NDc1s7Z08vz5dLp3s7i2cvb1Mn658ny4sjr3cfk2Mbd08XWzsPPycLIxcHpzsrny8jlysbiycTfx8PcxcLZxcHVxMASw8AQw8AOw8AMwsAKwsAIwsAGwcAEwcAe19Lc1dDa1M/Z087X0c3V0MzUz8vSzcrQzMnPy8jNycbLyMXJxsTHxcPFw8LDwsHbzsXXzcXUy8XQysXNyMTJxsPGxMLDwsHs1tPv3tvy5uT17u3y9ffs8fTn7fDh6e3c5enW4ebR3eLL2d/F1NvE0tnD0NbCz9TBzdLBy8/ByczAB8rABcfAA8TAAcLAAAAi1dXg09Pe0dHc0NDazs7YzMzWy8vVysrSyMjPx8fMxsbKxMTHw8PEwsLCwcHAAAAl597j5dzh4trf4Njd3tfc3NXa2tPY2NHW1tDT087Q0MzNzcrLy8jIyMbFxcTDw8Ln0s/k0M3izsvfzcndy8jaysbYyMXVx8TTxsPQxcLNxMLKw8HHwsHFwcACwAAAAAAd3vPb3PDZ2u3Y2OnW1ubU1ePS09/R0dzPz9nNzdXLy9LJyc/Ix8vGxcjEw8XCwcHm6t7j59vh5dje4tXc4NLZ3dDX287V2czS1snP08bN0MTLzsLIy8HGyMAExcACw8AAP8AI+cPP9MbU7snX6cvX48zX3sz///////T//+n//9///9T//8n/+sf/9cX/78P/6sH/5MA738A42sA01cAx0cAtzsAqysAmx8AjxcAfw8AcwcAXwAARwAALwAAGwAA7wAANzf//wAAAAD/KysjGxsXExMP65d/w3NTn1czez8b69PHx6ubp4t3h2tXn1tT';

let q2PaletteRgb: Uint8Array | null = null;

function sharedQ2Palette(): Uint8Array {
   if (!q2PaletteRgb) {
      const g = globalThis as { atob?: (data: string) => string };
      if (typeof g.atob !== 'function') {
         throw new Error('globalThis.atob is required to decode embedded Q2 palette (browser or Node 18+)');
      }
      const bin = g.atob(Q2_PALETTE_B64);
      q2PaletteRgb = new Uint8Array(768);
      for (let i = 0; i < 768; i++) q2PaletteRgb[i] = bin.charCodeAt(i);
      if (q2PaletteRgb.length !== 768) throw new Error('Q2 palette corrupt');
   }
   return q2PaletteRgb;
}

export function decodeWalBuffer(buf: ArrayBuffer): WalImage | null {
   if (buf.byteLength < 56) return null;
   const dv = new DataView(buf);
   const w = dv.getUint32(32, true);
   const h = dv.getUint32(36, true);
   const offs = [0, 1, 2, 3].map((i) => dv.getUint32(40 + i * 4, true));
   const o0 = offs[0]!;
   const mipSizes = [0, 1, 2, 3].map((i) => Math.max(1, w >> i) * Math.max(1, h >> i));
   const mip0 = mipSizes[0]!;
   const lastMipEnd = offs[3]! + mipSizes[3]!;

   if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || w > 2048 || h < 1 || h > 2048) return null;
   if (o0 < 0 || mip0 < 1 || o0 + mip0 > buf.byteLength || lastMipEnd > buf.byteLength) return null;

   let pal: Uint8Array;
   if (buf.byteLength >= lastMipEnd + 768) {
      pal = new Uint8Array(buf, lastMipEnd, 768);
   } else {
      pal = sharedQ2Palette();
   }

   const indices = new Uint8Array(buf, o0, mip0);
   const rgba = new Uint8ClampedArray(mip0 * 4);
   for (let i = 0; i < mip0; i++) {
      const p = indices[i]!;
      const pi = p * 3;
      const j = i * 4;
      rgba[j] = pal[pi]!;
      rgba[j + 1] = pal[pi + 1]!;
      rgba[j + 2] = pal[pi + 2]!;
      rgba[j + 3] = 255;
   }
   return { width: w, height: h, rgba };
}
