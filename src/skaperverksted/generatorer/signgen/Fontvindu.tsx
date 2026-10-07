/**
 * Add fonts from Google Fonts (Sivert, 2026-10-06, §20): search the
 * families, pick a weight, add. The font file is saved in this browser's
 * font library and in the project that uses it, so the sign builds offline
 * and opens with the same fonts elsewhere. With one text selected, the font
 * is put on it straight away.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { alleFonter } from '../../geometri/tekst';
import { Dialog } from '../../shell/Dialog';
import { brukBenk } from '../../shell/bruk-benk';
import { oppdaterObjekter } from './dokument';
import { fjernFraBibliotek, hentFontbibliotek, leggTilIBibliotek, synkFonter } from './fontbibliotek';
import {
  hentGoogleFamilier,
  hentGoogleFont,
  soekFamilier,
  standardVekt,
  type GoogleFamilie,
} from './googlefonts';
import { valgte } from './handlinger';
import { standardNavn } from './dokument';
import { signtilstand } from './tilstand';

export function Fontvindu({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [liste, settListe] = useState<GoogleFamilie[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [sok, settSok] = useState('');
  const [vekter, settVekter] = useState<Record<string, number>>({});
  const [jobber, settJobber] = useState<string | null>(null);
  const [melding, settMelding] = useState<string | null>(null);
  const [bibliotek, settBibliotek] = useState(() => hentFontbibliotek());
  const felt = useRef<HTMLInputElement>(null);

  useEffect(() => {
    felt.current?.focus();
    let avbrutt = false;
    hentGoogleFamilier()
      .then((l) => !avbrutt && settListe(l))
      .catch((e: unknown) => {
        if (!avbrutt)
          settFeil(
            e instanceof Error && e.message
              ? `${e.message} Fontene du allerede har lagt til, virker fortsatt uten nett.`
              : 'Kunne ikke nå Google Fonts. Sjekk nettforbindelsen.',
          );
      });
    return () => {
      avbrutt = true;
    };
  }, []);

  const valgtTekst = (() => {
    const v = valgte(benk);
    return v.length === 1 && v[0]!.kilde.type === 'tekst' ? v[0]! : null;
  })();
  const treff = liste ? soekFamilier(liste, sok) : [];
  const brukte = new Set(
    Object.values(t.dok.objekter).flatMap((o) => (o.kilde.type === 'tekst' ? [o.kilde.fontId] : [])),
  );

  const leggTil = async (f: GoogleFamilie) => {
    const vekt = vekter[f.id] ?? standardVekt(f);
    settJobber(f.id);
    settMelding(null);
    try {
      const lagret = leggTilIBibliotek(await hentGoogleFont(f, vekt));
      if (!lagret) {
        settMelding('Fonten ble ikke lagret: nettleseren har ikke plass, eller biblioteket er fullt.');
        return;
      }
      settBibliotek(hentFontbibliotek());
      if (valgtTekst) {
        benk.endre({
          navn: 'Bytt font',
          anvend: (d) =>
            synkFonter(
              oppdaterObjekter(d, [valgtTekst.id], (x) => {
                if (x.kilde.type !== 'tekst') return x;
                const kilde = { ...x.kilde, fontId: lagret.id };
                return { ...x, kilde, navn: x.navn === standardNavn(x.kilde) ? standardNavn(kilde) : x.navn };
              }),
            ),
        });
        settMelding(`«${lagret.navn}» er lagt til og brukt på den valgte teksten.`);
      } else {
        settMelding(`«${lagret.navn}» er lagt til. Velg den i font-listen på en tekst.`);
      }
    } catch (e) {
      settMelding(e instanceof Error ? e.message : 'Fonten kunne ikke hentes.');
    } finally {
      settJobber(null);
    }
  };

  return (
    <Dialog
      tittel="Flere fonter fra Google Fonts"
      lukk={() => signtilstand(benk).sett({ fontvindu: false })}
      klasse="fontvindu"
    >
      <div class="fontvindu-innhold">
        <p class="dempet">
          Søk i Google Fonts og legg til fonten i prosjektet. Filen lagres i prosjektet og i denne
          nettleseren, så skiltet kan bygges uten nett. Google Fonts har åpne lisenser, men sjekk lisensen til
          fonten du velger.
        </p>
        <label class="felt" for="font-sok">
          <span>Søk etter font</span>
          <input
            id="font-sok"
            ref={felt}
            type="search"
            value={sok}
            placeholder="for eksempel Lobster"
            onInput={(e) => settSok((e.target as HTMLInputElement).value)}
          />
        </label>
        {feil && (
          <p class="merknad" role="alert">
            {feil}
          </p>
        )}
        {!feil && !liste && (
          <p class="dempet" role="status">
            Henter fontlisten …
          </p>
        )}
        {liste && sok.trim() && (
          <p class="merknad" role="status">
            {treff.length === 0
              ? 'Ingen fonter passer.'
              : `${treff.length} fonter${treff.length === 40 ? ' (de 40 første)' : ''}.`}
          </p>
        )}
        <ul class="registerliste fontliste" role="list" aria-label="Søkeresultat">
          {treff.map((f) => {
            const vekt = vekter[f.id] ?? standardVekt(f);
            const id = `gf-${f.id}-${vekt}`;
            const har = alleFonter().some((x) => x.id === id);
            return (
              <li key={f.id}>
                <span class="fp-tekst">
                  {f.familie}
                  <span class="dempet fp-linje">{[f.kategori, f.lisens].filter(Boolean).join(' · ')}</span>
                </span>
                <label class="visuelt-skjult" for={`vekt-${f.id}`}>
                  Tykkelse for {f.familie}
                </label>
                <select
                  id={`vekt-${f.id}`}
                  value={vekt}
                  onChange={(e) =>
                    settVekter({ ...vekter, [f.id]: Number((e.target as HTMLSelectElement).value) })
                  }
                >
                  {f.vekter.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  class="kontroll-knapp"
                  disabled={jobber !== null}
                  onClick={() => void leggTil(f)}
                >
                  {jobber === f.id ? 'Henter …' : har ? 'Bruk' : valgtTekst ? 'Legg til og bruk' : 'Legg til'}
                  <span class="visuelt-skjult">
                    {' '}
                    {f.familie} {vekt}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {melding && (
          <p class="merknad" role="status">
            {melding}
          </p>
        )}

        <h3 class="underoverskrift" id="font-bibliotek">
          Mine fonter ({bibliotek.length})
        </h3>
        {bibliotek.length === 0 ? (
          <p class="dempet">Ingen ennå.</p>
        ) : (
          <ul class="registerliste" role="list" aria-labelledby="font-bibliotek">
            {bibliotek.map((f) => (
              <li key={f.id}>
                <span class="fp-tekst">
                  {f.navn}
                  <span class="dempet fp-linje">
                    {[f.kategori, brukte.has(f.id) ? 'i bruk' : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button
                  type="button"
                  class="kontroll-knapp"
                  disabled={brukte.has(f.id)}
                  onClick={() => {
                    fjernFraBibliotek(f.id);
                    settBibliotek(hentFontbibliotek());
                  }}
                >
                  Fjern<span class="visuelt-skjult"> {f.navn} fra biblioteket</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
