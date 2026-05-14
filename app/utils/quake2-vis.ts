/**
 * Quake II IBSP38 `LUMP_VISIBILITY` (`dvis_t` + compressed PVS rows).
 * Decompression matches `CM_DecompressVis` in `qcommon/cmodel.c`.
 */

export type Q2VisChunk = {
   /** BSP PVS cluster index (`dleaf_t::cluster`); `< 0` ⇒ always drawn. */
   cluster: number;
   /** First vertex index in the merged Float32 interleaved buffer (`Q2_VERT_STRIDE_FLOATS` floats per vertex). */
   first: number;
   /** Vertex count (multiple of 3 for triangles). */
   count: number;
};

export type Q2VisLumpInfo = {
   numClusters: number;
   rowBytes: number;
};

/** Validate header; `lump` is the raw `LUMP_VISIBILITY` bytes. */
export function parseQ2VisLumpInfo(lump: Uint8Array): Q2VisLumpInfo | null {
   if (lump.byteLength < 4) return null;
   const dv = new DataView(lump.buffer, lump.byteOffset, lump.byteLength);
   const numClusters = dv.getInt32(0, true);
   if (numClusters < 1 || numClusters > 65536) return null;
   const headerBytes = 4 + numClusters * 8;
   if (lump.byteLength < headerBytes) return null;
   const rowBytes = (numClusters + 7) >> 3;
   return { numClusters, rowBytes };
}

/**
 * Decompress PVS for `fromCluster` into `outRow` (length ≥ `rowBytes`).
 * `fromCluster < 0` or out of range ⇒ fill with `0xff` (everything visible).
 */
export function q2DecompressPvsRow(lump: Uint8Array, fromCluster: number, outRow: Uint8Array): void {
   const parsed = parseQ2VisLumpInfo(lump);
   if (!parsed) {
      outRow.fill(0xff);
      return;
   }
   const { numClusters, rowBytes } = parsed;
   if (outRow.length < rowBytes) return;
   if (fromCluster < 0 || fromCluster >= numClusters) {
      outRow.fill(0xff, 0, rowBytes);
      return;
   }
   const dv = new DataView(lump.buffer, lump.byteOffset, lump.byteLength);
   const pvsRel = dv.getInt32(4 + fromCluster * 8 + 0, true);
   if (pvsRel < 0 || pvsRel >= lump.byteLength) {
      outRow.fill(0xff, 0, rowBytes);
      return;
   }
   const inA = lump.subarray(pvsRel);
   let ip = 0;
   let op = 0;
   while (op < rowBytes) {
      if (ip >= inA.length) {
         /* Truncated vis stream — treat missing bits as visible so we do not blank the map. */
         outRow.fill(0xff, op, rowBytes);
         break;
      }
      const b = inA[ip++]!;
      if (b) {
         outRow[op++] = b;
      } else {
         let c = inA[ip++]!;
         if (op + c > rowBytes) {
            c = rowBytes - op;
         }
         while (c > 0) {
            outRow[op++] = 0;
            c--;
         }
      }
   }
   if (op < rowBytes) outRow.fill(0xff, op, rowBytes);
}

export function q2ClusterVisibleInPvs(pvsRow: Uint8Array, numClusters: number, targetCluster: number): boolean {
   if (targetCluster < 0) return true;
   if (targetCluster >= numClusters) return true;
   const i = targetCluster >> 3;
   if (i < 0 || i >= pvsRow.length) return true;
   return ((pvsRow[i]! >> (targetCluster & 7)) & 1) !== 0;
}
