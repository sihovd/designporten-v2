/**
 * The drawing workspace: the dragon seen from above (draw the spine, drag
 * points, widths and spikes), the same dragon seen from the side (drag the
 * height), and the live 3D model, all at once. Every handle is a button
 * that can be reached with Tab and moved with the arrow keys, so nothing
 * needs a precise drag (WCAG 2.2: 2.5.7, 2.5.8).
 */
import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { finnMateriale } from '../../../core/materialer';
import { Visning3d } from '../../../render3d/Lat3d';
import { brukUtdrag } from '../../../shell/bruk-benk';
import { Ikon, type IkonId } from '../../../shell/ikoner';
import { Tips } from '../../../shell/Tips';
import { lesParametre } from '../parametre';
import { naermesteLengde, tilVerden, vedLengde } from './geometri';
import { endreTegning } from './handlinger';
import { elementformer, profilVerdi, type V2 } from './modell';
import {
  festTilRute,
  flyttElement,
  flyttHele,
  flyttPunkt,
  leggTilPigg,
  leggTilProfilpunkt,
  settInnPunkt,
  settProfilpunkt,
  tegnRygg,
} from './operasjoner';
import {
  brukTegneeditor,
  gyldigValg,
  type Tegneeditor,
  type Tegnelager,
  type Valg,
  type Verktoy,
} from './tilstand';
import { brukTegnebilde, type Tegnebilde } from './visning';

const tall1 = (x: number) => String(Math.round(x)).replace('.', ',');
const avslutt = (benk: Arbeidsbenk) => benk.historikk.avsluttSammenslaing();

/** Size of an element in CSS px (a callback ref, so it also follows elements that mount later). */
function brukStorrelse(): [(el: Element | null) => void, { b: number; h: number }] {
  const [s, settS] = useState({ b: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: Element | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const mal = () => {
      const r = el.getBoundingClientRect();
      settS((f) =>
        Math.abs(f.b - r.width) < 0.5 && Math.abs(f.h - r.height) < 0.5 ? f : { b: r.width, h: r.height },
      );
    };
    ro.current = new ResizeObserver(mal);
    ro.current.observe(el);
    mal();
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, s];
}

/* ------------------------------------------------------------------ */
/* Tool bar                                                            */
/* ------------------------------------------------------------------ */

const verktoyliste: { id: Verktoy; navn: string; hjelp: string; tast: string; ikon: IkonId }[] = [
  {
    id: 'juster',
    navn: 'Juster',
    hjelp:
      'Dra punkter, bredder og pigger. Dra en del for å flytte hele dragen. Dobbeltklikk på ryggen for et nytt punkt.',
    tast: 'V',
    ikon: 'select',
  },
  {
    id: 'tegn',
    navn: 'Tegn rygg',
    hjelp: 'Tegn ryggen i ett strøk, fra nesen til halespissen.',
    tast: 'R',
    ikon: 'pen',
  },
  {
    id: 'pigg',
    navn: 'Pigg',
    hjelp: 'Trykk på en del for å sette en pigg midt på den.',
    tast: 'P',
    ikon: 'add-point',
  },
];

/** The tools in the workshop's tool rail. */
export function TegneVerktoy({ benk }: { benk: Arbeidsbenk }) {
  const [e, lager] = brukTegneeditor(benk);
  return (
    <>
      {verktoyliste.map((v) => (
        <Tips key={v.id} navn={v.navn} hjelp={v.hjelp} tast={v.tast}>
          {(p) => (
            <button
              type="button"
              class="verktoy"
              aria-label={v.navn}
              aria-pressed={e.verktoy === v.id}
              onClick={() => lager.sett({ verktoy: v.id })}
              {...p}
            >
              <Ikon id={v.ikon} />
              <span class="verktoy-etikett">{v.navn}</span>
            </button>
          )}
        </Tips>
      ))}
    </>
  );
}

export function verktoyHjelp(v: Verktoy): string {
  return verktoyliste.find((x) => x.id === v)!.hjelp;
}

function Verktoylinje({
  benk,
  e,
  lager,
  zoom,
  smal,
}: {
  benk: Arbeidsbenk;
  e: Tegneeditor;
  lager: Tegnelager;
  zoom: (faktor: number | 'tilpass') => void;
  smal: boolean;
}) {
  const snap = brukUtdrag(benk, (t) => t.innstillinger.snap);
  return (
    <div class="dt-verktoylinje" role="toolbar" aria-label="Tegnehjelp">
      {e.verktoy === 'pigg' && (
        <label class="dt-piggvalg">
          <span class="visuelt-skjult">Form på piggen</span>
          <select
            value={e.piggform}
            onChange={(ev) =>
              lager.sett({ piggform: (ev.target as HTMLSelectElement).value as Tegneeditor['piggform'] })
            }
          >
            {elementformer.map((f) => (
              <option key={f.id} value={f.id}>
                {f.navn}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        class="dt-bryter"
        aria-pressed={snap}
        title="Ryggpunkter festes til et rutenett på 5 mm. Hold Alt for å slippe."
        onClick={() => benk.settInnstillinger({ snap: !snap })}
      >
        Fest til 5 mm
      </button>
      <div class="dt-gruppe dt-zoom" aria-label="Zoom">
        <button type="button" aria-label="Zoom ut" onClick={() => zoom(1 / 1.25)}>
          −
        </button>
        <button type="button" aria-label="Zoom inn" onClick={() => zoom(1.25)}>
          +
        </button>
        <button type="button" onClick={() => zoom('tilpass')}>
          {smal ? 'Hele platen' : 'Vis hele platen'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top view                                                            */
/* ------------------------------------------------------------------ */

interface Utsnitt {
  cx: number;
  cy: number;
  /** CSS px per mm. */
  k: number;
}

type Dra =
  | { type: 'punkt'; i: number }
  | { type: 'bredde'; i: number }
  | { type: 'element'; id: string }
  | { type: 'hele'; fra: V2; flyttet: boolean; del: number }
  | { type: 'panorer'; fra: [number, number]; start: Utsnitt; flyttet: boolean }
  | { type: 'strek'; punkter: V2[] };

const NOKKEL = { punkt: 'dt-punkt', bredde: 'dt-bredde', element: 'dt-element', hele: 'dt-hele' };

function piltast(ev: KeyboardEvent): V2 | null {
  const steg = ev.shiftKey ? 5 : 1;
  switch (ev.key) {
    case 'ArrowLeft':
      return [-steg, 0];
    case 'ArrowRight':
      return [steg, 0];
    case 'ArrowUp':
      return [0, steg];
    case 'ArrowDown':
      return [0, -steg];
    default:
      return null;
  }
}

function Ovenfra({
  benk,
  bilde,
  e,
  lager,
  utsnitt,
  settUtsnitt,
  str,
}: {
  benk: Arbeidsbenk;
  bilde: Tegnebilde;
  e: Tegneeditor;
  lager: Tegnelager;
  utsnitt: Utsnitt;
  settUtsnitt: (u: Utsnitt) => void;
  str: { b: number; h: number };
}) {
  const { tegning: t, oppsett: o, former } = bilde;
  const plate = brukUtdrag(benk, (x) => x.dok.plate);
  const farger = lesParametre(brukUtdrag(benk, (x) => x.dok.parametre)).farger;
  const snap = brukUtdrag(benk, (x) => x.innstillinger.snap);
  const svg = useRef<SVGSVGElement>(null);
  const dra = useRef<Dra | null>(null);
  const [strek, settStrek] = useState<V2[] | null>(null);
  const valgt = gyldigValg(t, e.valgt, o.segmenter.length);

  const { cx, cy, k } = utsnitt;
  const vb = `${cx - str.b / 2 / k} ${-cy - str.h / 2 / k} ${str.b / k} ${str.h / k}`;
  const px = (n: number) => n / k; // n CSS px in mm
  const tilPlate = (ev: { clientX: number; clientY: number }): V2 => {
    const r = svg.current!.getBoundingClientRect();
    return [cx + (ev.clientX - r.left - r.width / 2) / k, cy - (ev.clientY - r.top - r.height / 2) / k];
  };
  const fest = (p: V2, ev: { altKey: boolean }) => (snap && !ev.altKey ? festTilRute(p) : p);
  const tAv = (s: number) => (o.L > 0 ? s / o.L : 0);
  const velg = (v: Valg, melding?: string) => {
    lager.sett({ valgt: v });
    if (melding) benk.melde(melding);
  };

  const ned = (ev: PointerEvent) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse' && ev.button !== 1) return;
    const mal = (ev.target as Element).closest<SVGElement>('[data-dt]');
    const p = tilPlate(ev);
    const hvem = mal?.dataset.dt ?? '';
    const [type, id] = hvem.split(':');
    svg.current!.setPointerCapture(ev.pointerId);
    if (ev.button === 1) {
      dra.current = { type: 'panorer', fra: [ev.clientX, ev.clientY], start: utsnitt, flyttet: false };
      return;
    }
    if (e.verktoy === 'tegn') {
      dra.current = { type: 'strek', punkter: [p] };
      settStrek([p]);
      return;
    }
    if (e.verktoy === 'pigg') {
      const { s, avstand } = naermesteLengde(o.sti, p);
      const del = type === 'del' ? Number(id) : -1;
      if (del < 0 && avstand > 30) {
        benk.melde('Trykk på dragen for å sette en pigg.');
        return;
      }
      const sPos = del >= 0 ? (o.segmenter[del]!.s0 + o.segmenter[del]!.s1) / 2 : s;
      const r = leggTilPigg(t, tAv(sPos), e.piggform);
      if ('grunn' in r) benk.melde(r.grunn);
      else {
        endreTegning(benk, 'Legg til pigg', () => r.tegning);
        velg({ type: 'element', id: r.id }, 'Piggen er lagt til.');
      }
      return;
    }
    if (type === 'punkt') {
      dra.current = { type: 'punkt', i: Number(id) };
      velg({ type: 'punkt', i: Number(id) });
    } else if (type === 'bredde') {
      dra.current = { type: 'bredde', i: Number(id) };
      velg({ type: 'bredde', i: Number(id) });
    } else if (type === 'element') {
      dra.current = { type: 'element', id: id! };
      velg({ type: 'element', id: id! });
    } else if (type === 'del') {
      dra.current = { type: 'hele', fra: p, flyttet: false, del: Number(id) };
    } else {
      dra.current = { type: 'panorer', fra: [ev.clientX, ev.clientY], start: utsnitt, flyttet: false };
    }
  };

  const flytt = (ev: PointerEvent) => {
    const d = dra.current;
    if (!d) return;
    const p = tilPlate(ev);
    switch (d.type) {
      case 'strek': {
        const sist = d.punkter.at(-1)!;
        if (Math.hypot(p[0] - sist[0], p[1] - sist[1]) > px(3)) {
          d.punkter.push(p);
          settStrek([...d.punkter]);
        }
        break;
      }
      case 'panorer': {
        const dx = ev.clientX - d.fra[0];
        const dy = ev.clientY - d.fra[1];
        if (Math.hypot(dx, dy) > 3) d.flyttet = true;
        settUtsnitt({ ...d.start, cx: d.start.cx - dx / d.start.k, cy: d.start.cy + dy / d.start.k });
        break;
      }
      case 'punkt':
        endreTegning(benk, 'Flytt ryggpunkt', (q) => flyttPunkt(q, d.i, fest(p, ev)), `dt-punkt-${d.i}`);
        break;
      case 'bredde': {
        const { s, avstand } = naermesteLengde(o.sti, p);
        endreTegning(
          benk,
          'Endre bredde',
          (q) => settProfilpunkt(q, 'bredde', d.i, { t: tAv(s), verdi: 2 * avstand }),
          `dt-bredde-${d.i}`,
        );
        break;
      }
      case 'element': {
        const { s } = naermesteLengde(o.sti, p);
        endreTegning(benk, 'Flytt pigg', (q) => flyttElement(q, d.id, tAv(s)), `dt-element-${d.id}`);
        break;
      }
      case 'hele': {
        let dx = p[0] - d.fra[0];
        let dy = p[1] - d.fra[1];
        if (!d.flyttet && Math.hypot(dx, dy) < px(4)) return;
        if (snap && !ev.altKey) {
          dx = Math.round(dx / 5) * 5;
          dy = Math.round(dy / 5) * 5;
          if (!dx && !dy) return;
        }
        d.flyttet = true;
        endreTegning(benk, 'Flytt dragen', (q) => flyttHele(q, dx, dy), NOKKEL.hele);
        d.fra = [d.fra[0] + dx, d.fra[1] + dy];
        break;
      }
    }
  };

  const opp = (ev: PointerEvent) => {
    const d = dra.current;
    dra.current = null;
    if (!d) return;
    if (svg.current?.hasPointerCapture(ev.pointerId)) svg.current.releasePointerCapture(ev.pointerId);
    if (d.type === 'strek') {
      settStrek(null);
      const r = tegnRygg(t, d.punkter);
      if ('grunn' in r) benk.melde(r.grunn);
      else {
        endreTegning(benk, 'Tegn ny rygg', () => r.tegning);
        lager.sett({ verktoy: 'juster', valgt: null });
        benk.melde('Ryggen er tegnet. Dra punktene for å forme den.');
      }
      return;
    }
    if (d.type === 'hele' && !d.flyttet)
      velg({ type: 'del', i: d.del }, `Valgt: ${o.segmenter[d.del]?.navn ?? ''}`);
    if (d.type === 'panorer' && !d.flyttet) velg(null);
    avslutt(benk);
  };

  const dobbel = (ev: MouseEvent) => {
    if (e.verktoy !== 'juster') return;
    const p = tilPlate(ev);
    const { s, avstand } = naermesteLengde(o.sti, p);
    if (avstand < px(10)) {
      const r = settInnPunkt(t, fest(p, ev));
      if (r.i < 0) return benk.melde('Ryggen har så mange punkter den kan ha.');
      endreTegning(benk, 'Nytt ryggpunkt', () => r.tegning);
      velg({ type: 'punkt', i: r.i }, 'Nytt ryggpunkt. Dra det, eller flytt det med piltastene.');
    } else if (avstand < 60) {
      const r = leggTilProfilpunkt(t, 'bredde', { t: tAv(s), verdi: 2 * avstand });
      endreTegning(benk, 'Nytt breddepunkt', () => r.tegning);
      velg({ type: 'bredde', i: r.i }, 'Nytt breddepunkt.');
    }
  };

  const hjul = (ev: WheelEvent) => {
    ev.preventDefault();
    const r = svg.current!.getBoundingClientRect();
    const f = Math.exp(-ev.deltaY * 0.0015);
    const nk = Math.min(40, Math.max(0.3, k * f));
    const mx = ev.clientX - r.left - r.width / 2;
    const my = ev.clientY - r.top - r.height / 2;
    // keep the point under the cursor in place
    settUtsnitt({ k: nk, cx: cx + mx / k - mx / nk, cy: cy - my / k + my / nk });
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    el.addEventListener('wheel', hjul, { passive: false });
    return () => el.removeEventListener('wheel', hjul);
  });

  const kropp = finnMateriale(farger.kropp).hex;
  const aksent = finnMateriale(farger.aksent).hex;
  const valgtDel = valgt?.type === 'del' ? valgt.i : -1;
  const r = px(7);
  const treff = px(14);

  const tastPunkt = (i: number) => (ev: KeyboardEvent) => {
    const d = piltast(ev);
    if (!d) return;
    ev.preventDefault();
    const q = t.rygg[i]!;
    endreTegning(
      benk,
      'Flytt ryggpunkt',
      (x) => flyttPunkt(x, i, [q[0] + d[0], q[1] + d[1]]),
      `dt-punkt-${i}`,
    );
  };
  const tastBredde = (i: number) => (ev: KeyboardEvent) => {
    const d = piltast(ev);
    if (!d) return;
    ev.preventDefault();
    const q = t.bredde[i]!;
    endreTegning(
      benk,
      'Endre bredde',
      (x) => settProfilpunkt(x, 'bredde', i, d[1] ? { verdi: q.verdi + d[1] } : { t: q.t - d[0] / 100 }),
      `dt-bredde-${i}`,
    );
  };
  const tastElement = (id: string, tPos: number) => (ev: KeyboardEvent) => {
    const d = piltast(ev);
    if (!d || !d[0]) return;
    ev.preventDefault();
    endreTegning(benk, 'Flytt pigg', (x) => flyttElement(x, id, tPos - d[0] / 100), `dt-element-${id}`);
  };

  if (!str.b || !str.h) return <svg ref={svg} class="dt-svg" aria-hidden="true" />;
  return (
    <svg
      ref={svg}
      class={`dt-svg verktoy-${e.verktoy}`}
      viewBox={vb}
      role="group"
      aria-label={`Dragen ovenfra. ${verktoyHjelp(e.verktoy)}`}
      onPointerDown={ned}
      onPointerMove={flytt}
      onPointerUp={opp}
      onPointerCancel={opp}
      onDblClick={dobbel}
    >
      <defs>
        <pattern id="dt-rute" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" class="dt-rutelinje" />
        </pattern>
      </defs>
      <g transform="scale(1,-1)">
        <rect
          x={-plate.bredde / 2}
          y={-plate.dybde / 2}
          width={plate.bredde}
          height={plate.dybde}
          class="dt-plate"
        />
        <rect
          x={-plate.bredde / 2}
          y={-plate.dybde / 2}
          width={plate.bredde}
          height={plate.dybde}
          fill="url(#dt-rute)"
        />
        {former.map((f, i) => {
          const seg = o.segmenter[i]!;
          const feil = bilde.feilDeler.has(i);
          return (
            <polygon
              key={i}
              data-dt={`del:${i}`}
              points={f.ovenfra.map((p) => `${p[0]},${p[1]}`).join(' ')}
              class={`dt-del${feil ? ' feil' : ''}${valgtDel === i ? ' valgt' : ''}`}
              style={{ fill: kropp }}
            >
              <title>{`${seg.navn}${feil ? ' (har en feil)' : ''}`}</title>
            </polygon>
          );
        })}
        <polyline
          points={o.sti.punkter.map((p) => `${p[0]},${p[1]}`).join(' ')}
          class="dt-rygglinje"
          style={{ strokeWidth: px(1.5) }}
        />
        {o.ledd.map((l) => (
          <circle
            key={l.indeks}
            cx={l.p[0]}
            cy={l.p[1]}
            r={px(3.5)}
            class={`dt-ledd${bilde.feilLedd.has(l.indeks) ? ' feil' : ''}`}
          >
            <title>{`Ledd ${l.indeks}: printes bøyd ${tall1(Math.abs((l.boy * 180) / Math.PI))}°`}</title>
          </circle>
        ))}
      </g>

      {/* handles: in screen orientation so text and focus rings are not mirrored */}
      {e.verktoy === 'juster' && (
        <g>
          {t.bredde.map((b, i) => {
            const { p, retning } = vedLengde(o.sti, b.t * o.L);
            const n: V2 = [-retning[1], retning[0]];
            const valgtNa = valgt?.type === 'bredde' && valgt.i === i;
            return [1, -1].map((side) => {
              const q: V2 = [p[0] + (n[0] * side * b.verdi) / 2, p[1] + (n[1] * side * b.verdi) / 2];
              return (
                <g
                  key={`b${i}${side}`}
                  data-dt={`bredde:${i}`}
                  class={`dt-handtak firkant${valgtNa ? ' valgt' : ''}`}
                  tabIndex={side === 1 ? 0 : -1}
                  role="button"
                  aria-label={`Bredde ${i + 1}: ${tall1(b.verdi)} mm, ${tall1(b.t * 100)} % bak nesen. Opp og ned endrer bredden, venstre og høyre flytter punktet.`}
                  onKeyDown={tastBredde(i)}
                  onFocus={() => velg({ type: 'bredde', i })}
                >
                  <circle cx={q[0]} cy={-q[1]} r={treff} class="dt-treff" />
                  <rect x={q[0] - r * 0.75} y={-q[1] - r * 0.75} width={r * 1.5} height={r * 1.5} />
                </g>
              );
            });
          })}
          {t.elementer.map((el) => {
            const seg = o.segmenter.find((s) => s.elementer[0] === el.id);
            const sted: V2 = seg ? tilVerden(seg.T, [0, 0]) : vedLengde(o.sti, el.t * o.L).p;
            const valgtNa = valgt?.type === 'element' && valgt.id === el.id;
            return (
              <g
                key={el.id}
                data-dt={`element:${el.id}`}
                class={`dt-handtak element${valgtNa ? ' valgt' : ''}${seg ? '' : ' ubrukt'}`}
                tabIndex={0}
                role="button"
                aria-label={`Pigg (${elementformer.find((f) => f.id === el.form)?.navn ?? el.form})${seg ? ` på ${seg.navn.toLowerCase()}` : ', vises ikke'}. Venstre og høyre flytter den langs ryggen, Delete fjerner den.`}
                onKeyDown={tastElement(el.id, el.t)}
                onFocus={() => velg({ type: 'element', id: el.id })}
              >
                <circle cx={sted[0]} cy={-sted[1]} r={treff} class="dt-treff" />
                <path
                  d={`M ${sted[0]} ${-sted[1] - r} L ${sted[0] + r} ${-sted[1]} L ${sted[0]} ${-sted[1] + r} L ${sted[0] - r} ${-sted[1]} Z`}
                  style={{ fill: aksent }}
                />
              </g>
            );
          })}
          {t.rygg.map((q, i) => {
            const valgtNa = valgt?.type === 'punkt' && valgt.i === i;
            const nese = i === 0;
            return (
              <g
                key={`p${i}`}
                data-dt={`punkt:${i}`}
                class={`dt-handtak punkt${nese ? ' nese' : ''}${valgtNa ? ' valgt' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={`${nese ? 'Nesen' : i === t.rygg.length - 1 ? 'Halespissen' : `Ryggpunkt ${i + 1}`}: ${tall1(q[0])}, ${tall1(q[1])} mm. Piltastene flytter punktet, Shift flytter 5 mm.`}
                onKeyDown={tastPunkt(i)}
                onFocus={() => velg({ type: 'punkt', i })}
              >
                <circle cx={q[0]} cy={-q[1]} r={treff} class="dt-treff" />
                <circle cx={q[0]} cy={-q[1]} r={nese ? r * 1.15 : r} />
              </g>
            );
          })}
          {o.segmenter[0] && (
            <text
              x={t.rygg[0]![0]}
              y={-t.rygg[0]![1] - px(18)}
              class="dt-etikett"
              style={{ fontSize: `${px(11)}px` }}
              aria-hidden="true"
            >
              Nese
            </text>
          )}
        </g>
      )}
      {strek && (
        <polyline
          points={strek.map((p) => `${p[0]},${-p[1]}`).join(' ')}
          class="dt-strek"
          style={{ strokeWidth: px(2.5) }}
        />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Side view                                                           */
/* ------------------------------------------------------------------ */

function FraSiden({
  benk,
  bilde,
  e,
  lager,
  str,
}: {
  benk: Arbeidsbenk;
  bilde: Tegnebilde;
  e: Tegneeditor;
  lager: Tegnelager;
  str: { b: number; h: number };
}) {
  const { tegning: t, oppsett: o, former } = bilde;
  const farger = lesParametre(brukUtdrag(benk, (x) => x.dok.parametre)).farger;
  const svg = useRef<SVGSVGElement>(null);
  const dra = useRef<number | null>(null);
  const valgt = gyldigValg(t, e.valgt, o.segmenter.length);
  if (!str.b || !str.h || o.L <= 0) return <svg ref={svg} class="dt-svg" aria-hidden="true" />;

  // the bottom margin leaves room for the development-geometry badge the workshop puts bottom left
  const marg = { v: 40, h: 16, t: 30, b: str.b < 440 ? 78 : 50 };
  const maksZ =
    Math.max(30, ...former.flatMap((f) => f.fraSiden.map((p) => p[1])), ...t.hoyde.map((p) => p.verdi)) * 1.1;
  const k = Math.min((str.b - marg.v - marg.h) / o.L, (str.h - marg.t - marg.b) / maksZ);
  const bredde = o.L * k;
  const x0 = marg.v + (str.b - marg.v - marg.h - bredde) / 2;
  const grunn = str.h - marg.b;
  // the nose is on the right, as in the standard drawing
  const X = (s: number) => x0 + (o.L - s) * k;
  const Y = (z: number) => grunn - z * k;
  const fra = (ev: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    return { s: o.L - (x - x0) / k, z: (grunn - y) / k };
  };

  const ned = (ev: PointerEvent) => {
    const mal = (ev.target as Element).closest<SVGElement>('[data-dt]');
    const [type, id] = (mal?.dataset.dt ?? '').split(':');
    if (type === 'hoyde') {
      dra.current = Number(id);
      svg.current!.setPointerCapture(ev.pointerId);
      lager.sett({ valgt: { type: 'hoyde', i: Number(id) } });
    } else if (type === 'del') lager.sett({ valgt: { type: 'del', i: Number(id) } });
  };
  const flytt = (ev: PointerEvent) => {
    const i = dra.current;
    if (i === null) return;
    const { s, z } = fra(ev);
    endreTegning(
      benk,
      'Endre høyde',
      (q) => settProfilpunkt(q, 'hoyde', i, { t: s / o.L, verdi: z }),
      `dt-hoyde-${i}`,
    );
  };
  const opp = (ev: PointerEvent) => {
    if (dra.current === null) return;
    dra.current = null;
    if (svg.current?.hasPointerCapture(ev.pointerId)) svg.current.releasePointerCapture(ev.pointerId);
    avslutt(benk);
  };
  const dobbel = (ev: MouseEvent) => {
    const { s, z } = fra(ev);
    if (s < 0 || s > o.L) return;
    const r = r0(s);
    if (Math.abs(z - r) > 8) return;
    const ny = leggTilProfilpunkt(t, 'hoyde', { t: s / o.L, verdi: z });
    endreTegning(benk, 'Nytt høydepunkt', () => ny.tegning);
    lager.sett({ valgt: { type: 'hoyde', i: ny.i } });
    benk.melde('Nytt høydepunkt.');
  };
  const r0 = (s: number) => profilVerdi(t.hoyde, s / o.L);
  const tast = (i: number) => (ev: KeyboardEvent) => {
    const d = piltast(ev);
    if (!d) return;
    ev.preventDefault();
    const q = t.hoyde[i]!;
    // the nose is on the right: the right arrow moves towards the nose
    endreTegning(
      benk,
      'Endre høyde',
      (x) => settProfilpunkt(x, 'hoyde', i, d[1] ? { verdi: q.verdi + d[1] } : { t: q.t - d[0] / 100 }),
      `dt-hoyde-${i}`,
    );
  };

  const kurve: string[] = [];
  for (let n = 0; n <= 80; n++) {
    const s = (o.L * n) / 80;
    kurve.push(`${X(s)},${Y(r0(s))}`);
  }
  const kropp = finnMateriale(farger.kropp).hex;
  const valgtDel = valgt?.type === 'del' ? valgt.i : -1;
  const linjer = [10, 20, 30, 40, 50].filter((z) => z < maksZ);

  return (
    <svg
      ref={svg}
      class="dt-svg dt-siden"
      width={str.b}
      height={str.h}
      role="group"
      aria-label="Dragen fra siden. Dra de runde punktene opp og ned for å endre høyden. Dobbeltklikk på linjen for et nytt punkt."
      onPointerDown={ned}
      onPointerMove={flytt}
      onPointerUp={opp}
      onPointerCancel={opp}
      onDblClick={dobbel}
    >
      {linjer.map((z) => (
        <g key={z} aria-hidden="true">
          <line x1={x0} x2={x0 + bredde} y1={Y(z)} y2={Y(z)} class="dt-hjelpelinje" />
          <text x={x0 - 6} y={Y(z) + 4} class="dt-skala">
            {z}
          </text>
        </g>
      ))}
      <line x1={x0 - 4} x2={x0 + bredde + 4} y1={grunn} y2={grunn} class="dt-grunnlinje" />
      {former.map((f, i) => (
        <polygon
          key={i}
          data-dt={`del:${i}`}
          points={f.fraSiden.map(([s, z]) => `${X(s)},${Y(z)}`).join(' ')}
          class={`dt-del${bilde.feilDeler.has(i) ? ' feil' : ''}${valgtDel === i ? ' valgt' : ''}`}
          style={{ fill: kropp }}
        >
          <title>{o.segmenter[i]!.navn}</title>
        </polygon>
      ))}
      {o.ledd.map((l) => (
        <line
          key={l.indeks}
          x1={X(l.s)}
          x2={X(l.s)}
          y1={grunn}
          y2={Y(o.mal.hulromHoyde + o.mal.tak)}
          class={`dt-leddlinje${bilde.feilLedd.has(l.indeks) ? ' feil' : ''}`}
        />
      ))}
      <polyline points={kurve.join(' ')} class="dt-hoydekurve" />
      {t.hoyde.map((p, i) => {
        const valgtNa = valgt?.type === 'hoyde' && valgt.i === i;
        return (
          <g
            key={i}
            data-dt={`hoyde:${i}`}
            class={`dt-handtak punkt${valgtNa ? ' valgt' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={`Høyde ${i + 1}: ${tall1(p.verdi)} mm, ${tall1(p.t * 100)} % bak nesen. Opp og ned endrer høyden, venstre og høyre flytter punktet.`}
            onKeyDown={tast(i)}
            onFocus={() => lager.sett({ valgt: { type: 'hoyde', i } })}
          >
            <circle cx={X(p.t * o.L)} cy={Y(p.verdi)} r={14} class="dt-treff" />
            <circle cx={X(p.t * o.L)} cy={Y(p.verdi)} r={6} />
          </g>
        );
      })}
      <text x={X(0)} y={grunn + 16} class="dt-etikett" text-anchor="end" aria-hidden="true">
        Nese
      </text>
      <text x={X(o.L)} y={grunn + 16} class="dt-etikett" aria-hidden="true">
        Hale
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The workspace                                                       */
/* ------------------------------------------------------------------ */

export function TegneLerret({ benk }: { benk: Arbeidsbenk }) {
  const bilde = brukTegnebilde(benk);
  const [e, lager] = brukTegneeditor(benk);
  const plate = brukUtdrag(benk, (x) => x.dok.plate);
  const [rot, rotStr] = brukStorrelse();
  const [topp, toppStr] = brukStorrelse();
  const [side, sideStr] = brukStorrelse();
  const [utsnitt, settUtsnitt] = useState<Utsnitt | null>(null);
  // wide: 3D in its own column; medium: side view and 3D side by side under the top view; small: tabs
  const smal = rotStr.b > 0 && rotStr.b < 520;
  const middels = !smal && rotStr.b > 0 && rotStr.b < 860;

  const ramme = (min: V2, maks: V2): Utsnitt => {
    const k = Math.min(toppStr.b / (maks[0] - min[0]), (toppStr.h - 28) / (maks[1] - min[1]));
    return {
      cx: (min[0] + maks[0]) / 2,
      cy: (min[1] + maks[1]) / 2 - 10 / k,
      k: Math.min(40, Math.max(0.3, k)),
    };
  };
  const tilpass = (): Utsnitt =>
    ramme([-plate.bredde / 2 - 12, -plate.dybde / 2 - 12], [plate.bredde / 2 + 12, plate.dybde / 2 + 12]);
  /** The dragon with room around it to draw, never closer than 140 mm across. */
  const rammeDragen = (): Utsnitt => {
    const p = bilde.former.flatMap((f) => f.ovenfra);
    if (!p.length) return tilpass();
    const min: V2 = [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1]))];
    const maks: V2 = [Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
    const c: V2 = [(min[0] + maks[0]) / 2, (min[1] + maks[1]) / 2];
    const halv = Math.max(60, (maks[0] - min[0]) * 0.58, (maks[1] - min[1]) * 0.58);
    return ramme([c[0] - halv, c[1] - halv], [c[0] + halv, c[1] + halv]);
  };
  // the view frames the dragon (also when the pane changes size) until the user zooms or pans
  const [eget, settEget] = useState(false);
  useEffect(() => {
    if (!eget && toppStr.b && toppStr.h) settUtsnitt(rammeDragen());
  }, [toppStr.b, toppStr.h, eget]);
  const brukerUtsnitt = (u: Utsnitt) => {
    settEget(true);
    settUtsnitt(u);
  };
  const zoom = (f: number | 'tilpass') => {
    if (!utsnitt) return;
    brukerUtsnitt(
      f === 'tilpass' ? tilpass() : { ...utsnitt, k: Math.min(40, Math.max(0.3, utsnitt.k * f)) },
    );
  };

  const feil = bilde.funn.filter((f) => f.niva === 'feil').length;
  const nedre = smal ? e.nedre : null;

  const stopp = (ev: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    // the arrow keys move a focused handle, not the page
    if ((ev.target as Element).closest('.dt-handtak') && ev.key.startsWith('Arrow')) ev.stopPropagation();
  };

  return (
    <div ref={rot} class={`dt-lerret${smal ? ' dt-smal' : middels ? ' dt-middels' : ''}`} onKeyDown={stopp}>
      <Verktoylinje benk={benk} e={e} lager={lager} zoom={zoom} smal={smal} />
      <section class="dt-flate dt-ovenfra" aria-label="Ovenfra">
        <h2 class="dt-tittel">Ovenfra</h2>
        <p class="dt-status" role="status">
          {bilde.oppsett.segmenter.length
            ? `${bilde.oppsett.segmenter.length} deler, ${bilde.oppsett.ledd.length} ledd, ${tall1(bilde.oppsett.L)} mm rygg`
            : 'Ingen deler ennå'}
          {feil > 0 && <span class="dt-feiltall">{feil === 1 ? ' · 1 feil' : ` · ${feil} feil`}</span>}
        </p>
        <div ref={topp} class="dt-maal">
          {utsnitt && (
            <Ovenfra
              benk={benk}
              bilde={bilde}
              e={e}
              lager={lager}
              utsnitt={utsnitt}
              settUtsnitt={brukerUtsnitt}
              str={toppStr}
            />
          )}
        </div>
      </section>
      {smal && (
        <div class="dt-nedrevalg" role="tablist" aria-label="Nedre visning">
          {(
            [
              ['siden', 'Fra siden'],
              ['3d', '3D'],
            ] as const
          ).map(([id, navn]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={e.nedre === id}
              onClick={() => lager.sett({ nedre: id })}
            >
              {navn}
            </button>
          ))}
        </div>
      )}
      {nedre !== '3d' && (
        <section class="dt-flate dt-sideflate" aria-label="Fra siden">
          {!smal && <h2 class="dt-tittel">Fra siden</h2>}
          <div ref={side} class="dt-maal">
            <FraSiden benk={benk} bilde={bilde} e={e} lager={lager} str={sideStr} />
          </div>
        </section>
      )}
      {nedre !== 'siden' && (
        <section class="dt-flate dt-3d" aria-label="3D">
          {!smal && <h2 class="dt-tittel">3D</h2>}
          <div class="dt-maal">
            <Visning3d benk={benk} kompakt etikett="Dragen i 3D, oppdateres mens du tegner" />
          </div>
        </section>
      )}
    </div>
  );
}
