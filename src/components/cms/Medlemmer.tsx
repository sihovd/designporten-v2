/**
 * The member register and the public sign gallery, for administrators
 * (Sivert, 2026-10-16): who has an account, their plan and payment state,
 * and the shared signs, each of which can be hidden from the gallery.
 */
import { useEffect, useState } from 'preact/hooks';
import { cmsCsrf } from '@/lib/cms/api';
import { konto, type DeltSkilt, type Medlem } from '@/lib/konto/api';
import { BETALINGSMERKNAD, BETALINGSTEKST, TJENESTER } from '@/lib/konto/tjenester';

type Rad = Medlem & { antallSkilt: number; aktiv: boolean };

const dato = (v: string | null) =>
  v ? new Date(v).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const BETALINGSSTATUS: Record<Medlem['betaling']['status'], string> = {
  ingen: 'Ingen betaling',
  aktiv: 'Betalt',
  utlopt: 'Utløpt',
  avbrutt: 'Avbrutt',
};

export function Medlemmer() {
  const [register, settRegister] = useState<{ medlemmer: Rad[]; antall: number; gjesteskilt: number } | null>(
    null,
  );
  const [skilt, settSkilt] = useState<DeltSkilt[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [sok, settSok] = useState('');

  const hent = () =>
    Promise.all([konto.admin.medlemmer(), konto.admin.skilt()])
      .then(([m, s]) => {
        settRegister(m);
        settSkilt(s.skilt);
      })
      .catch((e: unknown) => settFeil(e instanceof Error ? e.message : 'Kunne ikke hente registeret.'));
  useEffect(() => void hent(), []);

  const skjul = async (s: DeltSkilt) => {
    try {
      await konto.admin.skjul(s.id, !s.skjult, cmsCsrf());
      await hent();
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Kunne ikke endre skiltet.');
    }
  };

  const filter = sok.trim().toLowerCase();
  const synlige = (register?.medlemmer ?? []).filter(
    (m) => !filter || m.navn.toLowerCase().includes(filter) || m.epost.includes(filter),
  );

  return (
    <>
      <section aria-labelledby="cms-medlemmer">
        <h2 id="cms-medlemmer">Medlemsregister</h2>
        <p class="cms__dempet">
          {register
            ? `${register.antall} ${register.antall === 1 ? 'medlem' : 'medlemmer'} · ${register.gjesteskilt} skilt delt uten konto. `
            : ''}
          {BETALINGSMERKNAD}{' '}
          {Object.values(TJENESTER)
            .map((t) => `${t.navn}: ${BETALINGSTEKST[t.betaling].toLowerCase()}`)
            .join(' · ')}
          .
        </p>
        {feil && (
          <p class="cms__melding cms__melding--feil" role="alert">
            {feil}
          </p>
        )}
        <label class="cms__felt cms__felt--sok">
          Søk etter navn eller e-post
          <input type="search" value={sok} onInput={(e) => settSok((e.target as HTMLInputElement).value)} />
        </label>
        {!register && !feil && <p class="cms__dempet">Henter …</p>}
        {register && synlige.length === 0 && <p class="cms__dempet">Ingen medlemmer ennå.</p>}
        <ul class="cms__liste">
          {synlige.map((m) => (
            <li key={m.id} class="cms__rad">
              <div class="cms__radhode">
                <span class="cms__feltnavn">
                  {m.navn} <span class="cms__dempet">· {m.epost}</span>
                </span>
                <span class="cms__merke">
                  {m.plan === 'gratis' ? 'Gratis' : m.plan} · {BETALINGSSTATUS[m.betaling.status]}
                  {!m.aktiv && ' · sperret'}
                </span>
              </div>
              <p class="cms__dempet">
                Medlem siden {dato(m.opprettet)} · sist innlogget {dato(m.sistInne)} · {m.antallSkilt} delte
                skilt
                {m.betaling.leverandor && ` · betaler med ${m.betaling.leverandor}`}
                {m.betaling.betaltTil && ` · betalt til ${dato(m.betaling.betaltTil)}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cms-skiltgalleri">
        <h2 id="cms-skiltgalleri">Skiltgalleriet «Nylig laget»</h2>
        <p class="cms__dempet">
          Alle skilt som lastes ned eller bestilles fra Sign Forge, deles her. Skjul et skilt som ikke skal
          vises offentlig; det kan vises igjen senere.
        </p>
        {skilt?.length === 0 && <p class="cms__dempet">Ingen skilt er delt ennå.</p>}
        <ul class="cms__liste">
          {(skilt ?? []).map((s) => (
            <li key={s.id} class={`cms__rad ${s.skjult ? 'cms__rad--utkast' : ''}`}>
              <div class="cms__radhode">
                <span class="cms__feltnavn">
                  {s.bilde && !s.skjult && (
                    <img class="cms__skiltbilde" src={s.bilde} alt="" width="48" height="36" />
                  )}
                  {s.tittel} <span class="cms__dempet">· {s.skaper}</span>
                </span>
                <span class={`cms__merke ${s.skjult ? 'cms__merke--utkast' : 'cms__merke--publisert'}`}>
                  {s.skjult ? 'Skjult' : 'Vises'}
                </span>
              </div>
              <p class="cms__dempet">
                Delt {dato(s.opprettet)} · endret {dato(s.endret)} · brukt som mal {s.gangerBrukt} ganger
              </p>
              <button type="button" class="cms__knapp" onClick={() => void skjul(s)}>
                {s.skjult ? 'Vis i galleriet' : 'Skjul fra galleriet'}
                <span class="visuelt-skjult"> {s.tittel}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
