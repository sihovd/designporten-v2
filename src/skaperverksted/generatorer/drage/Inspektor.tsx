/**
 * Dragon inspector: presets, size, colours per zone, details and the
 * facts about the joints. Every change goes through history.
 */
import { useId } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { mm, tall } from '../../core/enheter';
import {
  finnMateriale,
  materialer,
  materialtyper,
  standardPrinter,
  type Materialtype,
} from '../../core/materialer';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel, TallFelt } from '../../shell/kontroller';
import { mal } from '../../shell/mal';
import { endreDrage, tilfeldig } from './handlinger';
import { leddMal } from './ledd';
import {
  forhandsvalg,
  katalog,
  lesParametre,
  LENGDE_MAKS,
  LENGDE_MIN,
  soner,
  type DrageParametre,
  type Fargesone,
} from './parametre';
import './drage.css';

function Fargevelger({
  sone,
  navn,
  verdi,
  endre,
}: {
  sone: Fargesone;
  navn: string;
  verdi: string;
  endre: (id: string) => void;
}) {
  const id = useId();
  const typer = Object.keys(materialtyper) as Materialtype[];
  return (
    <label class="felt" for={id}>
      <span>{navn}</span>
      <span class="materialvalg">
        <span class="fargeprove" style={{ background: finnMateriale(verdi).hex }} aria-hidden="true" />
        <select
          id={id}
          data-sone={sone}
          value={verdi}
          onChange={(e) => endre((e.target as HTMLSelectElement).value)}
        >
          {typer.map((t) => (
            <optgroup key={t} label={t}>
              {materialer
                .filter((x) => x.type === t)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.navn}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </span>
    </label>
  );
}

function Avkryssing({
  etikett,
  verdi,
  deaktivert,
  endre,
}: {
  etikett: string;
  verdi: boolean;
  deaktivert?: boolean;
  endre: (v: boolean) => void;
}) {
  return (
    <label class="avkryssing">
      <input
        type="checkbox"
        checked={verdi}
        disabled={deaktivert}
        onChange={(e) => endre((e.target as HTMLInputElement).checked)}
      />
      {etikett}
    </label>
  );
}

function overrask(p: DrageParametre): DrageParametre {
  const r = Math.random;
  const farge = () => tilfeldig(materialer, r).id;
  return {
    ...p,
    kropp: tilfeldig(katalog.kropp, r).id,
    hode: tilfeldig(katalog.hode, r).id,
    horn: tilfeldig(katalog.horn, r).id,
    pigger: tilfeldig(katalog.pigger, r).id,
    hale: tilfeldig(katalog.hale, r).id,
    vinger: tilfeldig(katalog.vinger, r).id,
    monster: tilfeldig(katalog.monster, r).id,
    farger: { kropp: farge(), aksent: farge(), vinger: farge(), oyne: p.farger.oyne },
    detaljer: { ...p.detaljer, oyne: tilfeldig(katalog.oyne, r).id },
  };
}

export function DrageInspektor({ benk }: { benk: Arbeidsbenk }) {
  const raa = brukUtdrag(benk, (t) => t.dok.parametre);
  const modell = brukUtdrag(benk, (t) => t.modell);
  const p = lesParametre(raa);
  const ledd = leddMal(p.lengde);
  const m = modell ? mal(modell.deler) : null;
  const stykker = modell ? new Set(modell.deler.map((d) => d.id.split('-')[1])).size : 0;
  const fargeantall = modell ? new Set(modell.deler.map((d) => d.materialId)).size : 0;

  const sett = (navn: string, f: (q: DrageParametre) => DrageParametre, slaSammen?: string) =>
    endreDrage(benk, navn, f, slaSammen);

  return (
    <>
      <Panel tittel="Start fra">
        <div class="drage-forhandsvalg">
          {forhandsvalg.map((f) => (
            <button
              key={f.id}
              type="button"
              class="kontroll-knapp"
              onClick={() => sett(`Forhåndsvalg: ${f.navn}`, (q) => ({ ...f.parametre, lengde: q.lengde }))}
            >
              {f.navn}
            </button>
          ))}
          <button type="button" class="kontroll-knapp" onClick={() => sett('Overrask meg', overrask)}>
            Overrask meg
          </button>
        </div>
      </Panel>

      <Panel tittel="Størrelse">
        <TallFelt
          etikett="Lengde, nese til halespiss"
          verdi={p.lengde}
          min={LENGDE_MIN}
          maks={LENGDE_MAKS}
          steg={5}
          desimaler={0}
          endre={(v, kilde) =>
            sett('Endre lengde', (q) => ({ ...q, lengde: v }), kilde === 'pil' ? 'drage-lengde' : undefined)
          }
        />
        <input
          type="range"
          class="drage-glidebryter"
          aria-label="Lengde i millimeter"
          min={LENGDE_MIN}
          max={LENGDE_MAKS}
          step={5}
          value={p.lengde}
          onInput={(e) =>
            sett(
              'Endre lengde',
              (q) => ({ ...q, lengde: Number((e.target as HTMLInputElement).value) }),
              'drage-lengde',
            )
          }
          onPointerUp={() => benk.historikk.avsluttSammenslaing()}
          onKeyUp={() => benk.historikk.avsluttSammenslaing()}
        />
        <p class="merknad">
          {LENGDE_MIN}–{LENGDE_MAKS} mm. Små drager får færre haleledd, så leddene holder seg sterke.
        </p>
        <dl class="drage-fakta">
          {m && (
            <div>
              <dt>Mål</dt>
              <dd class="mono">
                {tall(m.bredde, 0)} × {tall(m.dybde, 0)} × {tall(m.hoyde, 0)} mm
              </dd>
            </div>
          )}
          {stykker > 0 && (
            <div>
              <dt>Ledd</dt>
              <dd class="mono">
                {stykker - 1} ledd, {stykker} deler
              </dd>
            </div>
          )}
          <div>
            <dt>Klaring</dt>
            <dd class="mono">{mm(ledd.klaring, 2)}</dd>
          </div>
          <div>
            <dt>Bevegelse</dt>
            <dd class="mono">±{tall((ledd.bevegelse * 180) / Math.PI, 0)}° per ledd</dd>
          </div>
        </dl>
        <p class="merknad">
          Dragen printes liggende i ett stykke. Leddene er ferdige når den kommer av platen: bøy forsiktig
          første gang.
        </p>
      </Panel>

      <Panel tittel="Farger">
        {soner.map((s) => (
          <Fargevelger
            key={s.id}
            sone={s.id}
            navn={s.navn}
            verdi={p.farger[s.id]}
            endre={(id) =>
              sett(`${s.navn}: ${finnMateriale(id).navn}`, (q) => ({
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

      <Panel tittel="Detaljer">
        <Avkryssing
          etikett="Bein"
          verdi={p.detaljer.bein}
          endre={(v) =>
            sett(v ? 'Legg til bein' : 'Fjern bein', (q) => ({ ...q, detaljer: { ...q.detaljer, bein: v } }))
          }
        />
        <Avkryssing
          etikett="Klør"
          verdi={p.detaljer.klor}
          deaktivert={!p.detaljer.bein}
          endre={(v) =>
            sett(v ? 'Legg til klør' : 'Fjern klør', (q) => ({ ...q, detaljer: { ...q.detaljer, klor: v } }))
          }
        />
        <Avkryssing
          etikett="Ribber på vingene"
          verdi={p.detaljer.vingeribber}
          deaktivert={p.vinger === 'ingen'}
          endre={(v) =>
            sett(v ? 'Legg til vingeribber' : 'Fjern vingeribber', (q) => ({
              ...q,
              detaljer: { ...q.detaljer, vingeribber: v },
            }))
          }
        />
      </Panel>
    </>
  );
}
