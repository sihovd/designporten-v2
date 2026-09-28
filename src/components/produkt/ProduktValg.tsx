/**
 * Choices for one product: colour, material (with what it tolerates), optional
 * custom text with a counter, the price for the choices and «Legg i
 * handlekurven». Used in the product window and on the product page, so both
 * behave the same.
 */
import { useId, useState } from 'preact/hooks';
import { formaterKroner, leggTil } from '@/lib/handel/kurv';
import { beregnPris, harTekst, valgTilPoster } from '@/lib/handel/pris';
import type { ProduktVisning } from '@/lib/handel/visning';
import './produktvalg.css';

interface Props {
  produkt: ProduktVisning;
  /** Called after the product was added, e.g. to announce or update the page. */
  vedLagtTil?: () => void;
}

export default function ProduktValg({ produkt: p, vedLagtTil }: Props) {
  const id = useId();
  const [farge, settFarge] = useState(p.farger[0]?.id ?? '');
  const [materiale, settMateriale] = useState(p.materialer[0]?.type ?? '');
  const [tekst, settTekst] = useState('');
  const [lagtTil, settLagtTil] = useState(0);

  const valg = { farge, materiale, tekst };
  const pris = beregnPris(p, valg);
  const valgtFarge = p.farger.find((f) => f.id === farge);
  const valgtMateriale = p.materialer.find((m) => m.type === materiale);

  function send(e: Event) {
    e.preventDefault();
    leggTil({ produktId: p.id, navn: p.navn, antall: 1, enhetspris: pris, valg: valgTilPoster(valg) });
    settLagtTil((n) => n + 1);
    vedLagtTil?.();
  }

  return (
    <form class="produktvalg" onSubmit={send} data-produktvalg>
      <fieldset class="produktvalg__gruppe">
        <legend class="produktvalg__etikett mono">
          Farge <span class="produktvalg__verdi">{valgtFarge?.navn}</span>
        </legend>
        <div class="produktvalg__farger">
          {p.farger.map((f) => (
            <label class="produktvalg__farge" key={f.id} title={f.navn}>
              <input
                type="radio"
                name={`${id}-farge`}
                value={f.id}
                checked={farge === f.id}
                onChange={() => settFarge(f.id)}
              />
              <span class="produktvalg__prikk" style={{ '--prikk': f.hex }} aria-hidden="true" />
              <span class="visuelt-skjult">{f.navn}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset class="produktvalg__gruppe">
        <legend class="produktvalg__etikett mono">Materiale</legend>
        <div class="produktvalg__materialer">
          {p.materialer.map((m) => (
            <label class="produktvalg__materiale" key={m.type}>
              <input
                type="radio"
                name={`${id}-materiale`}
                value={m.type}
                checked={materiale === m.type}
                onChange={() => settMateriale(m.type)}
              />
              <span>{m.type}</span>
            </label>
          ))}
        </div>
        {valgtMateriale?.beskrivelse && <p class="produktvalg__notis">{valgtMateriale.beskrivelse}</p>}
      </fieldset>

      {p.egenTekst && (
        <div class="produktvalg__gruppe">
          <label class="produktvalg__etikett mono" for={`${id}-tekst`}>
            Egen tekst (valgfritt)
          </label>
          <input
            class="produktvalg__tekst"
            id={`${id}-tekst`}
            type="text"
            maxLength={p.egenTekst.maksTegn}
            value={tekst}
            onInput={(e) => settTekst((e.target as HTMLInputElement).value)}
            placeholder="For eksempel et navn"
            aria-describedby={`${id}-teller`}
            autocomplete="off"
          />
          <span class="produktvalg__teller mono" id={`${id}-teller`}>
            {tekst.length} / {p.egenTekst.maksTegn} tegn
          </span>
        </div>
      )}

      <p class="produktvalg__forelopig">
        Farger og materialer er foreløpige. Hva som faktisk er på lager, er ikke bekreftet ennå.
      </p>

      <div class="produktvalg__sum">
        <p class="produktvalg__pris" aria-live="polite">
          {pris !== null ? (
            <span class="tall">{formaterKroner(pris)}</span>
          ) : (
            <span class="produktvalg__ingenpris">Pris ikke fastsatt</span>
          )}
          <small class="mono">
            {[materiale, valgtFarge?.navn, harTekst(valg) ? 'egen tekst' : null].filter(Boolean).join(' · ')}
          </small>
        </p>
        <button class="produktvalg__knapp" type="submit">
          Legg i handlekurven
        </button>
      </div>

      <p class="produktvalg__status" role="status">
        {lagtTil > 0 && (
          <>
            Lagt i handlekurven{lagtTil > 1 ? ` (${lagtTil} ganger nå)` : ''}.{' '}
            <a href="/handlekurv/">Gå til handlekurven</a>
          </>
        )}
      </p>
    </form>
  );
}
