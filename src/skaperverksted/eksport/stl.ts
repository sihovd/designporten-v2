/**
 * Binary STL writer. STL has no units, colours or parts; by convention
 * slicers read the numbers as millimetres, which is what we store.
 * All parts are written into one file (use 3MF to keep colours apart).
 */
import type { ModellDel } from '../geometri/mesh';

export function tilStl(deler: ModellDel[], tittel = 'Designporten Skaperverksted'): Uint8Array {
  const antall = deler.reduce((n, d) => n + d.mesh.indekser.length / 3, 0);
  const buf = new ArrayBuffer(84 + antall * 50);
  const v = new DataView(buf);
  const hode = new TextEncoder().encode(tittel.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(hode);
  v.setUint32(80, antall, true);
  let o = 84;
  for (const d of deler) {
    const p = d.mesh.posisjoner;
    const ix = d.mesh.indekser;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3,
        b = ix[t + 1]! * 3,
        c = ix[t + 2]! * 3;
      const ux = p[b]! - p[a]!,
        uy = p[b + 1]! - p[a + 1]!,
        uz = p[b + 2]! - p[a + 2]!;
      const wx = p[c]! - p[a]!,
        wy = p[c + 1]! - p[a + 1]!,
        wz = p[c + 2]! - p[a + 2]!;
      let nx = uy * wz - uz * wy,
        ny = uz * wx - ux * wz,
        nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (const x of [nx, ny, nz]) {
        v.setFloat32(o, x, true);
        o += 4;
      }
      for (const i of [a, b, c]) {
        v.setFloat32(o, p[i]!, true);
        v.setFloat32(o + 4, p[i + 1]!, true);
        v.setFloat32(o + 8, p[i + 2]!, true);
        o += 12;
      }
      v.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Read a binary STL back (tests and import). */
export function lesStl(data: Uint8Array): { posisjoner: Float32Array; indekser: Uint32Array } {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = v.getUint32(80, true);
  if (84 + n * 50 !== data.byteLength) throw new Error('Ugyldig binær STL.');
  const pos = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k++) pos[t * 9 + k] = v.getFloat32(o + k * 4, true);
  }
  const ix = new Uint32Array(n * 3);
  for (let i = 0; i < ix.length; i++) ix[i] = i;
  return { posisjoner: pos, indekser: ix };
}
