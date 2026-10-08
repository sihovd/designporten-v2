/**
 * Project settings (Sivert, 2026-10-08): everything that belongs to the whole project and not to the selected
 * object: the build plate, the colours in use, the colour profile and the print layer height.
 * The inspector is only for the selected object.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import { fargekode, finnMateriale, standardPrinter, visningsnavn } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { Dialog } from '../../shell/Dialog';
import { Ikon } from '../../shell/ikoner';
import { TallFelt } from '../../shell/kontroller';
import { fargeplasser, palett, parametre, stable } from './dokument';
import { brukSigntilstand, signtilstand } from './tilstand';

/** Ready-made build plate sizes (width × depth, mm). The height is set on its own. */
export const PLATESTORRELSER: { navn: string; bredde: number; dybde: number }[] = [
  { navn: '180 × 180 mm', bredde: 180, dybde: 180 },
  { navn: '220 × 220 mm', bredde: 220, dybde: 220 },
  { navn: '256 × 256 mm', bredde: 256, dybde: 256 },
  { navn: '300 × 300 mm', bredde: 300, dybde: 300 },
  { navn: '350 × 350 mm', bredde: 350, dybde: 350 },
];

export function finnPlatestorrelse(bredde: number, dybde: number): number {
  return PLATESTORRELSER.findIndex((p) => p.bredde === bredde && p.dybde === dybde);
}

/** Change the build plate; the printer profile stays. */
export function settPlate(
  benk: Arbeidsbenk,
  ny: Partial<{ bredde: number; dybde: number; hoyde: number }>,
): void {
  benk.endre({
    navn: 'Endre byggeplate',
    anvend: (d: Dokument) =>
      (ny.bredde ?? d.plate.bredde) === d.plate.bredde &&
      (ny.dybde ?? d.plate.dybde) === d.plate.dybde &&
      (ny.hoyde ?? d.plate.hoyde) === d.plate.hoyde
        ? d
        : { ...d, plate: { ...d.plate, ...ny } },
  });
}

export function apneProsjektinnstillinger(benk: Arbeidsbenk): void {
  signtilstand(benk).sett({ prosjektinnstillinger: true });
}

export function Prosjektinnstillinger({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const lukk = () => signtilstand(benk).sett({ prosjektinnstillinger: false });
  const p = parametre(t.dok);
  const plate = t.dok.plate;
  const forhand = finnPlatestorrelse(plate.bredde, plate.dybde);
  const brukte = [...new Set(fargeplasser(t.dok).map((x) => x.materialId))].map(finnMateriale);
  const settParam = (navn: string, e: Partial<typeof p>) =>
    benk.endre({ navn, anvend: (d: Dokument) => stable({ ...d, parametre: { ...d.parametre, ...e } }) });
  return (
    <Dialog tittel="Prosjektinnstillinger" lukk={lukk} klasse="prosjektinnstillinger">
      <div class="prosjekt-innhold">
        <section aria-labelledby="pi-plate">
          <h3 id="pi-plate">Byggeplate</h3>
          <label class="felt-rad">
            <span>Størrelse</span>
            <select
              value={forhand < 0 ? 'egen' : String(forhand)}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v === 'egen') return;
                const valg = PLATESTORRELSER[Number(v)]!;
                settPlate(benk, { bredde: valg.bredde, dybde: valg.dybde });
              }}
            >
              {PLATESTORRELSER.map((s, i) => (
                <option key={s.navn} value={String(i)}>
                  {s.navn}
                </option>
              ))}
              <option value="egen">Egendefinert</option>
            </select>
          </label>
          <TallFelt
            etikett="Bredde"
            verdi={plate.bredde}
            min={20}
            maks={1000}
            steg={1}
            desimaler={0}
            endre={(v) => settPlate(benk, { bredde: v })}
          />
          <TallFelt
            etikett="Dybde"
            verdi={plate.dybde}
            min={20}
            maks={1000}
            steg={1}
            desimaler={0}
            endre={(v) => settPlate(benk, { dybde: v })}
          />
          <TallFelt
            etikett="Høyde"
            verdi={plate.hoyde}
            min={5}
            maks={1000}
            steg={1}
            desimaler={0}
            endre={(v) => settPlate(benk, { hoyde: v })}
          />
          {!standardPrinter.bekreftet && (
            <p class="merknad">Skriverprofil og farger er foreløpige og ikke bekreftet av Designporten.</p>
          )}
        </section>
        <section aria-labelledby="pi-farger">
          <h3 id="pi-farger">Farger</h3>
          <dl class="fakta">
            <div>
              <dt>Farger i bruk</dt>
              <dd class="fargekoder">
                {brukte.map((m) => (
                  <span class="fargekode" key={m.id} title={visningsnavn(m)}>
                    <span class="fargeprove" style={{ background: m.hex }} aria-hidden="true" />
                    <span class="mono">{fargekode(m)}</span>
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Fargeprofil</dt>
              <dd class="fargekoder">
                {palett(t.dok).map((id) => (
                  <span class="fargekode" key={id} title={visningsnavn(finnMateriale(id))}>
                    <span
                      class="fargeprove"
                      style={{ background: finnMateriale(id).hex }}
                      aria-hidden="true"
                    />
                    <span class="mono">{fargekode(finnMateriale(id))}</span>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              lukk();
              signtilstand(benk).sett({ fargeprofil: true });
            }}
          >
            Endre fargeprofil
          </button>
        </section>
        <section aria-labelledby="pi-print">
          <h3 id="pi-print">Printing</h3>
          <label class="avkryssing">
            <input
              type="checkbox"
              checked={p.autoZ}
              onChange={() => settParam('Automatisk stabling', { autoZ: !p.autoZ })}
            />{' '}
            Stable lagene automatisk
          </label>
          <TallFelt
            etikett="Printlaghøyde"
            verdi={p.lagHoyde}
            min={0.08}
            maks={0.4}
            steg={0.04}
            desimaler={2}
            endre={(v) => settParam('Printlaghøyde', { lagHoyde: v })}
          />
          <p class="merknad">Printlaghøyden brukes i forhåndsvisningen av printlagene. Den er ikke et lag.</p>
        </section>
      </div>
    </Dialog>
  );
}

/** The small entry at the top of the layers panel. */
export function ProsjektinnstillingerKnapp({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  return (
    <button
      type="button"
      class="minibryter prosjektknapp"
      aria-haspopup="dialog"
      aria-expanded={st.prosjektinnstillinger}
      title="Prosjektinnstillinger"
      aria-label="Prosjektinnstillinger"
      onClick={() => apneProsjektinnstillinger(benk)}
    >
      <Ikon id="settings" storrelse={16} />
    </button>
  );
}

/** Entry in the global Innstillinger menu that leads to the project's plate settings. */
export function Innstillingsvalg({ benk }: { benk: Arbeidsbenk }) {
  return (
    <>
      <p class="meny-overskrift">Byggeplate og kanvas</p>
      <button
        type="button"
        role="menuitem"
        class="med-ikon"
        onClick={(e) => {
          (e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
          apneProsjektinnstillinger(benk);
        }}
      >
        <Ikon id="settings" storrelse={16} />
        Størrelse på byggeplaten …
      </button>
    </>
  );
}
