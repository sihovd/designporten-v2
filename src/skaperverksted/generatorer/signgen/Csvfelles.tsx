/**
 * Parts every step of the CSV workflow shares: the step bar, a filament
 * chip, and the way a column connection is written in a menu.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import { fargekode, finnMateriale, visningsnavn } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import type { Kolonnemal } from './batch';
import { CSVSTEG, lesArbeid, lesInstans, nyeFelt, type Csvsteg } from './csvflyt';
import { gaTilSteg, stegNavn, tilMaster } from './csvhandlinger';
import { brukSigntilstand } from './tilstand';

export function kodeKobling(k: Kolonnemal): string {
  return k.type === 'felt' ? `felt:${k.felt}` : k.type === 'farge' ? `farge:${k.lagId}` : k.type;
}

export function dekodKobling(s: string): Kolonnemal {
  const i = s.indexOf(':');
  const type = i < 0 ? s : s.slice(0, i);
  const verdi = i < 0 ? '' : s.slice(i + 1);
  if (type === 'felt') return { type: 'felt', felt: verdi };
  if (type === 'farge') return { type: 'farge', lagId: verdi };
  if (type === 'profil') return { type: 'profil' };
  return { type: 'ingen' };
}

/** Why a step cannot be reached yet, or null when it can. */
export function hvorforIkke(dok: Dokument, steg: Csvsteg): string | null {
  if (lesInstans(dok)) return 'Fullfør skiltet du redigerer først';
  if (steg === 'importer') return null;
  const a = lesArbeid(dok);
  if (!a) return 'Importer en CSV-fil først';
  if (steg === 'koble') return null;
  const designet = a.steg !== 'koble';
  if (steg === 'master')
    return a.kobling.some((k) => k.type !== 'ingen') ? null : 'Koble minst én kolonne først';
  if (!designet) return 'Lag masteren først';
  if (steg === 'rader') return null;
  if (steg === 'generer') return a.valgte.length ? null : 'Velg minst én rad først';
  return a.generert.length ? null : 'Generer skilt først';
}

/** Go to a step from the step bar: the master is made the first time it is reached. */
export async function velgSteg(benk: Arbeidsbenk, steg: Csvsteg): Promise<void> {
  const a = lesArbeid(benk.dok);
  if (steg === 'master' && a && (a.steg === 'koble' || nyeFelt(benk.dok, a.kobling).length)) {
    await tilMaster(benk);
    return;
  }
  gaTilSteg(benk, steg, steg === 'master' || steg === 'rader');
}

/** The steps as a numbered row: the step you are on is marked, the ones you cannot reach yet are dimmed with the reason. */
export function Stegrad({
  benk,
  aktiv,
  kompakt = false,
}: {
  benk: Arbeidsbenk;
  aktiv: Csvsteg;
  kompakt?: boolean;
}) {
  const t = brukBenk(benk);
  return (
    <nav class={`csv-steg${kompakt ? ' kompakt' : ''}`} aria-label="Fra CSV, stegene">
      <ol>
        {CSVSTEG.map((s, i) => {
          const hvorfor = hvorforIkke(t.dok, s.id);
          const na = s.id === aktiv;
          return (
            <li key={s.id}>
              <button
                type="button"
                class="csv-steg-knapp"
                aria-current={na ? 'step' : undefined}
                aria-disabled={hvorfor && !na ? 'true' : undefined}
                title={hvorfor && !na ? hvorfor : s.navn}
                onClick={() => {
                  if (na || hvorfor) return;
                  void velgSteg(benk, s.id);
                }}
              >
                <span class="csv-steg-nr" aria-hidden="true">
                  {i + 1}
                </span>
                <span class="csv-steg-tekst">{s.kort}</span>
                <span class="visuelt-skjult">
                  {`, steg ${i + 1} av ${CSVSTEG.length}: ${s.navn}${na ? ', du er her' : hvorfor ? `, ikke tilgjengelig: ${hvorfor}` : ''}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Previous and next step for the narrow layout. */
export function Stegnavigasjon({ benk, aktiv }: { benk: Arbeidsbenk; aktiv: Csvsteg }) {
  const t = brukBenk(benk);
  const i = CSVSTEG.findIndex((s) => s.id === aktiv);
  const forrige = CSVSTEG[i - 1];
  const neste = CSVSTEG[i + 1];
  const nesteHvorfor = neste ? hvorforIkke(t.dok, neste.id) : 'Siste steg';
  return (
    <div class="csv-stegnav">
      <button
        type="button"
        class="kontroll-knapp"
        disabled={!forrige || !!hvorforIkke(t.dok, forrige.id)}
        onClick={() => forrige && void velgSteg(benk, forrige.id)}
      >
        ← {forrige?.kort ?? 'Start'}
      </button>
      <span class="dempet" aria-hidden="true">
        {i + 1} av {CSVSTEG.length}
      </span>
      <button
        type="button"
        class="kontroll-knapp"
        disabled={!neste || !!nesteHvorfor}
        title={nesteHvorfor ?? undefined}
        onClick={() => neste && void velgSteg(benk, neste.id)}
      >
        {neste?.kort ?? 'Slutt'} →
      </button>
    </div>
  );
}

/** The step on screen, for a heading and for screen readers. */
export function useAktivtSteg(benk: Arbeidsbenk) {
  const st = brukSigntilstand(benk);
  return { steg: st.csv, navn: st.csv ? stegNavn(st.csv) : '' };
}

/** A filament as a swatch and a name, with the AMS slot when it has one. */
export function Filamentchip({ id }: { id: string }) {
  const m = finnMateriale(id);
  return (
    <span class="csv-filament">
      <span class="fargeprove" style={{ background: m.hex }} aria-hidden="true" />
      <span class="mono" title={visningsnavn(m)}>
        {fargekode(m)}
      </span>
      {m.amsPlass ? <span class="dempet mono">AMS {m.amsPlass}</span> : null}
    </span>
  );
}
