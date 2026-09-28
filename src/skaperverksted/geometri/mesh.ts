/**
 * Triangle meshes in millimetres (X right, Y back, Z up), counter-clockwise
 * winding seen from outside. Shared by the 3D preview and the exporters.
 */

export interface Mesh {
  /** xyz per vertex, mm. */
  posisjoner: Float32Array;
  /** Three vertex indices per triangle. */
  indekser: Uint32Array;
}

/** A printable part: one mesh with one material. */
export interface ModellDel {
  id: string;
  navn: string;
  materialId: string;
  mesh: Mesh;
}

export class MeshBygger {
  private p: number[] = [];
  private i: number[] = [];

  get antallPunkter(): number {
    return this.p.length / 3;
  }

  punkt(x: number, y: number, z: number): number {
    this.p.push(x, y, z);
    return this.p.length / 3 - 1;
  }

  trekant(a: number, b: number, c: number): void {
    if (a === b || b === c || a === c) return;
    this.i.push(a, b, c);
  }

  firkant(a: number, b: number, c: number, d: number): void {
    this.trekant(a, b, c);
    this.trekant(a, c, d);
  }

  leggTil(m: Mesh): void {
    const forskyv = this.antallPunkter;
    for (const v of m.posisjoner) this.p.push(v);
    for (const v of m.indekser) this.i.push(v + forskyv);
  }

  bygg(): Mesh {
    return { posisjoner: new Float32Array(this.p), indekser: new Uint32Array(this.i) };
  }
}

export function slaSammenMesh(meshes: Mesh[]): Mesh {
  const b = new MeshBygger();
  for (const m of meshes) b.leggTil(m);
  return b.bygg();
}

/** Signed volume in mm³ (positive for outward-facing closed meshes). */
export function volum(m: Mesh): number {
  const p = m.posisjoner;
  let v = 0;
  for (let t = 0; t < m.indekser.length; t += 3) {
    const a = m.indekser[t]! * 3;
    const b = m.indekser[t + 1]! * 3;
    const c = m.indekser[t + 2]! * 3;
    v +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6;
  }
  return v;
}

export interface Boks3 {
  min: [number, number, number];
  maks: [number, number, number];
}

export function avgrensning(m: Mesh): Boks3 {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const maks: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const p = m.posisjoner;
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[i + k]!);
      maks[k] = Math.max(maks[k]!, p[i + k]!);
    }
  }
  return { min, maks };
}

/**
 * Merge vertices that share a position (within `toleranse` mm) and report
 * whether every edge is shared by exactly two triangles in opposite
 * directions (closed, consistently oriented, 2-manifold).
 */
export function sjekkManifold(
  m: Mesh,
  toleranse = 1e-4,
): { lukket: boolean; aapneKanter: number; feilKanter: number } {
  const p = m.posisjoner;
  const kart = new Map<string, number>();
  const felles = new Uint32Array(p.length / 3);
  const q = 1 / toleranse;
  for (let i = 0; i < p.length / 3; i++) {
    const k = `${Math.round(p[i * 3]! * q)},${Math.round(p[i * 3 + 1]! * q)},${Math.round(p[i * 3 + 2]! * q)}`;
    let id = kart.get(k);
    if (id === undefined) {
      id = kart.size;
      kart.set(k, id);
    }
    felles[i] = id;
  }
  const kanter = new Map<string, number>();
  const ix = m.indekser;
  for (let t = 0; t < ix.length; t += 3) {
    const v = [felles[ix[t]!]!, felles[ix[t + 1]!]!, felles[ix[t + 2]!]!];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e++) {
      const a = v[e]!;
      const b = v[(e + 1) % 3]!;
      const nokkel = `${a}>${b}`;
      kanter.set(nokkel, (kanter.get(nokkel) ?? 0) + 1);
    }
  }
  let aapne = 0;
  let feil = 0;
  for (const [nokkel, n] of kanter) {
    const [a, b] = nokkel.split('>');
    const mot = kanter.get(`${b}>${a}`) ?? 0;
    if (n > 1) feil += n - 1;
    if (mot === 0) aapne++;
  }
  return { lukket: aapne === 0 && feil === 0, aapneKanter: aapne, feilKanter: feil };
}
