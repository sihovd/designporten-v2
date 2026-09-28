/**
 * Lamp inspector: precise numeric control of everything the 3D handles do,
 * plus pattern, wall, base, material, preview light and printability.
 */
import { useMemo } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { mm, tall } from '../../core/enheter';
import { finnMateriale, materialer, materialtyper, type Materialtype } from '../../core/materialer';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { lagForm } from './form';
import { endreLampe } from './handlinger';
import { brukLys, lys } from './lys';
import { vurderingFor } from './modell';
import {
  GRENSER,
  monsternavn,
  normaliser,
  silhuettForhandsvalg,
  silhuettnavn,
  sokler,
  type LampeParametre,
  type Monstertype,
  type Silhuettvalg,
  type SokkelId,
} from './parametre';
import { Silhuettredigerer } from './Silhuettredigerer';

const antallEtikett: Record<Monstertype, string> = {
  glatt: 'Antall',
  ribber: 'Antall ribber',
  bolger: 'Antall bølger',
  fasetter: 'Antall fasetter',
  diamant: 'Antall ruter rundt',
};

export function LampeInspektor({ benk }: { benk: Arbeidsbenk }) {
  const parametre = brukUtdrag(benk, (t) => t.dok.parametre);
  const modell = brukUtdrag(benk, (t) => t.modell);
  const p = useMemo(() => normaliser(parametre), [parametre]);
  const form = useMemo(() => lagForm(p), [p]);
  const lysT = brukLys();
  const vurdering = vurderingFor(modell);
  const mat = finnMateriale(p.materialId);
  const sokkel = sokler[p.sokkel];

  /** Numeric field change: arrow steps merge into one undo step per field. */
  const felt =
    <K extends keyof LampeParametre>(navn: string, nokkel: K) =>
    (v: number, kilde: 'skriv' | 'pil') =>
      endreLampe(
        benk,
        navn,
        () => ({ [nokkel]: v }) as Partial<LampeParametre>,
        kilde === 'pil' ? `lampe-${String(nokkel)}` : undefined,
      );
  const monsterFelt = (navn: string, nokkel: 'antall' | 'dybde') => (v: number, kilde: 'skriv' | 'pil') =>
    endreLampe(
      benk,
      navn,
      (x) => ({ monster: { ...x.monster, [nokkel]: v } }),
      kilde === 'pil' ? `lampe-monster-${nokkel}` : undefined,
    );

  const type = p.monster.type;
  const harDybde = type !== 'glatt' && type !== 'fasetter';
  const harVri = type !== 'glatt' && type !== 'bolger';
  const antallGrense = type === 'bolger' ? GRENSER.antallBolger : GRENSER.antall;

  return (
    <>
      <Panel tittel="Form">
        <TallFelt
          etikett="Høyde"
          verdi={p.hoyde}
          min={GRENSER.hoyde.min}
          maks={GRENSER.hoyde.maks}
          desimaler={0}
          endre={felt('Endre høyde', 'hoyde')}
        />
        <TallFelt
          etikett="Diameter øverst"
          verdi={p.diameterTopp}
          min={GRENSER.diameter.min}
          maks={GRENSER.diameter.maks}
          desimaler={1}
          endre={felt('Endre diameter øverst', 'diameterTopp')}
        />
        <TallFelt
          etikett="Diameter nederst"
          verdi={p.diameterBunn}
          min={GRENSER.diameter.min}
          maks={GRENSER.diameter.maks}
          desimaler={1}
          endre={felt('Endre diameter nederst', 'diameterBunn')}
        />
        <div class="felt">
          <span>Silhuett</span>
          <div class="lampe-forhandsvalg" role="group" aria-label="Start fra en silhuett">
            {(Object.keys(silhuettnavn) as Silhuettvalg[]).map((s) => (
              <button
                key={s}
                type="button"
                class="kontroll-knapp"
                onClick={() =>
                  endreLampe(benk, `Silhuett: ${silhuettnavn[s]}`, (x) => ({
                    silhuett: silhuettForhandsvalg(
                      s,
                      Math.max(10, Math.min(x.diameterBunn, x.diameterTopp) * 0.2),
                    ),
                  }))
                }
              >
                {silhuettnavn[s]}
              </button>
            ))}
          </div>
        </div>
        <Silhuettredigerer benk={benk} p={p} form={form} farge={mat.hex} />
        <p class="merknad">Dra punktene her eller direkte på lampen i 3D.</p>
      </Panel>

      <Panel tittel="Mønster">
        <Segment
          etikett="Mønster på veggen"
          valg={(Object.keys(monsternavn) as Monstertype[]).map((id) => ({ id, navn: monsternavn[id] }))}
          verdi={type}
          endre={(v) =>
            endreLampe(benk, `Mønster: ${monsternavn[v]}`, (x) => ({
              monster: {
                ...x.monster,
                type: v,
                antall: v === 'bolger' ? Math.min(x.monster.antall, 8) : x.monster.antall,
              },
            }))
          }
        />
        <div class="lampe-mellomrom" />
        {type !== 'glatt' && (
          <TallFelt
            etikett={antallEtikett[type]}
            verdi={p.monster.antall}
            enhet=""
            min={antallGrense.min}
            maks={antallGrense.maks}
            desimaler={0}
            endre={monsterFelt('Endre antall', 'antall')}
          />
        )}
        {harDybde && (
          <TallFelt
            etikett="Dybde"
            verdi={p.monster.dybde}
            min={GRENSER.dybde.min}
            maks={GRENSER.dybde.maks}
            steg={0.5}
            desimaler={1}
            endre={monsterFelt('Endre mønsterdybde', 'dybde')}
          />
        )}
        {harVri && (
          <>
            <TallFelt
              etikett="Vridning"
              verdi={p.vridning}
              enhet="°"
              min={GRENSER.vridning.min}
              maks={GRENSER.vridning.maks}
              steg={5}
              desimaler={0}
              endre={felt('Vri mønsteret', 'vridning')}
            />
            <label class="felt">
              <span class="visuelt-skjult">Vridning, glidebryter</span>
              <input
                type="range"
                class="lampe-glider"
                min={-360}
                max={360}
                step={5}
                value={Math.max(-360, Math.min(360, p.vridning))}
                onInput={(e) =>
                  endreLampe(
                    benk,
                    'Vri mønsteret',
                    () => ({ vridning: Number((e.target as HTMLInputElement).value) }),
                    'lampe-vri-glider',
                  )
                }
                onChange={() => benk.historikk.avsluttSammenslaing()}
              />
            </label>
          </>
        )}
        {type === 'glatt' && <p class="merknad">Glatt vegg uten mønster.</p>}
      </Panel>

      <Panel tittel="Vegg og bunn">
        <TallFelt
          etikett="Veggtykkelse"
          verdi={p.veggtykkelse}
          min={GRENSER.veggtykkelse.min}
          maks={GRENSER.veggtykkelse.maks}
          steg={0.1}
          desimaler={2}
          endre={felt('Endre veggtykkelse', 'veggtykkelse')}
        />
        <label class="felt" for="lampe-sokkel">
          <span>Bunn</span>
          <select
            id="lampe-sokkel"
            value={p.sokkel}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value as SokkelId;
              endreLampe(benk, `Bunn: ${sokler[v].navn}`, () => ({ sokkel: v }));
            }}
          >
            {Object.values(sokler).map((s) => (
              <option key={s.id} value={s.id}>
                {s.navn}
              </option>
            ))}
          </select>
        </label>
        <p class="merknad">{sokkel.beskrivelse}</p>
        {!sokkel.bekreftet && (
          <p class="merknad">
            Hullet er {mm(sokkel.hullDiameter ?? 0, 0)}, et vanlig mål for {sokkel.navn.toLowerCase()}. Målet
            er ikke bekreftet av Designporten ennå.
          </p>
        )}
        {sokkel.hullDiameter !== null && (
          <TallFelt
            etikett="Bunntykkelse"
            verdi={p.bunnTykkelse}
            min={GRENSER.bunnTykkelse.min}
            maks={GRENSER.bunnTykkelse.maks}
            steg={0.2}
            desimaler={1}
            endre={felt('Endre bunntykkelse', 'bunnTykkelse')}
          />
        )}
      </Panel>

      <Panel tittel="Materiale">
        <label class="felt" for="lampe-materiale">
          <span>Farge</span>
          <span class="materialvalg">
            <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
            <select
              id="lampe-materiale"
              value={p.materialId}
              onChange={(e) => {
                const id = (e.target as HTMLSelectElement).value;
                endreLampe(benk, `Materiale: ${finnMateriale(id).navn}`, () => ({ materialId: id }));
              }}
            >
              {(Object.keys(materialtyper) as Materialtype[]).map((t) => (
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
        <p class="merknad">{materialtyper[mat.type].beskrivelse}</p>
        {!mat.bekreftet && <p class="merknad">Farger og lager er ikke bekreftet av Designporten ennå.</p>}
      </Panel>

      <Panel tittel="Lys">
        <label class="avkryssing">
          <input
            type="checkbox"
            checked={lysT.pa}
            onChange={(e) => lys.sett({ pa: (e.target as HTMLInputElement).checked })}
          />
          Skru på lyset i lampen <kbd>L</kbd>
        </label>
        <label class="avkryssing">
          <input
            type="checkbox"
            checked={lysT.natt}
            onChange={(e) => lys.sett({ natt: (e.target as HTMLInputElement).checked })}
          />
          Kveld i rommet <kbd>N</kbd>
        </label>
        <p class="merknad">
          Lyset gjennom veggen er en tilnærming i nettleseren, ikke en fotografisk gjengivelse.
        </p>
      </Panel>

      <Panel tittel="Utskrift">
        {vurdering ? (
          <>
            <dl class="fakta">
              <div>
                <dt>Vasemodus</dt>
                <dd>{vurdering.vasemodus.mulig ? 'Ja' : 'Nei'}</dd>
              </div>
              <div>
                <dt>Bredeste punkt</dt>
                <dd class="mono">{mm(vurdering.maksDiameter)}</dd>
              </div>
              <div>
                <dt>Brattest vegg</dt>
                <dd class="mono">{tall(vurdering.maksOverheng, 0)}° fra loddrett</dd>
              </div>
            </dl>
            <p class="merknad">{vurdering.vasemodus.grunn}</p>
            {modell && modell.advarsler.length > 0 && (
              <ul class="merknader">
                {modell.advarsler.map((a, i) => (
                  <li key={i} class={a.niva}>
                    {a.tekst}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p class="merknad" role="status">
            Bygger modellen …
          </p>
        )}
      </Panel>
    </>
  );
}
