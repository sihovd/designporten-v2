/**
 * Vectorium (Sivert, 2026-11-09, renamed and laid out after his sketch on
 * 2026-11-11): the image-to-SVG converter, as its own tool and inside Sign
 * Forge behind «Bilde».
 *
 * Simple: a preset, the number of colours, background removal, preview and
 * export. Advanced has three modes, each with its tools in a dock at the
 * bottom (the active one glows) and the active tool's options on the right:
 *  1. Mask: crop, magic wand, brush, eraser, lasso and rectangle. Every
 *     drawn field either masks (red, removed) or protects (green, always kept).
 *  2. Edit: the conversion (preset, colours, small parts, curves), colour
 *     control (merge alike, reduce to N), parts, borders, points and the pen.
 *     Neighbouring parts share their borders, so an edit never opens a gap.
 *  3. Finalize: download, copy or «Legg på skiltet».
 * Simple and Advanced share all state, so switching loses nothing.
 *
 * Everything runs in the browser; the image is not uploaded.
 */
import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Ikon, type IkonId } from '../../../shell/ikoner';
import {
  beskjaerBilde,
  brukUtvalg,
  inverterMaske,
  lesBildefil,
  malLasso,
  malStrok,
  maskeKopi,
  maskepiksler,
  nyMaske,
  settMaske,
  sporgrunnlag,
  beskyttMaske,
  lesLerret,
  BESKYTTFARGE,
  kildeFraBlob,
  leggTilBilde,
  lerretTilPng,
  maskeFraBlob,
  tomMaske,
  type Kildebilde,
  type Plassering,
  type Rektangel,
} from './forbered';
import {
  erProsjektfil,
  FILENDELSE,
  hentAutomatisk,
  lagreAutomatisk,
  prosjektFraFil,
  prosjektTilFil,
  slettAutomatisk,
  type Prosjekt,
} from './prosjekt';
import {
  byggModell,
  byttFarge,
  delerVed,
  delSti,
  flyttAnker,
  flyttHandtak,
  forenkle,
  gjorBuet,
  gjorRett,
  kurverIOmrade,
  leggTilFelt,
  pennepunkter,
  kurverRundt,
  leggTilAnker,
  naermesteKurve,
  settAnkertype,
  settFarge,
  slaSammenDeler,
  slettAnker,
  slettDeler,
  tall,
  tilpassPaNytt,
  tilSvg,
  vater,
  delBoks,
  flyttMatrise,
  matriseTekst,
  nullstillTransform,
  rundt,
  transformerDeler,
  transformerte,
  type Kurve,
  type Vektormodell,
} from './modell';
import { fargebruk, flatUt, reduserFarger, slaSammenLikeFarger } from './farger';
import { kontur, ringerTilSti, tilDxf, tynneDeler, type TynnDel } from './ferdig';
import { ringerI } from '../../../geometri/polygon';
import {
  delerIFarger,
  flyttLag,
  kurveLast,
  lagrekkefolge,
  tegnOmradePaNytt,
  type Lagkart,
  type Omrade,
} from './lag';
import { Hovertekst } from './Hovertekst';
import { festTilKant, forenkleSti, kantsti, lagKantkart, type Kantkart, type Punkt } from './magnetlasso';
import { lagRegionkart, STANDARD_REGIONVALG, type Regionkart, type Regionvalg } from './regioner';
import { STANDARD_TILPASNING, type Anker, type Tilpasningsvalg } from './tilpass';
import {
  antallValgt,
  bakgrunnsutvalg,
  fargespekter,
  fargeVed,
  inverterUtvalg,
  kantfarge,
  kombiner,
  SPEKTERSTEG,
  tryllestav,
  utvalgsbilde,
  utvid,
  type Rgba,
  type Utvalg,
} from './tryllestav';

/** The three modes of Advanced (Sivert's sketch): Mask, Edit, Finalize. */
type Steg = 'masker' | 'rediger' | 'ferdig';
/** Simple shows only what most people need; Advanced has every mode and tool. */
type Nivaa = 'enkel' | 'avansert';
type Forberedverktoy =
  'beskjaer' | 'tryllestav' | 'pensel' | 'viskelar' | 'lasso' | 'magnetlasso' | 'rektangel';

/** A magnetic lasso being drawn: where it started and the edge path to each anchor point after that. */
interface Magnetlasso {
  start: Punkt;
  segmenter: Punkt[][];
}
const magnetPunkter = (m: Magnetlasso) => [m.start, ...m.segmenter.flat()];
const magnetAnker = (m: Magnetlasso) => m.segmenter.at(-1)?.at(-1) ?? m.start;
/** What a drawn field does: red removes (masks), green protects. */
type Felttype = 'masker' | 'beskytt';
type Redigerverktoy = 'spor' | 'lag' | 'farger' | 'omrade' | 'del' | 'flytt' | 'linje' | 'punkt' | 'penn';
interface Visning {
  skala: number;
  tx: number;
  ty: number;
}
interface Resultat {
  modell: Vektormodell;
  /** Trace pixels per original pixel. */
  faktor: number;
  utsnitt: Rektangel;
  fjernet: number;
}

/** User-facing size settings are in pixels of the original image. */
interface Rensevalg {
  stoyfilter: number;
  minAreal: number;
  minTykkelse: number;
  minHull: number;
  smaaDeler: Regionvalg['smaaDeler'];
}

/** What a project file and the autosave keep beside the image and the masks. */
interface Prosjekttilstand {
  nivaa: Nivaa;
  steg: Steg;
  utsnitt: Rektangel;
  farger: number;
  terskel: number | null;
  inverter: boolean;
  fjernBakgrunn: boolean;
  rens: Rensevalg;
  tilpasning: Tilpasningsvalg;
  maksSide: number;
  forhandsvalgId: string | null;
  lagMeta: Lagkart;
  lagRekkefolge: string[];
  /** The image size the vector belongs to. */
  bildestorrelse: { bredde: number; hoyde: number };
  resultat: { faktor: number; utsnitt: Rektangel; fjernet: number } | null;
  modell: Vektormodell | null;
  /** The vector as traced, before edits, so undo can go back to it. */
  grunnmodell: Vektormodell | null;
  /** Finalize: size and contour. */
  ferdig?: {
    breddeMm: number | null;
    enhet: 'mm' | 'cm';
    konturPa: boolean;
    konturAvstand: number;
    konturType: 'linje' | 'flate';
    konturFarge: string;
    minBredde: number;
  };
}

const erTall = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const erRektangel = (v: unknown): v is Rektangel =>
  !!v &&
  typeof v === 'object' &&
  ['x', 'y', 'b', 'h'].every((k) => erTall((v as Record<string, unknown>)[k]));
const erModell = (v: unknown): v is Vektormodell =>
  !!v &&
  typeof v === 'object' &&
  Array.isArray((v as Vektormodell).deler) &&
  Array.isArray((v as Vektormodell).kurver) &&
  erTall((v as Vektormodell).bredde) &&
  erTall((v as Vektormodell).hoyde);

interface Forhandsvalg {
  id: string;
  navn: string;
  hjelp: string;
  /** Number of colours; left out, the preset keeps the user's choice. */
  farger?: number;
  tilpasning: Partial<Tilpasningsvalg>;
  rens: Partial<Rensevalg>;
}

const FORHANDSVALG: Forhandsvalg[] = [
  {
    id: 'logo',
    navn: 'Logo',
    hjelp: 'Rene flater og skarpe hjørner. Beholder antall farger.',
    tilpasning: {
      glatting: 1.2,
      hjorneVinkel: 55,
      hjorneSkala: 4,
      kurveToleranse: 0.8,
      rettToleranse: 0.8,
      beregnForm: true,
    },
    rens: { stoyfilter: 1, minAreal: 16, minHull: 16, minTykkelse: 1.5 },
  },
  {
    id: 'strek',
    navn: 'Strek',
    hjelp: 'Tegninger og håndskrift i én farge.',
    farger: 1,
    tilpasning: {
      glatting: 2,
      hjorneVinkel: 75,
      hjorneSkala: 6,
      kurveToleranse: 1.4,
      rettToleranse: 0.6,
      beregnForm: true,
    },
    rens: { stoyfilter: 2, minAreal: 40, minHull: 40, minTykkelse: 1 },
  },
  {
    id: 'foto',
    navn: 'Foto',
    hjelp: 'Bilder med mange farger: seks farger, mer glatting og færre småbiter.',
    farger: 6,
    tilpasning: {
      glatting: 2.2,
      hjorneVinkel: 80,
      hjorneSkala: 8,
      kurveToleranse: 1.8,
      rettToleranse: 0.6,
      beregnForm: false,
    },
    rens: { stoyfilter: 3, minAreal: 120, minHull: 120, minTykkelse: 2 },
  },
  {
    id: 'skiltvinyl',
    navn: 'Skiltvinyl',
    hjelp: 'Til skjæring og print: ingen tynne streker eller småbiter, jevne kurver.',
    tilpasning: {
      glatting: 1.6,
      hjorneVinkel: 60,
      hjorneSkala: 5,
      kurveToleranse: 1.0,
      rettToleranse: 0.8,
      beregnForm: true,
    },
    rens: { stoyfilter: 2, minAreal: 80, minHull: 60, minTykkelse: 4, smaaDeler: 'sla-sammen' },
  },
  {
    id: 'detalj',
    navn: 'Detaljert',
    hjelp: 'Tar med små detaljer og følger kanten tett.',
    tilpasning: {
      glatting: 0.8,
      hjorneVinkel: 50,
      hjorneSkala: 3,
      kurveToleranse: 0.5,
      rettToleranse: 0.5,
      beregnForm: true,
    },
    rens: { stoyfilter: 0, minAreal: 4, minHull: 4, minTykkelse: 0.5 },
  },
];

const STANDARD_RENS: Rensevalg = {
  stoyfilter: 1,
  minAreal: 16,
  minTykkelse: 1.5,
  minHull: 16,
  smaaDeler: 'sla-sammen',
};

const MAKS_HISTORIKK = 60;

/** Path data for one curve on its own, for the border overlay. */
function kurveSti(k: Kurve): string {
  const a = k.ankre;
  if (!a.length) return '';
  let d = `M${a[0]!.x} ${a[0]!.y}`;
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1]!,
      q = a[i]!;
    d +=
      p.ut || q.inn
        ? `C${(p.ut ?? [p.x, p.y]).join(' ')} ${(q.inn ?? [q.x, q.y]).join(' ')} ${q.x} ${q.y}`
        : `L${q.x} ${q.y}`;
  }
  return d;
}

function lastNed(navn: string, innhold: string | Blob) {
  const blob = typeof innhold === 'string' ? new Blob([innhold], { type: 'image/svg+xml' }) : innhold;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = navn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Glidebryter(props: {
  navn: string;
  verdi: number;
  min: number;
  max: number;
  steg: number;
  enhet?: string;
  hjelp?: string;
  endre: (v: number) => void;
  av?: boolean;
}) {
  const id = `vv-${props.navn.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div class="vv-felt">
      <label for={id}>
        <span>{props.navn}</span>
        <output for={id}>
          {Number.isFinite(props.verdi) ? +props.verdi.toFixed(2) : '∞'}
          {props.enhet ? ` ${props.enhet}` : ''}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.steg}
        value={props.verdi}
        disabled={props.av}
        onInput={(e) => props.endre(Number((e.target as HTMLInputElement).value))}
      />
      {props.hjelp && <small class="vv-hjelp">{props.hjelp}</small>}
    </div>
  );
}

/** A button with an icon from Sign Forge's icon set and its name beside it. */
/** CSS colour stops for the spectrum: each step at its place, gaps left to blend. */
function spekterstopp(farger: ({ r: number; g: number; b: number } | null)[]): string {
  const stopp = farger
    .map((f, i) => (f ? `rgb(${f.r} ${f.g} ${f.b}) ${(((i + 0.5) / SPEKTERSTEG) * 100).toFixed(1)}%` : null))
    .filter(Boolean);
  return stopp.length > 1 ? stopp.join(', ') : `${stopp[0] ?? 'transparent'}, ${stopp[0] ?? 'transparent'}`;
}

const rgbaTekst = (f: Rgba) =>
  `rgb(${Math.round(f.r)} ${Math.round(f.g)} ${Math.round(f.b)} / ${(f.a / 255).toFixed(2)})`;

function Knapp(props: {
  ikon: IkonId;
  navn: string;
  klasse?: string;
  onClick: () => void;
  av?: boolean;
  tittel?: string;
  trykket?: boolean;
  tast?: string;
}) {
  return (
    <button
      type="button"
      class={`${props.klasse ?? 'vv-sekundar'} vv-ikonknapp`}
      onClick={props.onClick}
      disabled={props.av}
      title={props.tittel}
      aria-pressed={props.trykket}
      aria-keyshortcuts={props.tast}
      data-tips={props.tast ? `${props.navn} (${props.tast})` : props.navn}
    >
      <Ikon id={props.ikon} storrelse={18} />
      <span>{props.navn}</span>
      {props.tast && <kbd>{props.tast}</kbd>}
    </button>
  );
}

/** A pen point moved, handles along. */
function flyttPennpunkt(a: Anker, dx: number, dy: number): Anker {
  return {
    ...a,
    x: a.x + dx,
    y: a.y + dy,
    inn: a.inn ? [a.inn[0] + dx, a.inn[1] + dy] : null,
    ut: a.ut ? [a.ut[0] + dx, a.ut[1] + dy] : null,
  };
}

/** Path data of the pen path being drawn. */
function pennSti(ankre: Anker[], lukket: boolean): string {
  const f = (p: { x: number; y: number } | [number, number]) =>
    'x' in p ? `${p.x} ${p.y}` : `${p[0]} ${p[1]}`;
  let d = '';
  const n = ankre.length;
  for (let i = 0; i < n; i++) {
    const a = ankre[i]!;
    if (!i) d = `M${f(a)}`;
    const b = ankre[i + 1] ?? (lukket ? ankre[0]! : null);
    if (!b) break;
    d += a.ut || b.inn ? `C${f(a.ut ?? a)} ${f(b.inn ?? b)} ${f(b)}` : `L${f(b)}`;
  }
  return d;
}

export function Vektorverksted(props: { ferdig?: (svg: string, navn: string) => void; lukk?: () => void }) {
  const [nivaa, settNivaa] = useState<Nivaa>('enkel');
  const [hjelpApen, settHjelpApen] = useState(false);
  const [felttype, settFelttype] = useState<Felttype>('masker');
  /** Lasso and rectangle with Mask: keep only the inside (everything outside is masked). */
  const [beholdInnsiden, settBeholdInnsiden] = useState(false);
  const [rekt, settRekt] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [forhandsvalgId, settForhandsvalgId] = useState<string | null>(null);
  const [fargeTerskel, settFargeTerskel] = useState(40);
  const [fargeMaal, settFargeMaal] = useState(3);
  /** Layers (one per colour): name, hidden, locked, and their order, bottom first. */
  const [lagMeta, settLagMeta] = useState<Lagkart>({});
  const [lagRekkefolge, settLagRekkefolge] = useState<string[]>([]);
  /** The area marked for «Tegn på nytt», in vector units, and its own settings. */
  const [lokalOmrade, settLokalOmrade] = useState<Omrade | null>(null);
  const [lokalTilpasning, settLokalTilpasning] = useState<Tilpasningsvalg>(STANDARD_TILPASNING);
  const [lokalMinAreal, settLokalMinAreal] = useState(0);
  const [lokalMelding, settLokalMelding] = useState<string | null>(null);
  const [kilde, settKilde] = useState<Kildebilde | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [steg, settSteg] = useState<Steg>('masker');
  const [utsnitt, settUtsnitt] = useState<Rektangel>({ x: 0, y: 0, b: 1, h: 1 });
  const maske = useRef<HTMLCanvasElement | null>(null);
  const [maskeVersjon, settMaskeVersjon] = useState(0);
  const maskeAngre = useRef<{ maske: ImageData; beskytt: ImageData }[]>([]);
  /** Protected areas: never removed, and kept as parts even in the background colour. */
  const beskytt = useRef<HTMLCanvasElement | null>(null);
  const beskyttHolder = useRef<HTMLDivElement>(null);
  const [fverktoy, settFverktoy] = useState<Forberedverktoy | null>(null);
  const [pensel, settPensel] = useState(24);
  const [utvalg, settUtvalg] = useState<Utvalg | null>(null);
  const [toleranse, settToleranse] = useState(32);
  const [sammenhengende, settSammenhengende] = useState(true);
  const [utvidPx, settUtvidPx] = useState(2);
  const maskeData = useRef<{ url: string; data: ImageData } | null>(null);
  const utvalgLerret = useRef<HTMLCanvasElement | null>(null);
  const utvalgHolder = useRef<HTMLDivElement>(null);

  const [farger, settFarger] = useState(1);
  const [terskel, settTerskel] = useState<number | null>(null);
  const [inverter, settInverter] = useState(false);
  const [fjernBakgrunn, settFjernBakgrunn] = useState(true);
  const [rens, settRens] = useState<Rensevalg>(STANDARD_RENS);
  const [tilpasning, settTilpasning] = useState<Tilpasningsvalg>(STANDARD_TILPASNING);
  const [maksSide, settMaksSide] = useState(1200);

  const [resultat, settResultat] = useState<Resultat | null>(null);
  const [brukteTerskel, settBrukteTerskel] = useState<number | null>(null);
  const [jobber, settJobber] = useState(false);
  const [modell, settModellRa] = useState<Vektormodell | null>(null);
  const fortid = useRef<Vektormodell[]>([]);
  const fremtid = useRef<Vektormodell[]>([]);
  const [, settHistorikkTikk] = useState(0);
  const [rverktoy, settRverktoy] = useState<Redigerverktoy>('spor');
  const [valgteDeler, settValgteDeler] = useState<number[]>([]);
  const [valgteKurver, settValgteKurver] = useState<number[]>([]);
  const [valgtAnker, settValgtAnker] = useState<{ kurve: number; idx: number } | null>(null);
  const [styrke, settStyrke] = useState(0.4);
  const [visOriginal, settVisOriginal] = useState(0.25);
  const [visKanter, settVisKanter] = useState(true);
  const [grupper, settGrupper] = useState(true);
  /** The field being drawn with the pen, in vector coordinates. */
  const [penn, settPenn] = useState<Anker[]>([]);
  const [pennFarge, settPennFarge] = useState('#000000');
  const [pennSlaSammen, settPennSlaSammen] = useState(true);
  const [pennMelding, settPennMelding] = useState<string | null>(null);
  /** The image before the last applied crop or added image, with the vector it had, to undo it. */
  const bildeAngre = useRef<{
    hva: 'beskjaer' | 'leggtil';
    kilde: Kildebilde;
    maske: HTMLCanvasElement;
    beskytt: HTMLCanvasElement;
    utsnitt: Rektangel;
    resultat: Resultat | null;
    modell: Vektormodell | null;
    fortid: Vektormodell[];
  } | null>(null);
  /** «Legg til bilde»: where the next image goes. */
  const [plassering, settPlassering] = useState<Plassering>('hoyre');
  const [leggerTil, settLeggerTil] = useState(false);
  const leggTilVelger = useRef<HTMLInputElement>(null);
  /** An autosaved project found when the tool opens, offered on the start screen. */
  const [lagretProsjekt, settLagretProsjekt] = useState<Prosjekt | null>(null);
  const [lagreStatus, settLagreStatus] = useState<string | null>(null);
  const [autolagring, settAutolagring] = useState<'av' | 'lagret' | 'feil'>('av');
  // Finalize (Sivert approved: preview against light/dark and as a sign, size in mm,
  // simplify for cutting with a minimum width warning, contour, flatten, PNG/DXF)
  const [bakgrunn, settBakgrunn] = useState<'rutenett' | 'lys' | 'mork' | 'skilt'>('rutenett');
  const [skiltfarge, settSkiltfarge] = useState('#ffffff');
  /** The width in mm the vector is exported at; null follows the image (96 px per inch). */
  const [breddeMm, settBreddeMm] = useState<number | null>(null);
  const [enhet, settEnhet] = useState<'mm' | 'cm'>('mm');
  const [minBredde, settMinBredde] = useState(1);
  const [tynne, settTynne] = useState<{ modell: Vektormodell; mm: number; deler: TynnDel[] } | null>(null);
  const [konturPa, settKonturPa] = useState(false);
  const [konturAvstand, settKonturAvstand] = useState(3);
  const [konturType, settKonturType] = useState<'linje' | 'flate'>('linje');
  const [konturFarge, settKonturFarge] = useState('#ffffff');
  const [flatFarge, settFlatFarge] = useState('#000000');
  const [forenkleStyrke, settForenkleStyrke] = useState(0.3);
  const [dpi, settDpi] = useState(300);
  const [ferdigMelding, settFerdigMelding] = useState<string | null>(null);
  /** Split view: the original left of the line, the vector right of it (percent of the width). */
  const [delt, settDelt] = useState<number | null>(null);
  /** Set when a vector is restored (project, undo): the next conversion adopts it instead of tracing. */
  const ventGjenopprett = useRef(false);
  /** The source image as PNG, made once per image for saving. */
  const bildeBlob = useRef<{ url: string; blob: Blob } | null>(null);
  const [beskjaerer, settBeskjaerer] = useState(false);

  const [visning, settVisning] = useState<Visning>({ skala: 1, tx: 0, ty: 0 });
  const flate = useRef<HTMLDivElement>(null);
  const maskeHolder = useRef<HTMLDivElement>(null);
  const filvelger = useRef<HTMLInputElement>(null);
  const [peker, settPeker] = useState<{ x: number; y: number } | null>(null);
  const [lasso, settLasso] = useState<{ x: number; y: number }[] | null>(null);
  const [magnet, settMagnet] = useState<Magnetlasso | null>(null);
  const rotRef = useRef<HTMLDivElement>(null);
  /**
   * The wand's last pick: the colour and where (mask pixels), or the image
   * edge for «Bakgrunn». While it stands alone (no Shift or Alt), the
   * selection follows the tolerance slider.
   */
  const [stavvalg, settStavvalg] = useState<
    | { type: 'punkt'; x: number; y: number; farge: Rgba; alene: boolean }
    | { type: 'kant'; farge: Rgba }
    | null
  >(null);
  /** How far from the pointer the magnetic lasso looks for an edge (image px), as Photoshop's «Width». */
  const [magnetBredde, settMagnetBredde] = useState(10);
  const kantkartRef = useRef<{ url: string; kart: Kantkart; s: number } | null>(null);
  const [omrade, settOmrade] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dra = useRef<
    | null
    | { type: 'panorer'; x: number; y: number; tx: number; ty: number }
    | { type: 'pensel'; siste: { x: number; y: number } }
    | { type: 'lasso' }
    | { type: 'rekt' }
    | { type: 'beskjaer'; modus: string; start: { x: number; y: number }; fra: Rektangel }
    | { type: 'omrade'; leggTil: boolean }
    | { type: 'lokal'; start: { x: number; y: number } }
    | { type: 'penn'; idx: number; start: { x: number; y: number }; siste: { x: number; y: number } }
    | {
        type: 'pennpunkt';
        idx: number;
        side: 'punkt' | 'inn' | 'ut';
        start: { x: number; y: number };
        flyttet: boolean;
        lukk: boolean;
      }
    | { type: 'anker'; kurve: number; idx: number; base: Vektormodell }
    | { type: 'flytt'; start: { x: number; y: number }; base: Vektormodell; ider: number[] }
    | { type: 'handtak'; kurve: number; idx: number; side: 'inn' | 'ut'; base: Vektormodell; bryt: boolean }
  >(null);
  const mellomrom = useRef(false);

  const redigert = fortid.current.length > 0;
  /** The mask and its tools show only in Advanced's Mask mode; elsewhere the vector shows. */
  const viserMaske = nivaa === 'avansert' && steg === 'masker';
  /** Editing tools work only in Advanced's Edit mode. */
  const kanRedigere = nivaa === 'avansert' && steg === 'rediger';

  // ------------------------------------------------------------ image

  const tilpassVisning = useCallback(
    (r?: Rektangel) => {
      const el = flate.current;
      if (!el || !kilde) return;
      const omr = r ?? { x: 0, y: 0, b: kilde.bredde, h: kilde.hoyde };
      const b = el.clientWidth,
        h = el.clientHeight;
      const skala = Math.min((b - 48) / omr.b, (h - 48) / omr.h);
      settVisning({
        skala,
        tx: (b - omr.b * skala) / 2 - omr.x * skala,
        ty: (h - omr.h * skala) / 2 - omr.y * skala,
      });
    },
    [kilde],
  );

  /** A new image (or a saved project) replaces what is open. */
  const velgFil = async (f: File | undefined) => {
    if (!f) return;
    if (erProsjektfil(f)) {
      try {
        await apneProsjekt(await prosjektFraFil(f));
      } catch (e) {
        settFeil(e instanceof Error ? e.message : 'Prosjektet kunne ikke åpnes.');
      }
      return;
    }
    try {
      const k = await lesBildefil(f);
      startBilde(k, nyMaske(k), nyMaske(k));
      settSteg('masker');
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Bildet kunne ikke leses.');
    }
  };

  /** Everything about the open image is reset for a new one. */
  const startBilde = (k: Kildebilde, m: HTMLCanvasElement, b: HTMLCanvasElement) => {
    if (kilde) URL.revokeObjectURL(kilde.url);
    if (bildeAngre.current) URL.revokeObjectURL(bildeAngre.current.kilde.url);
    bildeAngre.current = null;
    maskeData.current = null;
    kartMinne.current = null;
    settUtvalg(null);
    settPenn([]);
    maske.current = m;
    beskytt.current = b;
    maskeAngre.current = [];
    settKilde(k);
    settUtsnitt({ x: 0, y: 0, b: k.bredde, h: k.hoyde });
    settFverktoy(null);
    settResultat(null);
    settModellRa(null);
    fortid.current = [];
    fremtid.current = [];
    settLagMeta({});
    settLagRekkefolge([]);
    settLokalOmrade(null);
    settBreddeMm(null);
    settTynne(null);
    settFeil(null);
    settLagretProsjekt(null);
    settMaskeVersjon((v) => v + 1);
  };

  // ------------------------------------------------------------ projects

  /** Opens a saved project: the image, the masks, the settings and the vector as they were. */
  const apneProsjekt = async (p: Prosjekt) => {
    const k = await kildeFraBlob(p.bilde, p.navn);
    const m = await maskeFraBlob(k, p.maske);
    const b = await maskeFraBlob(k, p.beskytt);
    startBilde(k, m, b);
    bildeBlob.current = { url: k.url, blob: p.bilde };
    const t = (p.tilstand ?? {}) as Partial<Prosjekttilstand>;
    if (t.nivaa === 'enkel' || t.nivaa === 'avansert') settNivaa(t.nivaa);
    settSteg(t.steg === 'rediger' || t.steg === 'ferdig' ? t.steg : 'masker');
    if (erRektangel(t.utsnitt)) settUtsnitt(t.utsnitt);
    if (erTall(t.farger)) settFarger(t.farger);
    if (t.terskel === null || erTall(t.terskel)) settTerskel(t.terskel);
    if (typeof t.inverter === 'boolean') settInverter(t.inverter);
    if (typeof t.fjernBakgrunn === 'boolean') settFjernBakgrunn(t.fjernBakgrunn);
    if (t.rens && typeof t.rens === 'object') settRens({ ...STANDARD_RENS, ...t.rens });
    if (t.tilpasning && typeof t.tilpasning === 'object')
      settTilpasning({ ...STANDARD_TILPASNING, ...t.tilpasning });
    if (erTall(t.maksSide)) settMaksSide(t.maksSide);
    settForhandsvalgId(typeof t.forhandsvalgId === 'string' ? t.forhandsvalgId : null);
    if (t.lagMeta && typeof t.lagMeta === 'object') settLagMeta(t.lagMeta);
    if (Array.isArray(t.lagRekkefolge))
      settLagRekkefolge(t.lagRekkefolge.filter((f) => typeof f === 'string'));
    // the vector only fits the image it was made from
    const sammeBilde = t.bildestorrelse?.bredde === k.bredde && t.bildestorrelse?.hoyde === k.hoyde;
    if (
      sammeBilde &&
      erModell(t.modell) &&
      t.resultat &&
      erRektangel(t.resultat.utsnitt) &&
      erTall(t.resultat.faktor)
    ) {
      const grunn = erModell(t.grunnmodell) ? t.grunnmodell : t.modell;
      ventGjenopprett.current = true;
      settResultat({
        ...t.resultat,
        fjernet: erTall(t.resultat.fjernet) ? t.resultat.fjernet : 0,
        modell: grunn,
      });
      settModellRa(t.modell);
      fortid.current = grunn !== t.modell ? [grunn] : [];
    }
    const f = t.ferdig;
    settBreddeMm(f && erTall(f.breddeMm) && f.breddeMm > 0 ? f.breddeMm : null);
    if (f?.enhet === 'mm' || f?.enhet === 'cm') settEnhet(f.enhet);
    settKonturPa(f?.konturPa === true);
    if (f && erTall(f.konturAvstand)) settKonturAvstand(f.konturAvstand);
    if (f?.konturType === 'linje' || f?.konturType === 'flate') settKonturType(f.konturType);
    if (typeof f?.konturFarge === 'string' && /^#[0-9a-f]{6}$/i.test(f.konturFarge))
      settKonturFarge(f.konturFarge);
    if (f && erTall(f.minBredde)) settMinBredde(f.minBredde);
    settLagreStatus(`Prosjektet «${p.navn}» er åpnet.`);
  };

  /** The open work as a project. */
  const lagProsjekt = async (): Promise<Prosjekt | null> => {
    if (!kilde || !maske.current || !beskytt.current) return null;
    let bilde = bildeBlob.current?.url === kilde.url ? bildeBlob.current.blob : null;
    if (!bilde) {
      const c = document.createElement('canvas');
      c.width = kilde.bredde;
      c.height = kilde.hoyde;
      c.getContext('2d')!.drawImage(kilde.bilde, 0, 0);
      bilde = await lerretTilPng(c);
      c.width = c.height = 0;
      if (!bilde) return null;
      bildeBlob.current = { url: kilde.url, blob: bilde };
    }
    const tilstand: Prosjekttilstand = {
      nivaa,
      steg,
      utsnitt,
      farger,
      terskel,
      inverter,
      fjernBakgrunn,
      rens,
      tilpasning,
      maksSide,
      forhandsvalgId,
      lagMeta,
      lagRekkefolge,
      bildestorrelse: { bredde: kilde.bredde, hoyde: kilde.hoyde },
      resultat: resultat
        ? { faktor: resultat.faktor, utsnitt: resultat.utsnitt, fjernet: resultat.fjernet }
        : null,
      modell,
      grunnmodell: resultat && resultat.modell !== modell ? resultat.modell : null,
      ferdig: { breddeMm, enhet, konturPa, konturAvstand, konturType, konturFarge, minBredde },
    };
    return {
      versjon: 1,
      navn: kilde.navn,
      lagret: Date.now(),
      bilde,
      maske: await lerretTilPng(maske.current),
      beskytt: await lerretTilPng(beskytt.current),
      tilstand,
    };
  };

  const lagreProsjektfil = async () => {
    try {
      const p = await lagProsjekt();
      if (!p) return;
      lastNed(`${p.navn}${FILENDELSE}`, await prosjektTilFil(p));
      settLagreStatus(
        `Prosjektet er lastet ned som «${p.navn}${FILENDELSE}». Åpne det igjen med «Velg bilde».`,
      );
    } catch {
      settFeil('Prosjektet kunne ikke lagres.');
    }
  };

  // an autosaved project is offered when the tool opens without an image
  useEffect(() => {
    let aktiv = true;
    void hentAutomatisk().then((p) => {
      if (aktiv && p) settLagretProsjekt((naa) => naa ?? p);
    });
    return () => {
      aktiv = false;
    };
  }, []);

  // autosave a moment after the last change
  useEffect(() => {
    if (!kilde || jobber) return;
    let aktiv = true;
    const t = window.setTimeout(() => {
      void lagProsjekt()
        .then((p) => (p && aktiv ? lagreAutomatisk(p) : null))
        .then((ok) => {
          if (aktiv && ok !== null) settAutolagring(ok ? 'lagret' : 'feil');
        })
        .catch(() => aktiv && settAutolagring('feil'));
    }, 1500);
    return () => {
      aktiv = false;
      clearTimeout(t);
    };
    // lagProsjekt reads exactly these
  }, [
    kilde,
    maskeVersjon,
    utsnitt,
    modell,
    farger,
    terskel,
    inverter,
    fjernBakgrunn,
    rens,
    tilpasning,
    maksSide,
    lagMeta,
    lagRekkefolge,
    nivaa,
    steg,
    jobber,
    breddeMm,
    enhet,
    konturPa,
    konturAvstand,
    konturType,
    konturFarge,
    minBredde,
  ]);

  useEffect(() => {
    if (!ferdigMelding) return;
    const t = window.setTimeout(() => settFerdigMelding(null), 8000);
    return () => clearTimeout(t);
  }, [ferdigMelding]);

  useEffect(() => {
    if (!lagreStatus) return;
    const t = window.setTimeout(() => settLagreStatus(null), 8000);
    return () => clearTimeout(t);
  }, [lagreStatus]);

  const fortsettLagret = async () => {
    const p = lagretProsjekt;
    if (!p) return;
    try {
      await apneProsjekt(p);
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Prosjektet kunne ikke åpnes.');
    }
  };
  const forkastLagret = () => {
    settLagretProsjekt(null);
    void slettAutomatisk();
  };

  // paste: an image opens, or is added beside the open one. The listener is
  // set once and reads the latest state through a ref, since effects run a frame late.
  const limInnRef = useRef<(f: File) => void>(() => {});
  limInnRef.current = (f) => void (kilde ? leggTil(f) : velgFil(f));
  useEffect(() => {
    const lim = (e: ClipboardEvent) => {
      const mal = e.target as HTMLElement | null;
      if (mal?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const fil = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!fil) return;
      e.preventDefault();
      limInnRef.current(
        fil.name && fil.name !== 'image.png' ? fil : new File([fil], 'Innlimt bilde.png', { type: fil.type }),
      );
    };
    window.addEventListener('paste', lim);
    return () => window.removeEventListener('paste', lim);
  }, []);

  useEffect(() => {
    if (kilde) tilpassVisning();
  }, [kilde, tilpassVisning]);

  // the mask canvas lives in the DOM over the image
  useEffect(() => {
    const holder = maskeHolder.current;
    const c = maske.current;
    if (!holder || !c || !kilde) return;
    if (c.parentElement !== holder) {
      holder.replaceChildren(c);
      c.className = 'vv-maske';
      c.style.width = `${kilde.bredde}px`;
      c.style.height = `${kilde.hoyde}px`;
    }
  });

  useEffect(() => {
    const holder = beskyttHolder.current;
    const c = beskytt.current;
    if (!holder || !c || !kilde) return;
    if (c.parentElement !== holder) {
      holder.replaceChildren(c);
      c.className = 'vv-beskytt';
      c.style.width = `${kilde.bredde}px`;
      c.style.height = `${kilde.hoyde}px`;
    }
  });

  const lagreMaskeAngre = () => {
    if (!maske.current || !beskytt.current) return;
    maskeAngre.current.push({ maske: maskeKopi(maske.current), beskytt: maskeKopi(beskytt.current) });
    // each step holds two mask-sized copies: few, so a phone keeps up
    if (maskeAngre.current.length > 8) maskeAngre.current.shift();
  };
  /** After every change to the mask: protected areas are cut out of it again. */
  const oppdaterMaske = () => {
    if (maske.current && beskytt.current) beskyttMaske(maske.current, beskytt.current);
    settMaskeVersjon((v) => v + 1);
  };
  const angreMaske = () => {
    const d = maskeAngre.current.pop();
    if (d && maske.current && beskytt.current) {
      settMaske(maske.current, d.maske);
      settMaske(beskytt.current, d.beskytt);
      settMaskeVersjon((v) => v + 1);
    }
  };

  /** A drawn field (lasso or rectangle) is masked (red) or protected (green), as chosen. */
  const fyllFelt = (punkter: { x: number; y: number }[]) => {
    if (!kilde || !maske.current || !beskytt.current) return;
    lagreMaskeAngre();
    if (felttype === 'beskytt') malLasso(kilde, beskytt.current, punkter, 'fjern', BESKYTTFARGE);
    else malLasso(kilde, maske.current, punkter, beholdInnsiden ? 'behold' : 'fjern');
    oppdaterMaske();
  };

  // ------------------------------------------------------------ magnetic lasso

  /** The edge map for the magnetic lasso, made once per image. */
  const kantkart = () => {
    const d = bildedata();
    if (!d || !kilde) return null;
    if (kantkartRef.current?.url !== kilde.url)
      kantkartRef.current = {
        url: kilde.url,
        kart: lagKantkart(d.data, d.width, d.height),
        s: d.width / kilde.bredde,
      };
    return kantkartRef.current;
  };

  /** Where p snaps to: the strongest edge within the width, in image coordinates. */
  const festMagnet = (p: Punkt): Punkt => {
    const k = kantkart();
    if (!k) return p;
    const q = festTilKant(k.kart, { x: p.x * k.s, y: p.y * k.s }, magnetBredde * k.s);
    return { x: q.x / k.s, y: q.y / k.s };
  };

  /** The edge path from an anchor to p (snapped), in image coordinates; the anchor itself is left out. */
  const magnetSti = (fra: Punkt, p: Punkt): Punkt[] => {
    const k = kantkart();
    const til = festMagnet(p);
    if (!k) return [til];
    const sti = kantsti(
      k.kart,
      { x: fra.x * k.s, y: fra.y * k.s },
      { x: til.x * k.s, y: til.y * k.s },
      Math.max(8, Math.round(magnetBredde * k.s * 1.5)),
    );
    return forenkleSti(sti)
      .slice(1)
      .map((q) => ({ x: q.x / k.s, y: q.y / k.s }));
  };

  /** Closes the magnetic lasso and fills it as a field (masked or protected). */
  const lukkMagnet = (m: Magnetlasso | null = magnet, siste: Punkt[] = []) => {
    if (m) {
      const punkter = [...magnetPunkter(m), ...siste];
      if (punkter.length > 2) fyllFelt(punkter);
    }
    settMagnet(null);
    settLasso(null);
  };

  const avbrytMagnet = () => {
    settMagnet(null);
    settLasso(null);
  };

  // a half-drawn magnetic lasso ends when the tool, the mode or the image changes
  useEffect(avbrytMagnet, [fverktoy, steg, kilde?.url]);

  // ------------------------------------------------------------ crop

  const helt = (k: Kildebilde, u: Rektangel) => u.x === 0 && u.y === 0 && u.b === k.bredde && u.h === k.hoyde;

  /** Cuts the image, the mask and the protection to the crop. One step can be undone. */
  const brukBeskjaering = async () => {
    if (!kilde || !maske.current || !beskytt.current || beskjaerer || helt(kilde, utsnitt)) return;
    settBeskjaerer(true);
    try {
      const r = await beskjaerBilde(kilde, maske.current, beskytt.current, utsnitt);
      if (bildeAngre.current) URL.revokeObjectURL(bildeAngre.current.kilde.url);
      bildeAngre.current = {
        hva: 'beskjaer',
        kilde,
        maske: maske.current,
        beskytt: beskytt.current,
        utsnitt: { ...utsnitt },
        resultat,
        modell,
        fortid: [...fortid.current],
      };
      byttBilde(r.kilde, r.maske, r.beskytt, { x: 0, y: 0, b: r.kilde.bredde, h: r.kilde.hoyde });
      settFverktoy(null);
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Bildet kunne ikke beskjæres.');
    } finally {
      settBeskjaerer(false);
    }
  };
  /** Undoes the last crop or added image, and brings back the vector from before it. */
  const angreBilde = () => {
    const g = bildeAngre.current;
    if (!g || !kilde) return;
    URL.revokeObjectURL(kilde.url);
    bildeAngre.current = null;
    byttBilde(g.kilde, g.maske, g.beskytt, g.utsnitt);
    if (g.modell && g.resultat) {
      ventGjenopprett.current = true;
      settResultat(g.resultat);
      settModellRa(g.modell);
      fortid.current = g.fortid;
    }
  };

  /**
   * «Legg til bilde»: the image is placed beside or below the current one and
   * both are vectorised together. One step can be undone.
   */
  const leggTil = async (f: File | undefined) => {
    if (!f) return;
    if (!kilde || !maske.current || !beskytt.current) return void velgFil(f);
    if (leggerTil) return;
    settLeggerTil(true);
    let ny: Kildebilde | null = null;
    try {
      ny = await lesBildefil(f);
      const r = await leggTilBilde(kilde, maske.current, beskytt.current, ny, plassering);
      if (bildeAngre.current) URL.revokeObjectURL(bildeAngre.current.kilde.url);
      bildeAngre.current = {
        hva: 'leggtil',
        kilde,
        maske: maske.current,
        beskytt: beskytt.current,
        utsnitt: { ...utsnitt },
        resultat,
        modell,
        fortid: [...fortid.current],
      };
      byttBilde(r.kilde, r.maske, r.beskytt, { x: 0, y: 0, b: r.kilde.bredde, h: r.kilde.hoyde });
      settFeil(null);
      settLagreStatus(
        `«${ny.navn}» er lagt til ${plassering === 'hoyre' ? 'til høyre for' : 'under'} bildet.`,
      );
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Bildet kunne ikke legges til.');
    } finally {
      if (ny) URL.revokeObjectURL(ny.url);
      settLeggerTil(false);
    }
  };
  const byttBilde = (k: Kildebilde, m: HTMLCanvasElement, b: HTMLCanvasElement, u: Rektangel) => {
    maske.current = m;
    beskytt.current = b;
    maskeAngre.current = [];
    maskeData.current = null;
    kartMinne.current = null;
    settUtvalg(null);
    settKilde(k);
    settUtsnitt(u);
    settResultat(null);
    settModellRa(null);
    fortid.current = [];
    fremtid.current = [];
    settMaskeVersjon((v) => v + 1);
  };

  // ------------------------------------------------------------ magic wand

  /** The image at mask resolution, read once per image. */
  const bildedata = (): ImageData | null => {
    if (!kilde || !maske.current) return null;
    if (maskeData.current?.url !== kilde.url)
      maskeData.current = { url: kilde.url, data: maskepiksler(kilde, maske.current) };
    return maskeData.current.data;
  };

  // the selection is drawn on a canvas of its own over the image
  useEffect(() => {
    const holder = utvalgHolder.current;
    const m = maske.current;
    if (!holder || !m || !kilde) return;
    let c = utvalgLerret.current;
    if (!c || c.width !== m.width || c.height !== m.height) {
      c = document.createElement('canvas');
      c.width = m.width;
      c.height = m.height;
      c.className = 'vv-utvalg';
      utvalgLerret.current = c;
    }
    if (c.parentElement !== holder) holder.replaceChildren(c);
    c.style.width = `${kilde.bredde}px`;
    c.style.height = `${kilde.hoyde}px`;
    const ctx = c.getContext('2d')!;
    if (!utvalg) {
      ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    const bilde = ctx.createImageData(c.width, c.height);
    utvalgsbilde(utvalg, c.width, c.height, bilde.data);
    ctx.putImageData(bilde, 0, 0);
  }, [utvalg, kilde, steg]);

  const bruk = (modus: 'fjern' | 'behold' | 'gjenopprett') => {
    if (!utvalg || !maske.current) return;
    lagreMaskeAngre();
    brukUtvalg(maske.current, utvalg, modus);
    oppdaterMaske();
    settUtvalg(null);
  };

  const beskyttUtvalg = () => {
    if (!utvalg || !beskytt.current) return;
    lagreMaskeAngre();
    brukUtvalg(beskytt.current, utvalg, 'fjern', BESKYTTFARGE);
    oppdaterMaske();
    settUtvalg(null);
  };

  const fjernBakgrunnNa = () => {
    const d = bildedata();
    if (!d || !maske.current) return;
    lagreMaskeAngre();
    brukUtvalg(maske.current, bakgrunnsutvalg(d.data, d.width, d.height, toleranse), 'fjern');
    oppdaterMaske();
  };

  /** The wand from the image edge: the background and everything connected to it. */
  const velgBakgrunn = (t = toleranse) => {
    const d = bildedata();
    if (!d) return;
    settUtvalg(bakgrunnsutvalg(d.data, d.width, d.height, t));
    settStavvalg({ type: 'kant', farge: kantfarge(d.data, d.width, d.height) });
  };

  // the wand's pick belongs to one image
  useEffect(() => settStavvalg(null), [kilde?.url]);

  // a pick that stands alone follows the tolerance and «Bare sammenhengende», so the slider shows what it takes
  useEffect(() => {
    if (!stavvalg || fverktoy !== 'tryllestav') return;
    const d = bildedata();
    if (!d) return;
    if (stavvalg.type === 'kant') settUtvalg(bakgrunnsutvalg(d.data, d.width, d.height, toleranse));
    else if (stavvalg.alene)
      settUtvalg(tryllestav(d.data, d.width, d.height, stavvalg.x, stavvalg.y, toleranse, sammenhengende));
  }, [toleranse, sammenhengende]);

  /** The image's colours ordered by distance from the picked colour, for the slider. */
  const spekter = useMemo(() => {
    const d = stavvalg && bildedata();
    return d && stavvalg ? fargespekter(d.data, d.width, d.height, stavvalg.farge) : null;
  }, [stavvalg, kilde?.url]);

  /** Wand presets (Sivert, 2026-11-12): tolerance and «Bare sammenhengende» in one click. */
  const stavForhand: {
    id: string;
    navn: string;
    toleranse: number;
    sammenhengende: boolean;
    tips: string;
  }[] = [
    {
      id: 'presis',
      navn: 'Presis',
      toleranse: 10,
      sammenhengende: true,
      tips: 'Bare nesten lik farge, og bare det som henger sammen',
    },
    {
      id: 'logo',
      navn: 'Logo',
      toleranse: 32,
      sammenhengende: true,
      tips: 'Flate farger med litt kantutjevning',
    },
    {
      id: 'foto',
      navn: 'Foto',
      toleranse: 70,
      sammenhengende: true,
      tips: 'Skygger og fargeoverganger tas med',
    },
    {
      id: 'alle',
      navn: 'Alle like',
      toleranse: 32,
      sammenhengende: false,
      tips: 'Samme farge overalt i bildet, også det som ikke henger sammen',
    },
  ];

  const endreUtvalg = (r: number) => {
    const m = maske.current;
    if (!utvalg || !m || !kilde) return;
    settUtvalg(utvid(utvalg, m.width, m.height, (r * m.width) / kilde.bredde));
  };

  const valgtAndel = utvalg ? antallValgt(utvalg) / utvalg.length : 0;

  // ------------------------------------------------------------ conversion

  const kartMinne = useRef<{ nokkel: string; kart: Regionkart; faktor: number; utsnitt: Rektangel } | null>(
    null,
  );

  const konverter = useCallback(() => {
    if (!kilde || !maske.current) return null;
    const nokkel = JSON.stringify([
      kilde.url,
      utsnitt,
      maskeVersjon,
      maksSide,
      farger,
      terskel,
      inverter,
      fjernBakgrunn,
      rens,
    ]);
    let k = kartMinne.current;
    if (!k || k.nokkel !== nokkel) {
      const g = sporgrunnlag(kilde, maske.current, utsnitt, maksSide);
      const f = g.faktor;
      const valg: Regionvalg = {
        ...STANDARD_REGIONVALG,
        farger,
        terskel,
        inverter,
        fjernBakgrunn,
        stoyfilter: rens.stoyfilter,
        minAreal: rens.minAreal * f * f,
        minTykkelse: rens.minTykkelse * f,
        minHull: rens.minHull * f * f,
        smaaDeler: rens.smaaDeler,
      };
      const vern = beskytt.current
        ? lesLerret(kilde, beskytt.current, utsnitt, g.piksler.width, g.piksler.height)
        : null;
      const kart = lagRegionkart(g.piksler, g.maske, valg, vern);
      k = { nokkel, kart, faktor: f, utsnitt: { ...utsnitt } };
      kartMinne.current = k;
      settBrukteTerskel(kart.terskel);
    }
    const m = byggModell(k.kart, tilpasning);
    return { modell: m, faktor: k.faktor, utsnitt: k.utsnitt, fjernet: k.kart.fjernet };
  }, [kilde, utsnitt, maskeVersjon, maksSide, farger, terskel, inverter, fjernBakgrunn, rens, tilpasning]);

  /** The conversion the shown model came from: switching modes does not trace again. */
  const sistKonvertert = useRef<typeof konverter | null>(null);
  // a restored vector (project, undone crop) counts as the conversion of the settings it came back with
  useEffect(() => {
    if (ventGjenopprett.current && modell) {
      ventGjenopprett.current = false;
      sistKonvertert.current = konverter;
    }
  }, [konverter, modell]);
  useEffect(() => {
    if (viserMaske || !kilde) return;
    if (redigert) return; // the user decides when edits may be thrown away
    if (sistKonvertert.current === konverter && modell) return;
    let avbrutt = false;
    settJobber(true);
    const t = window.setTimeout(() => {
      if (avbrutt) return;
      try {
        const r = konverter();
        sistKonvertert.current = konverter;
        if (r) {
          settResultat(r);
          settModellRa(r.modell);
          settValgteDeler([]);
          settValgteKurver([]);
          settValgtAnker(null);
        }
        settFeil(
          r && !r.modell.deler.length
            ? 'Fant ingen former. Prøv en annen terskel, Inverter eller flere farger.'
            : null,
        );
      } catch (e) {
        console.error(e);
        settFeil('Bildet kunne ikke konverteres.');
      } finally {
        settJobber(false);
      }
    }, 260);
    return () => {
      avbrutt = true;
      clearTimeout(t);
      // a conversion called off before it ran is not running («Konverterer …» stayed up after a quick edit)
      settJobber(false);
    };
  }, [viserMaske, konverter, redigert, kilde]);

  const konverterPaNytt = () => {
    sistKonvertert.current = null;
    fortid.current = [];
    fremtid.current = [];
    settHistorikkTikk((v) => v + 1);
  };

  // ------------------------------------------------------------ history

  const settModell = (ny: Vektormodell) => {
    if (!modell || ny === modell) return;
    fortid.current.push(modell);
    if (fortid.current.length > MAKS_HISTORIKK) fortid.current.shift();
    fremtid.current = [];
    settModellRa(ny);
    settHistorikkTikk((v) => v + 1);
  };
  const angre = () => {
    const f = fortid.current.pop();
    if (!f || !modell) return;
    fremtid.current.push(modell);
    settModellRa(f);
    settValgtAnker(null);
    settHistorikkTikk((v) => v + 1);
  };
  const gjenta = () => {
    const f = fremtid.current.pop();
    if (!f || !modell) return;
    fortid.current.push(modell);
    settModellRa(f);
    settValgtAnker(null);
    settHistorikkTikk((v) => v + 1);
  };

  // ------------------------------------------------------------ pen

  /** Closes the pen path and adds it as a part, merged with the selected parts if asked. */
  const fullforPenn = () => {
    if (!modell) return;
    if (penn.length < 3) {
      settPennMelding('Et felt trenger minst tre punkter.');
      return;
    }
    const sammen = pennSlaSammen && valgteDeler.length > 0;
    const farge = sammen && valgtFarge ? valgtFarge : pennFarge;
    const { modell: m, id } = leggTilFelt(modell, pennepunkter(penn), farge);
    settPenn([]);
    if (id < 0) {
      settPennMelding('Feltet dekker ingen piksler i bildet. Tegn det større eller innenfor bildet.');
      return;
    }
    if (sammen) {
      const ider = [id, ...valgteDeler.filter((i) => m.deler[i])];
      const ny = slaSammenDeler(m, ider);
      settModell(ny);
      settValgteDeler(ider.filter((i) => ny.deler[i]).slice(0, 1));
      settPennMelding('Feltet er slått sammen med de valgte delene.');
    } else {
      settModell(m);
      settValgteDeler([id]);
      settPennMelding('Feltet er lagt til som en ny del og er valgt.');
    }
  };

  // keep selections pointing at things that still exist
  useEffect(() => {
    if (!modell) return;
    settValgteDeler((v) => v.filter((i) => modell.deler[i]));
    settValgteKurver((v) => v.filter((i) => modell.kurver[i]));
    settValgtAnker((a) => (a && modell.kurver[a.kurve]?.ankre[a.idx] ? a : null));
  }, [modell]);

  // ------------------------------------------------------------ derived

  const skjulteFarger = useMemo(
    () => new Set(Object.entries(lagMeta).flatMap(([f, l]) => (l.skjult ? [f] : []))),
    [lagMeta],
  );
  const lasteFarger = useMemo(
    () => new Set(Object.entries(lagMeta).flatMap(([f, l]) => (l.last ? [f] : []))),
    [lagMeta],
  );
  /** Parts in locked layers: nothing may change them. */
  const lagLaste = useMemo(
    () => (modell ? delerIFarger(modell, lasteFarger) : new Set<number>()),
    [modell, lasteFarger],
  );
  /** Moved, scaled or rotated parts: drawn where they were moved to, edited only with «Flytt». */
  const flyttede = useMemo(() => new Set(modell ? transformerte(modell) : []), [modell]);
  /** Parts the other edit tools leave alone: locked layers and moved parts. */
  const lasteDeler = useMemo(() => new Set([...lagLaste, ...flyttede]), [lagLaste, flyttede]);
  const lagliste = useMemo(
    () => (modell ? lagrekkefolge(modell, lagRekkefolge) : []),
    [modell, lagRekkefolge],
  );
  // the outlines only change with the borders and parts, not when parts are moved
  const kurverOgDeler = modell ? { kurver: modell.kurver, deler: modell.deler } : null;
  const grunnstier = useMemo(() => {
    if (!modell) return [];
    return modell.deler.flatMap((d) =>
      d && !skjulteFarger.has(d.farge) ? [{ id: d.id, farge: d.farge, d: delSti(modell, d) }] : [],
    );
  }, [kurverOgDeler?.kurver, kurverOgDeler?.deler, skjulteFarger]);
  const stier = useMemo(
    () =>
      grunnstier.map((s) => {
        const t = modell?.transformer?.[s.id];
        return t ? { ...s, t: matriseTekst(t) } : { ...s, t: undefined };
      }),
    [grunnstier, modell?.transformer],
  );
  const kantSti = useMemo(() => {
    if (!modell || !visKanter) return '';
    const flyttet = new Set(transformerte(modell));
    const synlig = (id: number) =>
      id >= 0 && !flyttet.has(id) && !skjulteFarger.has(modell.deler[id]?.farge ?? '');
    return modell.kurver
      .map((k) => (k && (synlig(k.venstre) || synlig(k.hoyre)) ? kurveSti(k) : ''))
      .join('');
  }, [modell, visKanter, skjulteFarger]);
  /** Locked layers keep their parts and borders out of every selection. */
  const ulaste = (ider: number[]) =>
    modell ? ider.filter((id) => !kurveLast(modell, id, lasteDeler)) : ider;
  const statistikk = useMemo(() => (modell ? tall(modell) : null), [modell]);
  const fargeliste = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stier) m.set(s.farge, (m.get(s.farge) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [stier]);

  const bruktUtsnitt = resultat?.utsnitt ?? utsnitt;
  /** Screen pixels per vector unit. */
  const pxPerEnhet = modell ? (visning.skala * bruktUtsnitt.b) / modell.bredde : 1;

  // ------------------------------------------------------------ size and contour

  /** Without a chosen size the vector keeps the image's size at 96 px per inch, as before. */
  const standardMm = Math.round(((bruktUtsnitt.b * 25.4) / 96) * 10) / 10;
  const bMm = breddeMm ?? standardMm;
  const mmPerEnhet = modell ? bMm / modell.bredde : 1;
  const hMm = modell ? modell.hoyde * mmPerEnhet : 0;
  const konturSti = useMemo(() => {
    if (!modell || !konturPa || konturAvstand <= 0) return '';
    try {
      return ringerTilSti(
        ringerI(kontur(modell, mmPerEnhet, konturAvstand, true, skjulteFarger)),
        1 / mmPerEnhet,
      );
    } catch (e) {
      console.error(e);
      return '';
    }
  }, [modell, konturPa, konturAvstand, mmPerEnhet, skjulteFarger]);
  /** Finalize shows the preview background, the sign plate and thin places. */
  const iFerdig = nivaa === 'avansert' && steg === 'ferdig';
  /** Room around the motif on the sign preview: 5 mm beyond the contour. */
  const skiltMarg = ((konturPa ? konturAvstand : 0) + 5) / mmPerEnhet;
  // in Finalize the sign plate and the contour reach outside the image: fit them in view
  /** The room the sign plate or contour takes outside the image, in image pixels. */
  const visMarg =
    iFerdig && modell && (bakgrunn === 'skilt' || konturPa)
      ? Math.round((skiltMarg * bruktUtsnitt.b) / modell.bredde)
      : 0;
  useEffect(() => {
    if (!iFerdig || !modell) return;
    const g = visMarg;
    const r = {
      x: bruktUtsnitt.x - g,
      y: bruktUtsnitt.y - g,
      b: bruktUtsnitt.b + 2 * g,
      h: bruktUtsnitt.h + 2 * g,
    };
    // after the mode switch's own fit
    let indre = 0;
    const t = requestAnimationFrame(() => (indre = requestAnimationFrame(() => tilpassVisning(r))));
    return () => {
      cancelAnimationFrame(t);
      cancelAnimationFrame(indre);
    };
    // refit when Finalize opens or the room around changes, not on every edit
  }, [iFerdig, visMarg]);
  /** The box around the parts selected for «Flytt, skaler, roter». */
  const flyttBoks =
    modell && kanRedigere && rverktoy === 'flytt' && valgteDeler.length ? delBoks(modell, valgteDeler) : null;
  /** A transform of the selected parts around the middle of their box, as one undo step. */
  const transformerValgte = (lag: (cx: number, cy: number) => Parameters<typeof transformerDeler>[2]) => {
    if (!modell || !valgteDeler.length) return;
    const b = delBoks(modell, valgteDeler);
    if (!b) return;
    settModell(transformerDeler(modell, valgteDeler, lag((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)));
  };
  const flyttValgte = (dx: number, dy: number) => transformerValgte(() => flyttMatrise(dx, dy));
  const gjeldendeTynne = tynne && tynne.modell === modell && tynne.mm === mmPerEnhet ? tynne : null;
  const iEnhet = (mm: number) => (enhet === 'cm' ? +(mm / 10).toFixed(2) : +mm.toFixed(1));
  const fraEnhet = (v: number) => (enhet === 'cm' ? v * 10 : v);

  // ------------------------------------------------------------ pointer

  const tilBilde = (e: { clientX: number; clientY: number }) => {
    const r = flate.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - visning.tx) / visning.skala,
      y: (e.clientY - r.top - visning.ty) / visning.skala,
    };
  };
  const tilVektor = (p: { x: number; y: number }) =>
    modell
      ? {
          x: ((p.x - bruktUtsnitt.x) * modell.bredde) / bruktUtsnitt.b,
          y: ((p.y - bruktUtsnitt.y) * modell.hoyde) / bruktUtsnitt.h,
        }
      : p;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = flate.current!.getBoundingClientRect();
    const mx = e.clientX - r.left,
      my = e.clientY - r.top;
    const faktor = Math.exp(-e.deltaY * 0.0015);
    settVisning((v) => {
      const skala = Math.max(0.02, Math.min(80, v.skala * faktor));
      const k = skala / v.skala;
      return { skala, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
    });
  };
  useEffect(() => {
    const el = flate.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const beskjaerTreff = (p: { x: number; y: number }, beroring: boolean): string => {
    const u = utsnitt;
    // a finger needs a larger target than a mouse
    const tol = (beroring ? 24 : 10) / visning.skala;
    const naerX0 = Math.abs(p.x - u.x) < tol,
      naerX1 = Math.abs(p.x - (u.x + u.b)) < tol;
    const naerY0 = Math.abs(p.y - u.y) < tol,
      naerY1 = Math.abs(p.y - (u.y + u.h)) < tol;
    const innX = p.x > u.x - tol && p.x < u.x + u.b + tol,
      innY = p.y > u.y - tol && p.y < u.y + u.h + tol;
    let m = '';
    if (naerY0 && innX) m += 'n';
    if (naerY1 && innX) m += 's';
    if (naerX0 && innY) m += 'w';
    if (naerX1 && innY) m += 'e';
    if (m) return m;
    if (p.x > u.x && p.x < u.x + u.b && p.y > u.y && p.y < u.y + u.h) return 'flytt';
    return 'ny';
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!kilde) return;
    const el = flate.current!;
    el.setPointerCapture(e.pointerId);
    // with no tool chosen, dragging moves the view
    const utenVerktoy =
      (viserMaske && !fverktoy) ||
      (!viserMaske && !kanRedigere) ||
      (kanRedigere && rverktoy === 'spor') ||
      (kanRedigere && (rverktoy === 'farger' || rverktoy === 'lag'));
    if (e.button === 1 || e.button === 2 || mellomrom.current || utenVerktoy) {
      dra.current = { type: 'panorer', x: e.clientX, y: e.clientY, tx: visning.tx, ty: visning.ty };
      return;
    }
    if (e.button !== 0) return;
    const p = tilBilde(e);
    if (viserMaske) {
      const lag = felttype === 'beskytt' ? beskytt.current! : maske.current!;
      const lagFarge = felttype === 'beskytt' ? BESKYTTFARGE : undefined;
      if (fverktoy === 'beskjaer') {
        dra.current = {
          type: 'beskjaer',
          modus: beskjaerTreff(p, e.pointerType === 'touch'),
          start: p,
          fra: { ...utsnitt },
        };
      } else if (fverktoy === 'tryllestav') {
        const d = bildedata();
        if (!d) return;
        const s = d.width / kilde.bredde;
        const ny = tryllestav(d.data, d.width, d.height, p.x * s, p.y * s, toleranse, sammenhengende);
        const modus = e.shiftKey ? 'legg-til' : e.altKey ? 'trekk-fra' : 'ny';
        settUtvalg((u) => kombiner(u, ny, modus));
        settStavvalg({
          type: 'punkt',
          x: p.x * s,
          y: p.y * s,
          farge: fargeVed(d.data, d.width, d.height, p.x * s, p.y * s),
          alene: modus === 'ny',
        });
      } else if (fverktoy === 'pensel' || fverktoy === 'viskelar') {
        lagreMaskeAngre();
        // Alt with the brush erases, as in Photoshop
        malStrok(kilde, lag, p, p, pensel / 2, fverktoy === 'pensel' && !e.altKey, lagFarge);
        dra.current = { type: 'pensel', siste: p };
      } else if (fverktoy === 'rektangel') {
        settRekt({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        dra.current = { type: 'rekt' };
      } else if (fverktoy === 'magnetlasso') {
        // click to set an anchor point; click the start point or double-click to close
        if (!magnet) {
          const start = festMagnet(p);
          settMagnet({ start, segmenter: [] });
          settLasso([start]);
        } else {
          const naerStart = Math.hypot(p.x - magnet.start.x, p.y - magnet.start.y) * visning.skala < 10;
          if (naerStart && magnet.segmenter.length) lukkMagnet(magnet, [magnet.start]);
          else if (e.detail >= 2) lukkMagnet(magnet);
          else {
            const sti = magnetSti(magnetAnker(magnet), p);
            const ny = sti.length ? { ...magnet, segmenter: [...magnet.segmenter, sti] } : magnet;
            settMagnet(ny);
            settLasso(magnetPunkter(ny));
          }
        }
      } else {
        settLasso([p]);
        dra.current = { type: 'lasso' };
      }
      return;
    }
    if (!modell) return;
    const v = tilVektor(p);
    const maal = e.target as Element;
    const ankerEl = maal.closest('[data-anker]');
    const handtakEl = maal.closest('[data-handtak]');
    if (kanRedigere && rverktoy === 'punkt' && handtakEl) {
      const [k, i, s] = handtakEl.getAttribute('data-handtak')!.split(':');
      dra.current = {
        type: 'handtak',
        kurve: +k!,
        idx: +i!,
        side: s as 'inn' | 'ut',
        base: modell,
        bryt: e.altKey,
      };
      return;
    }
    if (kanRedigere && rverktoy === 'punkt' && ankerEl) {
      const [k, i] = ankerEl.getAttribute('data-anker')!.split(':');
      settValgtAnker({ kurve: +k!, idx: +i! });
      dra.current = { type: 'anker', kurve: +k!, idx: +i!, base: modell };
      return;
    }
    if (!kanRedigere) return;
    if (rverktoy === 'penn') {
      const tol = (e.pointerType === 'touch' ? 18 : 8) / pxPerEnhet;
      const naerPunkt = (x: number, y: number) => Math.hypot(v.x - x, v.y - y) < tol;
      // a placed point or handle can be dragged again; a click on the first point closes the field
      for (let i = penn.length - 1; i >= 0; i--) {
        const a = penn[i]!;
        const side = naerPunkt(a.x, a.y)
          ? 'punkt'
          : a.ut && naerPunkt(a.ut[0], a.ut[1])
            ? 'ut'
            : a.inn && naerPunkt(a.inn[0], a.inn[1])
              ? 'inn'
              : null;
        if (!side) continue;
        dra.current = {
          type: 'pennpunkt',
          idx: i,
          side,
          start: v,
          flyttet: false,
          lukk: side === 'punkt' && i === 0 && penn.length >= 3,
        };
        return;
      }
      settPennMelding(null);
      settPenn((s) => [...s, { x: v.x, y: v.y, inn: null, ut: null, hjorne: true, ri: 0 }]);
      dra.current = { type: 'penn', idx: penn.length, start: v, siste: v };
      return;
    }
    if (rverktoy === 'flytt') {
      const delEl = maal.closest('[data-del]');
      const funnet = delEl ? Number(delEl.getAttribute('data-del')) : null;
      const id = funnet !== null && lagLaste.has(funnet) ? null : funnet;
      if (id === null) {
        if (!e.shiftKey) settValgteDeler([]);
        return;
      }
      const ider = e.shiftKey
        ? valgteDeler.includes(id)
          ? valgteDeler.filter((x) => x !== id)
          : [...valgteDeler, id]
        : valgteDeler.includes(id)
          ? valgteDeler
          : [id];
      settValgteDeler(ider);
      if (ider.includes(id)) dra.current = { type: 'flytt', start: v, base: modell, ider };
      return;
    }
    const naer = naermesteKurve(modell, v.x, v.y, 7 / pxPerEnhet);
    if (rverktoy === 'del') {
      const delEl = maal.closest('[data-del]');
      const funnet = delEl ? Number(delEl.getAttribute('data-del')) : null;
      const id = funnet !== null && lasteDeler.has(funnet) ? null : funnet;
      if (id === null) {
        if (!e.shiftKey) settValgteDeler([]);
      } else
        settValgteDeler((s) =>
          e.shiftKey ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id],
        );
      return;
    }
    if (rverktoy === 'omrade') {
      settLokalOmrade({ x0: v.x, y0: v.y, x1: v.x, y1: v.y });
      settLokalMelding(null);
      dra.current = { type: 'lokal', start: v };
      return;
    }
    if (naer && kurveLast(modell, naer.kurve, lasteDeler)) return;
    if (rverktoy === 'linje') {
      if (naer) {
        settValgteKurver((s) =>
          e.shiftKey
            ? s.includes(naer.kurve)
              ? s.filter((x) => x !== naer.kurve)
              : [...s, naer.kurve]
            : [naer.kurve],
        );
        return;
      }
      settOmrade({ x0: v.x, y0: v.y, x1: v.x, y1: v.y });
      dra.current = { type: 'omrade', leggTil: e.shiftKey };
      return;
    }
    // punkt: a click on a border selects it and shows its points
    if (naer) {
      settValgteKurver((s) =>
        e.shiftKey ? [...new Set([...s, naer.kurve])] : s.includes(naer.kurve) ? s : [naer.kurve],
      );
      settValgtAnker(null);
    } else if (!e.shiftKey) {
      settValgteKurver([]);
      settValgtAnker(null);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!kilde) return;
    const p = tilBilde(e);
    settPeker(p);
    if (magnet && viserMaske && fverktoy === 'magnetlasso' && !dra.current) {
      let m = magnet;
      let live = magnetSti(magnetAnker(m), p);
      // Photoshop sets anchor points by itself while you follow an edge
      const AVSTAND = 60 / visning.skala;
      let lengde = 0;
      let fra = magnetAnker(m);
      for (let i = 0; i < live.length; i++) {
        lengde += Math.hypot(live[i]!.x - fra.x, live[i]!.y - fra.y);
        fra = live[i]!;
        if (lengde > AVSTAND && i < live.length - 1) {
          m = { ...m, segmenter: [...m.segmenter, live.slice(0, i + 1)] };
          live = live.slice(i + 1);
          lengde = 0;
        }
      }
      if (m !== magnet) settMagnet(m);
      settLasso([...magnetPunkter(m), ...live]);
      return;
    }
    const d = dra.current;
    if (!d) return;
    // the button was released outside the page (or the frame it runs in): the drag is over
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      onPointerUp(e);
      return;
    }
    if (d.type === 'panorer') {
      settVisning((v) => ({ ...v, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }));
    } else if (d.type === 'pensel') {
      const lag = felttype === 'beskytt' ? beskytt.current! : maske.current!;
      const lagFarge = felttype === 'beskytt' ? BESKYTTFARGE : undefined;
      malStrok(kilde, lag, d.siste, p, pensel / 2, fverktoy === 'pensel' && !e.altKey, lagFarge);
      d.siste = p;
    } else if (d.type === 'rekt') {
      settRekt((r) => (r ? { ...r, x1: p.x, y1: p.y } : r));
    } else if (d.type === 'lasso') {
      settLasso((l) => (l ? [...l, p] : [p]));
    } else if (d.type === 'beskjaer') {
      const dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      let { x, y, b, h } = d.fra;
      if (d.modus === 'ny') {
        x = Math.min(d.start.x, p.x);
        y = Math.min(d.start.y, p.y);
        b = Math.abs(dx);
        h = Math.abs(dy);
      } else if (d.modus === 'flytt') {
        x += dx;
        y += dy;
        x = Math.max(0, Math.min(kilde.bredde - b, x));
        y = Math.max(0, Math.min(kilde.hoyde - h, y));
      } else {
        if (d.modus.includes('w')) {
          x += dx;
          b -= dx;
        }
        if (d.modus.includes('e')) b += dx;
        if (d.modus.includes('n')) {
          y += dy;
          h -= dy;
        }
        if (d.modus.includes('s')) h += dy;
        if (b < 0) {
          x += b;
          b = -b;
        }
        if (h < 0) {
          y += h;
          h = -h;
        }
      }
      const x0 = Math.max(0, Math.round(x)),
        y0 = Math.max(0, Math.round(y));
      const x1 = Math.min(kilde.bredde, Math.round(x + b)),
        y1 = Math.min(kilde.hoyde, Math.round(y + h));
      settUtsnitt({ x: x0, y: y0, b: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
    } else if (d.type === 'penn') {
      // dragging pulls out smooth handles, as in Illustrator; with Space held it moves the point
      const v = tilVektor(p);
      if (mellomrom.current) {
        const dx = v.x - d.siste.x,
          dy = v.y - d.siste.y;
        d.siste = v;
        d.start = { x: d.start.x + dx, y: d.start.y + dy };
        settPenn((s) => s.map((a, i) => (i !== d.idx ? a : flyttPennpunkt(a, dx, dy))));
        return;
      }
      d.siste = v;
      const glatt = Math.hypot(v.x - d.start.x, v.y - d.start.y) * pxPerEnhet > 3;
      settPenn((s) =>
        s.map((a, i) =>
          i !== d.idx
            ? a
            : glatt
              ? { ...a, hjorne: false, ut: [v.x, v.y], inn: [2 * a.x - v.x, 2 * a.y - v.y] }
              : { ...a, hjorne: true, ut: null, inn: null },
        ),
      );
    } else if (d.type === 'pennpunkt') {
      const v = tilVektor(p);
      if (!d.flyttet && Math.hypot(v.x - d.start.x, v.y - d.start.y) * pxPerEnhet < 3) return;
      d.flyttet = true;
      settPenn((s) =>
        s.map((a, i) => {
          if (i !== d.idx) return a;
          if (d.side === 'punkt') return flyttPennpunkt(a, v.x - a.x, v.y - a.y);
          const mot = d.side === 'ut' ? 'inn' : 'ut';
          // the opposite handle follows (mirrored length kept) unless Alt breaks it
          const ny: Anker = { ...a, [d.side]: [v.x, v.y] };
          const m = a[mot];
          if (m && !e.altKey && !a.hjorne) {
            const l = Math.hypot(m[0] - a.x, m[1] - a.y);
            const lv = Math.hypot(v.x - a.x, v.y - a.y) || 1;
            ny[mot] = [a.x - ((v.x - a.x) * l) / lv, a.y - ((v.y - a.y) * l) / lv];
          } else if (e.altKey) ny.hjorne = true;
          return ny;
        }),
      );
    } else if (d.type === 'omrade') {
      const v = tilVektor(p);
      settOmrade((o) => (o ? { ...o, x1: v.x, y1: v.y } : o));
    } else if (d.type === 'lokal') {
      const v = tilVektor(p);
      settLokalOmrade({ x0: d.start.x, y0: d.start.y, x1: v.x, y1: v.y });
    } else if (d.type === 'flytt') {
      const v = tilVektor(p);
      settModellRa(transformerDeler(d.base, d.ider, flyttMatrise(v.x - d.start.x, v.y - d.start.y)));
    } else if (d.type === 'anker') {
      const v = tilVektor(p);
      settModellRa(flyttAnker(d.base, d.kurve, d.idx, v.x, v.y));
    } else if (d.type === 'handtak') {
      const v = tilVektor(p);
      settModellRa(flyttHandtak(d.base, d.kurve, d.idx, d.side, v.x, v.y, d.bryt || e.altKey));
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = dra.current;
    dra.current = null;
    if (!d || !kilde) return;
    if (d.type === 'pennpunkt' && d.lukk && !d.flyttet) fullforPenn();
    if (d.type === 'pensel') oppdaterMaske();
    else if (d.type === 'lasso') {
      if (lasso && lasso.length > 2) fyllFelt(lasso);
      settLasso(null);
    } else if (d.type === 'rekt') {
      if (
        rekt &&
        Math.abs(rekt.x1 - rekt.x0) * visning.skala > 3 &&
        Math.abs(rekt.y1 - rekt.y0) * visning.skala > 3
      )
        fyllFelt([
          { x: rekt.x0, y: rekt.y0 },
          { x: rekt.x1, y: rekt.y0 },
          { x: rekt.x1, y: rekt.y1 },
          { x: rekt.x0, y: rekt.y1 },
        ]);
      settRekt(null);
    } else if (d.type === 'beskjaer') {
      if (utsnitt.b < 4 || utsnitt.h < 4) settUtsnitt(d.fra);
    } else if (d.type === 'omrade' && omrade && modell) {
      const liten =
        Math.abs(omrade.x1 - omrade.x0) * pxPerEnhet < 3 && Math.abs(omrade.y1 - omrade.y0) * pxPerEnhet < 3;
      const ider = liten ? [] : ulaste(kurverIOmrade(modell, omrade));
      settValgteKurver((s) => (d.leggTil ? [...new Set([...s, ...ider])] : ider));
      settOmrade(null);
    } else if (d.type === 'lokal' && lokalOmrade) {
      const liten =
        Math.abs(lokalOmrade.x1 - lokalOmrade.x0) * pxPerEnhet < 4 ||
        Math.abs(lokalOmrade.y1 - lokalOmrade.y0) * pxPerEnhet < 4;
      if (liten) settLokalOmrade(null);
    } else if (
      (d.type === 'anker' || d.type === 'handtak' || d.type === 'flytt') &&
      modell &&
      modell !== d.base
    ) {
      // one undo step for the whole drag
      fortid.current.push(d.base);
      if (fortid.current.length > MAKS_HISTORIKK) fortid.current.shift();
      fremtid.current = [];
      settHistorikkTikk((v) => v + 1);
    }
    void e;
  };

  const onDblClick = (e: MouseEvent) => {
    if (!kanRedigere || rverktoy !== 'punkt' || !modell) return;
    const maal = e.target as Element;
    const ankerEl = maal.closest('[data-anker]');
    if (ankerEl) {
      const [k, i] = ankerEl.getAttribute('data-anker')!.split(':');
      const a = modell.kurver[+k!]?.ankre[+i!];
      if (a) settModell(settAnkertype(modell, +k!, +i!, !a.hjorne));
      return;
    }
    const v = tilVektor(tilBilde(e));
    const naer = naermesteKurve(modell, v.x, v.y, 7 / pxPerEnhet);
    if (naer) {
      settModell(leggTilAnker(modell, naer.kurve, naer.seg, naer.t));
      settValgteKurver((s) => [...new Set([...s, naer.kurve])]);
      settValgtAnker({ kurve: naer.kurve, idx: naer.seg + 1 });
    }
  };

  // ------------------------------------------------------------ keys

  useEffect(() => {
    const ned = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        mellomrom.current = true;
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (hjelpApen) {
        if (e.key === 'Escape') settHjelpApen(false);
        return;
      }
      if ((e.key === 'd' || e.key === 'D') && !mod && !e.altKey && !viserMaske && modell) {
        settDelt((v) => (v === null ? 50 : null));
        return;
      }
      if (e.key === '?' && !mod) {
        settHjelpApen(true);
        return;
      }
      // 1, 2, 3 switch the modes of Advanced
      if (nivaa === 'avansert' && !mod && !e.altKey && ['1', '2', '3'].includes(e.key) && kilde) {
        const ny = (['masker', 'rediger', 'ferdig'] as const)[Number(e.key) - 1]!;
        if (ny !== 'ferdig' || modell) gaaTil(ny);
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (viserMaske) angreMaske();
        else if (e.shiftKey) gjenta();
        else angre();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        gjenta();
        return;
      }
      if (viserMaske && !mod && !e.altKey) {
        const t: Record<string, Forberedverktoy> = {
          c: 'beskjaer',
          w: 'tryllestav',
          b: 'pensel',
          e: 'viskelar',
          l: 'lasso',
          m: 'rektangel',
        };
        // Shift+L is the magnetic lasso, as in Photoshop's lasso group
        const v = e.shiftKey && e.key.toLowerCase() === 'l' ? 'magnetlasso' : t[e.key.toLowerCase()];
        if (v) settFverktoy(v);
        if (magnet) {
          if (e.key === 'Escape') {
            avbrytMagnet();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            lukkMagnet();
            return;
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            // removes the last anchor point; with none left, the lasso is dropped
            if (!magnet.segmenter.length) avbrytMagnet();
            else {
              const ny = { ...magnet, segmenter: magnet.segmenter.slice(0, -1) };
              settMagnet(ny);
              settLasso(magnetPunkter(ny));
            }
            return;
          }
        }
        // X swaps between Mask (red) and Protect (green)
        if (e.key.toLowerCase() === 'x') settFelttype((f) => (f === 'masker' ? 'beskytt' : 'masker'));
        if (e.key === 'Escape') settUtvalg(null);
        if ((e.key === 'Delete' || e.key === 'Backspace') && utvalg) bruk('fjern');
      }
      if (kanRedigere) {
        if (e.key === 'k' || e.key === 'K') settRverktoy('spor');
        if (e.key === 'f' || e.key === 'F') settRverktoy('farger');
        if (e.key === 'y' && !mod) settRverktoy('lag');
        if ((e.key === 'r' || e.key === 'R') && rverktoy !== 'omrade') {
          settRverktoy('omrade');
          settLokalTilpasning(tilpasning);
        }
        if (e.key === 'v' || e.key === 'V') settRverktoy('del');
        if ((e.key === 't' || e.key === 'T') && !mod) settRverktoy('flytt');
        if (rverktoy === 'flytt' && valgteDeler.length && e.key.startsWith('Arrow')) {
          e.preventDefault();
          const steg = (e.shiftKey ? 10 : 1) / Math.max(pxPerEnhet, 1e-6);
          const [dx, dy] =
            e.key === 'ArrowLeft'
              ? [-steg, 0]
              : e.key === 'ArrowRight'
                ? [steg, 0]
                : e.key === 'ArrowUp'
                  ? [0, -steg]
                  : [0, steg];
          flyttValgte(dx, dy);
          return;
        }
        if (e.key === 'l' || e.key === 'L') settRverktoy('linje');
        if (e.key === 'p' || e.key === 'P') settRverktoy('punkt');
        if (e.key === 'n' || e.key === 'N') settRverktoy('penn');
        if (rverktoy === 'penn' && penn.length) {
          if (e.key === 'Enter') fullforPenn();
          else if (e.key === 'Escape') settPenn([]);
          else if (e.key === 'Delete' || e.key === 'Backspace') settPenn((s) => s.slice(0, -1));
          if (['Enter', 'Escape', 'Delete', 'Backspace'].includes(e.key)) {
            e.preventDefault();
            return;
          }
        }
        if (e.key === 'Escape') {
          settValgteDeler([]);
          settValgteKurver([]);
          settValgtAnker(null);
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && modell) {
          if (rverktoy === 'punkt' && valgtAnker) {
            settModell(slettAnker(modell, valgtAnker.kurve, valgtAnker.idx));
            settValgtAnker(null);
          } else if ((rverktoy === 'del' || rverktoy === 'flytt') && valgteDeler.length)
            settModell(slettDeler(modell, valgteDeler));
        }
      }
      if (e.key === '0' && mod) {
        e.preventDefault();
        tilpassVisning(viserMaske ? undefined : bruktUtsnitt);
      }
    };
    const opp = (e: KeyboardEvent) => {
      if (e.code === 'Space') mellomrom.current = false;
    };
    window.addEventListener('keydown', ned);
    window.addEventListener('keyup', opp);
    return () => {
      window.removeEventListener('keydown', ned);
      window.removeEventListener('keyup', opp);
    };
  });

  // ------------------------------------------------------------ actions

  const gaaTil = (s: Steg) => {
    settSteg(s);
    settPenn([]);
    if (s !== 'masker') requestAnimationFrame(() => tilpassVisning(utsnitt));
    else requestAnimationFrame(() => tilpassVisning());
  };

  /** Simple and Advanced share all their state, so switching loses nothing. */
  const byttNivaa = (n: Nivaa) => {
    settNivaa(n);
    settPenn([]);
    requestAnimationFrame(() => tilpassVisning(n === 'avansert' && steg === 'masker' ? undefined : utsnitt));
  };

  const brukForhandsvalg = (id: string) => {
    const f = FORHANDSVALG.find((x) => x.id === id);
    if (!f) return;
    settForhandsvalgId(id);
    if (f.farger) settFarger(f.farger);
    if (f.farger === 1) settTerskel(null);
    settTilpasning((t) => ({ ...t, ...f.tilpasning }));
    settRens((r) => ({ ...r, ...f.rens }));
  };

  const eksporter = () => {
    if (!modell || !kilde) return;
    lastNed(`${kilde.navn}.svg`, svgTekst());
  };

  const [kopiStatus, settKopiStatus] = useState<string | null>(null);
  const [visSvgTekst, settVisSvgTekst] = useState(false);
  const kopierSvg = () => {
    if (!modell) return;
    const svg = svgTekst();
    // where the clipboard is refused, the code is shown to copy by hand
    navigator.clipboard
      .writeText(svg)
      .then(() => {
        settKopiStatus(`SVG-en er kopiert (${Math.round(svg.length / 1024)} kB).`);
        settVisSvgTekst(false);
      })
      .catch(() => {
        settKopiStatus('Kunne ikke kopiere automatisk. Merk teksten under og kopier den.');
        settVisSvgTekst(true);
      });
  };

  const valgtFarge = valgteDeler.length ? (modell?.deler[valgteDeler[0]!]?.farge ?? '#000000') : null;
  const synligeAnkre =
    kanRedigere && rverktoy === 'punkt' && modell
      ? valgteKurver.map((id) => modell.kurver[id]).filter((k): k is Kurve => !!k)
      : [];

  // ------------------------------------------------------------ render

  const markor = viserMaske
    ? !fverktoy
      ? 'grab'
      : fverktoy === 'pensel' || fverktoy === 'viskelar'
        ? 'none'
        : 'crosshair'
    : !kanRedigere || rverktoy === 'spor' || rverktoy === 'farger' || rverktoy === 'lag'
      ? 'grab'
      : rverktoy === 'linje' || rverktoy === 'penn' || rverktoy === 'omrade'
        ? 'crosshair'
        : rverktoy === 'flytt'
          ? 'move'
          : 'default';

  const ankerR = 4.5 / pxPerEnhet;
  const handtakR = 3.5 / pxPerEnhet;

  const lerret = (
    <div
      ref={flate}
      class={`vv-flate${iFerdig && bakgrunn !== 'rutenett' ? ` vv-bakgrunn-${bakgrunn}` : ''}`}
      style={{ cursor: markor }}
      onPointerDown={onPointerDown as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerMove={onPointerMove as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerUp={onPointerUp as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerCancel={onPointerUp as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onLostPointerCapture={onPointerUp as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerLeave={() => settPeker(null)}
      onDblClick={onDblClick as unknown as JSX.MouseEventHandler<HTMLDivElement>}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        // dropped on open work, an image is added beside it; a project replaces it
        void (kilde && f && !erProsjektfil(f) ? leggTil(f) : velgFil(f));
      }}
    >
      {!kilde && (
        <div class="vv-tom">
          {lagretProsjekt && (
            <div class="vv-fortsett">
              <p>
                <b>Fortsett der du slapp?</b>
                <br />«{lagretProsjekt.navn}», lagret{' '}
                {new Date(lagretProsjekt.lagret).toLocaleString('nb-NO', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
              <div class="vv-knapperad">
                <Knapp klasse="vv-primar" ikon="open" navn="Fortsett" onClick={() => void fortsettLagret()} />
                <Knapp ikon="delete" navn="Forkast" onClick={forkastLagret} />
              </div>
            </div>
          )}
          <p>Dra et bilde hit, lim det inn, eller</p>
          <button type="button" class="vv-primar" onClick={() => filvelger.current?.click()}>
            Velg bilde
          </button>
          <p class="vv-dempet">
            PNG, JPG, WebP, GIF eller BMP, eller et lagret prosjekt ({FILENDELSE}). Bildet behandles i
            nettleseren og lastes ikke opp.
          </p>
        </div>
      )}
      {kilde && (
        <div
          class="vv-scene"
          style={{
            width: `${kilde.bredde}px`,
            height: `${kilde.hoyde}px`,
            transform: `translate(${visning.tx}px, ${visning.ty}px) scale(${visning.skala})`,
          }}
        >
          <img
            class="vv-original"
            src={kilde.url}
            alt=""
            draggable={false}
            style={{
              opacity:
                viserMaske || (delt !== null && modell)
                  ? 1
                  : iFerdig && bakgrunn !== 'rutenett'
                    ? 0
                    : visOriginal,
            }}
          />
          <div
            ref={beskyttHolder}
            class="vv-maskeholder"
            style={{ display: viserMaske ? 'block' : 'none' }}
          />
          <div
            ref={utvalgHolder}
            class="vv-maskeholder vv-utvalgholder"
            style={{ display: viserMaske && utvalg ? 'block' : 'none' }}
          />
          {delt !== null && !viserMaske && modell && (
            <div
              class="vv-skillelinje"
              aria-hidden="true"
              style={{
                left: `${bruktUtsnitt.x + (bruktUtsnitt.b * delt) / 100}px`,
                top: `${bruktUtsnitt.y}px`,
                height: `${bruktUtsnitt.h}px`,
                bottom: 'auto',
                borderLeftWidth: `${2 / visning.skala}px`,
              }}
            />
          )}
          <div ref={maskeHolder} class="vv-maskeholder" style={{ display: viserMaske ? 'block' : 'none' }} />
          {!viserMaske && modell && (
            <svg
              class="vv-vektor"
              style={{
                left: `${bruktUtsnitt.x}px`,
                top: `${bruktUtsnitt.y}px`,
                width: `${bruktUtsnitt.b}px`,
                height: `${bruktUtsnitt.h}px`,
                clipPath: delt !== null ? `inset(-100000px -100000px -100000px ${delt}%)` : undefined,
              }}
              viewBox={`0 0 ${modell.bredde} ${modell.hoyde}`}
              aria-busy={jobber}
            >
              {iFerdig && bakgrunn === 'skilt' && (
                <rect
                  class="vv-skiltplate"
                  x={-skiltMarg}
                  y={-skiltMarg}
                  width={modell.bredde + 2 * skiltMarg}
                  height={modell.hoyde + 2 * skiltMarg}
                  rx={skiltMarg * 0.6}
                  fill={skiltfarge}
                  stroke-width={1 / pxPerEnhet}
                />
              )}
              {konturSti && konturType === 'flate' && <path d={konturSti} fill={konturFarge} />}
              <g class="vv-deler">
                {stier.map((s) => (
                  <path
                    key={s.id}
                    data-del={s.id}
                    d={s.d}
                    transform={s.t}
                    fill={s.farge}
                    stroke={s.farge}
                    stroke-width={0.6}
                    vector-effect="non-scaling-stroke"
                  />
                ))}
              </g>
              {valgteDeler.length > 0 && (
                <g class="vv-valgte-deler">
                  {stier
                    .filter((s) => valgteDeler.includes(s.id))
                    .map((s) => (
                      <path key={s.id} d={s.d} transform={s.t} vector-effect="non-scaling-stroke" />
                    ))}
                </g>
              )}
              {kanRedigere && rverktoy === 'flytt' && flyttBoks && (
                <rect
                  class="vv-flyttboks"
                  x={flyttBoks.x0}
                  y={flyttBoks.y0}
                  width={flyttBoks.x1 - flyttBoks.x0}
                  height={flyttBoks.y1 - flyttBoks.y0}
                  stroke-width={1.5 / pxPerEnhet}
                  stroke-dasharray={`${6 / pxPerEnhet} ${4 / pxPerEnhet}`}
                />
              )}
              {konturSti && konturType === 'linje' && (
                <path class="vv-konturlinje" d={konturSti} stroke-width={1.5 / pxPerEnhet} />
              )}
              {iFerdig && gjeldendeTynne && gjeldendeTynne.deler.length > 0 && (
                <g class="vv-tynne" stroke-width={2 / pxPerEnhet}>
                  {stier
                    .filter((s) => gjeldendeTynne.deler.some((t) => t.id === s.id))
                    .map((s) => (
                      <path key={s.id} d={s.d} transform={s.t} />
                    ))}
                </g>
              )}
              {kantSti && !iFerdig && (
                <path class="vv-kanter" d={kantSti} vector-effect="non-scaling-stroke" />
              )}
              {valgteKurver.length > 0 && (
                <path
                  class="vv-valgte-kanter"
                  d={valgteKurver
                    .map((id) => (modell.kurver[id] ? kurveSti(modell.kurver[id]!) : ''))
                    .join('')}
                  vector-effect="non-scaling-stroke"
                />
              )}
              {synligeAnkre.map((k) => (
                <g key={k.id} class="vv-ankre">
                  {k.ankre.map((a, i) => {
                    const valgt = valgtAnker?.kurve === k.id && valgtAnker.idx === i;
                    return (
                      <g key={i}>
                        {(['inn', 'ut'] as const).map((side) => {
                          const h = a[side];
                          if (!h) return null;
                          return (
                            <g key={side}>
                              <line
                                class="vv-handtakslinje"
                                x1={a.x}
                                y1={a.y}
                                x2={h[0]}
                                y2={h[1]}
                                vector-effect="non-scaling-stroke"
                              />
                              <circle
                                class="vv-handtak"
                                data-handtak={`${k.id}:${i}:${side}`}
                                cx={h[0]}
                                cy={h[1]}
                                r={handtakR}
                                vector-effect="non-scaling-stroke"
                              />
                            </g>
                          );
                        })}
                        {a.hjorne ? (
                          <rect
                            class={valgt ? 'vv-anker vv-anker-valgt' : 'vv-anker'}
                            data-anker={`${k.id}:${i}`}
                            x={a.x - ankerR}
                            y={a.y - ankerR}
                            width={ankerR * 2}
                            height={ankerR * 2}
                            vector-effect="non-scaling-stroke"
                          />
                        ) : (
                          <circle
                            class={valgt ? 'vv-anker vv-anker-valgt' : 'vv-anker'}
                            data-anker={`${k.id}:${i}`}
                            cx={a.x}
                            cy={a.y}
                            r={ankerR}
                            vector-effect="non-scaling-stroke"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
              {kanRedigere && rverktoy === 'penn' && penn.length > 0 && (
                <g class="vv-penn">
                  <path d={pennSti(penn, false)} vector-effect="non-scaling-stroke" />
                  {peker && !dra.current && (
                    <line
                      class="vv-penn-strikk"
                      x1={penn[penn.length - 1]!.x}
                      y1={penn[penn.length - 1]!.y}
                      x2={tilVektor(peker).x}
                      y2={tilVektor(peker).y}
                      vector-effect="non-scaling-stroke"
                    />
                  )}
                  {penn.map((a, i) => (
                    <g key={i}>
                      {a.inn && a.ut && (
                        <>
                          <line
                            class="vv-handtakslinje"
                            x1={a.inn[0]}
                            y1={a.inn[1]}
                            x2={a.ut[0]}
                            y2={a.ut[1]}
                            vector-effect="non-scaling-stroke"
                          />
                          <circle
                            class="vv-handtak"
                            cx={a.inn[0]}
                            cy={a.inn[1]}
                            r={handtakR}
                            vector-effect="non-scaling-stroke"
                          />
                          <circle
                            class="vv-handtak"
                            cx={a.ut[0]}
                            cy={a.ut[1]}
                            r={handtakR}
                            vector-effect="non-scaling-stroke"
                          />
                        </>
                      )}
                      <rect
                        class={i === 0 && penn.length >= 3 ? 'vv-anker vv-anker-valgt' : 'vv-anker'}
                        x={a.x - ankerR}
                        y={a.y - ankerR}
                        width={ankerR * 2}
                        height={ankerR * 2}
                        vector-effect="non-scaling-stroke"
                      />
                    </g>
                  ))}
                </g>
              )}
              {lokalOmrade && kanRedigere && rverktoy === 'omrade' && (
                <rect
                  class="vv-lokalomrade"
                  x={Math.min(lokalOmrade.x0, lokalOmrade.x1)}
                  y={Math.min(lokalOmrade.y0, lokalOmrade.y1)}
                  width={Math.abs(lokalOmrade.x1 - lokalOmrade.x0)}
                  height={Math.abs(lokalOmrade.y1 - lokalOmrade.y0)}
                  vector-effect="non-scaling-stroke"
                />
              )}
              {omrade && (
                <rect
                  class="vv-omrade"
                  x={Math.min(omrade.x0, omrade.x1)}
                  y={Math.min(omrade.y0, omrade.y1)}
                  width={Math.abs(omrade.x1 - omrade.x0)}
                  height={Math.abs(omrade.y1 - omrade.y0)}
                  vector-effect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
        </div>
      )}
      {kilde && viserMaske && (
        <svg class="vv-overlegg" aria-hidden="true">
          <g transform={`translate(${visning.tx} ${visning.ty}) scale(${visning.skala})`}>
            <path
              class="vv-utenfor"
              fill-rule="evenodd"
              d={`M0 0H${kilde.bredde}V${kilde.hoyde}H0Z M${utsnitt.x} ${utsnitt.y}h${utsnitt.b}v${utsnitt.h}h${-utsnitt.b}Z`}
            />
            <rect
              class="vv-utsnitt"
              x={utsnitt.x}
              y={utsnitt.y}
              width={utsnitt.b}
              height={utsnitt.h}
              vector-effect="non-scaling-stroke"
            />
            {fverktoy === 'beskjaer' &&
              [
                [0, 0],
                [0.5, 0],
                [1, 0],
                [0, 0.5],
                [1, 0.5],
                [0, 1],
                [0.5, 1],
                [1, 1],
              ].map(([fx, fy]) => (
                <rect
                  class="vv-utsnitt-hank"
                  x={utsnitt.x + utsnitt.b * fx! - 5 / visning.skala}
                  y={utsnitt.y + utsnitt.h * fy! - 5 / visning.skala}
                  width={10 / visning.skala}
                  height={10 / visning.skala}
                  vector-effect="non-scaling-stroke"
                />
              ))}
            {rekt && (
              <rect
                class={felttype === 'beskytt' ? 'vv-lasso vv-lasso-beskytt' : 'vv-lasso'}
                x={Math.min(rekt.x0, rekt.x1)}
                y={Math.min(rekt.y0, rekt.y1)}
                width={Math.abs(rekt.x1 - rekt.x0)}
                height={Math.abs(rekt.y1 - rekt.y0)}
                vector-effect="non-scaling-stroke"
              />
            )}
            {lasso && (
              <polyline
                class={felttype === 'beskytt' ? 'vv-lasso vv-lasso-beskytt' : 'vv-lasso'}
                points={lasso.map((p) => `${p.x},${p.y}`).join(' ')}
                vector-effect="non-scaling-stroke"
              />
            )}
            {magnet &&
              [magnet.start, ...magnet.segmenter.map((s) => s[s.length - 1]!)].map((a, i) => (
                <rect
                  key={i}
                  class={i === 0 ? 'vv-magnetanker vv-magnetanker-start' : 'vv-magnetanker'}
                  x={a.x - 3 / visning.skala}
                  y={a.y - 3 / visning.skala}
                  width={6 / visning.skala}
                  height={6 / visning.skala}
                  vector-effect="non-scaling-stroke"
                />
              ))}
            {peker && (fverktoy === 'pensel' || fverktoy === 'viskelar') && (
              <circle
                class={felttype === 'beskytt' ? 'vv-pensel vv-pensel-beskytt' : 'vv-pensel'}
                cx={peker.x}
                cy={peker.y}
                r={pensel / 2}
                vector-effect="non-scaling-stroke"
              />
            )}
          </g>
        </svg>
      )}
      {jobber && <div class="vv-jobber">Konverterer …</div>}
    </div>
  );

  const endreRens = (d: Partial<Rensevalg>) => {
    settForhandsvalgId(null);
    settRens((r) => ({ ...r, ...d }));
  };
  const endreTilp = (d: Partial<Tilpasningsvalg>) => {
    settForhandsvalgId(null);
    settTilpasning((t) => ({ ...t, ...d }));
  };

  const modi: { id: Steg; navn: string; av: boolean }[] = [
    { id: 'masker', navn: 'Mask', av: !kilde },
    { id: 'rediger', navn: 'Edit', av: !kilde },
    { id: 'ferdig', navn: 'Finalize', av: !kilde || !modell },
  ];

  const maskeverktoy: { id: Forberedverktoy; ikon: IkonId; navn: string; tast: string }[] = [
    { id: 'beskjaer', ikon: 'beskjaer', navn: 'Beskjær', tast: 'C' },
    { id: 'tryllestav', ikon: 'tryllestav', navn: 'Tryllestav', tast: 'W' },
    { id: 'pensel', ikon: 'paint', navn: 'Pensel', tast: 'B' },
    { id: 'viskelar', ikon: 'viskelar', navn: 'Viskelær', tast: 'E' },
    { id: 'lasso', ikon: 'lasso', navn: 'Lasso', tast: 'L' },
    { id: 'magnetlasso', ikon: 'magnetlasso', navn: 'Magnetisk lasso', tast: 'Shift+L' },
    { id: 'rektangel', ikon: 'rectangle', navn: 'Rektangel', tast: 'M' },
  ];
  const redigeringsverktoy: { id: Redigerverktoy; ikon: IkonId; navn: string; tast: string }[] = [
    { id: 'spor', ikon: 'adjustments', navn: 'Konvertering', tast: 'K' },
    { id: 'lag', ikon: 'layers', navn: 'Lag', tast: 'Y' },
    { id: 'farger', ikon: 'palette', navn: 'Farger', tast: 'F' },
    { id: 'omrade', ikon: 'velg-omrade', navn: 'Tegn på nytt i område', tast: 'R' },
    { id: 'del', ikon: 'select', navn: 'Velg deler', tast: 'V' },
    { id: 'flytt', ikon: 'transform', navn: 'Flytt, skaler, roter', tast: 'T' },
    { id: 'linje', ikon: 'velg-linje', navn: 'Velg linjer', tast: 'L' },
    { id: 'punkt', ikon: 'edit-point', navn: 'Punkter', tast: 'P' },
    { id: 'penn', ikon: 'pen', navn: 'Penn', tast: 'N' },
  ];

  const lagnavn = () => Object.fromEntries(Object.entries(lagMeta).map(([f, l]) => [f, l.navn]));

  /** The SVG as exported: at the chosen size in mm, with the contour when it is on. */
  function svgTekst() {
    if (!modell) return '';
    const k = konturSti
      ? konturType === 'flate'
        ? `<g id="kontur"><title>Kontur</title><path fill="${konturFarge}" d="${konturSti}"/></g>`
        : `<g id="kontur"><title>Kontur (skjærelinje)</title><path fill="none" stroke="#ff00ff" stroke-width="${+(0.25 / mmPerEnhet).toFixed(4)}" d="${konturSti}"/></g>`
      : '';
    return tilSvg(modell, {
      grupperEtterFarge: grupper,
      bredde: bMm,
      hoyde: hMm,
      mm: true,
      marg: konturSti ? (konturAvstand + 0.25) / mmPerEnhet : 0,
      under: konturType === 'flate' ? k : '',
      over: konturType === 'linje' ? k : '',
      rekkefolge: lagliste,
      skjulte: skjulteFarger,
      navn: lagnavn(),
    });
  }

  const filnavn = () => kilde?.navn || 'vectorium';

  const lastNedDxf = () => {
    if (!modell) return;
    try {
      const k = konturPa ? kontur(modell, mmPerEnhet, konturAvstand, true, skjulteFarger) : undefined;
      const dxf = tilDxf(modell, mmPerEnhet, {
        rekkefolge: lagliste,
        skjulte: skjulteFarger,
        navn: lagnavn(),
        kontur: k,
      });
      lastNed(`${filnavn()}.dxf`, new Blob([dxf], { type: 'application/dxf' }));
    } catch (e) {
      console.error(e);
      settFeil('DXF-filen kunne ikke lages.');
    }
  };

  /** PNG at the chosen size and resolution, transparent around the motif. */
  const lastNedPng = async () => {
    if (!modell) return;
    const svg = svgTekst();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const bilde = new Image();
      bilde.src = url;
      await bilde.decode();
      const marg = konturSti ? (konturAvstand + 0.25) * 2 : 0;
      const pxPerMm = dpi / 25.4;
      const s = Math.min(1, 8000 / Math.max((bMm + marg) * pxPerMm, (hMm + marg) * pxPerMm));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((bMm + marg) * pxPerMm * s));
      c.height = Math.max(1, Math.round((hMm + marg) * pxPerMm * s));
      c.getContext('2d')!.drawImage(bilde, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      c.width = c.height = 0;
      if (!blob) throw new Error();
      lastNed(`${filnavn()}.png`, blob);
      settFerdigMelding(
        s < 1
          ? `PNG-en er lastet ned, men skalert ned til ${Math.round(dpi * s)} dpi så den ikke blir større enn 8000 px.`
          : `PNG-en er lastet ned i ${dpi} dpi.`,
      );
    } catch {
      settFeil('PNG-filen kunne ikke lages.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const sjekkTynne = () => {
    if (!modell) return;
    try {
      const deler = tynneDeler(modell, mmPerEnhet, minBredde, skjulteFarger);
      settTynne({ modell, mm: mmPerEnhet, deler });
    } catch (e) {
      console.error(e);
      settFeil('Kunne ikke sjekke tykkelsen.');
    }
  };

  const forenkleAlt = () => {
    if (!modell) return;
    const ider = ulaste(modell.kurver.flatMap((k, i) => (k ? [i] : [])));
    settModell(forenkle(modell, ider, forenkleStyrke));
    settFerdigMelding(`${ider.length} kurver er forenklet. Angre med Ctrl Z.`);
  };

  const flatUtNa = () => {
    if (!modell) return;
    settModell(flatUt(modell, flatFarge));
    settFerdigMelding('Alle delene har nå én farge. Angre med Ctrl Z.');
  };

  const fargebrukListe = useMemo(() => (modell ? fargebruk(modell) : []), [modell]);

  // ------------------------------------------------------------ panel pieces

  const forhandsvalgSeksjon = (
    <section>
      <h2>Forhåndsinnstilling</h2>
      <div class="vv-forhandsvalg" role="group" aria-label="Forhåndsinnstilling">
        {FORHANDSVALG.map((f) => (
          <button
            key={f.id}
            type="button"
            class="vv-sekundar"
            aria-pressed={forhandsvalgId === f.id}
            title={f.hjelp}
            onClick={() => brukForhandsvalg(f.id)}
          >
            {f.navn}
          </button>
        ))}
      </div>
      <p class="vv-hjelp">
        {FORHANDSVALG.find((f) => f.id === forhandsvalgId)?.hjelp ??
          'Velg det som ligner bildet ditt mest. Du kan justere alt etterpå.'}
      </p>
    </section>
  );

  const fargerSeksjon = (
    <section>
      <h2>Farger</h2>
      <div class="vv-segment" role="group" aria-label="Antall farger">
        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={farger === n}
            onClick={() => {
              settForhandsvalgId(null);
              settFarger(n);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {farger === 1 ? (
        <>
          <label class="vv-avkryss">
            <input
              type="checkbox"
              checked={terskel === null}
              onChange={(e) =>
                settTerskel((e.target as HTMLInputElement).checked ? null : Math.round(brukteTerskel ?? 128))
              }
            />
            Automatisk terskel
          </label>
          <Glidebryter
            navn="Terskel"
            verdi={Math.round(terskel ?? brukteTerskel ?? 128)}
            min={1}
            max={254}
            steg={1}
            av={terskel === null}
            endre={settTerskel}
          />
          <label class="vv-avkryss">
            <input
              type="checkbox"
              checked={inverter}
              onChange={(e) => settInverter((e.target as HTMLInputElement).checked)}
            />
            Inverter
          </label>
        </>
      ) : (
        <label class="vv-avkryss">
          <input
            type="checkbox"
            checked={fjernBakgrunn}
            onChange={(e) => settFjernBakgrunn((e.target as HTMLInputElement).checked)}
          />
          Fjern bakgrunn
        </label>
      )}
    </section>
  );

  const visningSeksjon = (
    <section>
      <h2>Visning</h2>
      <Glidebryter
        navn="Original under"
        verdi={visOriginal}
        min={0}
        max={1}
        steg={0.05}
        hjelp="Sammenlign vektoren med originalen."
        endre={settVisOriginal}
      />
      <label class="vv-avkryss">
        <input
          type="checkbox"
          checked={visKanter}
          onChange={(e) => settVisKanter((e.target as HTMLInputElement).checked)}
        />
        Vis kanter
      </label>
      <label class="vv-avkryss">
        <input
          type="checkbox"
          checked={delt !== null}
          aria-keyshortcuts="D"
          onChange={(e) => settDelt(e.currentTarget.checked ? 50 : null)}
        />
        Delt visning (D)
      </label>
      {delt !== null && (
        <Glidebryter
          navn="Skillelinje"
          verdi={delt}
          min={0}
          max={100}
          steg={1}
          enhet="%"
          hjelp="Originalen til venstre for linjen, vektoren til høyre."
          endre={settDelt}
        />
      )}
      <button type="button" class="vv-sekundar vv-ikonknapp" onClick={() => tilpassVisning(bruktUtsnitt)}>
        <Ikon id="fit" storrelse={18} />
        <span>Tilpass visning</span>
      </button>
    </section>
  );

  const eksportSeksjon = modell && kilde && (
    <section class="vv-eksport">
      <h2>Eksport</h2>
      <label class="vv-avkryss">
        <input
          type="checkbox"
          checked={grupper}
          onChange={(e) => settGrupper((e.target as HTMLInputElement).checked)}
        />
        Grupper etter farge
      </label>
      <div class="vv-knapperad">
        {props.ferdig && (
          <button
            type="button"
            class="vv-primar vv-ikonknapp"
            onClick={() => props.ferdig!(svgTekst(), kilde.navn)}
          >
            <Ikon id="svg-import" storrelse={18} />
            <span>Legg på skiltet</span>
          </button>
        )}
        <button
          type="button"
          class={`${props.ferdig ? 'vv-sekundar' : 'vv-primar'} vv-ikonknapp`}
          onClick={eksporter}
        >
          <Ikon id="export" storrelse={18} />
          <span>Last ned SVG</span>
        </button>
        <button type="button" class="vv-sekundar vv-ikonknapp" onClick={kopierSvg}>
          <Ikon id="copy" storrelse={18} />
          <span>Kopier SVG</span>
        </button>
      </div>
      {nivaa === 'avansert' && steg === 'ferdig' && (
        <>
          <div class="vv-knapperad">
            <Knapp
              ikon="export"
              navn="Last ned DXF"
              onClick={lastNedDxf}
              tittel="For skjæreplotter og CAD, i mm."
            />
            <Knapp ikon="image" navn="Last ned PNG" onClick={() => void lastNedPng()} />
          </div>
          <div class="vv-segment" role="group" aria-label="Oppløsning for PNG">
            {[150, 300, 600].map((d) => (
              <button key={d} type="button" aria-pressed={dpi === d} onClick={() => settDpi(d)}>
                {d} dpi
              </button>
            ))}
          </div>
          <p class="vv-hjelp">
            {iEnhet(bMm)} × {iEnhet(hMm)} {enhet}. DXF har ett lag per farge og konturen i laget «Kontur».
          </p>
        </>
      )}
      {kopiStatus && (
        <p class="vv-hjelp" role="status">
          {kopiStatus}
        </p>
      )}
      {visSvgTekst && (
        <textarea
          id="vv-svgtekst"
          class="vv-svgtekst"
          readOnly
          aria-label="SVG-koden"
          value={svgTekst()}
          onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
        />
      )}
    </section>
  );

  const felttypeVelger = (
    <div class="vv-felttype" role="group" aria-label="Hva feltet gjør">
      <button
        type="button"
        class="vv-felttype-masker"
        aria-pressed={felttype === 'masker'}
        onClick={() => settFelttype('masker')}
      >
        <span class="vv-prikk" aria-hidden="true" />
        Masker
      </button>
      <button
        type="button"
        class="vv-felttype-beskytt"
        aria-pressed={felttype === 'beskytt'}
        onClick={() => settFelttype('beskytt')}
      >
        <span class="vv-prikk" aria-hidden="true" />
        Beskytt
      </button>
    </div>
  );

  /** Options for the active Mask tool, at the top of the panel (the sketch: «aktivt verktøy viser valg»). */
  const maskevalg = kilde && (
    <section class="vv-verktoyvalg">
      <h2>{maskeverktoy.find((v) => v.id === fverktoy)?.navn ?? 'Mask'}</h2>
      {(fverktoy === 'pensel' ||
        fverktoy === 'viskelar' ||
        fverktoy === 'lasso' ||
        fverktoy === 'magnetlasso' ||
        fverktoy === 'rektangel') && (
        <>
          {felttypeVelger}
          <p class="vv-hjelp">
            {felttype === 'masker'
              ? 'Rødt fjernes og blir ikke med i vektoren.'
              : 'Grønt beskyttes og blir alltid med, også når bakgrunnen fjernes. Bra for hvite felt i en logo.'}{' '}
            X bytter.
          </p>
        </>
      )}
      {(fverktoy === 'pensel' || fverktoy === 'viskelar') && (
        <Glidebryter
          navn="Penselstørrelse"
          verdi={pensel}
          min={2}
          max={300}
          steg={1}
          enhet="px"
          endre={settPensel}
        />
      )}
      {fverktoy === 'magnetlasso' && (
        <Glidebryter
          navn="Bredde"
          verdi={magnetBredde}
          min={1}
          max={40}
          steg={1}
          enhet="px"
          hjelp="Hvor langt fra pekeren kanten kan ligge og fortsatt bli funnet. Smalere følger kanten tettere."
          endre={settMagnetBredde}
        />
      )}
      {(fverktoy === 'lasso' || fverktoy === 'magnetlasso' || fverktoy === 'rektangel') &&
        felttype === 'masker' && (
          <label class="vv-avkryss">
            <input
              type="checkbox"
              checked={beholdInnsiden}
              onChange={(e) => settBeholdInnsiden((e.target as HTMLInputElement).checked)}
            />
            Behold bare innsiden (alt utenfor fjernes)
          </label>
        )}
      {fverktoy === 'tryllestav' && (
        <>
          <div class="vv-segment vv-stavvalg" role="group" aria-label="Forhåndsinnstilling for tryllestaven">
            {stavForhand.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={toleranse === f.toleranse && sammenhengende === f.sammenhengende}
                data-tips={f.tips}
                onClick={() => {
                  settToleranse(f.toleranse);
                  settSammenhengende(f.sammenhengende);
                }}
              >
                {f.navn}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={stavvalg?.type === 'kant'}
              data-tips="Velger fargen langs bildekanten og alt som henger sammen med den"
              onClick={() => velgBakgrunn()}
            >
              Bakgrunn
            </button>
          </div>
          <Glidebryter navn="Toleranse" verdi={toleranse} min={0} max={255} steg={1} endre={settToleranse} />
          {spekter && stavvalg ? (
            <div class="vv-spekter">
              <div
                class="vv-spekterstripe"
                role="img"
                aria-label={`Fargene i bildet fra den valgte fargen og utover. ${Math.round(
                  spekter.andelInnenfor[toleranse]! * 100,
                )} % av bildet er innenfor toleransen.`}
                style={{
                  background: `linear-gradient(to right, ${spekterstopp(spekter.farger)})`,
                }}
              >
                <span
                  class="vv-spekterutenfor"
                  style={{ left: `${(toleranse / 255) * 100}%` }}
                  aria-hidden="true"
                />
              </div>
              <p class="vv-hjelp">
                <span
                  class="vv-spekterprove"
                  style={{ background: rgbaTekst(stavvalg.farge) }}
                  aria-hidden="true"
                />
                {stavvalg.type === 'kant' ? 'Bakgrunnsfargen' : 'Fargen du klikket'} til venstre, bildets
                andre farger mot høyre. Det lyse feltet blir valgt:{' '}
                <b>{Math.round(spekter.andelInnenfor[toleranse]! * 100)} % av bildet</b>.
              </p>
            </div>
          ) : (
            <p class="vv-hjelp">
              Klikk en farge i bildet, så viser gliden hvilke av bildets farger som blir med.
            </p>
          )}
          <label class="vv-avkryss">
            <input
              id="vv-sammenhengende"
              type="checkbox"
              checked={sammenhengende}
              onChange={(e) => settSammenhengende((e.target as HTMLInputElement).checked)}
            />
            Bare sammenhengende område
          </label>
        </>
      )}
      {fverktoy === 'beskjaer' && (
        <>
          <p class="vv-tall">
            {utsnitt.b} × {utsnitt.h} px fra ({utsnitt.x}, {utsnitt.y})
          </p>
          <div class="vv-knapperad">
            <Knapp
              ikon="actual-size"
              navn="Hele bildet"
              onClick={() => settUtsnitt({ x: 0, y: 0, b: kilde.bredde, h: kilde.hoyde })}
            />
            <Knapp ikon="fit" navn="Zoom til utsnitt" onClick={() => tilpassVisning(utsnitt)} />
          </div>
          <div class="vv-knapperad">
            <Knapp
              klasse="vv-primar"
              ikon="beskjaer"
              navn={beskjaerer ? 'Beskjærer …' : 'Bruk beskjæring'}
              onClick={() => void brukBeskjaering()}
              av={beskjaerer || helt(kilde, utsnitt)}
            />
            <Knapp
              ikon="undo"
              navn="Angre beskjæring"
              onClick={angreBilde}
              av={bildeAngre.current?.hva !== 'beskjaer' || beskjaerer}
            />
          </div>
          {kilde.original && (
            <p class="vv-hjelp">
              Bildet er skalert ned fra {kilde.original.bredde} × {kilde.original.hoyde} px så det kan
              redigeres på mobil og nettbrett.
            </p>
          )}
        </>
      )}
      <p class="vv-hjelp">
        {!fverktoy
          ? 'Velg et verktøy nederst. Uten verktøy flytter du visningen ved å dra.'
          : fverktoy === 'beskjaer'
            ? 'Dra et nytt utsnitt, eller dra i kantene og hjørnene. «Bruk beskjæring» klipper bildet til utsnittet.'
            : fverktoy === 'tryllestav'
              ? 'Klikk på en farge for å velge den. Shift legger til, Alt trekker fra. Velg så hva som skal skje med utvalget.'
              : fverktoy === 'lasso'
                ? 'Tegn rundt et felt.'
                : fverktoy === 'magnetlasso'
                  ? 'Klikk ved en kant og følg den med pekeren: linjen fester seg til kanten, og nye punkter settes av seg selv. Klikk for å sette et punkt selv. Klikk på startpunktet, dobbeltklikk eller trykk Enter for å lukke. Backspace fjerner siste punkt, Esc avbryter.'
                  : fverktoy === 'rektangel'
                    ? 'Dra et rektangel.'
                    : fverktoy === 'viskelar'
                      ? 'Visk ut rødt eller grønt du har malt.'
                      : 'Mal over et felt. Alt + mal visker ut.'}{' '}
        Mellomrom + dra flytter visningen, hjulet zoomer.
      </p>
    </section>
  );

  const utvalgSeksjon = utvalg && (
    <section class="vv-utvalgsboks">
      <h2>Utvalg</h2>
      <p class="vv-tall">{(valgtAndel * 100).toFixed(1)} % av bildet er valgt</p>
      <div class="vv-knapperad">
        <Knapp ikon="delete" navn="Masker utvalget" klasse="vv-primar" onClick={() => bruk('fjern')} />
        <Knapp ikon="lock" navn="Beskytt utvalget" onClick={beskyttUtvalg} />
        <Knapp ikon="beskjaer" navn="Behold bare utvalget" onClick={() => bruk('behold')} />
        <Knapp ikon="viskelar" navn="Hent tilbake" onClick={() => bruk('gjenopprett')} />
      </div>
      <div class="vv-felt">
        <label for="vv-utvid">
          <span>Utvid eller krymp</span>
          <output for="vv-utvid">{utvidPx} px</output>
        </label>
        <input
          id="vv-utvid"
          type="range"
          min={1}
          max={20}
          step={1}
          value={utvidPx}
          onInput={(e) => settUtvidPx(Number((e.target as HTMLInputElement).value))}
        />
      </div>
      <div class="vv-knapperad">
        <Knapp ikon="zoom-in" navn="Utvid" onClick={() => endreUtvalg(utvidPx)} />
        <Knapp ikon="zoom-out" navn="Krymp" onClick={() => endreUtvalg(-utvidPx)} />
        <Knapp ikon="exclude" navn="Inverter" onClick={() => settUtvalg(inverterUtvalg(utvalg))} />
        <Knapp ikon="panel-close" navn="Opphev" onClick={() => settUtvalg(null)} />
      </div>
    </section>
  );

  /** «Legg til bilde»: several images in one vectorisation. */
  const bildeSeksjon = kilde && (
    <section>
      <h2>Bilder</h2>
      <div class="vv-segment" role="group" aria-label="Plassering av bildet som legges til">
        <button type="button" aria-pressed={plassering === 'hoyre'} onClick={() => settPlassering('hoyre')}>
          Til høyre
        </button>
        <button type="button" aria-pressed={plassering === 'under'} onClick={() => settPlassering('under')}>
          Under
        </button>
      </div>
      <div class="vv-knapperad">
        <Knapp
          ikon="layer-add"
          navn={leggerTil ? 'Legger til …' : 'Legg til bilde'}
          onClick={() => leggTilVelger.current?.click()}
          av={leggerTil}
        />
        <Knapp
          ikon="undo"
          navn="Angre"
          tittel="Fjerner bildet som ble lagt til sist."
          onClick={angreBilde}
          av={bildeAngre.current?.hva !== 'leggtil' || leggerTil}
        />
      </div>
      <p class="vv-hjelp">
        Bildet får samme høyde (til høyre) eller bredde (under) som det du har, og alt vektoriseres sammen. Du
        kan også lime inn eller dra et bilde hit.
      </p>
    </section>
  );

  const maskePanel = kilde && (
    <>
      {maskevalg}
      {utvalgSeksjon}
      <section>
        <h2>Maske og beskyttelse</h2>
        <div class="vv-knapperad">
          <Knapp ikon="undo" navn="Angre" onClick={angreMaske} av={!maskeAngre.current.length} />
          <Knapp
            ikon="exclude"
            navn="Inverter masken"
            onClick={() => {
              lagreMaskeAngre();
              inverterMaske(maske.current!);
              oppdaterMaske();
            }}
          />
          <Knapp
            ikon="delete"
            navn="Tøm masken"
            onClick={() => {
              lagreMaskeAngre();
              tomMaske(maske.current!);
              oppdaterMaske();
            }}
          />
          <Knapp
            ikon="unlock"
            navn="Tøm beskyttelse"
            onClick={() => {
              lagreMaskeAngre();
              tomMaske(beskytt.current!);
              oppdaterMaske();
            }}
          />
        </div>
      </section>
      {bildeSeksjon}
      <Knapp
        ikon="generate"
        navn="Videre til Edit"
        klasse="vv-primar vv-bred"
        onClick={() => gaaTil('rediger')}
      />
    </>
  );

  const sporPanel = (
    <>
      {redigert && (
        <div class="vv-merknad">
          <p>Du har redigert vektoren. Endrer du innstillingene her, forsvinner redigeringene.</p>
          <button type="button" class="vv-sekundar vv-ikonknapp" onClick={konverterPaNytt}>
            <Ikon id="generate" storrelse={18} />
            <span>Konverter på nytt</span>
          </button>
        </div>
      )}
      {forhandsvalgSeksjon}
      {fargerSeksjon}
      <section>
        <h2>Oppløsning</h2>
        <div class="vv-felt">
          <label for="vv-opplosning">
            <span>Sporing</span>
          </label>
          <select
            id="vv-opplosning"
            value={maksSide}
            onChange={(e) => settMaksSide(Number((e.target as HTMLSelectElement).value))}
          >
            <option value={800}>800 px (rask)</option>
            <option value={1200}>1200 px</option>
            <option value={1600}>1600 px</option>
            <option value={2000}>2000 px (nøyaktig)</option>
          </select>
        </div>
      </section>
      <section>
        <h2>Fjern små deler</h2>
        <Glidebryter
          navn="Minste areal"
          verdi={rens.minAreal}
          min={0}
          max={2000}
          steg={1}
          enhet="px²"
          hjelp="Deler mindre enn dette (i originalbildet) tas bort."
          endre={(v) => endreRens({ minAreal: v })}
        />
        <Glidebryter
          navn="Minste tykkelse"
          verdi={rens.minTykkelse}
          min={0}
          max={40}
          steg={0.5}
          enhet="px"
          hjelp="Tynnere streker enn dette tas bort. Viktig for print: for tynne deler skrives ikke ut."
          endre={(v) => endreRens({ minTykkelse: v })}
        />
        <Glidebryter
          navn="Minste hull"
          verdi={rens.minHull}
          min={0}
          max={2000}
          steg={1}
          enhet="px²"
          hjelp="Hull mindre enn dette fylles igjen."
          endre={(v) => endreRens({ minHull: v })}
        />
        <Glidebryter
          navn="Støyfilter"
          verdi={rens.stoyfilter}
          min={0}
          max={4}
          steg={1}
          enhet="runder"
          hjelp="Retter ujevne kanter og enkeltpiksler før sporingen."
          endre={(v) => endreRens({ stoyfilter: v })}
        />
        <div class="vv-segment" role="group" aria-label="Små deler">
          <button
            type="button"
            aria-pressed={rens.smaaDeler === 'sla-sammen'}
            onClick={() => endreRens({ smaaDeler: 'sla-sammen' })}
          >
            Slå inn i naboen
          </button>
          <button
            type="button"
            aria-pressed={rens.smaaDeler === 'fjern'}
            onClick={() => endreRens({ smaaDeler: 'fjern' })}
          >
            Fjern helt
          </button>
        </div>
        {resultat && <p class="vv-hjelp">{resultat.fjernet} små deler ryddet bort.</p>}
      </section>
      <section>
        <h2>Kurver og form</h2>
        <label class="vv-avkryss">
          <input
            type="checkbox"
            checked={tilpasning.beregnForm}
            onChange={(e) => endreTilp({ beregnForm: (e.target as HTMLInputElement).checked })}
          />
          Beregn form (finn rette sider)
        </label>
        <Glidebryter
          navn="Rett-toleranse"
          verdi={tilpasning.rettToleranse}
          min={0.1}
          max={4}
          steg={0.05}
          enhet="px"
          av={!tilpasning.beregnForm}
          hjelp="En side som avviker mindre enn dette fra en rett linje, blir rett."
          endre={(v) => endreTilp({ rettToleranse: v })}
        />
        <Glidebryter
          navn="Kurvetoleranse"
          verdi={tilpasning.kurveToleranse}
          min={0.2}
          max={6}
          steg={0.05}
          enhet="px"
          hjelp="Hvor langt en kurve kan avvike fra kanten. Høyere gir færre punkter."
          endre={(v) => endreTilp({ kurveToleranse: v })}
        />
        <Glidebryter
          navn="Glatting"
          verdi={tilpasning.glatting}
          min={0}
          max={5}
          steg={0.1}
          enhet="px"
          hjelp="Jevner ut pikseltrappen før kurvene tilpasses."
          endre={(v) => endreTilp({ glatting: v })}
        />
        <Glidebryter
          navn="Hjørnevinkel"
          verdi={tilpasning.hjorneVinkel}
          min={20}
          max={150}
          steg={1}
          enhet="°"
          hjelp="Knekk skarpere enn dette blir skarpe hjørner. Lavere gir flere hjørner."
          endre={(v) => endreTilp({ hjorneVinkel: v })}
        />
        <Glidebryter
          navn="Hjørneskala"
          verdi={tilpasning.hjorneSkala}
          min={2}
          max={16}
          steg={1}
          enhet="px"
          hjelp="Hvor langt knekken måles over. Høyere overser små hakk."
          endre={(v) => endreTilp({ hjorneSkala: v })}
        />
      </section>
    </>
  );

  const fargePanel = modell && (
    <>
      <section>
        <h2>Farger i vektoren</h2>
        <ul class="vv-fargeliste">
          {fargebrukListe.map((f) => (
            <li key={f.farge}>
              <input
                type="color"
                value={f.farge}
                aria-label={`Bytt fargen ${f.farge} på ${f.deler} deler`}
                onChange={(e) => settModell(byttFarge(modell, f.farge, (e.target as HTMLInputElement).value))}
              />
              <button
                type="button"
                class="vv-lenkeknapp"
                title="Velg delene i denne fargen"
                onClick={() => {
                  settValgteDeler(
                    stier.filter((s) => s.farge === f.farge && !lasteDeler.has(s.id)).map((s) => s.id),
                  );
                  settRverktoy('del');
                }}
              >
                {f.farge} · {f.deler} {f.deler === 1 ? 'del' : 'deler'}
              </button>
            </li>
          ))}
        </ul>
        <p class="vv-hjelp">Klikk fargefeltet for å bytte farge på alle delene i den fargen.</p>
      </section>
      <section>
        <h2>Slå sammen like farger</h2>
        <Glidebryter
          navn="Hvor like"
          verdi={fargeTerskel}
          min={5}
          max={200}
          steg={1}
          hjelp="Farger nærmere hverandre enn dette blir én farge. Fargen med størst flate vinner."
          endre={settFargeTerskel}
        />
        <Knapp
          ikon="union"
          navn="Slå sammen like"
          av={fargebrukListe.length < 2}
          onClick={() => settModell(slaSammenLikeFarger(modell, fargeTerskel))}
        />
      </section>
      <section>
        <h2>Begrens antall farger</h2>
        <div class="vv-segment" role="group" aria-label="Høyst så mange farger">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" aria-pressed={fargeMaal === n} onClick={() => settFargeMaal(n)}>
              {n}
            </button>
          ))}
        </div>
        <Knapp
          ikon="palette"
          navn={`Reduser til ${fargeMaal}`}
          av={fargebrukListe.length <= fargeMaal}
          onClick={() => settModell(reduserFarger(modell, fargeMaal))}
        />
        <p class="vv-hjelp">
          Slår sammen de likeste fargene til det er {fargeMaal} igjen. Antall farger ved sporingen velger du
          under Konvertering.
        </p>
      </section>
    </>
  );

  const [roterGrader, settRoterGrader] = useState(45);
  const [skalerProsent, settSkalerProsent] = useState(100);
  const flyttPanel = modell && (
    <section>
      {!valgteDeler.length ? (
        <p class="vv-hjelp">
          Klikk en del og dra den. Shift-klikk velger flere. Piltastene flytter (Shift: lenger).
        </p>
      ) : (
        <p class="vv-tall">
          {valgteDeler.length} {valgteDeler.length === 1 ? 'del valgt' : 'deler valgt'}
        </p>
      )}
      <Knapp
        ikon="select"
        navn="Velg alle"
        onClick={() => settValgteDeler(stier.filter((s) => !lagLaste.has(s.id)).map((s) => s.id))}
      />
      {valgteDeler.length > 0 && (
        <>
          <h3 class="vv-underoverskrift">Roter</h3>
          <div class="vv-knapperad">
            {[-90, -15, 15, 90].map((g) => (
              <button
                key={g}
                type="button"
                class="vv-sekundar"
                onClick={() => transformerValgte((cx, cy) => rundt(cx, cy, g))}
              >
                {g > 0 ? `+${g}°` : `${g}°`}
              </button>
            ))}
          </div>
          <div class="vv-storrelse">
            <label>
              <span>Grader</span>
              <input
                type="number"
                step={1}
                value={roterGrader}
                onChange={(e) => settRoterGrader(Number(e.currentTarget.value) || 0)}
              />
            </label>
            <button
              type="button"
              class="vv-sekundar"
              onClick={() => transformerValgte((cx, cy) => rundt(cx, cy, roterGrader))}
            >
              Roter
            </button>
          </div>
          <h3 class="vv-underoverskrift">Skaler</h3>
          <div class="vv-knapperad">
            {[90, 110].map((f) => (
              <button
                key={f}
                type="button"
                class="vv-sekundar"
                onClick={() => transformerValgte((cx, cy) => rundt(cx, cy, 0, f / 100))}
              >
                {f}&nbsp;%
              </button>
            ))}
          </div>
          <div class="vv-storrelse">
            <label>
              <span>Prosent</span>
              <input
                type="number"
                min={1}
                step={1}
                value={skalerProsent}
                onChange={(e) => settSkalerProsent(Math.max(1, Number(e.currentTarget.value) || 100))}
              />
            </label>
            <button
              type="button"
              class="vv-sekundar"
              onClick={() => transformerValgte((cx, cy) => rundt(cx, cy, 0, skalerProsent / 100))}
            >
              Skaler
            </button>
          </div>
          <h3 class="vv-underoverskrift">Speilvend</h3>
          <div class="vv-knapperad">
            <button
              type="button"
              class="vv-sekundar"
              onClick={() => transformerValgte((cx, cy) => rundt(cx, cy, 0, -1, 1))}
            >
              Vannrett
            </button>
            <button
              type="button"
              class="vv-sekundar"
              onClick={() => transformerValgte((cx, cy) => rundt(cx, cy, 0, 1, -1))}
            >
              Loddrett
            </button>
          </div>
          <div class="vv-knapperad">
            <Knapp
              ikon="undo"
              navn="Tilbake til plassen"
              tittel="Delene går tilbake dit de ble sporet."
              onClick={() => settModell(nullstillTransform(modell, valgteDeler))}
              av={!valgteDeler.some((id) => flyttede.has(id))}
            />
            <Knapp ikon="delete" navn="Slett" onClick={() => settModell(slettDeler(modell, valgteDeler))} />
          </div>
        </>
      )}
      <p class="vv-hjelp">
        En flyttet del etterlater et tomrom og kan ligge over andre. Den redigeres bare her til den er tilbake
        på plassen sin; kanter og punkter følger den ikke i de andre verktøyene.
      </p>
    </section>
  );

  const delPanel = modell && (
    <section>
      <h2>{valgteDeler.length ? `${valgteDeler.length} valgt` : 'Deler'}</h2>
      {!valgteDeler.length && <p class="vv-hjelp">Klikk en del. Shift-klikk velger flere.</p>}
      {valgteDeler.length > 0 && valgtFarge && (
        <>
          <div class="vv-felt">
            <label for="vv-delfarge">
              <span>Farge</span>
              <output>{valgtFarge}</output>
            </label>
            <input
              id="vv-delfarge"
              type="color"
              value={valgtFarge}
              onChange={(e) =>
                settModell(settFarge(modell, valgteDeler, (e.target as HTMLInputElement).value))
              }
            />
          </div>
          <div class="vv-farger" role="group" aria-label="Bruk en farge fra vektoren">
            {fargeliste.map(([f]) => (
              <button
                key={f}
                type="button"
                class="vv-fargeprove"
                style={{ background: f }}
                title={f}
                aria-label={`Bruk ${f}`}
                onClick={() => settModell(settFarge(modell, valgteDeler, f))}
              />
            ))}
          </div>
          <div class="vv-knapperad">
            <Knapp
              ikon="union"
              navn="Slå sammen"
              av={valgteDeler.length < 2}
              onClick={() => {
                settModell(slaSammenDeler(modell, valgteDeler));
                settValgteDeler([]);
              }}
            />
            <Knapp ikon="delete" navn="Slett" onClick={() => settModell(slettDeler(modell, valgteDeler))} />
            <Knapp
              ikon="velg-linje"
              navn="Velg kantene"
              onClick={() => {
                settValgteKurver(ulaste(kurverRundt(modell, valgteDeler)));
                settRverktoy('linje');
              }}
            />
          </div>
        </>
      )}
    </section>
  );

  const linjePanel = modell && (
    <section>
      <h2>{valgteKurver.length ? `${valgteKurver.length} linjer valgt` : 'Linjer'}</h2>
      <p class="vv-hjelp">
        {rverktoy === 'linje'
          ? 'Klikk en linje, eller dra et område for å velge alle linjene i det. Shift legger til.'
          : 'Klikk en linje for å se punktene. Dra punkter og håndtak; Alt bryter håndtaket. Dobbeltklikk på linjen legger til et punkt, på et punkt veksler hjørne og glatt. Delete sletter punktet.'}
      </p>
      <Glidebryter
        navn="Forenkling"
        verdi={Math.round(styrke * 100)}
        min={0}
        max={100}
        steg={1}
        enhet="%"
        endre={(v) => settStyrke(v / 100)}
      />
      <div class="vv-knapperad">
        <Knapp
          ikon="smooth"
          navn="Forenkle"
          av={!valgteKurver.length}
          onClick={() => settModell(forenkle(modell, valgteKurver, styrke))}
        />
        <Knapp
          ikon="rett-linje"
          navn="Gjør rett"
          av={!valgteKurver.length}
          onClick={() => settModell(gjorRett(modell, valgteKurver))}
        />
        <Knapp
          ikon="pen"
          navn="Gjør buet"
          av={!valgteKurver.length}
          onClick={() => settModell(gjorBuet(modell, valgteKurver))}
        />
        <Knapp
          ikon="vater"
          navn="Vater"
          av={!valgteKurver.length}
          tittel="Rette linjer som nesten er vannrette eller loddrette, blir helt det."
          onClick={() => settModell(vater(modell, valgteKurver))}
        />
        <Knapp
          ikon="history"
          navn="Tilbakestill"
          av={!valgteKurver.length}
          onClick={() => settModell(tilpassPaNytt(modell, valgteKurver, tilpasning))}
        />
      </div>
      <div class="vv-knapperad">
        <Knapp
          ikon="select"
          navn="Velg alle"
          onClick={() => settValgteKurver(ulaste(modell.kurver.flatMap((k) => (k ? [k.id] : []))))}
        />
        <Knapp
          ikon="select"
          navn="Velg delene ved"
          av={!valgteKurver.length}
          onClick={() => {
            settValgteDeler(delerVed(modell, valgteKurver));
            settRverktoy('del');
          }}
        />
      </div>
      {rverktoy === 'punkt' && valgtAnker && (
        <div class="vv-knapperad">
          <button
            type="button"
            class="vv-sekundar"
            onClick={() => {
              const a = modell.kurver[valgtAnker.kurve]?.ankre[valgtAnker.idx];
              if (a) settModell(settAnkertype(modell, valgtAnker.kurve, valgtAnker.idx, !a.hjorne));
            }}
          >
            {modell.kurver[valgtAnker.kurve]?.ankre[valgtAnker.idx]?.hjorne
              ? 'Gjør glatt'
              : 'Gjør til hjørne'}
          </button>
          <Knapp
            ikon="remove-point"
            navn="Slett punkt"
            onClick={() => {
              settModell(slettAnker(modell, valgtAnker.kurve, valgtAnker.idx));
              settValgtAnker(null);
            }}
          />
        </div>
      )}
    </section>
  );

  const pennPanel = (
    <section>
      <h2>{penn.length ? `Felt med ${penn.length} punkter` : 'Penn'}</h2>
      <p class="vv-hjelp">
        Klikk for hjørnepunkter, dra for buede punkter med håndtak. Hold mellomrom mens du drar for å flytte
        punktet. Klikk på første punkt (eller trykk Enter) for å lukke feltet. Backspace fjerner siste punkt,
        Esc avbryter.
      </p>
      <label class="vv-avkryss">
        <input
          type="checkbox"
          checked={pennSlaSammen}
          onChange={(e) => settPennSlaSammen(e.currentTarget.checked)}
        />
        <span>
          Slå sammen med valgte deler
          {valgteDeler.length ? ` (${valgteDeler.length} valgt)` : ' (velg deler med V først)'}
        </span>
      </label>
      {!(pennSlaSammen && valgteDeler.length) && (
        <div class="vv-felt">
          <label for="vv-pennfarge">
            <span>Farge på nytt felt</span>
            <output>{pennFarge}</output>
          </label>
          <input
            id="vv-pennfarge"
            type="color"
            value={pennFarge}
            onInput={(e) => settPennFarge(e.currentTarget.value)}
          />
        </div>
      )}
      <div class="vv-knapperad">
        <Knapp ikon="path-close" navn="Lukk feltet" onClick={fullforPenn} av={penn.length < 3} />
        <Knapp
          ikon="remove-point"
          navn="Fjern siste punkt"
          onClick={() => settPenn((s) => s.slice(0, -1))}
          av={!penn.length}
        />
        <Knapp ikon="panel-close" navn="Avbryt" onClick={() => settPenn([])} av={!penn.length} />
      </div>
      {pennMelding && (
        <p class="vv-hjelp" role="status">
          {pennMelding}
        </p>
      )}
    </section>
  );

  const angreRad = (
    <div class="vv-knapperad">
      <Knapp ikon="undo" navn="Angre" onClick={angre} av={!fortid.current.length} tittel="Ctrl Z" />
      <Knapp ikon="redo" navn="Gjør om" onClick={gjenta} av={!fremtid.current.length} />
    </div>
  );

  /** Layer metadata, changed for one colour. */
  const endreLag = (f: string, d: Partial<Lagkart[string]>) =>
    settLagMeta((l) => ({ ...l, [f]: { ...l[f], ...d } }));
  /** Moves a layer one step toward the front (+1) or the back (-1). */
  const flyttLagSteg = (f: string, retning: 1 | -1) => {
    const r = [...lagliste];
    const i = r.indexOf(f),
      j = i + retning;
    if (i < 0 || j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j]!, r[i]!];
    settLagRekkefolge(r);
  };
  /** A layer gets another colour; its name, visibility and lock go with it. */
  const byttLagfarge = (fra: string, til: string) => {
    if (!modell || fra === til) return;
    settModell(byttFarge(modell, fra, til));
    const ny = flyttLag(lagMeta, lagliste, fra, til);
    settLagMeta(ny.lag);
    settLagRekkefolge(ny.rekkefolge);
  };

  const lagPanel = modell && (
    <section>
      <p class="vv-hjelp">
        Hver farge er ett lag. Øverst i lista ligger forrest. Skjulte lag blir ikke med i eksporten; låste lag
        kan ikke velges eller endres.
      </p>
      <ol class="vv-lagliste">
        {[...lagliste].reverse().map((f, i, alle) => {
          const l = lagMeta[f] ?? {};
          const under = alle[i + 1];
          const antall =
            stier.filter((s) => s.farge === f).length || modell.deler.filter((d) => d?.farge === f).length;
          const navn = l.navn || f;
          return (
            <li key={f} class={l.skjult ? 'vv-lag vv-lag-skjult' : 'vv-lag'}>
              <div class="vv-lagrad">
                <input
                  type="color"
                  value={f}
                  aria-label={`Farge på laget ${navn}`}
                  disabled={l.last}
                  onChange={(e) => byttLagfarge(f, (e.target as HTMLInputElement).value)}
                />
                <input
                  type="text"
                  class="vv-lagnavn"
                  value={l.navn ?? ''}
                  placeholder={f}
                  aria-label={`Navn på laget ${f}`}
                  onInput={(e) => endreLag(f, { navn: (e.target as HTMLInputElement).value || undefined })}
                />
                <button
                  type="button"
                  class="vv-lagknapp"
                  aria-pressed={!l.skjult}
                  aria-label={`${l.skjult ? 'Vis' : 'Skjul'} laget ${navn}`}
                  title={l.skjult ? 'Vis' : 'Skjul'}
                  onClick={() => endreLag(f, { skjult: !l.skjult })}
                >
                  <Ikon id="visible" storrelse={16} />
                </button>
                <button
                  type="button"
                  class="vv-lagknapp"
                  aria-pressed={!!l.last}
                  aria-label={`${l.last ? 'Lås opp' : 'Lås'} laget ${navn}`}
                  title={l.last ? 'Lås opp' : 'Lås'}
                  onClick={() => {
                    endreLag(f, { last: !l.last });
                    if (!l.last) {
                      settValgteDeler((v) => v.filter((id) => modell.deler[id]?.farge !== f));
                      settValgteKurver([]);
                    }
                  }}
                >
                  <Ikon id={l.last ? 'lock' : 'unlock'} storrelse={16} />
                </button>
              </div>
              <div class="vv-lagrad vv-lagrad-handlinger">
                <span class="vv-dempet">
                  {antall} {antall === 1 ? 'del' : 'deler'}
                </span>
                <button
                  type="button"
                  class="vv-lagknapp"
                  aria-label={`Flytt laget ${navn} fremover`}
                  title="Fremover"
                  disabled={i === 0}
                  onClick={() => flyttLagSteg(f, 1)}
                >
                  <Ikon id="bring-forward" storrelse={16} />
                </button>
                <button
                  type="button"
                  class="vv-lagknapp"
                  aria-label={`Flytt laget ${navn} bakover`}
                  title="Bakover"
                  disabled={!under}
                  onClick={() => flyttLagSteg(f, -1)}
                >
                  <Ikon id="send-backward" storrelse={16} />
                </button>
                <button
                  type="button"
                  class="vv-lagknapp"
                  aria-label={`Velg delene i laget ${navn}`}
                  title="Velg delene"
                  disabled={l.last}
                  onClick={() => {
                    settValgteDeler(modell.deler.flatMap((d) => (d && d.farge === f ? [d.id] : [])));
                    settRverktoy('del');
                  }}
                >
                  <Ikon id="select" storrelse={16} />
                </button>
                <button
                  type="button"
                  class="vv-lagknapp"
                  aria-label={`Slå sammen delene i laget ${navn} til én del`}
                  title="Slå sammen delene i laget"
                  disabled={l.last || antall < 2}
                  onClick={() =>
                    settModell(
                      slaSammenDeler(
                        modell,
                        modell.deler.flatMap((d) => (d && d.farge === f ? [d.id] : [])),
                      ),
                    )
                  }
                >
                  <Ikon id="union" storrelse={16} />
                </button>
                <button
                  type="button"
                  class="vv-sekundar vv-lagslaa"
                  aria-label={`Slå sammen laget ${navn} med laget under`}
                  title="Laget under tar over delene og beholder sin farge"
                  disabled={!under || l.last || !!lagMeta[under]?.last}
                  onClick={() => under && byttLagfarge(f, under)}
                >
                  Merge ned
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );

  /** Original pixels² to vector units² for the area setting. */
  const enhetPerPx = modell ? modell.bredde / bruktUtsnitt.b : 1;
  const endreLokal = (d: Partial<Tilpasningsvalg>) => settLokalTilpasning((t) => ({ ...t, ...d }));
  const tegnPaNytt = () => {
    if (!modell || !lokalOmrade) return;
    const r = tegnOmradePaNytt(
      modell,
      lokalOmrade,
      { tilpasning: lokalTilpasning, minAreal: lokalMinAreal * enhetPerPx * enhetPerPx },
      lasteDeler,
    );
    settModell(r.modell);
    settLokalMelding(
      r.kurver || r.smaaDeler
        ? `${r.kurver} ${r.kurver === 1 ? 'linje' : 'linjer'} tegnet på nytt${r.smaaDeler ? `, ${r.smaaDeler} små deler slått inn i naboen` : ''}.`
        : 'Fant ingen linjer i området. Marker et større område.',
    );
  };

  const omradePanel = modell && (
    <section>
      <p class="vv-hjelp">
        Dra et område på vektoren. Innstillingene under gjelder bare der, og resten av vektoren er urørt.
        Kantene mot resten henger fortsatt sammen.
      </p>
      {lokalOmrade ? (
        <p class="vv-tall">Område markert.</p>
      ) : (
        <p class="vv-dempet">Ingen område markert ennå.</p>
      )}
      <div class="vv-knapperad">
        <Knapp
          ikon="history"
          navn="Hent globale innstillinger"
          tittel="Start fra innstillingene under Konvertering."
          onClick={() => settLokalTilpasning(tilpasning)}
        />
      </div>
      <label class="vv-avkryss">
        <input
          type="checkbox"
          checked={lokalTilpasning.beregnForm}
          onChange={(e) => endreLokal({ beregnForm: (e.target as HTMLInputElement).checked })}
        />
        Beregn form (finn rette sider)
      </label>
      <Glidebryter
        navn="Lokal rett-toleranse"
        verdi={lokalTilpasning.rettToleranse}
        min={0.1}
        max={4}
        steg={0.05}
        enhet="px"
        av={!lokalTilpasning.beregnForm}
        endre={(v) => endreLokal({ rettToleranse: v })}
      />
      <Glidebryter
        navn="Lokal kurvetoleranse"
        verdi={lokalTilpasning.kurveToleranse}
        min={0.2}
        max={6}
        steg={0.05}
        enhet="px"
        hjelp="Høyere gir færre punkter og rolige kurver."
        endre={(v) => endreLokal({ kurveToleranse: v })}
      />
      <Glidebryter
        navn="Lokal glatting"
        verdi={lokalTilpasning.glatting}
        min={0}
        max={5}
        steg={0.1}
        enhet="px"
        endre={(v) => endreLokal({ glatting: v })}
      />
      <Glidebryter
        navn="Lokal hjørnevinkel"
        verdi={lokalTilpasning.hjorneVinkel}
        min={20}
        max={150}
        steg={1}
        enhet="°"
        endre={(v) => endreLokal({ hjorneVinkel: v })}
      />
      <Glidebryter
        navn="Slå inn små deler under"
        verdi={lokalMinAreal}
        min={0}
        max={2000}
        steg={1}
        enhet="px²"
        hjelp="Deler helt inne i området som er mindre enn dette, går inn i naboen. 0 lar dem være."
        endre={settLokalMinAreal}
      />
      <div class="vv-knapperad">
        <Knapp
          ikon="generate"
          navn="Tegn på nytt i området"
          klasse="vv-primar"
          av={!lokalOmrade}
          onClick={tegnPaNytt}
        />
        <Knapp
          ikon="panel-close"
          navn="Fjern markeringen"
          av={!lokalOmrade}
          onClick={() => settLokalOmrade(null)}
        />
      </div>
      {lokalMelding && (
        <p class="vv-hjelp" role="status">
          {lokalMelding}
        </p>
      )}
    </section>
  );

  const redigerPanel = kilde && (
    <>
      <section class="vv-verktoyvalg">
        <h2>{redigeringsverktoy.find((v) => v.id === rverktoy)?.navn}</h2>
        {angreRad}
      </section>
      {rverktoy === 'spor' && sporPanel}
      {rverktoy === 'farger' && fargePanel}
      {rverktoy === 'lag' && lagPanel}
      {rverktoy === 'omrade' && omradePanel}
      {rverktoy === 'del' && delPanel}
      {rverktoy === 'flytt' && flyttPanel}
      {(rverktoy === 'linje' || rverktoy === 'punkt') && linjePanel}
      {rverktoy === 'penn' && pennPanel}
      {!modell && rverktoy !== 'spor' && <p class="vv-dempet">Vektoren lages …</p>}
      {visningSeksjon}
      <button
        type="button"
        class="vv-primar vv-bred vv-ikonknapp"
        disabled={!modell}
        onClick={() => gaaTil('ferdig')}
      >
        <Ikon id="export" storrelse={18} />
        <span>Videre til Finalize</span>
      </button>
    </>
  );

  /** A colour field with its label and code. */
  const fargefelt = (id: string, navn: string, verdi: string, endre: (v: string) => void) => (
    <div class="vv-felt">
      <label for={id}>
        <span>{navn}</span>
        <output>{verdi}</output>
      </label>
      <input id={id} type="color" value={verdi} onInput={(e) => endre(e.currentTarget.value)} />
    </div>
  );

  const settStorrelse = (verdi: string, side: 'b' | 'h') => {
    const v = fraEnhet(Number(verdi.replace(',', '.')));
    if (!modell || !Number.isFinite(v) || v <= 0) return;
    settBreddeMm(side === 'b' ? v : (v * modell.bredde) / modell.hoyde);
  };

  const forhandsvisningSeksjon = (
    <section>
      <h2>Forhåndsvisning</h2>
      <div class="vv-segment" role="group" aria-label="Bakgrunn">
        {(
          [
            ['rutenett', 'Rutenett'],
            ['lys', 'Lys'],
            ['mork', 'Mørk'],
            ['skilt', 'Som skilt'],
          ] as const
        ).map(([id, navn]) => (
          <button key={id} type="button" aria-pressed={bakgrunn === id} onClick={() => settBakgrunn(id)}>
            {navn}
          </button>
        ))}
      </div>
      {bakgrunn === 'skilt' && fargefelt('vv-skiltfarge', 'Skiltfarge', skiltfarge, settSkiltfarge)}
      <p class="vv-hjelp">Se hvordan vektoren står mot lys og mørk bakgrunn, eller på en skiltplate.</p>
    </section>
  );

  const storrelseSeksjon = modell && (
    <section>
      <h2>Størrelse</h2>
      <div class="vv-segment" role="group" aria-label="Enhet">
        <button type="button" aria-pressed={enhet === 'mm'} onClick={() => settEnhet('mm')}>
          mm
        </button>
        <button type="button" aria-pressed={enhet === 'cm'} onClick={() => settEnhet('cm')}>
          cm
        </button>
      </div>
      <div class="vv-storrelse">
        <label>
          <span>Bredde</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.1}
            step={enhet === 'cm' ? 0.1 : 1}
            value={iEnhet(bMm)}
            onChange={(e) => settStorrelse(e.currentTarget.value, 'b')}
          />
          <span>{enhet}</span>
        </label>
        <label>
          <span>Høyde</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.1}
            step={enhet === 'cm' ? 0.1 : 1}
            value={iEnhet(hMm)}
            onChange={(e) => settStorrelse(e.currentTarget.value, 'h')}
          />
          <span>{enhet}</span>
        </label>
      </div>
      {breddeMm !== null && (
        <button type="button" class="vv-lenkeknapp" onClick={() => settBreddeMm(null)}>
          Tilbake til bildets størrelse ({iEnhet(standardMm)} {enhet} bred)
        </button>
      )}
      <p class="vv-hjelp">Størrelsen står i SVG-, DXF- og PNG-filen, og følger med på skiltet.</p>
    </section>
  );

  const skjaeringSeksjon = modell && (
    <section>
      <h2>Til skjæring</h2>
      <Glidebryter
        navn="Minste bredde"
        verdi={minBredde}
        min={0.2}
        max={5}
        steg={0.1}
        enhet="mm"
        hjelp="Folie og fres klarer sjelden streker smalere enn 0,5 til 1 mm."
        endre={(v) => {
          settMinBredde(v);
          settTynne(null);
        }}
      />
      <Knapp ikon="ruler" navn="Sjekk tynne steder" onClick={sjekkTynne} />
      {gjeldendeTynne && (
        <p class={gjeldendeTynne.deler.length ? 'vv-advarsel' : 'vv-melding'} role="status">
          {gjeldendeTynne.deler.length
            ? `${gjeldendeTynne.deler.length} ${gjeldendeTynne.deler.length === 1 ? 'del har' : 'deler har'} steder smalere enn ${String(minBredde).replace('.', ',')} mm. De er markert med rødt. Gjør vektoren større, slå delene sammen i Edit, eller øk «Fjern tynne streker» i Konvertering.`
            : `Ingen deler er smalere enn ${String(minBredde).replace('.', ',')} mm.`}
        </p>
      )}
      <Glidebryter
        navn="Forenkling"
        verdi={forenkleStyrke}
        min={0}
        max={1}
        steg={0.05}
        hjelp="Færre punkter gir jevnere og raskere skjæring. Låste lag røres ikke."
        endre={settForenkleStyrke}
      />
      <Knapp ikon="smooth" navn="Forenkle alle kurver" onClick={forenkleAlt} />
    </section>
  );

  const konturSeksjon = modell && (
    <section>
      <h2>Kontur</h2>
      <label class="vv-avkryss">
        <input type="checkbox" checked={konturPa} onChange={(e) => settKonturPa(e.currentTarget.checked)} />
        Kontur rundt motivet
      </label>
      {konturPa && (
        <>
          <Glidebryter
            navn="Avstand"
            verdi={konturAvstand}
            min={0.5}
            max={20}
            steg={0.5}
            enhet="mm"
            endre={settKonturAvstand}
          />
          <div class="vv-segment" role="group" aria-label="Konturen er">
            <button
              type="button"
              aria-pressed={konturType === 'linje'}
              onClick={() => settKonturType('linje')}
            >
              Skjærelinje
            </button>
            <button
              type="button"
              aria-pressed={konturType === 'flate'}
              onClick={() => settKonturType('flate')}
            >
              Flate bak
            </button>
          </div>
          {konturType === 'flate' && fargefelt('vv-konturfarge', 'Farge', konturFarge, settKonturFarge)}
          <p class="vv-hjelp">
            {konturType === 'linje'
              ? 'En magenta linje rundt motivet, i et eget lag, for konturskjæring av klistremerker og folie.'
              : 'En fylt flate bak motivet, for eksempel som bakplate eller hvit underfarge.'}
          </p>
        </>
      )}
    </section>
  );

  const flatUtSeksjon = modell && (
    <section>
      <h2>Flat ut</h2>
      {fargefelt('vv-flatfarge', 'Én farge', flatFarge, settFlatFarge)}
      <Knapp ikon="fill" navn="Gjør alt til én farge" onClick={flatUtNa} />
      <p class="vv-hjelp">For folie i én farge eller gravering. Delene beholder formen sin.</p>
    </section>
  );

  const ferdigPanel = kilde && modell && (
    <>
      {ferdigMelding && (
        <p class="vv-melding" role="status">
          {ferdigMelding}
        </p>
      )}
      {forhandsvisningSeksjon}
      {storrelseSeksjon}
      {skjaeringSeksjon}
      {konturSeksjon}
      {flatUtSeksjon}
      {eksportSeksjon}
      {visningSeksjon}
    </>
  );

  const enkelPanel = kilde && (
    <>
      {forhandsvalgSeksjon}
      {fargerSeksjon}
      {farger === 1 && (
        <section>
          <Knapp
            ikon="delete"
            navn="Fjern bakgrunnen"
            tittel="Masker fargen langs bildekanten og alt som henger sammen med den."
            onClick={fjernBakgrunnNa}
          />
          <p class="vv-hjelp">Med én farge spores det mørke. Fjern bakgrunnen hvis den kommer med.</p>
        </section>
      )}
      <section>
        <h2>Sammenlign</h2>
        <Glidebryter
          navn="Original under"
          verdi={visOriginal}
          min={0}
          max={1}
          steg={0.05}
          endre={settVisOriginal}
        />
      </section>
      {eksportSeksjon}
      {bildeSeksjon}
      <p class="vv-hjelp">
        Trenger du å maskere, redigere kurver eller slå sammen deler? Bytt til <b>Advanced</b> øverst.
        Ingenting går tapt.
      </p>
    </>
  );

  const dokk =
    kilde && nivaa === 'avansert' && steg !== 'ferdig' ? (
      <nav class="vv-dokk" aria-label={steg === 'masker' ? 'Mask-verktøy' : 'Edit-verktøy'}>
        {steg === 'masker'
          ? maskeverktoy.map((v) => (
              <button
                key={v.id}
                type="button"
                class="vv-dokkknapp"
                aria-pressed={fverktoy === v.id}
                aria-label={v.navn}
                aria-keyshortcuts={v.tast}
                data-tips={`${v.navn} (${v.tast})`}
                onClick={() => settFverktoy((x) => (x === v.id ? null : v.id))}
              >
                <Ikon id={v.ikon} storrelse={20} />
                {(v.id === 'pensel' || v.id === 'lasso' || v.id === 'magnetlasso' || v.id === 'rektangel') &&
                  fverktoy === v.id && (
                    <span
                      class={felttype === 'beskytt' ? 'vv-dokkmerke vv-dokkmerke-beskytt' : 'vv-dokkmerke'}
                      aria-hidden="true"
                    />
                  )}
              </button>
            ))
          : redigeringsverktoy.map((v) => (
              <button
                key={v.id}
                type="button"
                class="vv-dokkknapp"
                aria-pressed={rverktoy === v.id}
                aria-label={v.navn}
                aria-keyshortcuts={v.tast}
                data-tips={`${v.navn} (${v.tast})`}
                disabled={v.id !== 'spor' && !modell}
                onClick={() => {
                  settRverktoy(v.id);
                  if (v.id !== 'penn') settPenn([]);
                  if (v.id === 'omrade' && rverktoy !== 'omrade') settLokalTilpasning(tilpasning);
                }}
              >
                <Ikon id={v.ikon} storrelse={20} />
              </button>
            ))}
      </nav>
    ) : null;

  const hjelp = hjelpApen && (
    <div
      class="vv-hjelpvindu"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vv-hjelp-tittel"
      onKeyDown={(e) => {
        // the dialog closes itself: the window's key listener is bound after a render and can lag behind
        if (e.key === 'Escape') {
          e.stopPropagation();
          settHjelpApen(false);
        }
      }}
    >
      <div class="vv-hjelpinnhold">
        <header>
          <h2 id="vv-hjelp-tittel">Slik bruker du Vectorium</h2>
          <button
            type="button"
            class="vv-sekundar vv-ikonknapp"
            onClick={() => settHjelpApen(false)}
            ref={(el) => el?.focus()}
          >
            <Ikon id="panel-close" storrelse={18} />
            <span>Lukk</span>
          </button>
        </header>
        <p>
          <b>Simple</b> gjør bildet om til vektor med en forhåndsinnstilling og et antall farger.{' '}
          <b>Advanced</b> har tre moduser:
        </p>
        <ol>
          <li>
            <b>Mask</b>: beskjær bildet og marker hva som skal fjernes (rødt) og hva som alltid skal være med
            (grønt). Tryllestaven velger farger, også bakgrunnen. Pensel, lasso, magnetisk lasso og rektangel
            kan både maskere og beskytte; X bytter.
          </li>
          <li>
            <b>Edit</b>: konverteringen (forhåndsinnstilling, farger, små deler, kurver), lagene, fargene,
            «Tegn på nytt i område», deler, flytt/skaler/roter, linjer, punkter og pennen.
          </li>
          <li>
            <b>Finalize</b>: se vektoren mot lys og mørk bakgrunn eller på et skilt, sett størrelsen i mm
            eller cm, sjekk tynne steder og forenkle til skjæring, legg til kontur, gjør alt til én farge, og
            last ned som SVG, DXF eller PNG, kopier den eller legg den på skiltet.
          </li>
        </ol>
        <h3>Flere bilder og prosjekter</h3>
        <p>
          «Legg til bilde» setter et nytt bilde til høyre for eller under det du har, og alt vektoriseres
          sammen. Du kan også lime inn (Ctrl V) eller dra et bilde inn. Arbeidet lagres automatisk i
          nettleseren og tilbys igjen neste gang. «Lagre prosjekt» laster det ned som en fil du kan åpne igjen
          med «Velg bilde».
        </p>
        <h3>Snarveier</h3>
        <dl class="vv-snarveier">
          <dt>1 2 3</dt>
          <dd>Mask, Edit, Finalize</dd>
          <dt>C W B E L M</dt>
          <dd>Beskjær, tryllestav, pensel, viskelær, lasso, rektangel (Mask)</dd>
          <dt>Shift L</dt>
          <dd>Magnetisk lasso (Mask)</dd>
          <dt>X</dt>
          <dd>Bytt mellom Masker og Beskytt</dd>
          <dt>K Y F R V T L P N</dt>
          <dd>
            Konvertering, lag, farger, tegn på nytt i område, deler, flytt/skaler/roter, linjer, punkter, penn
            (Edit)
          </dd>
          <dt>Piltaster</dt>
          <dd>Flytt de valgte delene med «Flytt, skaler, roter» (Shift: lenger)</dd>
          <dt>D</dt>
          <dd>Delt visning: originalen til venstre, vektoren til høyre</dd>
          <dt>Ctrl V</dt>
          <dd>Lim inn et bilde: åpner det, eller legger det til det du har</dd>
          <dt>Ctrl Z / Ctrl Y</dt>
          <dd>Angre / gjør om</dd>
          <dt>Mellomrom + dra</dt>
          <dd>Flytt visningen; hjulet zoomer, Ctrl 0 tilpasser</dd>
          <dt>?</dt>
          <dd>Denne hjelpen</dd>
        </dl>
      </div>
    </div>
  );

  return (
    <div class="vv" ref={rotRef}>
      <header class="vv-topp">
        <strong class="vv-tittel">Vectorium</strong>
        <div class="vv-segment vv-nivaa" role="group" aria-label="Modus">
          <button type="button" aria-pressed={nivaa === 'enkel'} onClick={() => byttNivaa('enkel')}>
            Simple
          </button>
          <button type="button" aria-pressed={nivaa === 'avansert'} onClick={() => byttNivaa('avansert')}>
            Advanced
          </button>
        </div>
        {nivaa === 'avansert' && (
          <nav class="vv-modi" aria-label="Steg">
            {modi.map((m, i) => (
              <button
                key={m.id}
                type="button"
                class="vv-modus"
                aria-current={steg === m.id ? 'step' : undefined}
                disabled={m.av}
                onClick={() => gaaTil(m.id)}
              >
                <sup>{i + 1}</sup>
                {m.navn}
              </button>
            ))}
          </nav>
        )}
        <button
          type="button"
          class="vv-hjelpknapp"
          aria-label="Hjelp"
          title="Hjelp (?)"
          onClick={() => settHjelpApen(true)}
        >
          ?
        </button>
        <div class="vv-topp-hoyre">
          <Knapp
            ikon="image"
            navn={kilde ? 'Nytt bilde' : 'Velg bilde'}
            tittel={`Åpne et bilde eller et lagret prosjekt (${FILENDELSE})`}
            onClick={() => filvelger.current?.click()}
          />
          {kilde && (
            <Knapp
              ikon="save"
              navn="Lagre prosjekt"
              tittel="Last ned bildet, maskene, innstillingene og vektoren som én fil du kan åpne igjen."
              onClick={() => void lagreProsjektfil()}
            />
          )}
          {props.lukk && (
            <button type="button" class="vv-sekundar vv-ikonknapp" onClick={props.lukk}>
              <Ikon id="panel-close" storrelse={18} />
              <span>Lukk</span>
            </button>
          )}
        </div>
        <input
          ref={filvelger}
          type="file"
          accept={`image/png,image/jpeg,image/webp,image/gif,image/bmp,${FILENDELSE}`}
          hidden
          onChange={(e) => {
            const inp = e.target as HTMLInputElement;
            void velgFil(inp.files?.[0]);
            inp.value = '';
          }}
        />
        <input
          ref={leggTilVelger}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          hidden
          aria-label="Bilde å legge til"
          onChange={(e) => {
            const inp = e.target as HTMLInputElement;
            void leggTil(inp.files?.[0]);
            inp.value = '';
          }}
        />
      </header>

      <main class="vv-hoved">
        <div class="vv-arbeid">
          {lerret}
          {dokk}
        </div>
        <aside class="vv-panel" aria-label="Valg">
          {feil && (
            <p class="vv-feil" role="alert">
              {feil}
            </p>
          )}
          {lagreStatus && kilde && (
            <p class="vv-melding" role="status">
              {lagreStatus}
            </p>
          )}
          {!kilde && <p class="vv-dempet">Start med å velge et bilde.</p>}
          {nivaa === 'enkel' && enkelPanel}
          {nivaa === 'avansert' && steg === 'masker' && maskePanel}
          {nivaa === 'avansert' && steg === 'rediger' && redigerPanel}
          {nivaa === 'avansert' && steg === 'ferdig' && ferdigPanel}
        </aside>
      </main>

      <div class="vv-status" role="status" aria-live="polite">
        {statistikk && !viserMaske ? (
          <>
            <span>
              <b>{statistikk.deler}</b> {statistikk.deler === 1 ? 'del' : 'deler'}
            </span>
            <span>
              <b>{statistikk.farger}</b> {statistikk.farger === 1 ? 'farge' : 'farger'}
            </span>
            <span title="Punkter i SVG-filen. Hver del skriver sin egen kopi av et punkt den deler med en nabo.">
              <b>{statistikk.punkter}</b> punkter i SVG
            </span>
            <span title="Punkter i kartet, hvert delt punkt telt én gang.">
              <b>{statistikk.unikePunkter}</b> unike punkter
            </span>
            <span>
              <b>{statistikk.kurvesegmenter}</b> buer · <b>{statistikk.linjesegmenter}</b> rette
            </span>
            <span>
              <b>{statistikk.kanter}</b> delte kanter
            </span>
          </>
        ) : kilde ? (
          <span>
            {kilde.navn} · {kilde.bredde} × {kilde.hoyde} px
          </span>
        ) : (
          <span>Ingen bilde valgt</span>
        )}
        {kilde && autolagring !== 'av' && (
          <span
            class="vv-autolagring"
            title="Arbeidet lagres i denne nettleseren og tilbys igjen neste gang du åpner Vectorium."
          >
            {autolagring === 'lagret' ? 'Lagret i nettleseren' : 'Kunne ikke lagre i nettleseren'}
          </span>
        )}
        <span class="vv-zoom">{Math.round(visning.skala * 100)} %</span>
      </div>
      {hjelp}
      <Hovertekst rot={rotRef} />
    </div>
  );
}
