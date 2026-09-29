/**
 * Light source selection and the fitting mode for light modules (Sivert,
 * 2026-09-29, items 59–60). Basic controls are visible; the engineering
 * details sit under «Avansert passform». Every product number shows how
 * sure we are of it, and unproven fits say «Ikke fysisk verifisert».
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { mm } from '../../core/enheter';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { endreLampe } from './handlinger';
import { brukLys, lys } from './lys';
import {
  KLEMKANT_HOYDE,
  TILPASNING_GRENSER as G,
  festenavn,
  holderHull,
  lyskilder,
  maskinvare,
  modulStorrelse,
  sikkerhetTekst,
  standardTilpasning,
  utenLyskilde,
  type Festemetode,
  type Maal,
  type SokkelId,
  type Tilpasning,
} from './maskinvare';
import type { LampeParametre } from './parametre';

type TallNokkel = {
  [K in keyof Tilpasning]: Tilpasning[K] extends number | null ? K : never;
}[keyof Tilpasning];

function Maalrad({ navn, maal, egen }: { navn: string; maal: Maal; egen?: number | null }) {
  const verdi = egen ?? maal.verdi;
  return (
    <div>
      <dt>{navn}</dt>
      <dd>
        <span class="mono">{verdi === null ? 'Ikke oppgitt' : mm(verdi, 1)}</span>
        <span class="lampe-sikkerhet">{egen != null ? 'Ditt mål' : sikkerhetTekst[maal.sikkerhet]}</span>
      </dd>
    </div>
  );
}

export function Lyskildepanel({ benk, p }: { benk: Arbeidsbenk; p: LampeParametre }) {
  const lysT = brukLys();
  const hw = maskinvare[p.sokkel];
  const t = p.tilpasning;

  const tilp = (navn: string, nokkel: TallNokkel) => (v: number, kilde: 'skriv' | 'pil') =>
    endreLampe(
      benk,
      navn,
      (x) => ({ tilpasning: { ...x.tilpasning, [nokkel]: v } }),
      kilde === 'pil' ? `lampe-tilpasning-${nokkel}` : undefined,
    );
  const settTilpasning = (navn: string, endring: Partial<Tilpasning>) =>
    endreLampe(benk, navn, (x) => ({ tilpasning: { ...x.tilpasning, ...endring } }));

  const velg = (id: SokkelId) =>
    endreLampe(benk, `Lyskilde: ${maskinvare[id].navn}`, (x) => ({
      sokkel: id,
      // Size overrides belong to one module; the fit settings carry over.
      tilpasning: {
        ...x.tilpasning,
        modulDiameter: null,
        modulHoyde: null,
        holderHull: null,
        provebit: false,
      },
    }));

  const velgFeste = (f: Festemetode) =>
    endreLampe(benk, `Feste: ${festenavn[f]}`, (x) => {
      const s = modulStorrelse(x.sokkel, x.tilpasning);
      const fordypning =
        f === 'klemkant' && s
          ? Math.max(x.tilpasning.fordypning, s.hoyde + KLEMKANT_HOYDE)
          : standardTilpasning().fordypning;
      return { tilpasning: { ...x.tilpasning, feste: f, fordypning } };
    });

  const storrelse = modulStorrelse(p.sokkel, t);
  const modul = hw.modul;

  return (
    <Panel tittel="Lyskilde">
      <label class="felt stablet" for="lampe-lyskilde">
        <span>Lyskilde</span>
        <select
          id="lampe-lyskilde"
          value={p.sokkel}
          onChange={(e) => velg((e.target as HTMLSelectElement).value as SokkelId)}
        >
          <optgroup label="Med lyskilde">
            {lyskilder.map((id) => (
              <option key={id} value={id}>
                {maskinvare[id].navn}
              </option>
            ))}
          </optgroup>
          <optgroup label="Uten lyskilde">
            {utenLyskilde.map((id) => (
              <option key={id} value={id}>
                {maskinvare[id].navn}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <p class="merknad">{hw.beskrivelse}</p>

      {modul && storrelse && (
        <div class="lampe-tilpasning">
          <p class="lampe-produkt">
            <strong>{hw.id === 'bambu-001' ? 'Bambu Lab Lamp Kit 001' : hw.produktnavn}</strong>
            {!hw.passformVerifisert && <span class="lampe-status">Ikke fysisk verifisert</span>}
          </p>

          {hw.id === 'egendefinert' ? (
            <>
              <TallFelt
                etikett="Moduldiameter"
                verdi={storrelse.diameter}
                min={G.modulDiameter.min}
                maks={G.modulDiameter.maks}
                steg={0.5}
                endre={tilp('Endre moduldiameter', 'modulDiameter')}
              />
              <TallFelt
                etikett="Modulhøyde"
                verdi={storrelse.hoyde}
                min={G.modulHoyde.min}
                maks={G.modulHoyde.maks}
                steg={0.5}
                endre={tilp('Endre modulhøyde', 'modulHoyde')}
              />
            </>
          ) : (
            <dl class="fakta lampe-maal">
              <Maalrad navn="Diameter" maal={modul.ytreDiameter} egen={t.modulDiameter} />
              <Maalrad navn="Høyde" maal={modul.kroppHoyde} egen={t.modulHoyde} />
            </dl>
          )}
          {modul.kroppHoyde.merknad && t.modulHoyde === null && hw.id !== 'egendefinert' && (
            <p class="merknad">{modul.kroppHoyde.merknad}</p>
          )}
          <p class="merknad">Strøm, slik produsenten oppgir den: {modul.elektrisk}</p>

          <Segment
            etikett="Feste"
            valg={modul.festemetoder.map((id) => ({ id, navn: festenavn[id] }))}
            verdi={t.feste}
            endre={velgFeste}
          />
          <p class="merknad">
            {t.feste === 'tape'
              ? 'Modulen står i en grunn fordypning og festes med dobbeltsidig tape i bunnen.'
              : 'Modulen presses ned forbi en smal kant som holder den på plass. Fordypningen blir like dyp som modulen.'}
          </p>
          <TallFelt
            etikett="Fordypning"
            verdi={t.fordypning}
            min={G.fordypning.min}
            maks={G.fordypning.maks}
            steg={0.5}
            endre={tilp('Endre fordypning', 'fordypning')}
          />

          <label class="avkryssing">
            <input
              type="checkbox"
              checked={t.provebit}
              onChange={(e) =>
                settTilpasning((e.target as HTMLInputElement).checked ? 'Vis prøvebit' : 'Vis hele lampen', {
                  provebit: (e.target as HTMLInputElement).checked,
                })
              }
            />
            Lag bare en prøvebit
          </label>
          <p class="merknad">
            En liten ring med fordypningen og kabelføringen. Skriv den ut først og sjekk at modulen passer,
            før du bruker plast på hele lampen.
          </p>
          <label class="avkryssing">
            <input
              type="checkbox"
              checked={lysT.visModul}
              onChange={(e) => lys.sett({ visModul: (e.target as HTMLInputElement).checked })}
            />
            Vis modulen i 3D
          </label>

          <details class="lampe-avansert">
            <summary>Avansert passform</summary>
            <p class="merknad">
              Startverdiene er Designportens forslag. Ingen av dem er testet med en utskrift ennå.
            </p>
            <TallFelt
              etikett="Toleranse"
              verdi={t.toleranse}
              min={G.toleranse.min}
              maks={G.toleranse.maks}
              steg={0.05}
              desimaler={2}
              endre={tilp('Endre toleranse', 'toleranse')}
            />
            {t.feste === 'klemkant' && (
              <TallFelt
                etikett="Klemkant"
                verdi={t.klemkant}
                min={G.klemkant.min}
                maks={G.klemkant.maks}
                steg={0.1}
                endre={tilp('Endre klemkant', 'klemkant')}
              />
            )}
            <TallFelt
              etikett="Kabelhull"
              verdi={t.kabelHull}
              min={G.kabelHull.min}
              maks={G.kabelHull.maks}
              steg={0.5}
              endre={tilp('Endre kabelhull', 'kabelHull')}
            />
            <TallFelt
              etikett="Kabelspor, bredde"
              verdi={t.kabelBredde}
              min={G.kabelBredde.min}
              maks={G.kabelBredde.maks}
              steg={0.5}
              endre={tilp('Endre bredde på kabelsporet', 'kabelBredde')}
            />
            <TallFelt
              etikett="Kabelspor, høyde"
              verdi={t.kabelHoyde}
              min={G.kabelHoyde.min}
              maks={G.kabelHoyde.maks}
              steg={0.5}
              endre={tilp('Endre høyde på kabelsporet', 'kabelHoyde')}
            />
            <TallFelt
              etikett="Bunn over sporet"
              verdi={t.gulv}
              min={G.gulv.min}
              maks={G.gulv.maks}
              steg={0.2}
              endre={tilp('Endre bunn over kabelsporet', 'gulv')}
            />
            {hw.id !== 'egendefinert' && (
              <>
                <TallFelt
                  etikett="Målt diameter"
                  verdi={storrelse.diameter}
                  min={G.modulDiameter.min}
                  maks={G.modulDiameter.maks}
                  steg={0.1}
                  endre={tilp('Endre moduldiameter', 'modulDiameter')}
                />
                <TallFelt
                  etikett="Målt høyde"
                  verdi={storrelse.hoyde}
                  min={G.modulHoyde.min}
                  maks={G.modulHoyde.maks}
                  steg={0.1}
                  endre={tilp('Endre modulhøyde', 'modulHoyde')}
                />
                {(t.modulDiameter !== null || t.modulHoyde !== null) && (
                  <button
                    type="button"
                    class="kontroll-knapp"
                    onClick={() =>
                      settTilpasning('Bruk oppgitte mål', { modulDiameter: null, modulHoyde: null })
                    }
                  >
                    Bruk oppgitte mål
                  </button>
                )}
              </>
            )}
          </details>

          {hw.kilder.length > 0 && (
            <details class="lampe-avansert">
              <summary>Kilder for målene</summary>
              <ul class="lampe-kilder">
                {hw.kilder.map((k) => (
                  <li key={k.url}>
                    <a href={k.url} target="_blank" rel="noopener noreferrer">
                      {k.tittel}
                    </a>
                    <span class="merknad">
                      {' '}
                      Lest {k.lest}. {k.merknad}
                    </span>
                  </li>
                ))}
              </ul>
              {modul.innhold && <p class="merknad">Innhold i settet: {modul.innhold}</p>}
            </details>
          )}
        </div>
      )}

      {hw.type === 'holder' && hw.hullDiameter && (
        <>
          <TallFelt
            etikett="Hull til holderen"
            verdi={holderHull(p.sokkel, t) ?? 0}
            min={G.holderHull.min}
            maks={G.holderHull.maks}
            steg={0.5}
            endre={tilp('Endre hull til holderen', 'holderHull')}
          />
          <p class="merknad">
            {t.holderHull === null
              ? `${mm(hw.hullDiameter.verdi ?? 0, 0)} er et vanlig mål for ${hw.navn}, men ikke bekreftet av Designporten. Mål holderen din og juster hullet.`
              : 'Hullet følger målet du har lagt inn.'}
            {!hw.passformVerifisert && ' Ikke fysisk verifisert.'}
          </p>
          {hw.varme && <p class="merknad">{hw.varme}</p>}
        </>
      )}

      {hw.type !== 'ingen' && (
        <p class="merknad lampe-elektrisk">
          Sjekkene her gjelder bare form og passform. De sier ingenting om elektrisk sikkerhet, og en
          utskrevet lampe blir ikke sertifisert eller godkjent av at den er laget for denne lyskilden.
        </p>
      )}
    </Panel>
  );
}
