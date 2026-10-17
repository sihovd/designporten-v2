/**
 * «Publiser i galleriet»: the maker's own choice to show the open sign in
 * «Nylig laget» (Sivert, 2026-10-17). Signed-in members only; the dialog
 * shows the picture the gallery will show and says the text becomes public.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { brukBenk } from '../../shell/bruk-benk';
import { konto, KontoFeil, type Medlem } from '@/lib/konto/api';
import { nettsti } from '@/lib/nettsti';
import {
  DELT_LISENS,
  fjernFraGalleriet,
  publiseringsbilde,
  publiserSkilt,
  tidligerePublisert,
} from './deling';
import { signtilstand } from './tilstand';

type Innlogging = { tilstand: 'henter' } | { tilstand: 'ute' } | { tilstand: 'av'; melding: string } | Medlem;

const feiltekst = (e: unknown) => (e instanceof Error ? e.message : 'ukjent feil');

export function Publiseringsdialog({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [hvem, settHvem] = useState<Innlogging>({ tilstand: 'henter' });
  const [arbeider, settArbeider] = useState(false);
  const [feil, settFeil] = useState<string | null>(null);
  const [ferdig, settFerdig] = useState<string | null>(null);
  const [tidligere, settTidligere] = useState(() => tidligerePublisert(t.dok));
  const bilde = useMemo(() => publiseringsbilde(t.dok), [t.dok]);
  const lukk = () => signtilstand(benk).sett({ malvindu: null });

  useEffect(() => {
    konto
      .meg()
      .then(({ medlem }) => settHvem(medlem ?? { tilstand: 'ute' }))
      .catch((e: unknown) => settHvem({ tilstand: 'av', melding: feiltekst(e) }));
  }, []);

  const publiser = async () => {
    settArbeider(true);
    settFeil(null);
    try {
      const { ny } = await publiserSkilt(t.dok);
      const tekst = ny ? 'Skiltet er publisert i «Nylig laget».' : 'Skiltet er oppdatert i «Nylig laget».';
      settFerdig(tekst);
      settTidligere(tidligerePublisert(t.dok));
      benk.melde(tekst);
    } catch (e) {
      if (e instanceof KontoFeil && e.status === 401) settHvem({ tilstand: 'ute' });
      settFeil(`Skiltet ble ikke publisert: ${feiltekst(e)}`);
    } finally {
      settArbeider(false);
    }
  };

  const fjern = async () => {
    settArbeider(true);
    settFeil(null);
    try {
      await fjernFraGalleriet(t.dok);
      settTidligere(null);
      settFerdig('Skiltet er fjernet fra «Nylig laget».');
      benk.melde('Skiltet er fjernet fra galleriet.');
    } catch (e) {
      settFeil(`Skiltet ble ikke fjernet: ${feiltekst(e)}`);
    } finally {
      settArbeider(false);
    }
  };

  return (
    <Dialog tittel="Publiser i galleriet" lukk={lukk} klasse="publiseringsdialog">
      <div class="malvindu-innhold">
        <p>
          Skiltene dine er private. Publiserer du dette, blir det synlig for alle i «Nylig laget» med navnet
          ditt, og andre kan bruke det som mal. Teksten på skiltet vises, så tenk over navn og adresser.
        </p>
        <figure class="publisering-bilde">
          {bilde ? (
            <img src={bilde} alt={`Forhåndsbilde av skiltet «${t.dok.navn}» slik galleriet viser det`} />
          ) : (
            <p class="dempet">Skiltet er tomt, så det er ikke noe å vise.</p>
          )}
          <figcaption class="dempet">
            {t.dok.navn} · lisens: {DELT_LISENS}
          </figcaption>
        </figure>

        {'tilstand' in hvem && hvem.tilstand === 'henter' && (
          <p class="dempet" role="status">
            Sjekker om du er logget inn …
          </p>
        )}
        {'tilstand' in hvem && hvem.tilstand === 'av' && (
          <p class="merknad" role="alert">
            {hvem.melding}
          </p>
        )}
        {'tilstand' in hvem && hvem.tilstand === 'ute' && (
          <p class="merknad">
            Du må være logget inn for å publisere.{' '}
            <a href={nettsti('/konto/')} target="_blank" rel="noopener">
              Logg inn eller lag en konto (åpnes i ny fane)
            </a>
            , og velg Publiser i galleriet igjen. Skiltet ligger lagret i denne nettleseren imens.
          </p>
        )}
        {'id' in hvem && (
          <p class="dempet">
            Publiseres som <strong>{hvem.navn}</strong>.
            {tidligere && ' Skiltet er publisert fra før; publiserer du igjen, oppdateres det i galleriet.'}
          </p>
        )}

        {feil && (
          <p class="merknad" role="alert">
            {feil}
          </p>
        )}
        {ferdig && (
          <p class="merknad" role="status">
            {ferdig}
          </p>
        )}

        <div class="knapperad">
          {'id' in hvem && (
            <button
              type="button"
              class="primar"
              disabled={arbeider || !bilde}
              onClick={() => void publiser()}
            >
              {tidligere ? 'Oppdater i galleriet' : 'Publiser'}
            </button>
          )}
          {tidligere && (
            <button type="button" class="sekundar" disabled={arbeider} onClick={() => void fjern()}>
              Fjern fra galleriet
            </button>
          )}
          <button type="button" class="sekundar" onClick={lukk}>
            {ferdig ? 'Lukk' : 'Avbryt'}
          </button>
        </div>
        <p class="merknad">
          Nedlasting og handlekurven deler ingenting. Du kan fjerne skiltet igjen her eller under Min konto.
        </p>
      </div>
    </Dialog>
  );
}
