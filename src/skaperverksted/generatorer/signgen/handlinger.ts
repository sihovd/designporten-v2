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
  type SvgKilde,
} from '../../core/dokument';
import type { Transform2D } from '../../core/geometri2d';
import { slaSammen, tomBoks, erTom, type Boks } from '../../core/geometri2d';
import {
  dupliserObjekter,
  ledigNavn,
  ledigTekstlagnavn,
  leggTilLag,
  leggTilLagNederst,
  leggTilObjekt,
  nyttLag,
  nyttObjekt,
  nyttTekstlag,
  nesteFarge,
  oppdaterLag,
  oppdaterObjekter,
  palett,
  slettObjekter,
  standardNavn,
} from './dokument';
import { modellBoks, verdensBoks } from './modell';
import { importerSvg, SvgFeil } from './svgimport';

export function valgte(benk: Arbeidsbenk): Objekt[] {
  const d = benk.dok;
  return benk.tilstand.utvalg.objekter.map((id) => d.objekter[id]).filter((o): o is Objekt => !!o);
}

/** Objects the user may change (not locked, layer not locked). */
export function redigerbare(benk: Arbeidsbenk): Objekt[] {
  const d = benk.dok;
  return valgte(benk).filter((o) => !o.last && !finnLag(d, o.lagId)?.last);
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
 * Where a new object goes. With a text layer selected, new text joins it
 * and is grouped with what is already there; with anything else selected
 * it gets a text layer of its own (above the active layer). To get a
 * second, separate text layer, make a new layer first (Sivert,
 * 2026-10-05). Shapes and SVGs go into the active layer, or, when that is
 * a text layer, into the nearest plain layer below it (a new one above it
 * if there is none).
 */
function malFor(
  benk: Arbeidsbenk,
  kilde: ObjektKilde,
): { lagId: LagId; nytt?: ReturnType<typeof nyttLag> } | null {
  const d = benk.dok;
  const id = aktivtLag(benk);
  if (!id && d.lag.length) return null;
  const aktiv = id ? finnLag(d, id) : undefined;
  if (kilde.type === 'tekst') {
    if (aktiv?.tekstlag) return { lagId: aktiv.id };
    const nytt = nyttTekstlag(ledigTekstlagnavn(d), palett(d)[0] ?? 'pla-kritthvit', 1.5);
    return { lagId: nytt.id, nytt };
  }
  if (aktiv && !aktiv.tekstlag) return { lagId: aktiv.id };
  if (kilde.type === 'form' && kilde.form === 'hull') {
    // holes act on the whole sign: any plain layer will do, else one of their own
    const vanlig = d.lag.find((l) => !l.tekstlag && l.synlig && !l.last);
    if (vanlig) return { lagId: vanlig.id };
    const nytt = nyttLag('Hull og øyne', nesteFarge(d), 1);
    return { lagId: nytt.id, nytt };
  }
  const i = aktiv ? d.lag.indexOf(aktiv) : d.lag.length;
  const under = d.lag
    .slice(0, i)
    .reverse()
    .find((l) => !l.tekstlag && l.synlig && !l.last);
  if (under) return { lagId: under.id };
  const nytt = nyttLag(`Lag ${d.lag.length + 1}`, nesteFarge(d), 1);
  return { lagId: nytt.id, nytt };
}

export function leggTil(
  benk: Arbeidsbenk,
  kilde: ObjektKilde,
  transform: Partial<Transform2D> = {},
  navn?: string,
): Objekt | null {
  const mal = malFor(benk, kilde);
  if (!mal) return null;
  const o = nyttObjekt(mal.lagId, kilde, transform, navn ?? standardNavn(kilde));
  const nytt = mal.nytt;
  const over = benk.tilstand.utvalg.lag ?? undefined;
  benk.endre({
    navn: `Legg til ${o.navn}`,
    // a new layer goes above the active one, like «+ Nytt lag»
    anvend: (d) => leggTilObjekt(nytt ? leggTilLag(d, nytt, over) : d, o),
  });
  benk.velg({ objekter: [o.id], lag: mal.lagId });
  const lag = finnLag(benk.dok, mal.lagId);
  benk.melde(
    nytt
      ? `${o.navn} lagt til i et nytt lag, «${lag?.navn ?? ''}».`
      : `${o.navn} lagt til i ${lag?.navn ?? 'laget'}.`,
  );
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

// ---------- new layers (Sivert, 2026-10-05) ----------

/** Margin between the sign and a frame or the shape around the text (mm). */
const RAMMEMARG = 4;

/**
 * A layer under everything that takes its shape from what is around the
 * text: every text layer with its outlines, a little wider. It follows
 * the text as it changes.
 */
export function nyttLagRundtTeksten(benk: Arbeidsbenk): void {
  const d = benk.dok;
  const tekstlag = d.lag.filter((l) => l.tekstlag);
  if (!tekstlag.length) {
    benk.melde('Skiltet har ingen tekst å forme laget rundt. Legg til en tekst først.');
    return;
  }
  const lag = nyttLag('Rundt teksten', nesteFarge(d), 2);
  benk.endre({
    navn: 'Nytt lag rundt teksten',
    // at the bottom: the text stands on it
    anvend: (x) =>
      oppdaterLag(leggTilLagNederst(x, lag), lag.id, {
        pavirkninger: tekstlag.map((t) => ({
          kildeLagId: t.id,
          handling: 'legg-til' as const,
          avstand: RAMMEMARG,
        })),
      }),
  });
  benk.velg({ lag: lag.id, objekter: [] });
  benk.melde(
    `«${lag.navn}» er lagt under teksten og følger formen til teksten og omrissene, ${RAMMEMARG} mm utenfor.`,
  );
}

export type Svgrolle = 'ramme' | 'pynt';

/**
 * Import an SVG into a layer of its own: as a frame under the sign,
 * sized to go round it, or as a decoration above the active layer.
 */
export async function importerSvgSom(benk: Arbeidsbenk, fil: File, rolle: Svgrolle): Promise<void> {
  if (fil.size > 5 * 1024 * 1024) {
    benk.melde('SVG-filen er større enn 5 MB.');
    return;
  }
  let r: ReturnType<typeof importerSvg>;
  try {
    r = importerSvg(await fil.text(), fil.name);
  } catch (e) {
    benk.melde(e instanceof SvgFeil ? e.message : 'SVG-filen kunne ikke leses.');
    return;
  }
  const d = benk.dok;
  const plate = Math.min(d.plate.bredde, d.plate.dybde) * 0.8;
  const skilt = modellBoks(d);
  let s: number;
  let x = 0;
  let y = 0;
  if (rolle === 'ramme' && skilt) {
    // big enough to go round the sign with a margin, proportions kept
    const b = skilt.maksX - skilt.minX + 2 * RAMMEMARG;
    const h = skilt.maksY - skilt.minY + 2 * RAMMEMARG;
    s = Math.max(b / r.bredde, h / r.hoyde);
    x = (skilt.minX + skilt.maksX) / 2;
    y = (skilt.minY + skilt.maksY) / 2;
  } else {
    // a decoration: about a third of the sign's height, or 30 mm
    const maal = skilt ? Math.max(10, (skilt.maksY - skilt.minY) / 3) : 30;
    s = maal / Math.max(r.bredde, r.hoyde);
    if (skilt) {
      x = skilt.maksX - maal / 2;
      y = skilt.maksY - maal / 2;
    }
  }
  s = Math.min(s, plate / Math.max(r.bredde, r.hoyde));
  const lag = nyttLag(rolle === 'ramme' ? 'Ramme' : 'Pynt', nesteFarge(d), rolle === 'ramme' ? 2 : 1);
  const o = nyttObjekt(lag.id, r.kilde, { skalaX: s, skalaY: s, x, y });
  const over = benk.tilstand.utvalg.lag ?? undefined;
  benk.endre({
    navn: rolle === 'ramme' ? 'SVG som ramme' : 'SVG som pynt',
    anvend: (x0) =>
      leggTilObjekt(rolle === 'pynt' ? leggTilLag(x0, lag, over) : leggTilLagNederst(x0, lag), o),
  });
  benk.velg({ lag: lag.id, objekter: [o.id] });
  const deler = [
    rolle === 'ramme'
      ? `«${fil.name}» er lagt inn som ramme under skiltet`
      : `«${fil.name}» er lagt inn som pynt i et eget lag`,
  ];
  if (r.hoppetOver.length) deler.push(`Hoppet over: ${r.hoppetOver.join(', ')}`);
  benk.melde(`${deler.join('. ')}.`);
}

// ---------- decoration gallery (Sivert, 2026-10-05) ----------

export type Dekorplass = 'gruppe' | 'eget';

/** The text layer a decoration would be grouped with: the selected one, else the only one. */
export function tekstlagForDekor(benk: Arbeidsbenk): Lag | null {
  const d = benk.dok;
  const aktiv = benk.tilstand.utvalg.lag ? finnLag(d, benk.tilstand.utvalg.lag) : undefined;
  if (aktiv?.tekstlag && !aktiv.last && aktiv.synlig) return aktiv;
  const alle = d.lag.filter((l) => l.tekstlag && !l.last && l.synlig);
  return alle.length === 1 ? alle[0]! : null;
}

/**
 * Put a gallery element (or any vector) on the sign. «gruppe» adds it to
 * the text layer, so it shares the text's outlines and sits beside the
 * text; «eget» gives it a layer of its own above the active layer, to
 * place and colour freely. Both can be changed later by dragging it in
 * the layers panel.
 */
export function leggTilDekor(
  benk: Arbeidsbenk,
  navn: string,
  r: { kilde: SvgKilde; bredde: number; hoyde: number },
  plass: Dekorplass,
): void {
  const d = benk.dok;
  const tekstlag = plass === 'gruppe' ? tekstlagForDekor(benk) : null;
  const skilt = modellBoks(d);
  const storste = Math.max(r.bredde, r.hoyde);
  let maal: number;
  let x = 0;
  let y = 0;
  if (tekstlag) {
    // beside the text group, as tall as the text, a little apart
    const bokser = objekterILag(d, tekstlag.id)
      .filter((o) => o.synlig)
      .map(verdensBoks);
    const gruppe = bokser.reduce(slaSammen, tomBoks());
    const hoyde = erTom(gruppe) ? 14 : gruppe.maksY - gruppe.minY;
    maal = Math.min(40, Math.max(10, hoyde * 1.3));
    if (!erTom(gruppe)) {
      x = gruppe.maksX + 3 + maal / 2;
      y = (gruppe.minY + gruppe.maksY) / 2;
    }
  } else {
    maal = skilt ? Math.max(10, (skilt.maksY - skilt.minY) / 3) : 30;
    if (skilt) {
      x = skilt.maksX - maal / 2;
      y = skilt.maksY - maal / 2;
    }
  }
  const plate = Math.min(d.plate.bredde, d.plate.dybde) * 0.8;
  const s = Math.min(maal, plate) / storste;
  const lagNavn = ledigNavn(d, 'Pynt');
  const nyttPynt = tekstlag ? null : nyttLag(lagNavn, nesteFarge(d), 1);
  const lagId = tekstlag ? tekstlag.id : nyttPynt!.id;
  const o = nyttObjekt(lagId, r.kilde, { skalaX: s, skalaY: s, x, y }, navn);
  const over = benk.tilstand.utvalg.lag ?? undefined;
  benk.endre({
    navn: `Legg til dekor ${navn}`,
    anvend: (x0) => leggTilObjekt(nyttPynt ? leggTilLag(x0, nyttPynt, over) : x0, o),
  });
  benk.velg({ lag: lagId, objekter: [o.id] });
  benk.melde(
    tekstlag
      ? `${navn} er lagt til i «${tekstlag.navn}» og får samme omriss som teksten.`
      : `${navn} er lagt til i et eget lag, «${lagNavn}».`,
  );
}

/**
 * An empty text layer above the selected layer. Text written while it is
 * selected goes into it, apart from the other text layers (Sivert,
 * 2026-10-05: a new layer is a separate layer).
 */
export function nyttTomtTekstlag(benk: Arbeidsbenk): void {
  const d = benk.dok;
  const lag = nyttTekstlag(ledigTekstlagnavn(d), nesteFarge(d), 1.5);
  const over = benk.tilstand.utvalg.lag ?? undefined;
  benk.endre({ navn: 'Nytt tekstlag', anvend: (x) => leggTilLag(x, lag, over) });
  benk.velg({ lag: lag.id, objekter: [] });
  benk.melde(`«${lag.navn}» er lagt til. Tekst du skriver nå havner her, atskilt fra de andre tekstene.`);
}
