/**
 * Signgen commands shared by the keyboard, the floating toolbar, the
 * layers panel and the inspector. Each is one undo step with a Norwegian
 * label, and reports what happened to the live region.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import {
  finnLag,
  objekterILag,
  type Dokument,
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
import { fargekode, finnMateriale } from '../../core/materialer';
import { narmesteFarge } from './fargeprofiler';
import { modellBoks, verdensBoks } from './modell';
import type { Flerfarget, SvgDeler } from './svgdeler';
import { delerTilKilde, lesSvgDeler, SvgFeil } from './svgimport';
import { signtilstand } from './tilstand';
import {
  fordelingsforskyvninger,
  justeringGjelder,
  justeringsforskyvning,
  type Justering,
  type Justeringsmal,
} from './justering';

/**
 * Give one object its own colour. The layer's only object just takes the layer's colour; with several
 * objects in the layer, the one that differs from the layer's colour gets a colour of its own.
 */
export function settObjektFarge(benk: Arbeidsbenk, objektId: string, materialId: string): void {
  benk.endre({
    navn: 'Bytt farge på objektet',
    anvend: (d) => {
      const o = d.objekter[objektId];
      const lag = o && finnLag(d, o.lagId);
      if (!o || !lag) return d;
      const andre = objekterILag(d, lag.id).filter(
        (x) =>
          x.id !== o.id &&
          x.synlig &&
          x.operasjon !== 'trekk-fra' &&
          !(x.kilde.type === 'form' && x.kilde.form === 'hull'),
      );
      if (!andre.length) {
        return oppdaterLag(
          oppdaterObjekter(d, [o.id], (x) => ({ ...x, materialId: undefined })),
          lag.id,
          { materialId },
        );
      }
      return oppdaterObjekter(d, [o.id], (x) => ({
        ...x,
        materialId: materialId === lag.materialId ? undefined : materialId,
      }));
    },
  });
}

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

export type { Justering } from './justering';

/** The plate as a box, centred on the origin: the reference for a single object. */
export function plateboks(dok: Dokument): Boks {
  return {
    minX: -dok.plate.bredde / 2,
    maksX: dok.plate.bredde / 2,
    minY: -dok.plate.dybde / 2,
    maksY: dok.plate.dybde / 2,
  };
}

/**
 * Line the selected objects up. Without `mal` several objects line up against their common box and
 * one object against the build plate.
 */
export function juster(benk: Arbeidsbenk, j: Justering, mal?: Justeringsmal): void {
  const obj = redigerbare(benk);
  const boks = utvalgsboks(obj);
  if (!boks) return;
  const m: Justeringsmal = mal ?? { type: 'boks', boks: obj.length === 1 ? plateboks(benk.dok) : boks };
  if (!justeringGjelder(j, m)) {
    benk.melde('Den hjelpelinjen justerer bare den andre veien.');
    return;
  }
  benk.endre({
    navn: 'Juster',
    anvend: (d) =>
      oppdaterObjekter(
        d,
        obj.map((o) => o.id),
        (o) => {
          const { dx, dy } = justeringsforskyvning(verdensBoks(o), j, m);
          return dx || dy
            ? { ...o, transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy } }
            : o;
        },
      ),
  });
}

/**
 * Spread the objects evenly: between the outermost ones, or between `grenser` (the plate edges or
 * two guide lines). Needs three objects without limits and two with.
 */
export function fordel(benk: Arbeidsbenk, akse: 'x' | 'y', grenser?: { start: number; slutt: number }): void {
  const obj = redigerbare(benk);
  if (obj.length < (grenser ? 2 : 3)) {
    benk.melde(
      grenser ? 'Velg minst to objekter for å fordele dem.' : 'Velg minst tre objekter for å fordele dem.',
    );
    return;
  }
  const flytt = fordelingsforskyvninger(
    obj.map((o) => ({ id: o.id, boks: verdensBoks(o) })),
    akse,
    grenser,
  );
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

/** An SVG file read into its parts; null (with a message) when it cannot be read. */
export async function lesSvgFil(benk: Arbeidsbenk, fil: File, maksMb = 5): Promise<SvgDeler | null> {
  if (fil.size > maksMb * 1024 * 1024) {
    benk.melde(`SVG-filen er større enn ${maksMb} MB.`);
    return null;
  }
  try {
    return lesSvgDeler(await fil.text(), fil.name);
  } catch (e) {
    benk.melde(e instanceof SvgFeil ? e.message : 'SVG-filen kunne ikke leses.');
    return null;
  }
}

const filnavnUtenSvg = (navn: string) => navn.replace(/\.svg$/i, '');

/**
 * A frame: an SVG in a layer under the sign, sized to go round it with a
 * margin and the proportions kept.
 */
function leggTilRamme(
  benk: Arbeidsbenk,
  navn: string,
  r: { kilde: SvgKilde; bredde: number; hoyde: number },
  farge?: string,
  ekstra?: string,
): void {
  const d = benk.dok;
  const plate = Math.min(d.plate.bredde, d.plate.dybde) * 0.8;
  const skilt = modellBoks(d);
  let s: number;
  let x = 0;
  let y = 0;
  if (skilt) {
    const b = skilt.maksX - skilt.minX + 2 * RAMMEMARG;
    const h = skilt.maksY - skilt.minY + 2 * RAMMEMARG;
    s = Math.max(b / r.bredde, h / r.hoyde);
    x = (skilt.minX + skilt.maksX) / 2;
    y = (skilt.minY + skilt.maksY) / 2;
  } else {
    s = 30 / Math.max(r.bredde, r.hoyde);
  }
  s = Math.min(s, plate / Math.max(r.bredde, r.hoyde));
  const lag = nyttLag('Ramme', farge || nesteFarge(d), 2);
  const o = nyttObjekt(lag.id, r.kilde, { skalaX: s, skalaY: s, x, y });
  benk.endre({ navn: 'SVG som ramme', anvend: (x0) => leggTilObjekt(leggTilLagNederst(x0, lag), o) });
  benk.velg({ lag: lag.id, objekter: [o.id] });
  const deler = [`«${navn}» er lagt inn som ramme under skiltet`];
  if (ekstra) deler.push(ekstra);
  benk.melde(`${deler.join('. ')}.`);
}

/**
 * Put an SVG on the sign, as a frame under it or as a decoration. A file
 * with several parts opens the part picker first.
 */
export async function importerSvgSom(benk: Arbeidsbenk, fil: File, rolle: Svgrolle): Promise<void> {
  const deler = await lesSvgFil(benk, fil);
  if (!deler) return;
  behandleSvg(benk, deler, rolle, 'skilt');
}

/**
 * A file with two or more parts is shown in the part picker, where the user
 * keeps some of them, colours them, puts them on the sign or saves them in
 * the gallery. A file in one piece goes straight on.
 */
export function behandleSvg(
  benk: Arbeidsbenk,
  deler: SvgDeler,
  rolle: Svgrolle,
  opphav: 'skilt' | 'galleri',
): 'apnet' | 'lagt-inn' | 'feil' {
  const navn = filnavnUtenSvg(deler.filnavn);
  if (deler.deler.length >= 2) {
    // opened from the gallery, the gallery steps aside and comes back when the picker closes
    signtilstand(benk).sett({
      svgdeler: { deler, rolle, opphav },
      ...(opphav === 'galleri' ? { dekor: false } : {}),
    });
    return 'apnet';
  }
  const r = delerTilKilde(deler, deler.filnavn);
  if (!r) {
    benk.melde('Formene i SVG-en har ingen flate.');
    return 'feil';
  }
  const ekstra = deler.hoppetOver.length ? `Hoppet over: ${deler.hoppetOver.join(', ')}` : undefined;
  if (rolle === 'ramme') leggTilRamme(benk, navn, r, undefined, ekstra);
  else leggTilDekor(benk, navn, r, 'eget', { ekstra });
  return 'lagt-inn';
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
  valg: { farge?: string; ekstra?: string } = {},
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
  const nyttPynt = tekstlag ? null : nyttLag(lagNavn, tilPalett(d, valg.farge), 1);
  const lagId = tekstlag ? tekstlag.id : nyttPynt!.id;
  const o = nyttObjekt(lagId, r.kilde, { skalaX: s, skalaY: s, x, y }, navn);
  // in the text layer the element keeps its own colour when it differs from the text's
  if (tekstlag && valg.farge) {
    const eget = tilPalett(d, valg.farge);
    if (eget !== tekstlag.materialId) o.materialId = eget;
  }
  const over = benk.tilstand.utvalg.lag ?? undefined;
  benk.endre({
    navn: `Legg til dekor ${navn}`,
    anvend: (x0) => leggTilObjekt(nyttPynt ? leggTilLag(x0, nyttPynt, over) : x0, o),
  });
  benk.velg({ lag: lagId, objekter: [o.id] });
  const melding = tekstlag
    ? `${navn} er lagt til i «${tekstlag.navn}» og får samme omriss som teksten`
    : `${navn} er lagt til i et eget lag, «${lagNavn}»`;
  benk.melde(`${valg.ekstra ? `${melding}. ${valg.ekstra}` : melding}.`);
}

/** A filament in the sign's colour profile: the one asked for, else the closest to it, else the next unused. */
function tilPalett(d: Dokument, farge?: string): string {
  if (!farge) return nesteFarge(d);
  const p = palett(d);
  return p.length ? narmesteFarge(farge, p) : farge;
}

/**
 * Put a picture on the sign as a decoration, in its colours. One colour
 * goes where a gallery element goes (into the text layer or a layer of its
 * own); several colours get a layer each, at the same height, lying side by
 * side so they print as one coloured picture. A frame is one colour.
 */
export function leggTilFlerfarget(
  benk: Arbeidsbenk,
  ff: Flerfarget,
  rolle: Svgrolle,
  plass: Dekorplass,
  ekstra?: string,
): void {
  const g0 = ff.grupper[0];
  if (!g0) return;
  if (rolle === 'ramme' || ff.grupper.length === 1) {
    const farge = g0.farge || undefined;
    if (rolle === 'ramme')
      leggTilRamme(benk, ff.navn, g0, farge ? tilPalett(benk.dok, farge) : undefined, ekstra);
    else leggTilDekor(benk, ff.navn, g0, plass, { farge, ekstra });
    return;
  }
  const d = benk.dok;
  const tekstlag = plass === 'gruppe' ? tekstlagForDekor(benk) : null;
  const skilt = modellBoks(d);
  let maal = skilt ? Math.max(10, (skilt.maksY - skilt.minY) / 3) : 30;
  let x = skilt ? skilt.maksX - maal / 2 : 0;
  let y = skilt ? skilt.maksY - maal / 2 : 0;
  if (tekstlag) {
    // beside the text group, as tall as the text, a little apart (as for a single-colour element)
    const gruppe = objekterILag(d, tekstlag.id)
      .filter((o) => o.synlig)
      .map(verdensBoks)
      .reduce(slaSammen, tomBoks());
    const hoyde = erTom(gruppe) ? 14 : gruppe.maksY - gruppe.minY;
    maal = Math.min(40, Math.max(10, hoyde * 1.3));
    if (!erTom(gruppe)) {
      x = gruppe.maksX + 3 + maal / 2;
      y = (gruppe.minY + gruppe.maksY) / 2;
    }
  }
  const plate = Math.min(d.plate.bredde, d.plate.dybde) * 0.8;
  const s = Math.min(maal, plate) / Math.max(ff.bredde, ff.hoyde);
  if (tekstlag) {
    // every colour is an object of the text layer: the text's outlines go round the whole picture, whatever its colours
    const farger = ff.grupper.map((g) => tilPalett(d, g.farge || undefined));
    const objekter: Objekt[] = ff.grupper.map((g, i) => ({
      ...nyttObjekt(
        tekstlag.id,
        g.kilde,
        { skalaX: s, skalaY: s, x: x + g.dx * s, y: y + g.dy * s },
        `${ff.navn} · ${fargekode(finnMateriale(farger[i]!))}`,
      ),
      ...(farger[i] !== tekstlag.materialId ? { materialId: farger[i]! } : {}),
    }));
    benk.endre({
      navn: `Legg til ${ff.navn}`,
      anvend: (x0) => objekter.reduce((dok, o) => leggTilObjekt(dok, o), x0),
    });
    benk.velg({ lag: tekstlag.id, objekter: objekter.map((o) => o.id) });
    const tekst = `${ff.navn} er lagt til i «${tekstlag.navn}» med ${new Set(farger).size} farger. Omrisset går rundt hele bildet, uansett farge`;
    benk.melde(`${ekstra ? `${tekst}. ${ekstra}` : tekst}.`);
    return;
  }
  const grunn = ledigNavn(d, ff.navn);
  const over = benk.tilstand.utvalg.lag ?? undefined;
  // one layer for the whole picture: every colour is an object of its own with its own colour, so the
  // layer's outline, height and profile are the same for all of them
  const farger = ff.grupper.map((g) => tilPalett(d, g.farge || undefined));
  const lag = nyttLag(grunn, farger[0]!, 1);
  const objekter: Objekt[] = ff.grupper.map((g, i) => ({
    ...nyttObjekt(
      lag.id,
      g.kilde,
      { skalaX: s, skalaY: s, x: x + g.dx * s, y: y + g.dy * s },
      `${ff.navn} · ${fargekode(finnMateriale(farger[i]!))}`,
    ),
    ...(farger[i] !== lag.materialId ? { materialId: farger[i]! } : {}),
  }));
  benk.endre({
    navn: `Legg til ${ff.navn}`,
    anvend: (x0) => {
      let dok = leggTilLag(x0, lag, over);
      for (const o of objekter) dok = leggTilObjekt(dok, o);
      return dok;
    },
  });
  benk.velg({ lag: lag.id, objekter: objekter.map((o) => o.id) });
  const meldinger = [
    `${ff.navn} er lagt til i ett lag med ${new Set(farger).size} farger. Alle delene har samme omriss og høyde`,
  ];
  if (ekstra) meldinger.push(ekstra);
  benk.melde(`${meldinger.join('. ')}.`);
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
