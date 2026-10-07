/**
 * Layers panel (spec: "Layers panel"): the physical construction list,
 * top of the stack first, with Z ranges, heights, colours, visibility and
 * lock, and the objects in each layer. A text layer also lists its
 * outlines, each its own row (Sivert, 2026-10-05). The stack diagram was
 * removed on Sivert's request the same day.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, objekterILag, type Dokument, type Lag, type Omriss } from '../../core/dokument';
import { finnMateriale } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { brukBenk } from '../../shell/bruk-benk';
import { Ikon, type IkonId } from '../../shell/ikoner';
import type { Region } from '../../geometri/polygon';
import { regionBoks } from '../../geometri/polygon';
import { lagRegion } from './modell';
import {
  dupliserLag,
  flyttLagInnI,
  flyttObjekterInnI,
  kanLiggeI,
  losUtObjekt,
  nesteFarge,
  leggTilOmriss,
  nyttOmriss,
  oppdaterOmriss,
  flyttLag,
  leggTilLag,
  nyttLag,
  oppdaterLag,
  oppdaterObjekter,
  slettLag,
} from './dokument';
import { signtilstand, brukSigntilstand } from './tilstand';
import { importerSvgSom, nyttLagRundtTeksten, nyttTomtTekstlag, type Svgrolle } from './handlinger';

// ---------- thumbnails ----------

const miniatyrBuffer = new WeakMap<Region, string>();
const MB = 30;
const MH = 22;

/** Outline path of a region scaled into the thumbnail box; rings are thinned to keep it light. */
function miniatyrSti(region: Region): string {
  const hit = miniatyrBuffer.get(region);
  if (hit !== undefined) return hit;
  let d = '';
  if (region.length) {
    const b = regionBoks(region);
    const w = Math.max(b.maksX - b.minX, 1e-6);
    const h = Math.max(b.maksY - b.minY, 1e-6);
    const k = Math.min((MB - 4) / w, (MH - 4) / h);
    const ox = (MB - w * k) / 2;
    const oy = (MH - h * k) / 2;
    for (const f of region) {
      for (const r of [f.ytre, ...f.hull]) {
        const steg = Math.max(1, Math.ceil(r.length / 120));
        let i = 0;
        for (let n = 0; n < r.length; n += steg, i++) {
          const p = r[n]!;
          d += `${i === 0 ? 'M' : 'L'}${(ox + (p.x - b.minX) * k).toFixed(1)} ${(oy + (b.maksY - p.y) * k).toFixed(1)}`;
        }
        d += 'Z';
      }
    }
  }
  miniatyrBuffer.set(region, d);
  return d;
}

/** The layer's shape in its own colour: functional geometry, not decoration. */
function Miniatyr({ dok, lag, farge }: { dok: Dokument; lag: Lag; farge: string }) {
  const region = lagRegion(dok, lag.id);
  const sti = region ? miniatyrSti(region) : '';
  return (
    <svg
      class="lag-miniatyr"
      width={MB}
      height={MH}
      viewBox={`0 0 ${MB} ${MH}`}
      aria-hidden="true"
      focusable="false"
    >
      {sti ? (
        <path d={sti} fill={farge} fill-rule="evenodd" stroke="var(--linje-sterk)" stroke-width="0.6" />
      ) : (
        <rect x="9" y="6" width="12" height="10" rx="1.5" fill={farge} opacity="0.5" />
      )}
    </svg>
  );
}

/** Visibility and lock buttons share one look: pack icons, state in aria-pressed. */
function Bryter({
  type,
  paa,
  navn,
  tittel,
  onClick,
}: {
  type: 'synlighet' | 'las';
  paa: boolean;
  navn: string;
  tittel: string;
  onClick: () => void;
}) {
  return (
    <button type="button" class={`minibryter ${type}`} aria-pressed={paa} title={tittel} onClick={onClick}>
      <Ikon id={type === 'synlighet' ? 'visible' : paa ? 'lock' : 'unlock'} storrelse={16} />
      <span class="visuelt-skjult">
        {type === 'synlighet' ? 'Synlig' : 'Låst'} {navn}
      </span>
    </button>
  );
}

/** What a layer's influences turn into: derived rows under it (read-only, they follow their source layer). */
function Utledet({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const t = brukBenk(benk);
  if (!lag.pavirkninger.length) return null;
  return (
    <ul class="utledet" role="list" aria-label={`Utledet geometri i ${lag.navn}`}>
      {lag.pavirkninger.map((p, i) => {
        const kilde = finnLag(t.dok, p.kildeLagId);
        return (
          <li key={i} class="utledetrad">
            <Ikon id={p.handling === 'kutt' ? 'subtract' : 'union'} storrelse={14} />
            <span class="lag-tittel">
              {p.handling === 'kutt' ? 'Kuttet av' : 'Utvidet med'} «{kilde?.navn ?? 'ukjent lag'}»
            </span>
            <span class="mono lag-z">{tall(p.avstand)} mm</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- context menu ----------

interface MenyValg {
  id: string;
  navn: string;
  ikon?: IkonId;
  av?: boolean;
  farlig?: boolean;
  gjor: () => void;
}

/** Right-click (or the menu key, or Shift+F10) on a layer. Arrow keys move, Esc closes. */
function Lagmeny({ x, y, valg, lukk }: { x: number; y: number; valg: MenyValg[]; lukk: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const utenfor = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) lukk();
    };
    window.addEventListener('pointerdown', utenfor, true);
    return () => window.removeEventListener('pointerdown', utenfor, true);
  }, [lukk]);
  const pos = {
    left: `${Math.min(x, window.innerWidth - 220)}px`,
    top: `${Math.min(y, window.innerHeight - valg.length * 38 - 16)}px`,
  };
  return (
    <div
      ref={ref}
      class="lagmeny"
      role="menu"
      aria-label="Lag"
      style={pos}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          lukk();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const k = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
          const i = k.indexOf(document.activeElement as HTMLButtonElement);
          k[(i + (e.key === 'ArrowDown' ? 1 : -1) + k.length) % k.length]?.focus();
        } else if (e.key === 'Tab') lukk();
      }}
    >
      {valg.map((v) => (
        <button
          key={v.id}
          type="button"
          role="menuitem"
          class={v.farlig ? 'farlig' : ''}
          disabled={v.av}
          onClick={() => {
            lukk();
            v.gjor();
          }}
        >
          {v.ikon && <Ikon id={v.ikon} storrelse={16} />}
          {v.navn}
        </button>
      ))}
    </div>
  );
}

/** One outline of a text layer: a row of its own in the layers panel. */
function Omrissrad({ benk, lag, o }: { benk: Arbeidsbenk; lag: Lag; o: Omriss }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const mat = finnMateriale(o.materialId);
  const aktiv = t.utvalg.lag === lag.id && st.omriss === o.id;
  const endre = (navn: string, endring: Partial<Omriss>) =>
    benk.endre({ navn, anvend: (d) => oppdaterOmriss(d, lag.id, o.id, endring) });
  return (
    <li class={`omrissrad${aktiv ? ' aktiv' : ''}${o.synlig ? '' : ' skjult'}`}>
      <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
      <button
        type="button"
        class="lag-navn"
        aria-current={aktiv ? 'true' : undefined}
        onClick={() => {
          signtilstand(benk).sett({ omriss: o.id });
          benk.velg({ lag: lag.id, objekter: [] });
        }}
      >
        <span class="lag-tittel">{o.navn}</span>
        <span class="mono lag-z">
          {o.type === 'fyll' ? 'Fyll' : 'Omriss'} {tall(o.bredde)} mm · {tall(o.hoyde)} mm høy · {mat.navn}
        </span>
      </button>
      <Bryter
        type="synlighet"
        paa={o.synlig}
        navn={o.navn}
        tittel={o.synlig ? 'Skjul omrisset' : 'Vis omrisset'}
        onClick={() => endre(o.synlig ? 'Skjul omriss' : 'Vis omriss', { synlig: !o.synlig })}
      />
    </li>
  );
}

/** Add an outline outside the text layer's outlines, in a colour not yet used. */
export function nyttOmrissI(benk: Arbeidsbenk, lag: Lag): void {
  const mat = finnMateriale(nesteFarge(benk.dok));
  const n = (lag.omriss?.length ?? 0) + 1;
  const o = nyttOmriss(`Omriss ${n}`, mat.id, { hoyde: Math.max(0.6, Math.round(lag.hoyde * 5) / 10) });
  benk.endre({ navn: 'Nytt omriss', anvend: (d) => leggTilOmriss(d, lag.id, o) });
  signtilstand(benk).sett({ omriss: o.id });
  benk.velg({ lag: lag.id, objekter: [] });
  benk.melde(`${o.navn} er lagt til rundt teksten i «${lag.navn}», i ${mat.navn}.`);
}

/** What is being dragged in the layers panel: an object, or a whole layer. */
interface Dra {
  type: 'objekt' | 'lag';
  id: string;
}

interface Dnd {
  dra: Dra | null;
  start: (d: Dra, e: DragEvent) => void;
  slutt: () => void;
  /** The layer under the pointer while dragging. */
  over: string | null;
  settOver: (id: string | null) => void;
  /** Whether the dragged thing may be dropped on this layer. */
  kan: (lag: Lag) => boolean;
  slipp: (lagId: string) => void;
  /** Rename in place: the layer being renamed, and the menu opening on a layer. */
  omdop: string | null;
  ferdigOmdop: () => void;
  apneMeny: (lagId: string, x: number, y: number) => void;
  startOmdop: (lagId: string) => void;
}

function Lagrad({
  benk,
  lag,
  apen,
  veksle,
  dnd,
}: {
  benk: Arbeidsbenk;
  lag: Lag;
  apen: boolean;
  veksle: () => void;
  dnd: Dnd;
}) {
  const t = brukBenk(benk);
  const aktiv = t.utvalg.lag === lag.id;
  const objekter = objekterILag(t.dok, lag.id);
  const mat = finnMateriale(lag.materialId);
  const endreLag = (navn: string, endring: Partial<Lag>) =>
    benk.endre({ navn, anvend: (d) => oppdaterLag(d, lag.id, endring) });
  const kanSlippes = !!dnd.dra && dnd.kan(lag);
  return (
    <li
      class={`lagrad${aktiv ? ' aktiv' : ''}${lag.synlig ? '' : ' skjult'}${
        kanSlippes ? ' kan-slippes' : ''
      }${kanSlippes && dnd.over === lag.id ? ' slipp-her' : ''}`}
      onDragOver={(e) => {
        if (!kanSlippes) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (dnd.over !== lag.id) dnd.settOver(lag.id);
      }}
      onDragLeave={(e) => {
        if (dnd.over === lag.id && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null))
          dnd.settOver(null);
      }}
      onDrop={(e) => {
        if (!kanSlippes) return;
        e.preventDefault();
        dnd.slipp(lag.id);
      }}
    >
      <div
        class="lagrad-hode"
        draggable={!lag.last}
        onDragStart={(e) => dnd.start({ type: 'lag', id: lag.id }, e)}
        onDragEnd={dnd.slutt}
      >
        <button type="button" class="lag-apne" aria-expanded={apen} onClick={veksle}>
          <span class="visuelt-skjult">{apen ? 'Skjul innholdet i' : 'Vis innholdet i'} </span>
          <span aria-hidden="true">{apen ? '▾' : '▸'}</span>
        </button>
        <Miniatyr dok={t.dok} lag={lag} farge={mat.hex} />
        {dnd.omdop === lag.id ? (
          <input
            class="lag-omdop"
            type="text"
            aria-label="Nytt navn på laget"
            defaultValue={lag.navn}
            ref={(el) => el?.focus()}
            onFocus={(e) => (e.target as HTMLInputElement).select()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') dnd.ferdigOmdop();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const nytt = (e.target as HTMLInputElement).value.trim();
              if (dnd.omdop === lag.id && nytt && nytt !== lag.navn)
                endreLag('Gi laget nytt navn', { navn: nytt });
              dnd.ferdigOmdop();
            }}
          />
        ) : (
          <button
            type="button"
            class="lag-navn"
            aria-current={aktiv ? 'true' : undefined}
            onClick={() => {
              signtilstand(benk).sett({ omriss: null });
              benk.velg({ lag: lag.id, objekter: [] });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              signtilstand(benk).sett({ omriss: null });
              benk.velg({ lag: lag.id, objekter: [] });
              dnd.apneMeny(lag.id, e.clientX, e.clientY);
            }}
            onDblClick={() => {
              if (!lag.last) dnd.startOmdop(lag.id);
            }}
          >
            <span class="lag-tittel">
              {lag.navn}
              {lag.tekstlag && (
                <span class="merke lag-merke">
                  {objekter.length > 1 ? `Gruppe · ${objekter.length}` : 'Tekst'}
                </span>
              )}
            </span>
            <span class="mono lag-z">
              {tall(lag.zBunn)}–{tall(lag.zBunn + lag.hoyde)} mm ·{' '}
              {lag.tekstvisning === 'kutt' ? 'skåret ut' : mat.navn}
            </span>
          </button>
        )}
        <Bryter
          type="synlighet"
          paa={lag.synlig}
          navn={lag.navn}
          tittel={lag.synlig ? 'Skjul laget' : 'Vis laget'}
          onClick={() => endreLag(lag.synlig ? 'Skjul lag' : 'Vis lag', { synlig: !lag.synlig })}
        />
        <Bryter
          type="las"
          paa={lag.last}
          navn={lag.navn}
          tittel={lag.last ? 'Lås opp laget' : 'Lås laget'}
          onClick={() => endreLag(lag.last ? 'Lås opp lag' : 'Lås lag', { last: !lag.last })}
        />
      </div>
      {apen && (
        <ul class="objektliste" role="list">
          {objekter.length === 0 && (
            <li class="tom-melding">
              {lag.tekstlag
                ? 'Ingen tekst. Bruk Tekst-verktøyet.'
                : 'Ingen objekter. Bruk verktøyene for å legge til.'}
            </li>
          )}
          {[...objekter].reverse().map((o) => {
            const valgt = t.utvalg.objekter.includes(o.id);
            return (
              <li
                key={o.id}
                class={valgt ? 'valgt' : ''}
                draggable={!o.last && !lag.last}
                onDragStart={(e) => dnd.start({ type: 'objekt', id: o.id }, e)}
                onDragEnd={dnd.slutt}
              >
                <button
                  type="button"
                  class="objekt-navn"
                  aria-pressed={valgt}
                  onClick={(e) => {
                    const flere = e.shiftKey || e.ctrlKey || e.metaKey;
                    const ny = flere
                      ? valgt
                        ? t.utvalg.objekter.filter((x) => x !== o.id)
                        : [...t.utvalg.objekter, o.id]
                      : [o.id];
                    benk.velg({ objekter: ny, lag: lag.id });
                  }}
                >
                  {o.navn}
                  {o.operasjon === 'trekk-fra' && <span class="mono merke"> kutter</span>}
                </button>
                <Bryter
                  type="synlighet"
                  paa={o.synlig}
                  navn={o.navn}
                  tittel={o.synlig ? 'Skjul objektet' : 'Vis objektet'}
                  onClick={() =>
                    benk.endre({
                      navn: o.synlig ? 'Skjul objekt' : 'Vis objekt',
                      anvend: (d) => oppdaterObjekter(d, [o.id], (x) => ({ ...x, synlig: !x.synlig })),
                    })
                  }
                />
                <Bryter
                  type="las"
                  paa={o.last}
                  navn={o.navn}
                  tittel={o.last ? 'Lås opp objektet' : 'Lås objektet'}
                  onClick={() =>
                    benk.endre({
                      navn: o.last ? 'Lås opp objekt' : 'Lås objekt',
                      anvend: (d) => oppdaterObjekter(d, [o.id], (x) => ({ ...x, last: !x.last })),
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      {apen && <Utledet benk={benk} lag={lag} />}
      {apen && lag.tekstlag && (
        <div class="omrissliste">
          {(lag.omriss ?? []).length > 0 && (
            <ol role="list" aria-label={`Omriss rundt ${lag.navn}, innerst først`}>
              {(lag.omriss ?? []).map((o) => (
                <Omrissrad key={o.id} benk={benk} lag={lag} o={o} />
              ))}
            </ol>
          )}
          <button
            type="button"
            class="kontroll-knapp"
            disabled={lag.last}
            onClick={() => nyttOmrissI(benk, lag)}
          >
            + Omriss
          </button>
        </div>
      )}
    </li>
  );
}

export function Lagpanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  // layers start open, new ones too; this remembers the ones the user closed
  const [lukket, settLukket] = useState<Set<string>>(() => new Set());
  const aktiv = t.utvalg.lag;
  const indeks = t.dok.lag.findIndex((l) => l.id === aktiv);

  const [meny, settMeny] = useState(false);
  const svgfil = useRef<HTMLInputElement>(null);
  const svgrolle = useRef<Svgrolle>('ramme');
  const apneNytt = (id: string) =>
    settLukket((a) => {
      const n = new Set(a);
      n.delete(id);
      return n;
    });

  const tomt = () => {
    const lag = nyttLag(`Lag ${t.dok.lag.length + 1}`, nesteFarge(t.dok), 1);
    benk.endre({ navn: 'Nytt lag', anvend: (d) => leggTilLag(d, lag, aktiv ?? undefined) });
    benk.velg({ lag: lag.id, objekter: [] });
    apneNytt(lag.id);
    benk.melde(`${lag.navn} er lagt til over det valgte laget.`);
  };
  const velg = (gjor: () => void) => {
    settMeny(false);
    gjor();
    const ny = benk.tilstand.utvalg.lag;
    if (ny) apneNytt(ny);
  };
  // dragging in the layers panel (Sivert, 2026-10-05): an object or a layer onto a layer, or an
  // object out of its group
  const [dra, settDraTilstand] = useState<Dra | null>(null);
  const [over, settOver] = useState<string | null>(null);
  const kan = (lag: Lag): boolean => {
    if (!dra || lag.last) return false;
    if (dra.type === 'objekt') {
      const o = t.dok.objekter[dra.id];
      return !!o && o.lagId !== lag.id && kanLiggeI(o, lag);
    }
    return dra.id !== lag.id && objekterILag(t.dok, dra.id).some((o) => !o.last && kanLiggeI(o, lag));
  };
  const start = (d: Dra, e: DragEvent) => {
    e.stopPropagation();
    e.dataTransfer?.setData('text/plain', d.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    // changing the DOM inside dragstart can cancel the drag
    requestAnimationFrame(() => settDraTilstand(d));
  };
  const slutt = () => {
    settDraTilstand(null);
    settOver(null);
  };
  const slipp = (lagId: string) => {
    const d = dra;
    slutt();
    if (!d) return;
    const mal = finnLag(benk.dok, lagId);
    const r =
      d.type === 'objekt' ? flyttObjekterInnI(benk.dok, [d.id], lagId) : flyttLagInnI(benk.dok, d.id, lagId);
    if (!r.flyttet.length || !mal) {
      benk.melde('Det kan ikke legges i det laget.');
      return;
    }
    benk.endre({
      navn: d.type === 'objekt' ? 'Flytt til lag' : 'Flytt lag inn i lag',
      anvend: (dok: Dokument) =>
        (d.type === 'objekt' ? flyttObjekterInnI(dok, [d.id], lagId) : flyttLagInnI(dok, d.id, lagId)).dok,
    });
    benk.velg({ lag: lagId, objekter: r.flyttet });
    apneNytt(lagId);
    benk.melde(
      mal.tekstlag
        ? `Flyttet til «${mal.navn}». Det får samme omriss som resten av gruppen.`
        : `Flyttet til «${mal.navn}».`,
    );
  };
  const slippUt = () => {
    const d = dra;
    slutt();
    if (d?.type !== 'objekt') return;
    let ny: string | null = null;
    benk.endre({
      navn: 'Løs ut av gruppen',
      anvend: (dok: Dokument) => {
        const r = losUtObjekt(dok, d.id);
        ny = r.lagId;
        return r.dok;
      },
    });
    if (ny) {
      benk.velg({ lag: ny, objekter: [d.id] });
      apneNytt(ny);
      benk.melde('Tatt ut av gruppen og lagt i et eget lag.');
    }
  };
  const draObjekt = dra?.type === 'objekt' ? t.dok.objekter[dra.id] : undefined;
  const kanLosesUt =
    !!draObjekt &&
    !!finnLag(t.dok, draObjekt.lagId)?.tekstlag &&
    (t.dok.rekkefolge[draObjekt.lagId]?.length ?? 0) > 1 &&
    draObjekt.kilde.type !== 'form';
  const [omdop, settOmdop] = useState<string | null>(null);
  const [lagmeny, settLagmeny] = useState<{ lagId: string; x: number; y: number } | null>(null);
  const lukkMeny = () => settLagmeny(null);
  const dnd: Dnd = {
    dra,
    start,
    slutt,
    over,
    settOver,
    kan,
    slipp,
    omdop,
    ferdigOmdop: () => settOmdop(null),
    apneMeny: (lagId, x, y) => settLagmeny({ lagId, x, y }),
    startOmdop: settOmdop,
  };
  const menyLag = lagmeny ? finnLag(t.dok, lagmeny.lagId) : undefined;
  const menyIndeks = menyLag ? t.dok.lag.findIndex((l) => l.id === menyLag.id) : -1;
  const menyValg: MenyValg[] = menyLag
    ? [
        {
          id: 'navn',
          navn: 'Gi nytt navn',
          ikon: 'properties',
          av: menyLag.last,
          gjor: () => settOmdop(menyLag.id),
        },
        {
          id: 'profil',
          navn: 'Rediger profil …',
          ikon: 'width',
          gjor: () => {
            benk.velg({ lag: menyLag.id, objekter: [] });
            benk.kommando('panel:profil');
          },
        },
        {
          id: 'dupliser',
          navn: 'Dupliser',
          ikon: 'duplicate',
          gjor: () => {
            let ny = menyLag.id;
            benk.endre({
              navn: 'Dupliser lag',
              anvend: (d) => {
                const r = dupliserLag(d, menyLag.id);
                ny = r.nyId;
                return r.dok;
              },
            });
            benk.velg({ lag: ny, objekter: [] });
          },
        },
        {
          id: 'synlig',
          navn: menyLag.synlig ? 'Skjul' : 'Vis',
          ikon: 'visible',
          gjor: () =>
            benk.endre({
              navn: menyLag.synlig ? 'Skjul lag' : 'Vis lag',
              anvend: (d) => oppdaterLag(d, menyLag.id, { synlig: !menyLag.synlig }),
            }),
        },
        {
          id: 'las',
          navn: menyLag.last ? 'Lås opp' : 'Lås',
          ikon: menyLag.last ? 'unlock' : 'lock',
          gjor: () =>
            benk.endre({
              navn: menyLag.last ? 'Lås opp lag' : 'Lås lag',
              anvend: (d) => oppdaterLag(d, menyLag.id, { last: !menyLag.last }),
            }),
        },
        {
          id: 'opp',
          navn: 'Flytt opp',
          ikon: 'bring-forward',
          av: menyIndeks >= t.dok.lag.length - 1,
          gjor: () => benk.endre({ navn: 'Flytt lag opp', anvend: (d) => flyttLag(d, menyLag.id, 1) }),
        },
        {
          id: 'ned',
          navn: 'Flytt ned',
          ikon: 'send-backward',
          av: menyIndeks <= 0,
          gjor: () => benk.endre({ navn: 'Flytt lag ned', anvend: (d) => flyttLag(d, menyLag.id, -1) }),
        },
        {
          id: 'slett',
          navn: 'Slett',
          ikon: 'delete',
          farlig: true,
          av: t.dok.lag.length <= 1,
          gjor: () => {
            benk.endre({ navn: 'Slett lag', anvend: (d) => slettLag(d, menyLag.id) });
            benk.melde(`Laget «${menyLag.navn}» er slettet. Angre med Ctrl+Z.`);
          },
        },
      ]
    : [];

  const svg = (rolle: Svgrolle) => {
    settMeny(false);
    svgrolle.current = rolle;
    svgfil.current?.click();
  };

  return (
    <div class="lagpanel">
      {lagmeny && menyLag && <Lagmeny x={lagmeny.x} y={lagmeny.y} valg={menyValg} lukk={lukkMeny} />}
      <div class="panel">
        <h2 class="panel-tittel">
          <span>Lag, øverst først</span>
          <button
            type="button"
            class="kontroll-knapp"
            aria-expanded={meny}
            aria-controls="nytt-lag-meny"
            onClick={() => settMeny(!meny)}
          >
            + Nytt lag
          </button>
        </h2>
        {meny && (
          <ul id="nytt-lag-meny" class="nytt-lag-meny" role="list">
            <li>
              <button type="button" onClick={() => velg(() => nyttTomtTekstlag(benk))}>
                <strong>Tekstlag</strong>
                <span class="dempet">Et eget lag for tekst, atskilt fra de andre tekstene</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  settMeny(false);
                  signtilstand(benk).sett({ dekor: true });
                }}
              >
                <strong>Dekor fra galleri</strong>
                <span class="dempet">Stjerne, hest, enhjørning og flere, eller din egen vektor</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => velg(() => nyttLagRundtTeksten(benk))}>
                <strong>Rundt teksten</strong>
                <span class="dempet">Under skiltet, formet etter teksten og omrissene</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => svg('ramme')}>
                <strong>SVG som ramme</strong>
                <span class="dempet">En SVG-fil under skiltet, stor nok til å gå rundt det</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => svg('pynt')}>
                <strong>SVG som pynt</strong>
                <span class="dempet">En SVG-fil i et eget lag over det valgte laget</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => velg(tomt)}>
                <strong>Tomt lag</strong>
                <span class="dempet">Tegn former i det selv</span>
              </button>
            </li>
          </ul>
        )}
        <input
          ref={svgfil}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f)
              void importerSvgSom(benk, f, svgrolle.current).then(() => {
                const ny = benk.tilstand.utvalg.lag;
                if (ny) apneNytt(ny);
              });
            (e.target as HTMLInputElement).value = '';
          }}
        />
        <ol class="lagliste" role="list">
          {[...t.dok.lag].reverse().map((l) => (
            <Lagrad
              key={l.id}
              benk={benk}
              lag={l}
              apen={!lukket.has(l.id)}
              dnd={dnd}
              veksle={() => {
                const n = new Set(lukket);
                if (n.has(l.id)) n.delete(l.id);
                else n.add(l.id);
                settLukket(n);
              }}
            />
          ))}
        </ol>
        {dra && kanLosesUt && (
          <div
            class={`lag-ut${over === 'ut' ? ' slipp-her' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== 'ut') settOver('ut');
            }}
            onDragLeave={() => settOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              slippUt();
            }}
          >
            Slipp her for å ta det ut av gruppen
          </div>
        )}
        {aktiv && (
          <div class="lagknapper" role="group" aria-label="Valgt lag">
            <button
              type="button"
              class="kontroll-knapp"
              disabled={indeks >= t.dok.lag.length - 1}
              onClick={() => benk.endre({ navn: 'Flytt lag opp', anvend: (d) => flyttLag(d, aktiv, 1) })}
            >
              Flytt opp
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={indeks <= 0}
              onClick={() => benk.endre({ navn: 'Flytt lag ned', anvend: (d) => flyttLag(d, aktiv, -1) })}
            >
              Flytt ned
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() => {
                let ny = aktiv;
                benk.endre({
                  navn: 'Dupliser lag',
                  anvend: (d) => {
                    const r = dupliserLag(d, aktiv);
                    ny = r.nyId;
                    return r.dok;
                  },
                });
                benk.velg({ lag: ny, objekter: [] });
              }}
            >
              Dupliser
            </button>
            <button
              type="button"
              class="kontroll-knapp farlig"
              disabled={t.dok.lag.length <= 1}
              onClick={() => {
                const navn = t.dok.lag[indeks]?.navn;
                benk.endre({ navn: 'Slett lag', anvend: (d) => slettLag(d, aktiv) });
                benk.melde(`Laget «${navn}» er slettet. Angre med Ctrl+Z.`);
              }}
            >
              Slett
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
