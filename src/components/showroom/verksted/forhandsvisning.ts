/**
 * Previews of the generators for the showroom (the homepage portal
 * section and the Skaperverksted hub). Each preview is drawn from the
 * generator's own starting design, in millimetres, so what the visitor sees
 * is the kind of object the tool actually makes, at its real default size.
 * Functional programmatic geometry (D-3): outlines, layers, ribs and joints
 * of real models, not illustration.
 *
 * Runs at build time; the component renders the result as SVG.
 */
import { finnMateriale, standardPrinter } from '@/skaperverksted/core/materialer';
import { omrissPunkt } from '@/skaperverksted/generatorer/drage/former';
import { standardParametre as drageStandard } from '@/skaperverksted/generatorer/drage/parametre';
import { lagSkjelett } from '@/skaperverksted/generatorer/drage/skjelett';
import { klikkersnitt } from '@/skaperverksted/generatorer/buildforge/snitt';
import { lagForm } from '@/skaperverksted/generatorer/lampe/form';
import { standardParametre as lampeStandard } from '@/skaperverksted/generatorer/lampe/parametre';

const f = (n: number) => (Math.round(n * 100) / 100).toString();

function sti(punkter: [number, number][], lukket = false): string {
  return punkter.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join(' ') + (lukket ? ' Z' : '');
}

export interface Boks {
  x: number;
  y: number;
  b: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/* Signgen: the starting sign, layer by layer, in an oblique view.    */
/* ------------------------------------------------------------------ */

export interface SkiltLag {
  navn: string;
  hoyde: number;
  zBunn: number;
  farge: string;
  /** Print slices from the bottom of the layer up (z in mm). */
  skiver: number[];
}

export interface Skilt {
  bredde: number;
  dybde: number;
  radius: number;
  tekst: string;
  tekstStorrelse: number;
  lag: SkiltLag[];
  /** The plane of the sign in the view: SVG matrix(a b c d 0 0). */
  plan: [number, number, number, number];
  /** Screen offset per mm of height. */
  zSkala: number;
  lagHoyde: number;
  visning: Boks;
}

/**
 * A plate sign as Signgen builds it: a base plate layer with a text layer
 * on top (Signgen's starting sign until 2026-10-05; it now starts with an
 * outline as the base, but plates remain a normal way to build). Kept as
 * data here because Signgen pulls in the font engine, which the static
 * build does not need; a unit test keeps the two in step
 * (signgen/testskilt.ts).
 */
export const SIGNGEN_START = {
  bredde: 120,
  dybde: 42,
  radius: 6,
  tekst: 'Designporten',
  tekstStorrelse: 14,
  lag: [
    { navn: 'Bunnplate', hoyde: 3, materialId: 'pla-grafitt' },
    { navn: 'Tekst', hoyde: 1.5, materialId: 'pla-kritthvit' },
  ],
};

export function skilt(): Skilt {
  const { bredde, dybde, radius, tekst, tekstStorrelse } = SIGNGEN_START;
  let z = 0;
  const startlag = SIGNGEN_START.lag.map((l) => {
    const zBunn = z;
    z += l.hoyde;
    return { ...l, zBunn };
  });
  const lagHoyde = standardPrinter.lagHoyde;
  // Plan view rotated −24° and seen from about 35° above.
  const vinkel = (-24 * Math.PI) / 180;
  const k = 0.58;
  const c = Math.cos(vinkel);
  const s = Math.sin(vinkel);
  const plan: [number, number, number, number] = [c, k * s, -s, k * c];
  const zSkala = Math.sqrt(1 - k * k) * 1.6;
  const lag = startlag.map((l) => {
    const antall = Math.max(2, Math.round(l.hoyde / lagHoyde));
    const skiver = Array.from({ length: antall }, (_, i) => l.zBunn + (l.hoyde * i) / antall);
    return { navn: l.navn, hoyde: l.hoyde, zBunn: l.zBunn, farge: finnMateriale(l.materialId).hex, skiver };
  });
  // Bounding box of the rotated plate plus the stack height and room to separate.
  const hjorner: [number, number][] = [
    [-bredde / 2, -dybde / 2],
    [bredde / 2, -dybde / 2],
    [bredde / 2, dybde / 2],
    [-bredde / 2, dybde / 2],
  ].map(([x, y]) => [plan[0] * x! + plan[2] * y!, plan[1] * x! + plan[3] * y!]);
  const xs = hjorner.map((p) => p[0]);
  const ys = hjorner.map((p) => p[1]);
  const topp = lag.reduce((m, l) => Math.max(m, l.zBunn + l.hoyde), 0);
  const luft = 16;
  const visning = {
    x: Math.min(...xs) - luft,
    y: Math.min(...ys) - topp * zSkala - 26 - luft,
    b: Math.max(...xs) - Math.min(...xs) + 2 * luft,
    h: Math.max(...ys) - Math.min(...ys) + topp * zSkala + 26 + 2 * luft,
  };
  return { bredde, dybde, radius, tekst, tekstStorrelse, lag, plan, zSkala, lagHoyde, visning };
}

/* ------------------------------------------------------------------ */
/* Lamp: side view of the default shade, silhouette and twisted ribs. */
/* ------------------------------------------------------------------ */

export interface Lampe {
  hoyde: number;
  diameterBunn: number;
  diameterTopp: number;
  kontur: string;
  topp: string;
  bunn: string;
  /** Ribs at the default twist, and turned further (for the hover state). */
  ribber: string;
  ribberVridd: string;
  visning: Boks;
}

const HELNING = 0.22;

export function lampe(): Lampe {
  const p = lampeStandard();
  const form = lagForm(p);
  const H = p.hoyde;
  const steg = 72;
  // y down in the drawing: t = 0 (bottom) at y = H.
  const venstre: [number, number][] = [];
  const hoyre: [number, number][] = [];
  for (let i = 0; i <= steg; i++) {
    const t = i / steg;
    const r = form.radius(t);
    venstre.push([-r, H - t * H]);
    hoyre.push([r, H - t * H]);
  }
  const ellipse = (t: number, halv: boolean) => {
    const r = form.radius(t);
    const y = H - t * H;
    return halv
      ? `M${f(-r)} ${f(y)} A${f(r)} ${f(r * HELNING)} 0 0 0 ${f(r)} ${f(y)}`
      : `M${f(-r)} ${f(y)} A${f(r)} ${f(r * HELNING)} 0 1 0 ${f(r)} ${f(y)} A${f(r)} ${f(r * HELNING)} 0 1 0 ${f(-r)} ${f(y)}`;
  };
  const antall = p.monster.type === 'glatt' ? 16 : Math.min(p.monster.antall ?? 24, 36);
  const ribbesett = (vridningGrader: number) => {
    const vri = (vridningGrader * Math.PI) / 180;
    const ut: string[] = [];
    for (let n = 0; n < antall; n++) {
      const start = (n / antall) * Math.PI * 2;
      let lop: [number, number][] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const theta = start + vri * t;
        const r = form.radius(t);
        if (Math.cos(theta) > 0) lop.push([r * Math.sin(theta), H - t * H + r * Math.cos(theta) * HELNING]);
        else {
          if (lop.length > 1) ut.push(sti(lop));
          lop = [];
        }
      }
      if (lop.length > 1) ut.push(sti(lop));
    }
    return ut.join(' ');
  };
  let maksR = 0;
  for (let i = 0; i <= steg; i++) maksR = Math.max(maksR, form.radius(i / steg));
  const luft = 22;
  return {
    hoyde: H,
    diameterBunn: p.diameterBunn,
    diameterTopp: p.diameterTopp,
    kontur: `${sti(venstre)} ${sti(hoyre)}`,
    topp: ellipse(1, false),
    bunn: ellipse(0, true),
    ribber: ribbesett(p.vridning),
    ribberVridd: ribbesett(p.vridning + 90),
    visning: { x: -maksR - luft - 28, y: -luft - 10, b: 2 * maksR + 2 * luft + 56, h: H + 2 * luft + 20 },
  };
}

/* ------------------------------------------------------------------ */
/* Dragon: top view of the default dragon's articulated parts.        */
/* ------------------------------------------------------------------ */

export interface DrageDel {
  navn: string;
  omriss: string;
  /** Joint to the previous part (towards the head), in mm. */
  ledd: [number, number] | null;
}

export interface Drage {
  lengde: number;
  /** Body colour of the default dragon (material catalogue). */
  farge: string;
  deler: DrageDel[];
  visning: Boks;
}

export function drage(): Drage {
  const sk = lagSkjelett(drageStandard);
  let minX = Infinity;
  let maksX = -Infinity;
  let maksY = 0;
  const deler = sk.deler.map((d) => {
    const punkter: [number, number][] = [];
    for (let i = 0; i < 64; i++) {
      const [x, y] = omrissPunkt(d.omriss, (i / 64) * Math.PI * 2);
      // Nose points left in the drawing; SVG y is down.
      punkter.push([-x, -y]);
      minX = Math.min(minX, -x);
      maksX = Math.max(maksX, -x);
      maksY = Math.max(maksY, Math.abs(y));
    }
    return {
      navn: d.navn,
      omriss: sti(punkter, true),
      ledd: d.tapp ? ([-d.tapp.jx, 0] as [number, number]) : null,
    };
  });
  const luft = 16;
  return {
    lengde: drageStandard.lengde,
    farge: finnMateriale(drageStandard.farger.kropp).hex,
    deler,
    visning: {
      x: minX - luft,
      y: -maksY - luft - 18,
      b: maksX - minX + 2 * luft,
      h: 2 * maksY + 2 * luft + 30,
    },
  };
}

/* ------------------------------------------------------------------ */
/* BuildForge: a section through the starting clicker.                */
/* ------------------------------------------------------------------ */

export interface Klikker {
  /** Outlines as SVG paths (x right, z up → SVG y down). */
  underdel: string;
  topp: string;
  bryter: string;
  toppFarge: string;
  underdelFarge: string;
  vandring: number;
  bredde: number;
  hoyde: number;
  visning: Boks;
}

/** BuildForge's starting clicker («Enkel knapp»), cut through the middle. */
export function klikker(): Klikker {
  const s = klikkersnitt('knapp');
  const vei = (seg: [number, number, number, number][]) =>
    seg.map(([a, b, c, d]) => `M${f(a)} ${f(-b)}L${f(c)} ${f(-d)}`).join('');
  // the real outline's extent, not the shapes' bounding boxes
  const alle = [...s.underdel, ...s.topp];
  const xs = alle.flatMap(([a, , c]) => [a, c]);
  const zs = alle.flatMap(([, b, , d]) => [b, d]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    z1 = Math.max(...zs);
  const bredde = x1 - x0;
  const luft = 0.3 * z1;
  return {
    underdel: vei(s.underdel),
    topp: vei(s.topp),
    bryter: vei(s.bryter),
    toppFarge: finnMateriale(s.farger.topp).hex,
    underdelFarge: finnMateriale(s.farger.underdel).hex,
    vandring: s.vandring,
    bredde: Math.round(bredde),
    hoyde: Math.round(z1 * 10) / 10,
    visning: { x: x0 - luft - 0.6 * bredde, y: -z1 - luft, b: bredde * 2.2 + 2 * luft, h: z1 + 2 * luft },
  };
}
