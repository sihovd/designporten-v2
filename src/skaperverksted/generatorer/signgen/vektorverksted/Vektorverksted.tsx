/**
 * Vektorverksted (Sivert, 2026-11-09): the advanced image-to-SVG converter
 * for Sign Forge, built on its own first so it can be tried before it goes
 * into the editor.
 *
 *  1. Forbered: crop the image and mask away what should not be traced
 *     (brush and lasso, remove or keep).
 *  2. Konverter: colours, the small-part rules and the curve settings, with
 *     a live result and the number of parts and points.
 *  3. Rediger: colour per part, merge or delete parts, select borders (by
 *     click or by area) and simplify, straighten or curve them, and move
 *     points and Bézier handles. Neighbouring parts share their borders, so
 *     an edit never opens a gap.
 *
 * Everything runs in the browser; the image is not uploaded. `ferdig`, when
 * given, gets the finished SVG (Sign Forge's «Legg på skiltet» later).
 */
import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  inverterMaske,
  lesBildefil,
  malLasso,
  malStrok,
  maskeKopi,
  nyMaske,
  settMaske,
  sporgrunnlag,
  tomMaske,
  type Kildebilde,
  type Rektangel,
} from './forbered';
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
  type Kurve,
  type Vektormodell,
} from './modell';
import { lagRegionkart, STANDARD_REGIONVALG, type Regionkart, type Regionvalg } from './regioner';
import { STANDARD_TILPASNING, type Tilpasningsvalg } from './tilpass';

type Steg = 'forbered' | 'konverter' | 'rediger';
type Forberedverktoy = 'beskjaer' | 'pensel' | 'viskelar' | 'lasso-fjern' | 'lasso-behold';
type Redigerverktoy = 'del' | 'linje' | 'punkt';
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

const FORHANDSVALG: {
  id: string;
  navn: string;
  tilpasning: Partial<Tilpasningsvalg>;
  rens: Partial<Rensevalg>;
}[] = [
  {
    id: 'logo',
    navn: 'Logo',
    tilpasning: {
      glatting: 1.2,
      hjorneVinkel: 55,
      hjorneSkala: 4,
      kurveToleranse: 0.8,
      rettToleranse: 0.8,
      beregnForm: true,
    },
    rens: { stoyfilter: 1, minAreal: 16, minHull: 16 },
  },
  {
    id: 'tegning',
    navn: 'Tegning',
    tilpasning: {
      glatting: 2,
      hjorneVinkel: 75,
      hjorneSkala: 6,
      kurveToleranse: 1.4,
      rettToleranse: 0.6,
      beregnForm: true,
    },
    rens: { stoyfilter: 2, minAreal: 40, minHull: 40 },
  },
  {
    id: 'detalj',
    navn: 'Detaljert',
    tilpasning: {
      glatting: 0.8,
      hjorneVinkel: 50,
      hjorneSkala: 3,
      kurveToleranse: 0.5,
      rettToleranse: 0.5,
      beregnForm: true,
    },
    rens: { stoyfilter: 0, minAreal: 4, minHull: 4 },
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

function lastNed(navn: string, innhold: string) {
  const url = URL.createObjectURL(new Blob([innhold], { type: 'image/svg+xml' }));
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

export function Vektorverksted(props: { ferdig?: (svg: string, navn: string) => void; lukk?: () => void }) {
  const [kilde, settKilde] = useState<Kildebilde | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [steg, settSteg] = useState<Steg>('forbered');
  const [utsnitt, settUtsnitt] = useState<Rektangel>({ x: 0, y: 0, b: 1, h: 1 });
  const maske = useRef<HTMLCanvasElement | null>(null);
  const [maskeVersjon, settMaskeVersjon] = useState(0);
  const maskeAngre = useRef<ImageData[]>([]);
  const [fverktoy, settFverktoy] = useState<Forberedverktoy>('beskjaer');
  const [pensel, settPensel] = useState(24);

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
  const [rverktoy, settRverktoy] = useState<Redigerverktoy>('del');
  const [valgteDeler, settValgteDeler] = useState<number[]>([]);
  const [valgteKurver, settValgteKurver] = useState<number[]>([]);
  const [valgtAnker, settValgtAnker] = useState<{ kurve: number; idx: number } | null>(null);
  const [styrke, settStyrke] = useState(0.4);
  const [visOriginal, settVisOriginal] = useState(0.25);
  const [visKanter, settVisKanter] = useState(true);
  const [grupper, settGrupper] = useState(true);

  const [visning, settVisning] = useState<Visning>({ skala: 1, tx: 0, ty: 0 });
  const flate = useRef<HTMLDivElement>(null);
  const maskeHolder = useRef<HTMLDivElement>(null);
  const filvelger = useRef<HTMLInputElement>(null);
  const [peker, settPeker] = useState<{ x: number; y: number } | null>(null);
  const [lasso, settLasso] = useState<{ x: number; y: number }[] | null>(null);
  const [omrade, settOmrade] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dra = useRef<
    | null
    | { type: 'panorer'; x: number; y: number; tx: number; ty: number }
    | { type: 'pensel'; siste: { x: number; y: number } }
    | { type: 'lasso' }
    | { type: 'beskjaer'; modus: string; start: { x: number; y: number }; fra: Rektangel }
    | { type: 'omrade'; leggTil: boolean }
    | { type: 'anker'; kurve: number; idx: number; base: Vektormodell }
    | { type: 'handtak'; kurve: number; idx: number; side: 'inn' | 'ut'; base: Vektormodell; bryt: boolean }
  >(null);
  const mellomrom = useRef(false);

  const redigert = fortid.current.length > 0;

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

  const velgFil = async (f: File | undefined) => {
    if (!f) return;
    try {
      const k = await lesBildefil(f);
      if (kilde) URL.revokeObjectURL(kilde.url);
      maske.current = nyMaske(k);
      maskeAngre.current = [];
      settKilde(k);
      settUtsnitt({ x: 0, y: 0, b: k.bredde, h: k.hoyde });
      settSteg('forbered');
      settFverktoy('beskjaer');
      settResultat(null);
      settModellRa(null);
      fortid.current = [];
      fremtid.current = [];
      settFeil(null);
      settMaskeVersjon((v) => v + 1);
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Bildet kunne ikke leses.');
    }
  };

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

  const lagreMaskeAngre = () => {
    if (!maske.current) return;
    maskeAngre.current.push(maskeKopi(maske.current));
    if (maskeAngre.current.length > 12) maskeAngre.current.shift();
  };
  const angreMaske = () => {
    const d = maskeAngre.current.pop();
    if (d && maske.current) {
      settMaske(maske.current, d);
      settMaskeVersjon((v) => v + 1);
    }
  };

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
      const kart = lagRegionkart(g.piksler, g.maske, valg);
      k = { nokkel, kart, faktor: f, utsnitt: { ...utsnitt } };
      kartMinne.current = k;
      settBrukteTerskel(kart.terskel);
    }
    const m = byggModell(k.kart, tilpasning);
    return { modell: m, faktor: k.faktor, utsnitt: k.utsnitt, fjernet: k.kart.fjernet };
  }, [kilde, utsnitt, maskeVersjon, maksSide, farger, terskel, inverter, fjernBakgrunn, rens, tilpasning]);

  useEffect(() => {
    if (steg !== 'konverter' || !kilde) return;
    if (redigert) return; // the user decides when edits may be thrown away
    let avbrutt = false;
    settJobber(true);
    const t = window.setTimeout(() => {
      if (avbrutt) return;
      try {
        const r = konverter();
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
    };
  }, [steg, konverter, redigert, kilde]);

  const konverterPaNytt = () => {
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

  // keep selections pointing at things that still exist
  useEffect(() => {
    if (!modell) return;
    settValgteDeler((v) => v.filter((i) => modell.deler[i]));
    settValgteKurver((v) => v.filter((i) => modell.kurver[i]));
    settValgtAnker((a) => (a && modell.kurver[a.kurve]?.ankre[a.idx] ? a : null));
  }, [modell]);

  // ------------------------------------------------------------ derived

  const stier = useMemo(() => {
    if (!modell) return [];
    return modell.deler.flatMap((d) => (d ? [{ id: d.id, farge: d.farge, d: delSti(modell, d) }] : []));
  }, [modell]);
  const kantSti = useMemo(
    () => (modell && visKanter ? modell.kurver.map((k) => (k ? kurveSti(k) : '')).join('') : ''),
    [modell, visKanter],
  );
  const statistikk = useMemo(() => (modell ? tall(modell) : null), [modell]);
  const fargeliste = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stier) m.set(s.farge, (m.get(s.farge) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [stier]);

  const bruktUtsnitt = resultat?.utsnitt ?? utsnitt;
  /** Screen pixels per vector unit. */
  const pxPerEnhet = modell ? (visning.skala * bruktUtsnitt.b) / modell.bredde : 1;

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

  const beskjaerTreff = (p: { x: number; y: number }): string => {
    const u = utsnitt;
    const tol = 10 / visning.skala;
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
    if (e.button === 1 || e.button === 2 || mellomrom.current) {
      dra.current = { type: 'panorer', x: e.clientX, y: e.clientY, tx: visning.tx, ty: visning.ty };
      return;
    }
    if (e.button !== 0) return;
    const p = tilBilde(e);
    if (steg === 'forbered') {
      if (fverktoy === 'beskjaer') {
        dra.current = { type: 'beskjaer', modus: beskjaerTreff(p), start: p, fra: { ...utsnitt } };
      } else if (fverktoy === 'pensel' || fverktoy === 'viskelar') {
        lagreMaskeAngre();
        malStrok(kilde, maske.current!, p, p, pensel / 2, fverktoy === 'pensel');
        dra.current = { type: 'pensel', siste: p };
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
    if (steg === 'rediger' && rverktoy === 'punkt' && handtakEl) {
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
    if (steg === 'rediger' && rverktoy === 'punkt' && ankerEl) {
      const [k, i] = ankerEl.getAttribute('data-anker')!.split(':');
      settValgtAnker({ kurve: +k!, idx: +i! });
      dra.current = { type: 'anker', kurve: +k!, idx: +i!, base: modell };
      return;
    }
    if (steg !== 'rediger') return;
    const naer = naermesteKurve(modell, v.x, v.y, 7 / pxPerEnhet);
    if (rverktoy === 'del') {
      const delEl = maal.closest('[data-del]');
      const id = delEl ? Number(delEl.getAttribute('data-del')) : null;
      if (id === null) {
        if (!e.shiftKey) settValgteDeler([]);
      } else
        settValgteDeler((s) =>
          e.shiftKey ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id],
        );
      return;
    }
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
    const d = dra.current;
    if (!d) return;
    if (d.type === 'panorer') {
      settVisning((v) => ({ ...v, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }));
    } else if (d.type === 'pensel') {
      malStrok(kilde, maske.current!, d.siste, p, pensel / 2, fverktoy === 'pensel');
      d.siste = p;
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
    } else if (d.type === 'omrade') {
      const v = tilVektor(p);
      settOmrade((o) => (o ? { ...o, x1: v.x, y1: v.y } : o));
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
    if (d.type === 'pensel') settMaskeVersjon((v) => v + 1);
    else if (d.type === 'lasso') {
      if (lasso && lasso.length > 2) {
        lagreMaskeAngre();
        malLasso(kilde, maske.current!, lasso, fverktoy === 'lasso-behold' ? 'behold' : 'fjern');
        settMaskeVersjon((v) => v + 1);
      }
      settLasso(null);
    } else if (d.type === 'beskjaer') {
      if (utsnitt.b < 4 || utsnitt.h < 4) settUtsnitt(d.fra);
    } else if (d.type === 'omrade' && omrade && modell) {
      const liten =
        Math.abs(omrade.x1 - omrade.x0) * pxPerEnhet < 3 && Math.abs(omrade.y1 - omrade.y0) * pxPerEnhet < 3;
      const ider = liten ? [] : kurverIOmrade(modell, omrade);
      settValgteKurver((s) => (d.leggTil ? [...new Set([...s, ...ider])] : ider));
      settOmrade(null);
    } else if ((d.type === 'anker' || d.type === 'handtak') && modell && modell !== d.base) {
      // one undo step for the whole drag
      fortid.current.push(d.base);
      if (fortid.current.length > MAKS_HISTORIKK) fortid.current.shift();
      fremtid.current = [];
      settHistorikkTikk((v) => v + 1);
    }
    void e;
  };

  const onDblClick = (e: MouseEvent) => {
    if (steg !== 'rediger' || rverktoy !== 'punkt' || !modell) return;
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
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (steg === 'forbered') angreMaske();
        else if (e.shiftKey) gjenta();
        else angre();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        gjenta();
        return;
      }
      if (steg === 'rediger') {
        if (e.key === 'v' || e.key === 'V') settRverktoy('del');
        if (e.key === 'l' || e.key === 'L') settRverktoy('linje');
        if (e.key === 'p' || e.key === 'P') settRverktoy('punkt');
        if (e.key === 'Escape') {
          settValgteDeler([]);
          settValgteKurver([]);
          settValgtAnker(null);
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && modell) {
          if (rverktoy === 'punkt' && valgtAnker) {
            settModell(slettAnker(modell, valgtAnker.kurve, valgtAnker.idx));
            settValgtAnker(null);
          } else if (rverktoy === 'del' && valgteDeler.length) settModell(slettDeler(modell, valgteDeler));
        }
      }
      if (e.key === '0' && mod) {
        e.preventDefault();
        tilpassVisning(steg === 'forbered' ? undefined : bruktUtsnitt);
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
    if (s !== 'forbered') requestAnimationFrame(() => tilpassVisning(utsnitt));
    else requestAnimationFrame(() => tilpassVisning());
  };

  const brukForhandsvalg = (id: string) => {
    const f = FORHANDSVALG.find((x) => x.id === id);
    if (!f) return;
    settTilpasning((t) => ({ ...t, ...f.tilpasning }));
    settRens((r) => ({ ...r, ...f.rens }));
  };

  const eksporter = () => {
    if (!modell || !kilde) return;
    lastNed(
      `${kilde.navn}.svg`,
      tilSvg(modell, { grupperEtterFarge: grupper, bredde: bruktUtsnitt.b, hoyde: bruktUtsnitt.h }),
    );
  };

  const valgtFarge = valgteDeler.length ? (modell?.deler[valgteDeler[0]!]?.farge ?? '#000000') : null;
  const synligeAnkre =
    steg === 'rediger' && rverktoy === 'punkt' && modell
      ? valgteKurver.map((id) => modell.kurver[id]).filter((k): k is Kurve => !!k)
      : [];

  // ------------------------------------------------------------ render

  const markor =
    steg === 'forbered'
      ? fverktoy === 'beskjaer'
        ? 'crosshair'
        : fverktoy.startsWith('lasso')
          ? 'crosshair'
          : 'none'
      : rverktoy === 'linje'
        ? 'crosshair'
        : 'default';

  const ankerR = 4.5 / pxPerEnhet;
  const handtakR = 3.5 / pxPerEnhet;

  const lerret = (
    <div
      ref={flate}
      class="vv-flate"
      style={{ cursor: markor }}
      onPointerDown={onPointerDown as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerMove={onPointerMove as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerUp={onPointerUp as unknown as JSX.PointerEventHandler<HTMLDivElement>}
      onPointerLeave={() => settPeker(null)}
      onDblClick={onDblClick as unknown as JSX.MouseEventHandler<HTMLDivElement>}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void velgFil(e.dataTransfer?.files?.[0]);
      }}
    >
      {!kilde && (
        <div class="vv-tom">
          <p>Dra et bilde hit, eller</p>
          <button type="button" class="vv-primar" onClick={() => filvelger.current?.click()}>
            Velg bilde
          </button>
          <p class="vv-dempet">
            PNG, JPG, WebP, GIF eller BMP. Bildet behandles i nettleseren og lastes ikke opp.
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
            style={{ opacity: steg === 'forbered' ? 1 : visOriginal }}
          />
          <div
            ref={maskeHolder}
            class="vv-maskeholder"
            style={{ display: steg === 'forbered' ? 'block' : 'none' }}
          />
          {steg === 'forbered' && (
            <svg
              class="vv-overlegg"
              width={kilde.bredde}
              height={kilde.hoyde}
              viewBox={`0 0 ${kilde.bredde} ${kilde.hoyde}`}
            >
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
              {lasso && (
                <polyline
                  class="vv-lasso"
                  points={lasso.map((p) => `${p.x},${p.y}`).join(' ')}
                  vector-effect="non-scaling-stroke"
                />
              )}
              {peker && (fverktoy === 'pensel' || fverktoy === 'viskelar') && (
                <circle
                  class="vv-pensel"
                  cx={peker.x}
                  cy={peker.y}
                  r={pensel / 2}
                  vector-effect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
          {steg !== 'forbered' && modell && (
            <svg
              class="vv-vektor"
              style={{
                left: `${bruktUtsnitt.x}px`,
                top: `${bruktUtsnitt.y}px`,
                width: `${bruktUtsnitt.b}px`,
                height: `${bruktUtsnitt.h}px`,
              }}
              viewBox={`0 0 ${modell.bredde} ${modell.hoyde}`}
              aria-busy={jobber}
            >
              <g class="vv-deler">
                {stier.map((s) => (
                  <path
                    key={s.id}
                    data-del={s.id}
                    d={s.d}
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
                      <path key={s.id} d={s.d} vector-effect="non-scaling-stroke" />
                    ))}
                </g>
              )}
              {kantSti && <path class="vv-kanter" d={kantSti} vector-effect="non-scaling-stroke" />}
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
      {jobber && <div class="vv-jobber">Konverterer …</div>}
    </div>
  );

  const fanevalg: { id: Steg; navn: string }[] = [
    { id: 'forbered', navn: '1 Beskjær og masker' },
    { id: 'konverter', navn: '2 Konverter' },
    { id: 'rediger', navn: '3 Rediger' },
  ];

  const endreRens = (d: Partial<Rensevalg>) => settRens((r) => ({ ...r, ...d }));
  const endreTilp = (d: Partial<Tilpasningsvalg>) => settTilpasning((t) => ({ ...t, ...d }));

  return (
    <div class="vv">
      <header class="vv-topp">
        <strong class="vv-tittel">Vektorverksted</strong>
        <nav class="vv-faner" aria-label="Steg">
          {fanevalg.map((f) => (
            <button
              key={f.id}
              type="button"
              class="vv-fane"
              aria-current={steg === f.id ? 'step' : undefined}
              disabled={!kilde || (f.id === 'rediger' && !modell)}
              onClick={() => gaaTil(f.id)}
            >
              {f.navn}
            </button>
          ))}
        </nav>
        <div class="vv-topp-hoyre">
          <button type="button" class="vv-sekundar" onClick={() => filvelger.current?.click()}>
            {kilde ? 'Nytt bilde' : 'Velg bilde'}
          </button>
          {props.lukk && (
            <button type="button" class="vv-sekundar" onClick={props.lukk}>
              Lukk
            </button>
          )}
        </div>
        <input
          ref={filvelger}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          hidden
          onChange={(e) => {
            const inp = e.target as HTMLInputElement;
            void velgFil(inp.files?.[0]);
            inp.value = '';
          }}
        />
      </header>

      <main class="vv-hoved">
        {lerret}
        <aside class="vv-panel" aria-label="Innstillinger">
          {feil && (
            <p class="vv-feil" role="alert">
              {feil}
            </p>
          )}
          {!kilde && <p class="vv-dempet">Start med å velge et bilde.</p>}

          {kilde && steg === 'forbered' && (
            <>
              <section>
                <h2>Verktøy</h2>
                <div class="vv-knappegrid">
                  {(
                    [
                      ['beskjaer', 'Beskjær'],
                      ['pensel', 'Pensel: fjern'],
                      ['viskelar', 'Pensel: gjenopprett'],
                      ['lasso-fjern', 'Lasso: fjern'],
                      ['lasso-behold', 'Lasso: behold'],
                    ] as const
                  ).map(([id, navn]) => (
                    <button
                      key={id}
                      type="button"
                      class="vv-verktoy"
                      aria-pressed={fverktoy === id}
                      onClick={() => settFverktoy(id)}
                    >
                      {navn}
                    </button>
                  ))}
                </div>
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
                <p class="vv-hjelp">
                  {fverktoy === 'beskjaer'
                    ? 'Dra et nytt utsnitt, eller dra i kantene og hjørnene. Alt utenfor blir ikke med.'
                    : fverktoy.startsWith('lasso')
                      ? fverktoy === 'lasso-fjern'
                        ? 'Tegn rundt det som skal fjernes.'
                        : 'Tegn rundt det som skal være med. Resten fjernes.'
                      : 'Mal over det som ikke skal konverteres. Rødt blir ikke med.'}{' '}
                  Mellomrom + dra flytter visningen, hjulet zoomer.
                </p>
              </section>
              <section>
                <h2>Utsnitt</h2>
                <p class="vv-tall">
                  {utsnitt.b} × {utsnitt.h} px fra ({utsnitt.x}, {utsnitt.y})
                </p>
                <div class="vv-knapperad">
                  <button
                    type="button"
                    class="vv-sekundar"
                    onClick={() => settUtsnitt({ x: 0, y: 0, b: kilde.bredde, h: kilde.hoyde })}
                  >
                    Hele bildet
                  </button>
                  <button type="button" class="vv-sekundar" onClick={() => tilpassVisning(utsnitt)}>
                    Zoom til utsnitt
                  </button>
                </div>
              </section>
              <section>
                <h2>Maske</h2>
                <div class="vv-knapperad">
                  <button
                    type="button"
                    class="vv-sekundar"
                    onClick={angreMaske}
                    disabled={!maskeAngre.current.length}
                  >
                    Angre
                  </button>
                  <button
                    type="button"
                    class="vv-sekundar"
                    onClick={() => {
                      lagreMaskeAngre();
                      inverterMaske(maske.current!);
                      settMaskeVersjon((v) => v + 1);
                    }}
                  >
                    Inverter
                  </button>
                  <button
                    type="button"
                    class="vv-sekundar"
                    onClick={() => {
                      lagreMaskeAngre();
                      tomMaske(maske.current!);
                      settMaskeVersjon((v) => v + 1);
                    }}
                  >
                    Tøm
                  </button>
                </div>
              </section>
              <button type="button" class="vv-primar vv-bred" onClick={() => gaaTil('konverter')}>
                Konverter
              </button>
            </>
          )}

          {kilde && steg === 'konverter' && (
            <>
              {redigert && (
                <div class="vv-merknad">
                  <p>Du har redigert vektoren. Endrer du innstillingene her, forsvinner redigeringene.</p>
                  <button type="button" class="vv-sekundar" onClick={konverterPaNytt}>
                    Konverter på nytt
                  </button>
                </div>
              )}
              <section>
                <h2>Forhåndsvalg</h2>
                <div class="vv-knapperad">
                  {FORHANDSVALG.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      class="vv-sekundar"
                      onClick={() => brukForhandsvalg(f.id)}
                    >
                      {f.navn}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2>Farger</h2>
                <div class="vv-segment" role="group" aria-label="Antall farger">
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <button key={n} type="button" aria-pressed={farger === n} onClick={() => settFarger(n)}>
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
                          settTerskel(
                            (e.target as HTMLInputElement).checked ? null : Math.round(brukteTerskel ?? 128),
                          )
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
                <div class="vv-felt">
                  <label for="vv-opplosning">
                    <span>Oppløsning</span>
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
              <section>
                <h2>Visning</h2>
                <Glidebryter
                  navn="Original under"
                  verdi={visOriginal}
                  min={0}
                  max={1}
                  steg={0.05}
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
              </section>
              <button
                type="button"
                class="vv-primar vv-bred"
                disabled={!modell}
                onClick={() => gaaTil('rediger')}
              >
                Rediger
              </button>
            </>
          )}

          {kilde && steg === 'rediger' && modell && (
            <>
              <section>
                <h2>Verktøy</h2>
                <div class="vv-knappegrid">
                  {(
                    [
                      ['del', 'Velg deler', 'V'],
                      ['linje', 'Velg linjer', 'L'],
                      ['punkt', 'Rediger punkter', 'P'],
                    ] as const
                  ).map(([id, navn, tast]) => (
                    <button
                      key={id}
                      type="button"
                      class="vv-verktoy"
                      aria-pressed={rverktoy === id}
                      aria-keyshortcuts={tast}
                      onClick={() => settRverktoy(id)}
                    >
                      {navn} <kbd>{tast}</kbd>
                    </button>
                  ))}
                </div>
                <div class="vv-knapperad">
                  <button type="button" class="vv-sekundar" onClick={angre} disabled={!fortid.current.length}>
                    Angre
                  </button>
                  <button
                    type="button"
                    class="vv-sekundar"
                    onClick={gjenta}
                    disabled={!fremtid.current.length}
                  >
                    Gjør om
                  </button>
                  <button type="button" class="vv-sekundar" onClick={() => tilpassVisning(bruktUtsnitt)}>
                    Tilpass visning
                  </button>
                </div>
                <p class="vv-hjelp">
                  {rverktoy === 'del'
                    ? 'Klikk en del. Shift-klikk velger flere.'
                    : rverktoy === 'linje'
                      ? 'Klikk en linje, eller dra et område for å velge alle linjene i det. Shift legger til.'
                      : 'Klikk en linje for å se punktene. Dra punkter og håndtak; Alt bryter håndtaket. Dobbeltklikk på linjen legger til et punkt, på et punkt veksler hjørne og glatt. Delete sletter punktet.'}
                </p>
              </section>

              {rverktoy === 'del' && (
                <section>
                  <h2>{valgteDeler.length ? `${valgteDeler.length} valgt` : 'Deler'}</h2>
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
                        <button
                          type="button"
                          class="vv-sekundar"
                          disabled={valgteDeler.length < 2}
                          onClick={() => {
                            settModell(slaSammenDeler(modell, valgteDeler));
                            settValgteDeler([]);
                          }}
                        >
                          Slå sammen
                        </button>
                        <button
                          type="button"
                          class="vv-sekundar"
                          onClick={() => settModell(slettDeler(modell, valgteDeler))}
                        >
                          Slett
                        </button>
                        <button
                          type="button"
                          class="vv-sekundar"
                          onClick={() => {
                            settValgteKurver(kurverRundt(modell, valgteDeler));
                            settRverktoy('linje');
                          }}
                        >
                          Velg kantene
                        </button>
                      </div>
                    </>
                  )}
                  <h3>Farger i vektoren</h3>
                  <ul class="vv-fargeliste">
                    {fargeliste.map(([f, n]) => (
                      <li key={f}>
                        <input
                          type="color"
                          value={f}
                          aria-label={`Bytt fargen ${f} på ${n} deler`}
                          onChange={(e) =>
                            settModell(byttFarge(modell, f, (e.target as HTMLInputElement).value))
                          }
                        />
                        <button
                          type="button"
                          class="vv-lenkeknapp"
                          onClick={() => settValgteDeler(stier.filter((s) => s.farge === f).map((s) => s.id))}
                        >
                          {f} · {n} {n === 1 ? 'del' : 'deler'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(rverktoy === 'linje' || rverktoy === 'punkt') && (
                <section>
                  <h2>{valgteKurver.length ? `${valgteKurver.length} linjer valgt` : 'Linjer'}</h2>
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
                    <button
                      type="button"
                      class="vv-sekundar"
                      disabled={!valgteKurver.length}
                      onClick={() => settModell(forenkle(modell, valgteKurver, styrke))}
                    >
                      Forenkle
                    </button>
                    <button
                      type="button"
                      class="vv-sekundar"
                      disabled={!valgteKurver.length}
                      onClick={() => settModell(gjorRett(modell, valgteKurver))}
                    >
                      Gjør rett
                    </button>
                    <button
                      type="button"
                      class="vv-sekundar"
                      disabled={!valgteKurver.length}
                      onClick={() => settModell(gjorBuet(modell, valgteKurver))}
                    >
                      Gjør buet
                    </button>
                    <button
                      type="button"
                      class="vv-sekundar"
                      disabled={!valgteKurver.length}
                      title="Rette linjer som nesten er vannrette eller loddrette, blir helt det."
                      onClick={() => settModell(vater(modell, valgteKurver))}
                    >
                      Vater
                    </button>
                    <button
                      type="button"
                      class="vv-sekundar"
                      disabled={!valgteKurver.length}
                      onClick={() => settModell(tilpassPaNytt(modell, valgteKurver, tilpasning))}
                    >
                      Tilbakestill
                    </button>
                  </div>
                  <div class="vv-knapperad">
                    <button
                      type="button"
                      class="vv-sekundar"
                      onClick={() => settValgteKurver(modell.kurver.flatMap((k) => (k ? [k.id] : [])))}
                    >
                      Velg alle
                    </button>
                    <button
                      type="button"
                      class="vv-sekundar"
                      disabled={!valgteKurver.length}
                      onClick={() => {
                        settValgteDeler(delerVed(modell, valgteKurver));
                        settRverktoy('del');
                      }}
                    >
                      Velg delene ved
                    </button>
                  </div>
                  {rverktoy === 'punkt' && valgtAnker && (
                    <div class="vv-knapperad">
                      <button
                        type="button"
                        class="vv-sekundar"
                        onClick={() => {
                          const a = modell.kurver[valgtAnker.kurve]?.ankre[valgtAnker.idx];
                          if (a)
                            settModell(settAnkertype(modell, valgtAnker.kurve, valgtAnker.idx, !a.hjorne));
                        }}
                      >
                        {modell.kurver[valgtAnker.kurve]?.ankre[valgtAnker.idx]?.hjorne
                          ? 'Gjør glatt'
                          : 'Gjør til hjørne'}
                      </button>
                      <button
                        type="button"
                        class="vv-sekundar"
                        onClick={() => {
                          settModell(slettAnker(modell, valgtAnker.kurve, valgtAnker.idx));
                          settValgtAnker(null);
                        }}
                      >
                        Slett punkt
                      </button>
                    </div>
                  )}
                </section>
              )}
              <section>
                <h2>Visning</h2>
                <Glidebryter
                  navn="Original under"
                  verdi={visOriginal}
                  min={0}
                  max={1}
                  steg={0.05}
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
              </section>
            </>
          )}

          {kilde && steg !== 'forbered' && modell && (
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
                <button type="button" class="vv-primar" onClick={eksporter}>
                  Last ned SVG
                </button>
                {props.ferdig && (
                  <button
                    type="button"
                    class="vv-primar"
                    onClick={() =>
                      props.ferdig!(
                        tilSvg(modell, {
                          grupperEtterFarge: grupper,
                          bredde: bruktUtsnitt.b,
                          hoyde: bruktUtsnitt.h,
                        }),
                        kilde.navn,
                      )
                    }
                  >
                    Legg på skiltet
                  </button>
                )}
              </div>
            </section>
          )}
        </aside>
      </main>

      <footer class="vv-status" role="status" aria-live="polite">
        {statistikk && steg !== 'forbered' ? (
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
        <span class="vv-zoom">{Math.round(visning.skala * 100)} %</span>
      </footer>
    </div>
  );
}
