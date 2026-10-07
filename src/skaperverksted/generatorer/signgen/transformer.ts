/**
 * Position, size and rotation of the selection from numbers (the Transform panel). Position and
 * size are those of the selection's box on the plate, so one object and a group behave the same.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Objekt } from '../../core/dokument';
import { anvend, tilMatrise } from '../../core/geometri2d';
import { oppdaterObjekter } from './dokument';
import { redigerbare, utvalgsboks } from './handlinger';
import { lokalGeometri } from './modell';

const MIN_STORRELSE = 0.2;

/** Move the selection so the middle of its box lands on (x, y); a missing value leaves that axis alone. */
export function flyttUtvalgTil(benk: Arbeidsbenk, x?: number, y?: number, slaSammen?: string): void {
  const obj = redigerbare(benk);
  const b = utvalgsboks(obj);
  if (!b) return;
  const dx = x === undefined ? 0 : x - (b.minX + b.maksX) / 2;
  const dy = y === undefined ? 0 : y - (b.minY + b.maksY) / 2;
  if (!dx && !dy) return;
  benk.endre({
    navn: 'Flytt',
    slaSammen,
    anvend: (d) =>
      oppdaterObjekter(
        d,
        obj.map((o) => o.id),
        (o) => ({ ...o, transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy } }),
      ),
  });
}

const erSkjev = (o: Objekt) => Math.abs((((o.transform.rotasjon % 90) + 90) % 90) - 0) > 0.01;

/**
 * Give the selection's box a new width and/or height, scaling about its middle. Rotated objects only
 * scale evenly (a slanted shape would be distorted otherwise); `proporsjonal` keeps the ratio.
 */
export function skalerUtvalgTil(
  benk: Arbeidsbenk,
  bredde: number | null,
  hoyde: number | null,
  proporsjonal: boolean,
  slaSammen?: string,
): void {
  const obj = redigerbare(benk);
  const b = utvalgsboks(obj);
  if (!b) return;
  const w = Math.max(1e-6, b.maksX - b.minX);
  const h = Math.max(1e-6, b.maksY - b.minY);
  let sx = bredde !== null ? Math.max(MIN_STORRELSE, bredde) / w : 1;
  let sy = hoyde !== null ? Math.max(MIN_STORRELSE, hoyde) / h : 1;
  if (proporsjonal || obj.some(erSkjev)) {
    const s = bredde !== null ? sx : sy;
    sx = sy = s;
  }
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return;
  const cx = (b.minX + b.maksX) / 2;
  const cy = (b.minY + b.maksY) / 2;
  benk.endre({
    navn: 'Endre størrelse',
    slaSammen,
    anvend: (d) =>
      oppdaterObjekter(
        d,
        obj.map((o) => o.id),
        (o) => {
          const pos = { x: cx + (o.transform.x - cx) * sx, y: cy + (o.transform.y - cy) * sy };
          if (o.kilde.type === 'form') {
            return {
              ...o,
              kilde: {
                ...o.kilde,
                bredde: Math.max(MIN_STORRELSE, o.kilde.bredde * sx),
                hoyde: Math.max(MIN_STORRELSE, o.kilde.hoyde * sy),
              },
              transform: { ...o.transform, ...pos },
            };
          }
          return {
            ...o,
            transform: {
              ...o.transform,
              ...pos,
              skalaX: o.transform.skalaX * sx,
              skalaY: o.transform.skalaY * sy,
            },
          };
        },
      ),
  });
}

/** Turn one object about the middle of its own box. */
export function roterUtvalgTil(benk: Arbeidsbenk, grader: number, slaSammen?: string): void {
  const obj = redigerbare(benk);
  if (obj.length !== 1) return;
  const o0 = obj[0]!;
  const g = lokalGeometri(o0.kilde);
  if (!g) return;
  const lokalMidt = { x: (g.boks.minX + g.boks.maksX) / 2, y: (g.boks.minY + g.boks.maksY) / 2 };
  const senter = anvend(tilMatrise(o0.transform), lokalMidt);
  const rot = (((grader % 360) + 540) % 360) - 180;
  const c1 = anvend(tilMatrise({ ...o0.transform, rotasjon: rot, x: 0, y: 0 }), lokalMidt);
  benk.endre({
    navn: 'Roter',
    slaSammen,
    anvend: (d) =>
      oppdaterObjekter(d, [o0.id], (o) => ({
        ...o,
        transform: { ...o.transform, rotasjon: rot, x: senter.x - c1.x, y: senter.y - c1.y },
      })),
  });
}
