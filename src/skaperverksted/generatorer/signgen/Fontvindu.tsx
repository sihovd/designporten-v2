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
  filtrerFamilier,
  forhandsvisningUrl,
  hentGoogleFont,
  standardVekt,
  type GoogleFamilie,
} from './googlefonts';
import { valgte } from './handlinger';
import { standardNavn } from './dokument';
import { signtilstand } from './tilstand';

const PER_SIDE = 20;

/** The family name set in the font itself. The preview file loads when the row shows; if it can't, the name stays in the normal font. */
function Forhandsvisning({ familie }: { familie: GoogleFamilie }) {
  const navn = `gfforhand-${familie.id}`;
  const [klar, settKlar] = useState(false);
  useEffect(() => {
    let avbrutt = false;
    settKlar(false);
    if (typeof FontFace === 'undefined') return;
    const ansikt = new FontFace(navn, `url(${forhandsvisningUrl(familie)})`);
    ansikt
      .load()
      .then((f) => {
        if (avbrutt) return;
        document.fonts.add(f);
        settKlar(true);
      })
      .catch(() => {});
    return () => {
      avbrutt = true;
    };
  }, [familie.id]);
  return (
    <span
      class="font-forhandsvisning"
      data-klar={klar}
      aria-hidden="true"
      style={klar ? { fontFamily: `'${navn}', sans-serif` } : undefined}
    >
      {familie.familie}
    </span>
  );
}

export function Fontvindu({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [liste, settListe] = useState<GoogleFamilie[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [sok, settSok] = useState('');
  const [side, settSide] = useState(0);
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
  const alle = liste ? filtrerFamilier(liste, sok) : [];
  const sider = Math.max(1, Math.ceil(alle.length / PER_SIDE));
  const naaSide = Math.min(side, sider - 1);
  const treff = alle.slice(naaSide * PER_SIDE, (naaSide + 1) * PER_SIDE);
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
          Bla i Google Fonts eller søk, og legg fonten til i prosjektet. Filen lagres i prosjektet og i denne
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
            onInput={(e) => {
              settSok((e.target as HTMLInputElement).value);
              settSide(0);
            }}
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
        {liste && (
          <p class="merknad" role="status">
            {alle.length === 0
              ? 'Ingen fonter passer.'
              : alle.length <= PER_SIDE
                ? `${alle.length} fonter.`
                : `Viser ${naaSide * PER_SIDE + 1}–${naaSide * PER_SIDE + treff.length} av ${alle.length} fonter.`}
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
                  <Forhandsvisning familie={f} />
                  <span class="fp-linje">
                    <span class="visuelt-skjult">{f.familie}. </span>
                    <span class="dempet">{[f.kategori, f.lisens].filter(Boolean).join(' · ')}</span>
                  </span>
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
        {liste && alle.length > PER_SIDE && (
          <nav class="fontsider" aria-label="Sider med fonter">
            <button
              type="button"
              class="kontroll-knapp"
              disabled={naaSide === 0}
              onClick={() => settSide(naaSide - 1)}
            >
              Forrige
            </button>
            <span class="dempet">
              Side {naaSide + 1} av {sider}
            </span>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={naaSide >= sider - 1}
              onClick={() => settSide(naaSide + 1)}
            >
              Neste
            </button>
          </nav>
        )}
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
