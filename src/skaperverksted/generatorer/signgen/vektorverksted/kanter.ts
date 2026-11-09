/**
 * Vektorverksted, step 2: the borders between regions, each traced once.
 *
 * A border runs along pixel edges («cracks») between two pixels with
 * different labels. The corners where three or more regions meet are
 * nodes; the cracks between two nodes form one chain, which has one region
 * on its left and one on its right. Every chain is later fitted with curves
 * once, and both regions use that same curve, so neighbours share their
 * border exactly: no overlap and no gap.
 *
 * Coordinates are pixel corners: pixel (x, y) covers [x, x + 1] × [y, y + 1].
 * Directions: 0 = east, 1 = south, 2 = west, 3 = north (y points down).
 * The left side of a direction is the side reached by turning towards north
 * from east, i.e. (dx, dy) → (dy, -dx).
 */

export interface Kjede {
  /** Pixel-corner points, start and end included (a closed chain does not repeat its start). */
  punkter: number[];
  /** Region on the left / right when walking the chain, -1 = nothing. */
  venstre: number;
  hoyre: number;
  /** Start and end node (vertex index), -1 for a closed loop without nodes. */
  fra: number;
  til: number;
  /** Direction of the first and the last crack. */
  forsteRetning: number;
  sisteRetning: number;
  lukket: boolean;
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** Label of a pixel, -1 outside the image. */
function lab(e: Int32Array, w: number, h: number, x: number, y: number): number {
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : e[y * w + x]!;
}

/** Left and right pixel of the crack leaving corner (i, j) in direction d. */
function sider(e: Int32Array, w: number, h: number, i: number, j: number, d: number): [number, number] {
  switch (d) {
    case 0:
      return [lab(e, w, h, i, j - 1), lab(e, w, h, i, j)];
    case 1:
      return [lab(e, w, h, i, j), lab(e, w, h, i - 1, j)];
    case 2:
      return [lab(e, w, h, i - 1, j), lab(e, w, h, i - 1, j - 1)];
    default:
      return [lab(e, w, h, i - 1, j - 1), lab(e, w, h, i, j - 1)];
  }
}

/** Index of the crack leaving corner (i, j) in direction d, for the visited marks. */
function sprekk(w: number, h: number, i: number, j: number, d: number): number {
  // horizontal cracks: (w) × (h + 1), then vertical: (w + 1) × h
  switch (d) {
    case 0:
      return j * w + i;
    case 2:
      return j * w + i - 1;
    case 1:
      return w * (h + 1) + j * (w + 1) + i;
    default:
      return w * (h + 1) + (j - 1) * (w + 1) + i;
  }
}

/** All chains of a label image. */
export function finnKjeder(etikett: Int32Array, w: number, h: number): Kjede[] {
  const finnes = (i: number, j: number, d: number) => {
    const [a, b] = sider(etikett, w, h, i, j, d);
    return a !== b;
  };
  const grad = (i: number, j: number) => {
    let g = 0;
    for (let d = 0; d < 4; d++) if (finnes(i, j, d)) g++;
    return g;
  };
  const W = w + 1;
  const erNode = new Uint8Array(W * (h + 1));
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) if (grad(i, j) > 2) erNode[j * W + i] = 1;
  const besokt = new Uint8Array(w * (h + 1) + (w + 1) * h);
  const kjeder: Kjede[] = [];

  /** Walks from corner (i, j) in direction d until a node, or back to the start. */
  const gaa = (i0: number, j0: number, d0: number): Kjede => {
    const [venstre, hoyre] = sider(etikett, w, h, i0, j0, d0);
    const punkter = [i0, j0];
    let i = i0,
      j = j0,
      d = d0;
    let siste: number;
    for (;;) {
      besokt[sprekk(w, h, i, j, d)] = 1;
      i += DX[d]!;
      j += DY[d]!;
      siste = d;
      if (erNode[j * W + i] || (i === i0 && j === j0)) break;
      punkter.push(i, j);
      // the other crack at this corner, keeping the same left side
      const tilbake = (d + 2) % 4;
      let neste = -1;
      for (const k of [(d + 3) % 4, d, (d + 1) % 4]) {
        if (k === tilbake || !finnes(i, j, k)) continue;
        const [v] = sider(etikett, w, h, i, j, k);
        if (v === venstre) {
          neste = k;
          break;
        }
      }
      if (neste < 0) break; // cannot happen in a consistent label image
      d = neste;
    }
    const lukket = !erNode[j * W + i] && i === i0 && j === j0;
    if (!lukket) punkter.push(i, j);
    return {
      punkter,
      venstre,
      hoyre,
      fra: lukket ? -1 : j0 * W + i0,
      til: lukket ? -1 : j * W + i,
      forsteRetning: d0,
      sisteRetning: siste,
      lukket,
    };
  };

  for (let j = 0; j <= h; j++) {
    for (let i = 0; i <= w; i++) {
      if (!erNode[j * W + i]) continue;
      for (let d = 0; d < 4; d++) {
        if (!finnes(i, j, d) || besokt[sprekk(w, h, i, j, d)]) continue;
        kjeder.push(gaa(i, j, d));
      }
    }
  }
  // loops without nodes: the outline of a region that touches only one other
  for (let j = 0; j <= h; j++) {
    for (let i = 0; i <= w; i++) {
      for (const d of [0, 1]) {
        if (!finnes(i, j, d) || besokt[sprekk(w, h, i, j, d)]) continue;
        kjeder.push(gaa(i, j, d));
      }
    }
  }
  return kjeder;
}

/** One use of a chain in a region's ring: forwards or backwards. */
export interface Kjedebruk {
  kjede: number;
  bakover: boolean;
}

/** The pieces of a chain the ring builder needs. */
export interface Kjedeende {
  venstre: number;
  hoyre: number;
  fra: number;
  til: number;
  forsteRetning: number;
  sisteRetning: number;
  lukket: boolean;
}

/**
 * The rings of every region, built from the chains: each chain that has the
 * region on its left is used forwards, on its right backwards, and they are
 * joined end to start. Where a region touches a node twice (two of its
 * pixels meet only at a corner), the tightest left turn is taken, which
 * matches the 4-neighbourhood the regions were found with.
 */
export function byggRinger(kjeder: Kjedeende[], antallRegioner: number): Kjedebruk[][][] {
  const ringer: Kjedebruk[][][] = Array.from({ length: antallRegioner }, () => []);
  type Bruk = { kjede: number; bakover: boolean; fra: number; til: number; inn: number; ut: number };
  const perRegion: Bruk[][] = Array.from({ length: antallRegioner }, () => []);
  kjeder.forEach((k, idx) => {
    if (k.lukket) {
      if (k.venstre >= 0) ringer[k.venstre]!.push([{ kjede: idx, bakover: false }]);
      if (k.hoyre >= 0) ringer[k.hoyre]!.push([{ kjede: idx, bakover: true }]);
      return;
    }
    if (k.venstre >= 0)
      perRegion[k.venstre]!.push({
        kjede: idx,
        bakover: false,
        fra: k.fra,
        til: k.til,
        ut: k.forsteRetning,
        inn: k.sisteRetning,
      });
    if (k.hoyre >= 0)
      perRegion[k.hoyre]!.push({
        kjede: idx,
        bakover: true,
        fra: k.til,
        til: k.fra,
        ut: (k.sisteRetning + 2) % 4,
        inn: (k.forsteRetning + 2) % 4,
      });
  });
  perRegion.forEach((bruk, r) => {
    const fraNode = new Map<number, number[]>();
    bruk.forEach((b, i) => {
      const l = fraNode.get(b.fra);
      if (l) l.push(i);
      else fraNode.set(b.fra, [i]);
    });
    const brukt = new Uint8Array(bruk.length);
    for (let s = 0; s < bruk.length; s++) {
      if (brukt[s]) continue;
      const ring: Kjedebruk[] = [];
      let c = s;
      for (let vakt = 0; vakt <= bruk.length; vakt++) {
        brukt[c] = 1;
        const b = bruk[c]!;
        ring.push({ kjede: b.kjede, bakover: b.bakover });
        const kandidater = (fraNode.get(b.til) ?? []).filter((k) => !brukt[k] || k === s);
        if (!kandidater.length) break;
        // turn priority: left, straight, right, back
        const rang = (k: number) => {
          const sving = (bruk[k]!.ut - b.inn + 4) % 4; // 3 = left, 0 = straight, 1 = right, 2 = back
          return [1, 2, 3, 0][sving]!;
        };
        kandidater.sort((a, z) => rang(a) - rang(z));
        const neste = kandidater[0]!;
        if (neste === s) break;
        c = neste;
      }
      ringer[r]!.push(ring);
    }
  });
  return ringer;
}
