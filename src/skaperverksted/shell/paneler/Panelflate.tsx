/**
 * The panel system around the canvas: dock columns left and right, floating
 * panels over the canvas, tabs, minimise, resize and drag to dock. The layout
 * itself lives in `modell.ts`; this file only draws it and turns pointer and
 * keyboard input into layout changes.
 */
import { Fragment, type ComponentChildren, type JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { PanelDef } from '../../core/generator';
import { Ikon, type IkonId } from '../ikoner';
import { Tips } from '../Tips';
import { startDra } from './dra';
import type { PanelHandling, PanelLager } from './lager';
import {
  DOKK_MAKS,
  DOKK_MIN,
  FLYT_MIN_B,
  FLYT_MIN_H,
  dokkGrupper,
  flyttGruppeTilDokk,
  flyttGruppeTilFlyt,
  klemFlyt,
  loft,
  losneFane,
  lukkPanel,
  settAktiv,
  settDokkB,
  settFlyt,
  settMinimert,
  settVekter,
  slaaSammen,
  type DokkSide,
  type Gruppe,
  type Oppsett,
} from './modell';
import { finnMal, malRekt, type GruppeRekt, type Mal, type Rekt } from './slipp';

type Pe = PointerEvent & { currentTarget: HTMLElement };

interface Props {
  benk: Arbeidsbenk;
  defs: PanelDef[];
  lager: PanelLager;
  send: (h: PanelHandling) => void;
  children: ComponentChildren;
}

interface Dra {
  gruppeId: string;
  tittel: string;
  x: number;
  y: number;
  mal: Mal;
  /** Highlight in panel-area coordinates. */
  markering: Rekt | null;
  /** A chip follows the pointer (the group itself stays put). */
  brikke: boolean;
}

type Kant = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const KANTER: Kant[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const tilRekt = (r: DOMRect): Rekt => ({ x: r.left, y: r.top, b: r.width, h: r.height });

export function Panelflate({ benk, defs, lager, send, children }: Props) {
  const o = lager.oppsett;
  const flate = useRef<HTMLDivElement>(null);
  const [str, settStr] = useState({ b: 0, h: 0 });
  const [levende, settLevende] = useState<
    Record<string, Partial<{ x: number; y: number; b: number; h: number }>>
  >({});
  const [levendeB, settLevendeB] = useState<Partial<Record<DokkSide, number>>>({});
  const [levendeVekt, settLevendeVekt] = useState<Record<string, number> | null>(null);
  const [dra, settDra] = useState<Dra | null>(null);
  const def = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);

  useEffect(() => {
    const el = flate.current;
    if (!el) return;
    const les = () => settStr({ b: el.clientWidth, h: el.clientHeight });
    les();
    const ro = new ResizeObserver(les);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const endre = (f: (o: Oppsett) => Oppsett, rolig = false) => send({ t: 'endre', f, rolig });
  const tittelAv = (g: Gruppe) => def.get(g.aktiv)?.navn ?? g.aktiv;

  /** Drag a group (or one tab) by its header. */
  const starthode = (e: Pe, g: Gruppe, panelId: string | null) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button:not([role="tab"]), [role="menu"], input'))
      return;
    const fl = flate.current;
    if (!fl) return;
    if (g.plass.type === 'flyt') endre((x) => loft(x, g.id), true);
    const kilde = e.currentTarget as HTMLElement;
    const gruppeEl = kilde.closest<HTMLElement>('[data-gruppe]')!;
    const egen = gruppeEl.getBoundingClientRect();
    const offX = e.clientX - egen.left;
    const offY = e.clientY - egen.top;
    const live = g.plass.type === 'flyt' && (panelId === null || g.paneler.length === 1);
    const tittel = panelId ? (def.get(panelId)?.navn ?? panelId) : tittelAv(g);
    let rekter: { fr: Rekt; grupper: GruppeRekt[]; kolonner: { side: DokkSide; rekt: Rekt }[] } | null = null;
    let sisteMal: Mal = { type: 'ingen' };
    const samle = () => {
      const fr = tilRekt(fl.getBoundingClientRect());
      const grupper = [...fl.querySelectorAll<HTMLElement>('[data-gruppe]')].map((el) => ({
        id: el.dataset.gruppe!,
        rekt: tilRekt(el.getBoundingClientRect()),
        dokk: (el.dataset.dokk as DokkSide | undefined) || null,
        indeks: Number(el.dataset.indeks ?? 0),
      }));
      const kolonner = [...fl.querySelectorAll<HTMLElement>('[data-kolonne]')].map((el) => ({
        side: el.dataset.kolonne as DokkSide,
        rekt: tilRekt(el.getBoundingClientRect()),
      }));
      rekter = { fr, grupper, kolonner };
    };
    startDra(e, {
      terskel: 5,
      start: () => samle(),
      flytt: (_dx, _dy, ev) => {
        if (!rekter) return;
        const mal = finnMal(
          { x: ev.clientX, y: ev.clientY },
          rekter.fr,
          rekter.grupper,
          rekter.kolonner,
          g.id,
        );
        sisteMal = mal;
        const mr = malRekt(mal, rekter.fr, rekter.grupper, rekter.kolonner, o.dokkB);
        if (live) {
          settLevende({ [g.id]: { x: ev.clientX - rekter.fr.x - offX, y: ev.clientY - rekter.fr.y - offY } });
        }
        settDra({
          gruppeId: g.id,
          tittel,
          x: ev.clientX,
          y: ev.clientY,
          mal,
          markering: mr ? { x: mr.x - rekter.fr.x, y: mr.y - rekter.fr.y, b: mr.b, h: mr.h } : null,
          brikke: !live,
        });
      },
      slutt: (_dx, _dy, ev, avbrutt) => {
        settDra(null);
        settLevende({});
        if (avbrutt || !rekter) return;
        const fr = rekter.fr;
        const mal = sisteMal;
        const a = def.get(g.aktiv);
        const nyPos = {
          x: ev.clientX - fr.x - offX,
          y: ev.clientY - fr.y - offY,
        };
        const storrelse = {
          b: g.plass.type === 'flyt' ? g.plass.b : (a?.flytB ?? Math.min(egen.width, 420)),
          h: g.plass.type === 'flyt' ? g.plass.h : (a?.flytH ?? Math.min(egen.height, 520)),
        };
        endre((x) => {
          // a dragged tab leaves its group first
          let m = x;
          let gid = g.id;
          if (panelId && g.paneler.length > 1) {
            const l = losneFane(x, panelId);
            if (!l) return x;
            m = l.oppsett;
            gid = l.gruppeId;
          }
          if (mal.type === 'ingen') return m;
          if (mal.type === 'fane') return slaaSammen(m, gid, mal.gruppeId);
          if (mal.type === 'dokk') {
            let indeks = mal.indeks;
            const naa = dokkGrupper(m, mal.side).findIndex((q) => q.id === gid);
            if (naa >= 0 && Number.isFinite(indeks) && naa < indeks) indeks -= 1;
            return flyttGruppeTilDokk(m, gid, mal.side, indeks);
          }
          return flyttGruppeTilFlyt(m, gid, {
            ...nyPos,
            b: storrelse.b,
            h: storrelse.h,
          });
        });
      },
    });
  };

  /** Resize a floating group from an edge or corner. */
  const startKant = (e: Pe, g: Gruppe, kant: Kant) => {
    if (e.button !== 0 || g.plass.type !== 'flyt') return;
    e.stopPropagation();
    const start = klemFlyt(levende[g.id] ? { ...g.plass, ...levende[g.id] } : g.plass, str.b, str.h);
    let siste = start;
    startDra(e, {
      flytt: (dx, dy) => {
        let { x, y, b, h } = start;
        if (kant.includes('e')) b = Math.max(FLYT_MIN_B, start.b + dx);
        if (kant.includes('s')) h = Math.max(FLYT_MIN_H, start.h + dy);
        if (kant.includes('w')) {
          b = Math.max(FLYT_MIN_B, start.b - dx);
          x = start.x + start.b - b;
        }
        if (kant.includes('n')) {
          h = Math.max(FLYT_MIN_H, start.h - dy);
          y = start.y + start.h - h;
        }
        siste = { x, y, b, h };
        settLevende({ [g.id]: siste });
      },
      slutt: (_dx, _dy, _e, avbrutt) => {
        settLevende({});
        if (!avbrutt) endre((x) => settFlyt(x, g.id, siste));
      },
    });
  };

  /** Resize the dock column from its inner edge. */
  const startDokkB = (e: Pe, side: DokkSide) => {
    if (e.button !== 0) return;
    const start = o.dokkB[side];
    let siste = start;
    startDra(e, {
      flytt: (dx) => {
        siste = Math.round(Math.min(DOKK_MAKS, Math.max(DOKK_MIN, start + (side === 'venstre' ? dx : -dx))));
        settLevendeB({ [side]: siste });
      },
      slutt: (_dx, _dy, _e, avbrutt) => {
        settLevendeB({});
        if (!avbrutt) endre((x) => settDokkB(x, side, siste));
      },
    });
  };

  /** Move the border between two stacked groups in a dock column. */
  const startDeling = (e: Pe, over: Gruppe, under: Gruppe) => {
    if (e.button !== 0) return;
    const kolonne = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-kolonne]')!;
    const hoyder: Record<string, number> = {};
    kolonne.querySelectorAll<HTMLElement>('[data-gruppe]').forEach((el) => {
      if (el.dataset.minimert !== 'true') hoyder[el.dataset.gruppe!] = el.getBoundingClientRect().height;
    });
    const a = hoyder[over.id] ?? 0;
    const b = hoyder[under.id] ?? 0;
    const min = 90;
    let siste = hoyder;
    startDra(e, {
      flytt: (_dx, dy) => {
        const d = Math.max(min - a, Math.min(b - min, dy));
        siste = { ...hoyder, [over.id]: a + d, [under.id]: b - d };
        settLevendeVekt(siste);
      },
      slutt: (_dx, _dy, _e, avbrutt) => {
        settLevendeVekt(null);
        if (!avbrutt) endre((x) => settVekter(x, siste));
      },
    });
  };

  const gruppeVis = (g: Gruppe, dokkSide: DokkSide | null, indeks: number) => (
    <Gruppevisning
      key={g.id}
      g={g}
      def={def}
      benk={benk}
      dokkSide={dokkSide}
      indeks={indeks}
      endre={endre}
      starthode={starthode}
      startKant={startKant}
      levende={levende[g.id]}
      str={str}
      vekt={levendeVekt?.[g.id]}
      tegnZ={o.grupper.indexOf(g)}
    />
  );

  const kolonne = (side: DokkSide) => {
    const gr = dokkGrupper(o, side);
    if (!gr.length) return null;
    const b = levendeB[side] ?? o.dokkB[side];
    return (
      <div class={`dokkolonne ${side}`} data-kolonne={side} style={{ '--dokk-b': `${b}px` }}>
        {gr.map((g, i) => {
          const forrige = gr[i - 1];
          return (
            <Fragment key={g.id}>
              {forrige && !forrige.minimert && !g.minimert && (
                <div
                  class="deling"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={`Endre høyden mellom ${tittelAv(forrige)} og ${tittelAv(g)}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(
                    (100 * (levendeVekt?.[forrige.id] ?? forrige.vekt)) /
                      ((levendeVekt?.[forrige.id] ?? forrige.vekt) + (levendeVekt?.[g.id] ?? g.vekt)),
                  )}
                  tabIndex={0}
                  onPointerDown={(e) => startDeling(e, forrige, g)}
                  onKeyDown={(e) => {
                    const d = e.key === 'ArrowUp' ? -24 : e.key === 'ArrowDown' ? 24 : 0;
                    if (!d) return;
                    e.preventDefault();
                    const kol = (e.currentTarget as HTMLElement).closest('[data-kolonne]')!;
                    const m: Record<string, number> = {};
                    kol.querySelectorAll<HTMLElement>('[data-gruppe]').forEach((el) => {
                      if (el.dataset.minimert !== 'true')
                        m[el.dataset.gruppe!] = el.getBoundingClientRect().height;
                    });
                    const a = m[forrige.id] ?? 0;
                    const bb = m[g.id] ?? 0;
                    const dd = Math.max(90 - a, Math.min(bb - 90, d));
                    endre((x) => settVekter(x, { ...m, [forrige.id]: a + dd, [g.id]: bb - dd }));
                  }}
                />
              )}
              {gruppeVis(g, side, i)}
            </Fragment>
          );
        })}
        <div
          class={`dokkskille ${side}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Endre bredden på ${side === 'venstre' ? 'venstre' : 'høyre'} dokk`}
          aria-valuemin={DOKK_MIN}
          aria-valuemax={DOKK_MAKS}
          aria-valuenow={b}
          tabIndex={0}
          onPointerDown={(e) => startDokkB(e, side)}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
            if (!d) return;
            e.preventDefault();
            endre((x) => settDokkB(x, side, x.dokkB[side] + (side === 'venstre' ? d : -d)));
          }}
        />
      </div>
    );
  };

  const flyt = o.grupper.filter((g) => g.plass.type === 'flyt');
  return (
    <div class="panelflate" ref={flate}>
      {kolonne('venstre')}
      <div class="lerretflate">{children}</div>
      {kolonne('hoyre')}
      <div class="flytlag">{flyt.map((g) => gruppeVis(g, null, 0))}</div>
      {dra?.markering && (
        <div
          class={`slippmal ${dra.mal.type}`}
          aria-hidden="true"
          style={{
            left: `${dra.markering.x}px`,
            top: `${dra.markering.y}px`,
            width: `${dra.markering.b}px`,
            height: `${dra.markering.h}px`,
          }}
        />
      )}
      {dra?.brikke && (
        <div class="drabrikke" aria-hidden="true" style={{ left: `${dra.x + 12}px`, top: `${dra.y + 12}px` }}>
          {dra.tittel}
        </div>
      )}
    </div>
  );
}

interface GruppeProps {
  g: Gruppe;
  def: Map<string, PanelDef>;
  benk: Arbeidsbenk;
  dokkSide: DokkSide | null;
  indeks: number;
  endre: (f: (o: Oppsett) => Oppsett, rolig?: boolean) => void;
  starthode: (e: Pe, g: Gruppe, panelId: string | null) => void;
  startKant: (e: Pe, g: Gruppe, kant: Kant) => void;
  levende?: Partial<{ x: number; y: number; b: number; h: number }>;
  str: { b: number; h: number };
  vekt?: number;
  tegnZ: number;
}

function Gruppevisning({
  g,
  def,
  benk,
  dokkSide,
  indeks,
  endre,
  starthode,
  startKant,
  levende,
  str,
  vekt,
  tegnZ,
}: GruppeProps) {
  const aktivDef = def.get(g.aktiv);
  const Innhold = aktivDef?.Innhold;
  const flyter = g.plass.type === 'flyt';
  const hodeId = `pg-${g.id}`;
  let stil: JSX.CSSProperties | undefined;
  if (g.plass.type === 'flyt') {
    const r = klemFlyt({ ...g.plass, ...levende }, str.b || 100000, str.h || 100000);
    stil = {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.b}px`,
      height: g.minimert ? 'auto' : `${r.h}px`,
      zIndex: 20 + tegnZ,
    };
  } else if (!g.minimert) {
    stil = { flex: `${vekt ?? g.vekt} 1 0` };
  }
  const navn = aktivDef?.navn ?? g.aktiv;
  return (
    <section
      class={`panelgruppe${flyter ? ' flytende' : ''}${g.minimert ? ' minimert' : ''}`}
      style={stil}
      aria-labelledby={hodeId}
      data-gruppe={g.id}
      data-dokk={dokkSide ?? ''}
      data-indeks={indeks}
      data-minimert={g.minimert ? 'true' : 'false'}
      onPointerDownCapture={flyter ? () => endre((x) => loft(x, g.id), true) : undefined}
    >
      <header class="panelhode" onPointerDown={(e) => starthode(e, g, null)}>
        {g.paneler.length > 1 ? (
          <div class="panelfaner" role="tablist" aria-label="Paneler i gruppen" id={hodeId}>
            {g.paneler.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                class="panelfane"
                aria-selected={p === g.aktiv}
                tabIndex={p === g.aktiv ? 0 : -1}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  starthode(e, g, p);
                }}
                onClick={() => endre((x) => settAktiv(x, g.id, p), true)}
                onKeyDown={(e) => {
                  const i = g.paneler.indexOf(p);
                  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                  if (!d) return;
                  e.preventDefault();
                  const neste = g.paneler[(i + d + g.paneler.length) % g.paneler.length]!;
                  endre((x) => settAktiv(x, g.id, neste), true);
                  requestAnimationFrame(() =>
                    (e.currentTarget as HTMLElement).parentElement
                      ?.querySelector<HTMLElement>('[aria-selected="true"]')
                      ?.focus(),
                  );
                }}
              >
                {def.get(p)?.ikon && <Ikon id={def.get(p)!.ikon as IkonId} storrelse={14} />}
                {def.get(p)?.navn ?? p}
              </button>
            ))}
          </div>
        ) : (
          <h2 class="panelnavn" id={hodeId}>
            {aktivDef?.ikon && <Ikon id={aktivDef.ikon as IkonId} storrelse={14} />}
            {navn}
          </h2>
        )}
        <div class="panelknapper">
          <Tips navn={g.minimert ? 'Gjenopprett' : 'Minimer'} side="under">
            {(p) => (
              <button
                type="button"
                class="panelknapp"
                aria-label={g.minimert ? `Gjenopprett ${navn}` : `Minimer ${navn}`}
                aria-expanded={!g.minimert}
                onClick={() => endre((x) => settMinimert(x, g.id, !g.minimert))}
                {...p}
              >
                <Ikon id={g.minimert ? 'gjenopprett' : 'minimer'} storrelse={16} />
              </button>
            )}
          </Tips>
          <Gruppemeny g={g} def={def} dokkSide={dokkSide} endre={endre} />
        </div>
      </header>
      {!g.minimert && (
        <div
          class="panelinnhold"
          role={g.paneler.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={hodeId}
        >
          {Innhold ? <Innhold benk={benk} key={g.aktiv} /> : null}
        </div>
      )}
      {flyter &&
        !g.minimert &&
        KANTER.map((k) => (
          <div
            key={k}
            class={`kant kant-${k}`}
            aria-hidden="true"
            onPointerDown={(e) => startKant(e, g, k)}
          />
        ))}
    </section>
  );
}

function Gruppemeny({
  g,
  def,
  dokkSide,
  endre,
}: {
  g: Gruppe;
  def: Map<string, PanelDef>;
  dokkSide: DokkSide | null;
  endre: (f: (o: Oppsett) => Oppsett, rolig?: boolean) => void;
}) {
  const [apen, settApen] = useState(false);
  const rot = useRef<HTMLDivElement>(null);
  const navn = def.get(g.aktiv)?.navn ?? g.aktiv;
  useEffect(() => {
    if (!apen) return;
    rot.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const utenfor = (e: PointerEvent) => {
      if (!rot.current?.contains(e.target as Node)) settApen(false);
    };
    window.addEventListener('pointerdown', utenfor);
    return () => window.removeEventListener('pointerdown', utenfor);
  }, [apen]);
  const valg = (f: (o: Oppsett) => Oppsett) => {
    settApen(false);
    endre(f);
  };
  const flytTil = (side: DokkSide) => valg((x) => flyttGruppeTilDokk(x, g.id, side));
  const knapp = (tekst: string, ikon: Parameters<typeof Ikon>[0]['id'], gjor: () => void) => (
    <button type="button" role="menuitem" onClick={gjor}>
      <Ikon id={ikon} storrelse={16} />
      {tekst}
    </button>
  );
  return (
    <div class="gruppemeny" ref={rot}>
      <Tips navn="Panelmeny" side="under">
        {(p) => (
          <button
            type="button"
            class="panelknapp"
            aria-label={`Meny for ${navn}`}
            aria-haspopup="menu"
            aria-expanded={apen}
            onClick={() => settApen(!apen)}
            {...p}
          >
            <Ikon id="meny" storrelse={16} />
          </button>
        )}
      </Tips>
      {apen && (
        <div
          class="meny panelmeny"
          role="menu"
          aria-label={`Meny for ${navn}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              settApen(false);
              rot.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
              return;
            }
            const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const alle = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
            const i = alle.indexOf(document.activeElement as HTMLElement);
            alle[(i + d + alle.length) % alle.length]?.focus();
          }}
        >
          {dokkSide !== 'venstre' && knapp('Dokk til venstre', 'dokk-venstre', () => flytTil('venstre'))}
          {dokkSide !== 'hoyre' && knapp('Dokk til høyre', 'dokk-hoyre', () => flytTil('hoyre'))}
          {dokkSide !== null &&
            knapp('Gjør flytende', 'flyt', () => valg((x) => flyttGruppeTilFlyt(x, g.id, { x: 48, y: 48 })))}
          {g.paneler.length > 1 &&
            knapp(`Løsne «${navn}» fra gruppen`, 'flyt', () =>
              valg((x) => {
                const l = losneFane(x, g.aktiv);
                return l ? flyttGruppeTilFlyt(l.oppsett, l.gruppeId, { x: 64, y: 64 }) : x;
              }),
            )}
          {knapp(g.minimert ? 'Gjenopprett' : 'Minimer', g.minimert ? 'gjenopprett' : 'minimer', () =>
            valg((x) => settMinimert(x, g.id, !g.minimert)),
          )}
          {knapp(`Lukk «${navn}»`, 'lukk', () => valg((x) => lukkPanel(x, g.aktiv)))}
        </div>
      )}
    </div>
  );
}
