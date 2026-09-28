/**
 * Units. The design domain is in millimetres: 1 unit = 1 mm, always.
 * Screen pixels never enter model geometry; the viewport converts.
 */

/** CSS px per mm at 100 % zoom (CSS reference: 96 px per inch). */
export const PX_PER_MM = 96 / 25.4;

const formatter = new Map<number, Intl.NumberFormat>();

function nf(desimaler: number): Intl.NumberFormat {
  let f = formatter.get(desimaler);
  if (!f) {
    f = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: desimaler });
    formatter.set(desimaler, f);
  }
  return f;
}

/** "12,5 mm" */
export function mm(verdi: number, desimaler = 1): string {
  return `${nf(desimaler).format(rund(verdi, desimaler))} mm`;
}

/** "12,5" (no unit), for inputs. */
export function tall(verdi: number, desimaler = 1): string {
  return nf(desimaler)
    .format(rund(verdi, desimaler))
    .replace(/\u00a0/g, '');
}

export function rund(v: number, desimaler = 1): number {
  const f = 10 ** desimaler;
  return Math.round(v * f) / f;
}

export function klem(v: number, min: number, maks: number): number {
  return Math.min(maks, Math.max(min, v));
}

/**
 * Parse a user-typed length in mm. Accepts Norwegian decimal comma,
 * an optional unit (mm, cm, m) and simple arithmetic: "40+2,5", "3*12", "10 cm".
 * Returns null for anything else. No eval.
 */
export function tolkLengde(inndata: string): number | null {
  let s = inndata.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let faktor = 1;
  const enhet = s.match(/(mm|cm|m)$/);
  if (enhet) {
    faktor = enhet[1] === 'cm' ? 10 : enhet[1] === 'm' ? 1000 : 1;
    s = s.slice(0, -enhet[1]!.length);
  }
  s = s.replace(/,/g, '.');
  if (!/^[-+*/().\d]+$/.test(s)) return null;
  const v = uttrykk(s);
  return v === null || !Number.isFinite(v) ? null : v * faktor;
}

/** Tiny recursive-descent parser for + - * / and parentheses. */
function uttrykk(kilde: string): number | null {
  let i = 0;
  const topp = () => kilde[i];
  function tallverdi(): number | null {
    if (topp() === '(') {
      i++;
      const v = sum();
      if (topp() !== ')') return null;
      i++;
      return v;
    }
    let fortegn = 1;
    while (topp() === '-' || topp() === '+') {
      if (topp() === '-') fortegn = -fortegn;
      i++;
    }
    if (topp() === '(') {
      const v = tallverdi();
      return v === null ? null : fortegn * v;
    }
    const start = i;
    while (i < kilde.length && /[\d.]/.test(kilde[i]!)) i++;
    if (start === i) return null;
    const v = Number(kilde.slice(start, i));
    return Number.isNaN(v) ? null : fortegn * v;
  }
  function produkt(): number | null {
    let v = tallverdi();
    while (v !== null && (topp() === '*' || topp() === '/')) {
      const op = kilde[i++];
      const h = tallverdi();
      if (h === null) return null;
      if (op === '/' && h === 0) return null;
      v = op === '*' ? v * h : v / h;
    }
    return v;
  }
  function sum(): number | null {
    let v = produkt();
    while (v !== null && (topp() === '+' || topp() === '-')) {
      const op = kilde[i++];
      const h = produkt();
      if (h === null) return null;
      v = op === '+' ? v + h : v - h;
    }
    return v;
  }
  const v = sum();
  return i === kilde.length ? v : null;
}
