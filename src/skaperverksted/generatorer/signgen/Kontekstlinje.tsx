/**
 * The context bar under the workshop bar (Sivert, 2026-10-08): what the active tool, or the selected
 * objects, can do right now. It replaces the old Justér panel (align and distribute are icons here)
 * and holds the small choices of the hole, polygon, Paint and pen tools. Few words, small icons.
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Ikon, type IkonId } from '../../shell/ikoner';
import { Segment, TallFelt } from '../../shell/kontroller';
import { Tips } from '../../shell/Tips';
import { fordel, juster, plateboks, redigerbare } from './handlinger';
import { oppdaterObjekter, ordne } from './dokument';
import { flyttObjektTilValg, lagValgFor } from './objektlag';
import { hjelpelinjerAv } from './hjelpelinjer';
import { justeringGjelder, type Justering, type Justeringsmal } from './justering';
import { Paintvalgbar } from './Strekpanel';
import { HULLFORMER } from './dokument';
import { fullforPenn, pennPagar } from './Pennverktoy';
import { brukSigntilstand, signtilstand } from './tilstand';

function Knapp({
  navn,
  hjelp,
  ikon,
  klikk,
  deaktivert,
  trykket,
}: {
  navn: string;
  hjelp?: string;
  ikon: IkonId;
  klikk: () => void;
  deaktivert?: boolean;
  trykket?: boolean;
}) {
  return (
    <Tips navn={navn} hjelp={hjelp ?? ''} side="under">
      {(p) => (
        <button
          type="button"
          class="ikonknapp kontekstknapp"
          aria-label={navn}
          aria-pressed={trykket}
          disabled={deaktivert}
          onClick={klikk}
          {...p}
        >
          <Ikon id={ikon} storrelse={18} />
        </button>
      )}
    </Tips>
  );
}

type Referanse = 'utvalg' | 'plate' | 'hjelpelinje';

const JUSTERINGER: [Justering, IkonId, string][] = [
  ['venstre', 'juster-venstre', 'Venstre kant'],
  ['midtX', 'juster-midt-x', 'Midt, vannrett'],
  ['hoyre', 'juster-hoyre', 'Høyre kant'],
  ['topp', 'juster-topp', 'Topp'],
  ['midtY', 'juster-midt-y', 'Midt, loddrett'],
  ['bunn', 'juster-bunn', 'Bunn'],
];

/** Align and distribute against the selection, the plate or a guide line (what the Justér panel did). */
function Justeringsknapper({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const antall = redigerbare(benk).length;
  const guider = hjelpelinjerAv(t.dok);
  const valgtGuide = guider.find((g) => g.id === st.valgtGuide);
  const [ref, settRef] = useState<Referanse>('utvalg');
  // «Utvalget» needs two objects; «Linje» needs a chosen guide. Fall back to the plate.
  const gjelder: Referanse =
    ref === 'hjelpelinje' && !valgtGuide ? 'plate' : ref === 'utvalg' && antall < 2 ? 'plate' : ref;
  const mal = (): Justeringsmal | undefined => {
    if (gjelder === 'plate') return { type: 'boks', boks: plateboks(t.dok) };
    if (gjelder === 'hjelpelinje' && valgtGuide)
      return { type: 'linje', akse: valgtGuide.akse, verdi: valgtGuide.verdi };
    return undefined;
  };
  const grenser = (akse: 'x' | 'y') => {
    if (gjelder === 'plate') {
      const p = plateboks(t.dok);
      return akse === 'x' ? { start: p.minX, slutt: p.maksX } : { start: p.minY, slutt: p.maksY };
    }
    if (gjelder === 'hjelpelinje') {
      // between the outermost guides that run across the axis
      const v = guider.filter((g) => g.akse === akse).map((g) => g.verdi);
      return v.length >= 2 ? { start: Math.min(...v), slutt: Math.max(...v) } : null;
    }
    return undefined;
  };
  const gx = grenser('x');
  const gy = grenser('y');
  const m = mal();
  const hint =
    gjelder === 'plate'
      ? 'Mot byggeplaten'
      : gjelder === 'hjelpelinje'
        ? 'Mot den valgte hjelpelinjen'
        : 'Mot de andre valgte objektene';
  return (
    <>
      <div class="kontekst-gruppe" role="group" aria-label="Juster">
        {JUSTERINGER.map(([id, ikon, navn]) => (
          <Knapp
            key={id}
            navn={navn}
            hjelp={hint}
            ikon={ikon}
            deaktivert={!antall || (m ? !justeringGjelder(id, m) : antall < 2)}
            klikk={() => juster(benk, id, m)}
          />
        ))}
      </div>
      <div class="kontekst-gruppe" role="group" aria-label="Fordel">
        <Knapp
          navn="Fordel vannrett"
          hjelp="Like store mellomrom mellom ytterkantene"
          ikon="distribute-horizontal"
          deaktivert={gx === null || antall < (gx ? 2 : 3)}
          klikk={() => fordel(benk, 'x', gx ?? undefined)}
        />
        <Knapp
          navn="Fordel loddrett"
          hjelp="Like store mellomrom mellom ytterkantene"
          ikon="distribute-vertical"
          deaktivert={gy === null || antall < (gy ? 2 : 3)}
          klikk={() => fordel(benk, 'y', gy ?? undefined)}
        />
      </div>
      <Segment<Referanse>
        etikett="Justér mot"
        verdi={gjelder}
        valg={[
          { id: 'utvalg', navn: 'Utvalg' },
          { id: 'plate', navn: 'Plata' },
          { id: 'hjelpelinje', navn: 'Linje' },
        ]}
        endre={settRef}
      />
    </>
  );
}

/** What one selected object can be: which layer it lies in, add or cut, and in front or behind. */
function Objektvalg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const o = redigerbare(benk)[0];
  if (!o || redigerbare(benk).length !== 1) return null;
  const erHull = o.kilde.type === 'form' && o.kilde.form === 'hull';
  const valg = lagValgFor(t.dok, o);
  return (
    <>
      <label class="kontekst-lag">
        <span>Lag</span>
        <select
          aria-label={o.kilde.type === 'tekst' ? 'Tekstlag' : 'Lag eller gruppe'}
          value={o.lagId}
          onChange={(e) => flyttObjektTilValg(benk, o, (e.target as HTMLSelectElement).value)}
        >
          {valg.map((v) => (
            <option key={v.id} value={v.id}>
              {v.navn}
            </option>
          ))}
        </select>
      </label>
      {!erHull && (
        <Segment
          etikett="Rolle i laget"
          valg={[
            { id: 'legg-til', navn: 'Legger til' },
            { id: 'trekk-fra', navn: 'Kutter' },
          ]}
          verdi={o.operasjon}
          endre={(op) =>
            benk.endre({
              navn: op === 'trekk-fra' ? 'Gjør til kutt' : 'Gjør til fyll',
              anvend: (d) => oppdaterObjekter(d, [o.id], (x) => ({ ...x, operasjon: op })),
            })
          }
        />
      )}
      <div class="kontekst-gruppe" role="group" aria-label="Rekkefølge i laget">
        <Knapp
          navn="Fremst i laget"
          ikon="bring-forward"
          klikk={() => benk.endre({ navn: 'Legg fremst', anvend: (d) => ordne(d, o.id, 'fremst') })}
        />
        <Knapp
          navn="Bakerst i laget"
          ikon="send-backward"
          klikk={() => benk.endre({ navn: 'Legg bakerst', anvend: (d) => ordne(d, o.id, 'bakerst') })}
        />
      </div>
    </>
  );
}

function Hint({ children }: { children: string }) {
  return <span class="kontekst-hint">{children}</span>;
}

export function Kontekstlinje({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const lager = signtilstand(benk);
  const t = brukBenk(benk);
  const i2d = t.innstillinger.visning === '2d';
  if (!i2d) return <Hint>3D-visning. Bytt til 2D for å tegne og justere.</Hint>;
  switch (st.verktoy) {
    case 'velg': {
      if (redigerbare(benk).length)
        return (
          <>
            <Justeringsknapper benk={benk} />
            <Objektvalg benk={benk} />
          </>
        );
      return <Hint>Velg noe på lerretet for å justere det, eller et verktøy til venstre.</Hint>;
    }
    case 'tekst':
      return <Hint>Klikk på lerretet for å skrive.</Hint>;
    case 'rektangel':
    case 'ellipse':
      return <Hint>Dra for å tegne. Hold Shift for like sider.</Hint>;
    case 'trekant':
      return <Hint>Dra for å tegne. Musehjulet gir flere sider mens du drar.</Hint>;
    case 'polygon':
      return (
        <>
          <TallFelt
            etikett="Antall sider"
            kortEtikett="Sider"
            enhet=""
            desimaler={0}
            verdi={st.formSider}
            min={3}
            maks={24}
            steg={1}
            endre={(v) => lager.sett({ formSider: Math.round(v) })}
          />
          <Hint>Dra for å tegne. Musehjulet endrer sidene mens du drar.</Hint>
        </>
      );
    case 'hull':
      return (
        <>
          <div class="kontekst-gruppe" role="radiogroup" aria-label="Form på hullet">
            {HULLFORMER.map((f) => (
              <Tips key={f.id} navn={f.navn} hjelp="Formen på neste hull" side="under">
                {(p) => (
                  <button
                    type="button"
                    role="radio"
                    class="ikonknapp kontekstknapp"
                    aria-label={f.navn}
                    aria-checked={st.hullform === f.id}
                    onClick={() => lager.sett({ hullform: f.id })}
                    {...p}
                  >
                    <Ikon id={f.ikon} storrelse={18} />
                  </button>
                )}
              </Tips>
            ))}
          </div>
          <Hint>Klikk på skiltet. Utenfor kanten blir hullet et øye til nøkkelring.</Hint>
        </>
      );
    case 'penn': {
      const antall = lager.t.penn?.bane?.noder.length ?? 0;
      return (
        <>
          <div class="kontekst-gruppe" role="group" aria-label="Fullfør banen">
            <Knapp
              navn="Lukk bane"
              hjelp="Binder siste punkt til det første"
              ikon="path-close"
              deaktivert={antall < 3}
              klikk={() => fullforPenn(benk, true)}
            />
            <Knapp
              navn="Fullfør åpen bane"
              hjelp="Enter"
              ikon="path-finish"
              deaktivert={antall < 3}
              klikk={() => fullforPenn(benk, false)}
            />
            <Knapp
              navn="Ferdig med pennen"
              ikon="select"
              klikk={() => {
                if (pennPagar(benk)) fullforPenn(benk, false);
                lager.sett({ verktoy: 'velg', penn: null });
              }}
            />
          </div>
          <Hint>Klikk for hjørne, dra for kurve.</Hint>
        </>
      );
    }
    case 'paint':
      return <Paintvalgbar benk={benk} />;
    case 'mal':
      return <Hint>Dra for å måle avstanden mellom to punkter.</Hint>;
  }
}
