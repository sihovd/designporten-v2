/**
 * Properties of the drawn dragon: what is selected (a spine point, a width
 * or height point, a spike or a piece), then the dragon as a whole (pieces,
 * head, tail, colours) and what the check found. Every number the canvas
 * changes by dragging can be typed here too.
 */
import { mm, tall } from '../../../core/enheter';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { finnMateriale, standardPrinter } from '../../../core/materialer';
import { brukUtdrag } from '../../../shell/bruk-benk';
import { Panel, TallFelt } from '../../../shell/kontroller';
import { mal } from '../../../shell/mal';
import { endreDrage } from '../handlinger';
import { Fargevelger } from '../Inspektor';
import { katalog, lesParametre, soner } from '../parametre';
import { endreTegning } from './handlinger';
import {
  DELER_MAKS,
  DELER_MIN,
  elementformer,
  standardTegning,
  type Elementform,
  type Tegning,
} from './modell';
import {
  endreElement,
  flyttPunkt,
  leggTilPigg,
  settProfilpunkt,
  slettElement,
  slettProfilpunkt,
  slettPunkt,
  snu,
} from './operasjoner';
import { MAKS_BOY } from './geometri';
import { brukTegneeditor, gyldigValg, type Tegnelager, type Valg } from './tilstand';
import { brukTegnebilde, type Tegnebilde } from './visning';
import '../drage.css';

const grader = (r: number) => `${tall((Math.abs(r) * 180) / Math.PI, 0)}°`;
const retning = (r: number) => (Math.abs(r) < 0.5 * (Math.PI / 180) ? 'rett' : `bøyd ${grader(r)}`);

function Valgfelt<T extends string>({
  etikett,
  verdi,
  liste,
  endre,
}: {
  etikett: string;
  verdi: T;
  liste: readonly { id: T; navn: string }[];
  endre: (v: T) => void;
}) {
  return (
    <label class="felt">
      <span>{etikett}</span>
      <select value={verdi} onChange={(e) => endre((e.target as HTMLSelectElement).value as T)}>
        {liste.map((v) => (
          <option key={v.id} value={v.id}>
            {v.navn}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Delete what is selected, if it can be. Shared with the Delete key. */
export function slettValgt(benk: Arbeidsbenk, t: Tegning, v: Valg, lager: Tegnelager): boolean {
  if (!v) return false;
  if (v.type === 'punkt') {
    if (t.rygg.length <= 2) {
      benk.melde('Ryggen trenger minst to punkter.');
      return true;
    }
    endreTegning(benk, 'Slett ryggpunkt', (q) => slettPunkt(q, v.i));
  } else if (v.type === 'bredde' || v.type === 'hoyde') {
    if (t[v.type].length <= 1) {
      benk.melde('Det må være minst ett punkt igjen.');
      return true;
    }
    endreTegning(benk, v.type === 'bredde' ? 'Slett breddepunkt' : 'Slett høydepunkt', (q) =>
      slettProfilpunkt(q, v.type as 'bredde' | 'hoyde', v.i),
    );
  } else if (v.type === 'element') {
    endreTegning(benk, 'Fjern pigg', (q) => slettElement(q, v.id));
  } else return false;
  lager.sett({ valgt: null });
  benk.melde('Slettet.');
  return true;
}

function Utvalg({
  benk,
  bilde,
  v,
  lager,
}: {
  benk: Arbeidsbenk;
  bilde: Tegnebilde;
  v: Valg;
  lager: Tegnelager;
}) {
  const { tegning: t, oppsett: o } = bilde;
  if (!v) return null;
  const slett = (
    <button type="button" class="kontroll-knapp" onClick={() => slettValgt(benk, t, v, lager)}>
      Slett
    </button>
  );
  if (v.type === 'punkt') {
    const p = t.rygg[v.i]!;
    const navn = v.i === 0 ? 'Nesen' : v.i === t.rygg.length - 1 ? 'Halespissen' : `Ryggpunkt ${v.i + 1}`;
    return (
      <Panel tittel={navn}>
        <TallFelt
          etikett="X"
          verdi={p[0]}
          steg={1}
          desimaler={1}
          endre={(x) => endreTegning(benk, 'Flytt ryggpunkt', (q) => flyttPunkt(q, v.i, [x, p[1]]))}
        />
        <TallFelt
          etikett="Y"
          verdi={p[1]}
          steg={1}
          desimaler={1}
          endre={(y) => endreTegning(benk, 'Flytt ryggpunkt', (q) => flyttPunkt(q, v.i, [p[0], y]))}
        />
        <div class="knapperad">{t.rygg.length > 2 && slett}</div>
      </Panel>
    );
  }
  if (v.type === 'bredde' || v.type === 'hoyde') {
    const navn = v.type;
    const p = t[navn][v.i]!;
    return (
      <Panel tittel={navn === 'bredde' ? `Bredde ${v.i + 1}` : `Høyde ${v.i + 1}`}>
        <TallFelt
          etikett={navn === 'bredde' ? 'Bredde' : 'Høyde'}
          verdi={p.verdi}
          steg={1}
          desimaler={0}
          endre={(x) => endreTegning(benk, 'Endre punkt', (q) => settProfilpunkt(q, navn, v.i, { verdi: x }))}
        />
        <TallFelt
          etikett="Plass bak nesen"
          enhet="%"
          verdi={p.t * 100}
          min={0}
          maks={100}
          steg={1}
          desimaler={0}
          endre={(x) =>
            endreTegning(benk, 'Flytt punkt', (q) => settProfilpunkt(q, navn, v.i, { t: x / 100 }))
          }
        />
        <div class="knapperad">{t[navn].length > 1 && slett}</div>
      </Panel>
    );
  }
  if (v.type === 'element') {
    const el = t.elementer.find((x) => x.id === v.id)!;
    const seg = o.segmenter.find((s) => s.elementer[0] === el.id);
    return (
      <Panel tittel="Pigg">
        <Valgfelt
          etikett="Form"
          verdi={el.form}
          liste={elementformer}
          endre={(f: Elementform) => endreTegning(benk, 'Endre pigg', (q) => endreElement(q, el.id, f))}
        />
        <p class="merknad">
          {seg
            ? `Sitter på ${seg.navn.toLowerCase()}.`
            : 'Vises ikke: delen har allerede en pigg, eller hodet har horn.'}
        </p>
        <div class="knapperad">{slett}</div>
      </Panel>
    );
  }
  const seg = o.segmenter[v.i]!;
  const foran = o.ledd.find((l) => l.indeks === seg.indeks);
  const bak = o.ledd.find((l) => l.indeks === seg.indeks + 1);
  return (
    <Panel tittel={seg.navn}>
      <dl class="drage-fakta">
        <div>
          <dt>Bredde</dt>
          <dd class="mono">
            {mm(seg.bredde, 0)}
            {seg.breddeOkt ? ' (økt for leddet)' : ''}
          </dd>
        </div>
        <div>
          <dt>Høyde</dt>
          <dd class="mono">{mm(seg.hoyde, 0)}</dd>
        </div>
        {seg.indeks > 0 && (
          <div>
            <dt>Mellomrom foran</dt>
            <dd class="mono">{mm(seg.gap, 1)}</dd>
          </div>
        )}
        {foran && (
          <div>
            <dt>Ledd foran</dt>
            <dd class="mono">printes {retning(foran.boy)}</dd>
          </div>
        )}
        {bak && (
          <div>
            <dt>Ledd bak</dt>
            <dd class="mono">printes {retning(bak.boy)}</dd>
          </div>
        )}
      </dl>
      <div class="knapperad">
        {seg.elementer.length ? (
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              endreTegning(benk, 'Fjern pigg', (q) => slettElement(q, seg.elementer[0]!));
              benk.melde(`Piggen på ${seg.navn.toLowerCase()} er fjernet.`);
            }}
          >
            Fjern piggen
          </button>
        ) : (
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              const r = leggTilPigg(t, (seg.s0 + seg.s1) / 2 / o.L, lager.naa.piggform);
              if ('grunn' in r) return benk.melde(r.grunn);
              endreTegning(benk, 'Legg til pigg', () => r.tegning);
              benk.melde(`${seg.navn} har fått en pigg.`);
            }}
          >
            Legg til pigg
          </button>
        )}
      </div>
    </Panel>
  );
}

export function TegneInspektor({ benk }: { benk: Arbeidsbenk }) {
  const bilde = brukTegnebilde(benk);
  const [e, lager] = brukTegneeditor(benk);
  const raa = brukUtdrag(benk, (x) => x.dok.parametre);
  const modell = brukUtdrag(benk, (x) => x.modell);
  const p = lesParametre(raa);
  const { tegning: t, oppsett: o } = bilde;
  const v = gyldigValg(t, e.valgt, o.segmenter.length);
  const m = modell?.deler.length ? mal(modell.deler) : null;
  const fargeantall = modell ? new Set(modell.deler.map((d) => d.materialId)).size : 0;
  const feil = bilde.funn.filter((f) => f.niva === 'feil');
  const advarsler = bilde.funn.filter((f) => f.niva === 'advarsel');
  const sett = (navn: string, f: (q: Tegning) => Tegning) => endreTegning(benk, navn, f);
  const auto = t.antallDeler === null;

  return (
    <>
      <Utvalg benk={benk} bilde={bilde} v={v} lager={lager} />

      {(feil.length > 0 || advarsler.length > 0) && (
        <Panel tittel={feil.length ? 'Må rettes før eksport' : 'Å se på'}>
          <ul class="dt-funn" role="list">
            {[...feil, ...advarsler].map((f, i) => (
              <li key={i} class={f.niva}>
                {f.objektId?.startsWith('deler:') ? (
                  <button
                    type="button"
                    class="dt-funnlenke"
                    onClick={() =>
                      lager.sett({ valgt: { type: 'del', i: Number(f.objektId!.slice(6).split(',')[0]) } })
                    }
                  >
                    {f.tekst}
                  </button>
                ) : (
                  f.tekst
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel tittel="Deler og ledd">
        <label class="avkryssing">
          <input
            type="checkbox"
            checked={auto}
            onChange={(ev) => {
              const pa = (ev.target as HTMLInputElement).checked;
              sett(pa ? 'Automatisk antall deler' : 'Velg antall deler', (q) => ({
                ...q,
                antallDeler: pa ? null : o.segmenter.length || 8,
              }));
            }}
          />
          Velg antall deler automatisk
        </label>
        {!auto && (
          <TallFelt
            etikett="Antall deler"
            enhet=""
            verdi={t.antallDeler ?? o.segmenter.length}
            min={DELER_MIN}
            maks={Math.max(DELER_MIN, Math.min(DELER_MAKS, o.maksDeler))}
            steg={1}
            desimaler={0}
            endre={(x) => sett('Endre antall deler', (q) => ({ ...q, antallDeler: Math.round(x) }))}
          />
        )}
        <dl class="drage-fakta">
          <div>
            <dt>Rygg</dt>
            <dd class="mono">{mm(o.L, 0)}</dd>
          </div>
          <div>
            <dt>Deler</dt>
            <dd class="mono">
              {o.segmenter.length} deler, {o.ledd.length} ledd
            </dd>
          </div>
          {m && (
            <div>
              <dt>Mål</dt>
              <dd class="mono">
                {tall(m.bredde, 0)} × {tall(m.dybde, 0)} × {tall(m.hoyde, 0)} mm
              </dd>
            </div>
          )}
          <div>
            <dt>Klaring</dt>
            <dd class="mono">{mm(o.mal.klaring, 2)}</dd>
          </div>
          <div>
            <dt>Bevegelse</dt>
            <dd class="mono">±{grader(o.mal.bevegelse)} fra printstillingen</dd>
          </div>
          <div>
            <dt>Bøy i printen</dt>
            <dd class="mono">høyst {grader(MAKS_BOY)} per ledd</dd>
          </div>
        </dl>
        <p class="merknad">
          Leddene legges inn der delene møtes, og målene på dem er låst. Dragen printes ferdig koblet i
          stillingen du tegner. Leddene er en prøveprofil som ikke er testet bøyd.
        </p>
        <div class="knapperad">
          <button type="button" class="kontroll-knapp" onClick={() => sett('Snu dragen', snu)}>
            Bytt nese og hale
          </button>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              lager.sett({ verktoy: 'tegn', valgt: null });
              benk.melde('Tegn ryggen i ett strøk, fra nesen til halespissen.');
            }}
          >
            Tegn ny rygg
          </button>
        </div>
      </Panel>

      <Panel tittel="Hode og hale">
        <Valgfelt
          etikett="Hode"
          verdi={t.hode.form}
          liste={katalog.hode}
          endre={(form) => sett('Endre hode', (q) => ({ ...q, hode: { ...q.hode, form } }))}
        />
        <Valgfelt
          etikett="Horn"
          verdi={t.hode.horn}
          liste={katalog.horn}
          endre={(horn) => sett('Endre horn', (q) => ({ ...q, hode: { ...q.hode, horn } }))}
        />
        <Valgfelt
          etikett="Øyne"
          verdi={t.hode.oyne}
          liste={katalog.oyne}
          endre={(oyne) => sett('Endre øyne', (q) => ({ ...q, hode: { ...q.hode, oyne } }))}
        />
        <Valgfelt
          etikett="Haletupp"
          verdi={t.hale}
          liste={katalog.hale}
          endre={(hale) => sett('Endre haletupp', (q) => ({ ...q, hale }))}
        />
      </Panel>

      <Panel tittel="Farger">
        <Valgfelt
          etikett="Mønster"
          verdi={p.monster}
          liste={katalog.monster}
          endre={(monster) => endreDrage(benk, 'Endre mønster', (q) => ({ ...q, monster }))}
        />
        {soner
          .filter((s) => s.id !== 'vinger')
          .map((s) => (
            <Fargevelger
              key={s.id}
              sone={s.id}
              navn={s.navn}
              verdi={p.farger[s.id]}
              endre={(id) =>
                endreDrage(benk, `${s.navn}: ${finnMateriale(id).navn}`, (q) => ({
                  ...q,
                  farger: { ...q.farger, [s.id]: id },
                }))
              }
            />
          ))}
        {fargeantall > standardPrinter.fargerPerPrint && (
          <p class="merknad" role="status">
            Dragen bruker {fargeantall} farger, mer enn {standardPrinter.fargerPerPrint} i samme print.
          </p>
        )}
        <p class="merknad">Farger og skriverprofil er foreløpige og ikke bekreftet av Designporten.</p>
      </Panel>

      <Panel tittel="Start på nytt">
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => {
            sett('Start med standarddragen', () => standardTegning());
            lager.sett({ valgt: null, verktoy: 'juster' });
          }}
        >
          Start med standarddragen
        </button>
      </Panel>
    </>
  );
}
