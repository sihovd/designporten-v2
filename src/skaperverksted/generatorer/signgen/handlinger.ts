/**
 * Signgen commands shared by the keyboard, the floating toolbar, the
 * layers panel and the inspector. Each is one undo step with a Norwegian
 * label, and reports what happened to the live region.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import {
  finnLag,
  objekterILag,
  type Lag,
  type LagId,
  type Objekt,
  type ObjektKilde,
  type Underlag,
} from '../../core/dokument';
import type { Transform2D } from '../../core/geometri2d';
import { slaSammen, tomBoks, erTom, type Boks } from '../../core/geometri2d';
import {
  dupliserObjekter,
  finnTekstlag,
  leggTilLag,
  leggTilObjekt,
  nyttObjekt,
  nyttTekstlag,
  oppdaterObjekter,
  slettObjekter,
  standardNavn,
  underlagFor,
} from './dokument';
import { verdensBoks } from './modell';
import { signtilstand } from './tilstand';
import { materialer } from '../../core/materialer';

export function valgte(benk: Arbeidsbenk): Objekt[] {
  const d = benk.dok;
  return benk.tilstand.utvalg.objekter.map((id) => d.objekter[id]).filter((o): o is Objekt => !!o);
}

/** Objects the user may change (not locked, layer or colour group not locked). */
export function redigerbare(benk: Arbeidsbenk): Objekt[] {
  const d = benk.dok;
  return valgte(benk).filter((o) => !o.last && !finnLag(d, o.lagId)?.last && !underlagFor(d, o)?.last);
}

/**
 * The text layer's active colour group: that of a selected object in it,
 * else the one last chosen in the layers panel, else the top one.
 */
export function aktivtUnderlag(benk: Arbeidsbenk, lag: Lag): Underlag | undefined {
  const grupper = lag.underlag ?? [];
  const fraUtvalg = valgte(benk).find((o) => o.lagId === lag.id)?.underlagId;
  const valgt = fraUtvalg ?? signtilstand(benk).t.underlag;
  return grupper.find((u) => u.id === valgt) ?? grupper.at(-1);
}

export function utvalgsboks(objekter: Objekt[]): Boks | null {
  const b = objekter.map(verdensBoks).reduce(slaSammen, tomBoks());
  return erTom(b) ? null : b;
}

/** The layer new objects go into; null (with a message) if it is locked or hidden. */
export function aktivtLag(benk: Arbeidsbenk): LagId | null {
  const d = benk.dok;
  const id = benk.tilstand.utvalg.lag ?? d.lag.at(-1)?.id ?? null;
  const lag = id ? finnLag(d, id) : undefined;
  if (!lag) {
    benk.melde('Lag et lag først.');
    return null;
  }
  if (lag.last) {
    benk.melde(`Laget «${lag.navn}» er låst. Lås det opp eller velg et annet lag.`);
    return null;
  }
  if (!lag.synlig) {
    benk.melde(`Laget «${lag.navn}» er skjult. Vis det eller velg et annet lag.`);
    return null;
  }
  return lag.id;
}

/**
 * The text layer for new text: the sign's text layer, or a new one for the
 * top of the stack if it has none. Null (with a message) if it is locked
 * or hidden.
 */
function tekstlagForNyTekst(benk: Arbeidsbenk): { lag: Lag; ny: boolean } | null {
  const lag = finnTekstlag(benk.dok);
  if (!lag) {
    const brukte = new Set(benk.dok.lag.map((l) => l.materialId));
    const mat = materialer.find((m) => !brukte.has(m.id)) ?? materialer[0]!;
    return { lag: nyttTekstlag(mat.id), ny: true };
  }
  if (lag.last || !lag.synlig) {
    benk.melde(
      lag.last
        ? 'Tekstlaget er låst. Lås det opp for å legge til tekst.'
        : 'Tekstlaget er skjult. Vis det for å legge til tekst.',
    );
    return null;
  }
  return { lag, ny: false };
}

export function leggTil(
  benk: Arbeidsbenk,
  kilde: ObjektKilde,
  transform: Partial<Transform2D> = {},
  navn?: string,
): Objekt | null {
  // text always goes into the sign's one text layer
  let lag: Lag | undefined;
  let nyttLag = false;
  if (kilde.type === 'tekst') {
    const t = tekstlagForNyTekst(benk);
    if (!t) return null;
    lag = t.lag;
    nyttLag = t.ny;
  } else {
    const id = aktivtLag(benk);
    lag = id ? finnLag(benk.dok, id) : undefined;
  }
  if (!lag) return null;
  const gruppe = lag.tekstlag ? aktivtUnderlag(benk, lag) : undefined;
  if (gruppe && (gruppe.last || !gruppe.synlig)) {
    benk.melde(
      `Fargen «${gruppe.navn}» er ${gruppe.last ? 'låst' : 'skjult'}. Velg en annen farge i tekstlaget.`,
    );
    return null;
  }
  const o = nyttObjekt(lag.id, kilde, transform, navn ?? standardNavn(kilde), gruppe?.id);
  const ny = lag;
  benk.endre({
    navn: `Legg til ${o.navn}`,
    anvend: (d) => leggTilObjekt(nyttLag ? leggTilLag(d, ny) : d, o),
  });
  benk.velg({ objekter: [o.id], lag: lag.id });
  const hvor = gruppe && (lag.underlag?.length ?? 0) > 1 ? `${lag.navn} (${gruppe.navn})` : lag.navn;
  benk.melde(nyttLag ? `${o.navn} lagt til i et nytt tekstlag.` : `${o.navn} lagt til i ${hvor}.`);
  return o;
}

export function slettValgte(benk: Arbeidsbenk): void {
  const ider = redigerbare(benk).map((o) => o.id);
  if (!ider.length) {
    if (valgte(benk).length) benk.melde('De valgte objektene er låst.');
    return;
  }
  benk.endre({
    navn: ider.length === 1 ? 'Slett objekt' : `Slett ${ider.length} objekter`,
    anvend: (d) => slettObjekter(d, ider),
  });
  benk.velg({ objekter: [] });
  benk.melde(ider.length === 1 ? 'Objektet er slettet.' : `${ider.length} objekter er slettet.`);
}

export function dupliserValgte(benk: Arbeidsbenk): void {
  const ider = valgte(benk).map((o) => o.id);
  if (!ider.length) return;
  let nye: string[] = [];
  benk.endre({
    navn: 'Dupliser',
    anvend: (d) => {
      const r = dupliserObjekter(d, ider);
      nye = r.nye;
      return r.dok;
    },
  });
  benk.velg({ objekter: nye });
  benk.melde(nye.length === 1 ? 'Duplisert.' : `${nye.length} objekter duplisert.`);
}

export function flyttValgte(benk: Arbeidsbenk, dx: number, dy: number, slaSammen = 'pil'): void {
  const ider = redigerbare(benk).map((o) => o.id);
  if (!ider.length) return;
  benk.endre({
    navn: 'Flytt',
    slaSammen,
    anvend: (d) =>
      oppdaterObjekter(d, ider, (o) => ({
        ...o,
        transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy },
      })),
  });
}

export function velgAlle(benk: Arbeidsbenk): void {
  const d = benk.dok;
  const lag = benk.tilstand.utvalg.lag;
  const kandidater = (lag ? objekterILag(d, lag) : Object.values(d.objekter)).filter(
    (o) => o.synlig && !o.last,
  );
  benk.velg({ objekter: kandidater.map((o) => o.id) });
  benk.melde(`${kandidater.length} objekter valgt.`);
}

export type Justering = 'venstre' | 'midtX' | 'hoyre' | 'topp' | 'midtY' | 'bunn';

export function juster(benk: Arbeidsbenk, j: Justering): void {
  const obj = redigerbare(benk);
  const boks = utvalgsboks(obj);
  if (!boks) return;
  // one object aligns to the plate centre; several align to their common box
  const mal: Boks = obj.length === 1 ? { minX: 0, maksX: 0, minY: 0, maksY: 0 } : boks;
  benk.endre({
    navn: 'Juster',
    anvend: (d) =>
      oppdaterObjekter(
        d,
        obj.map((o) => o.id),
        (o) => {
          const b = verdensBoks(o);
          let dx = 0,
            dy = 0;
          if (j === 'venstre') dx = (obj.length === 1 ? -(b.maksX - b.minX) / 2 : mal.minX) - b.minX;
          if (j === 'hoyre') dx = (obj.length === 1 ? (b.maksX - b.minX) / 2 : mal.maksX) - b.maksX;
          if (j === 'midtX') dx = (mal.minX + mal.maksX) / 2 - (b.minX + b.maksX) / 2;
          if (j === 'bunn') dy = (obj.length === 1 ? -(b.maksY - b.minY) / 2 : mal.minY) - b.minY;
          if (j === 'topp') dy = (obj.length === 1 ? (b.maksY - b.minY) / 2 : mal.maksY) - b.maksY;
          if (j === 'midtY') dy = (mal.minY + mal.maksY) / 2 - (b.minY + b.maksY) / 2;
          return dx || dy
            ? { ...o, transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy } }
            : o;
        },
      ),
  });
}

/** Spread three or more objects evenly between the outermost ones. */
export function fordel(benk: Arbeidsbenk, akse: 'x' | 'y'): void {
  const obj = redigerbare(benk);
  if (obj.length < 3) {
    benk.melde('Velg minst tre objekter for å fordele dem.');
    return;
  }
  const med = obj
    .map((o) => ({ o, b: verdensBoks(o) }))
    .sort((a, b) => (akse === 'x' ? a.b.minX - b.b.minX : a.b.minY - b.b.minY));
  const storrelse = (b: Boks) => (akse === 'x' ? b.maksX - b.minX : b.maksY - b.minY);
  const start = akse === 'x' ? med[0]!.b.minX : med[0]!.b.minY;
  const slutt = akse === 'x' ? med.at(-1)!.b.maksX : med.at(-1)!.b.maksY;
  const sum = med.reduce((s, x) => s + storrelse(x.b), 0);
  const gap = (slutt - start - sum) / (med.length - 1);
  const flytt = new Map<string, number>();
  let pos = start;
  for (const { o, b } of med) {
    flytt.set(o.id, pos - (akse === 'x' ? b.minX : b.minY));
    pos += storrelse(b) + gap;
  }
  benk.endre({
    navn: 'Fordel',
    anvend: (d) =>
      oppdaterObjekter(d, [...flytt.keys()], (o) => {
        const v = flytt.get(o.id)!;
        return { ...o, transform: { ...o.transform, [akse]: o.transform[akse] + v } };
      }),
  });
}
