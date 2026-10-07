/**
 * A colour swatch that opens a small menu of the active colour profile's
 * filaments (Sivert, 2026-10-06, §16). There is no free RGB picker: a colour
 * is a filament, so choosing one means choosing a filament from the profile.
 * The last entry opens the Fargeprofil panel for everything else (browse
 * the registry, add, edit).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnMateriale, visningsnavn } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { palett } from './dokument';
import { filamentLinje } from './filamenter';
import { signtilstand } from './tilstand';

/** Open the colour profile: the panel where there are panels, else the dialog. */
export function apneFargeprofil(benk: Arbeidsbenk): void {
  if (!benk.kommando('panel:fargeprofil')) signtilstand(benk).sett({ fargeprofil: true });
}

export function Fargevelger({
  benk,
  verdi,
  endre,
  etikett,
  klasse = '',
  medNavn = false,
}: {
  benk: Arbeidsbenk;
  verdi: string;
  endre: (id: string) => void;
  /** What the colour is for, for screen readers: «Farge på laget», «Farge på omrisset». */
  etikett: string;
  klasse?: string;
  /** Show the filament's name beside the swatch. */
  medNavn?: boolean;
}) {
  const t = brukBenk(benk);
  const [apen, settApen] = useState(false);
  const knapp = useRef<HTMLButtonElement>(null);
  const meny = useRef<HTMLDivElement>(null);
  const m = finnMateriale(verdi);
  const profil = palett(t.dok);
  const valg = profil.includes(verdi) ? profil : [verdi, ...profil];

  const lukk = (fokus = true) => {
    settApen(false);
    if (fokus) knapp.current?.focus();
  };

  useEffect(() => {
    if (!apen) return;
    const noverende = meny.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (noverende ?? meny.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    const utenfor = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!meny.current?.contains(n) && !knapp.current?.contains(n)) settApen(false);
    };
    window.addEventListener('pointerdown', utenfor, true);
    return () => window.removeEventListener('pointerdown', utenfor, true);
  }, [apen]);

  const r = apen ? knapp.current?.getBoundingClientRect() : undefined;
  const hoyde = valg.length * 36 + 52;
  const stil = r
    ? {
        left: `${Math.max(8, Math.min(r.left, window.innerWidth - 248))}px`,
        top: `${r.bottom + hoyde + 8 > window.innerHeight ? Math.max(8, r.top - hoyde - 4) : r.bottom + 4}px`,
      }
    : undefined;

  return (
    <span class={`fargevelger ${klasse}`}>
      <button
        ref={knapp}
        type="button"
        class="fargeknapp"
        aria-haspopup="menu"
        aria-expanded={apen}
        aria-label={`${etikett}: ${visningsnavn(m)}. Velg annen farge`}
        title={`${etikett}: ${filamentLinje(m)}`}
        onClick={() => settApen(!apen)}
      >
        <span class="fargeprove stor" style={{ background: m.hex }} aria-hidden="true" />
        {medNavn && <span class="fargenavn">{visningsnavn(m)}</span>}
      </button>
      {apen && (
        <div
          ref={meny}
          class="lagmeny fargemeny"
          role="menu"
          aria-label={`${etikett}, filamentene i fargeprofilen`}
          style={stil}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              lukk();
            } else if (e.key === 'Tab') lukk(false);
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const k = [...(meny.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
              const i = k.indexOf(document.activeElement as HTMLButtonElement);
              k[(i + (e.key === 'ArrowDown' ? 1 : -1) + k.length) % k.length]?.focus();
            }
          }}
        >
          {valg.map((id) => {
            const f = finnMateriale(id);
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === verdi}
                title={filamentLinje(f)}
                onClick={() => {
                  lukk();
                  if (id !== verdi) endre(id);
                }}
              >
                <span class="fargeprove stor" style={{ background: f.hex }} aria-hidden="true" />
                <span class="fargemeny-navn">
                  {visningsnavn(f)}
                  <span class="dempet"> {f.produsent ? `${f.produsent} ${f.type}` : f.type}</span>
                </span>
                {id === verdi && (
                  <span class="menyhake" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            class="fargemeny-mer"
            onClick={() => {
              lukk(false);
              apneFargeprofil(benk);
            }}
          >
            Flere filamenter …
          </button>
        </div>
      )}
    </span>
  );
}
