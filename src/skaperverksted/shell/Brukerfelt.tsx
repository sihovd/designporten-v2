/**
 * The user field at the top right (Sivert, 2026-10-08). Where member accounts are switched on
 * (docs/konto.md) it shows who is signed in and links to «Min konto», which opens in a new tab so
 * the open project stays as it is. Nothing here blocks the editor: it works the same without an
 * account. Elsewhere it says accounts are not switched on.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { nettsti } from '@/lib/nettsti';
import { konto, kontoMulig, type Medlem } from '@/lib/konto/api';
import { useLukkMeny } from './lukk-meny';

export function Brukerfelt() {
  const rot = useRef<HTMLDetailsElement>(null);
  const [medlem, settMedlem] = useState<Medlem | null>(null);
  useLukkMeny(rot);
  useEffect(() => {
    if (!kontoMulig) return;
    const hent = () =>
      void konto
        .meg()
        .then((s) => settMedlem(s.medlem))
        .catch(() => settMedlem(null));
    hent();
    // signing in happens in another tab: look again when the editor gets focus back
    addEventListener('focus', hent);
    return () => removeEventListener('focus', hent);
  }, []);
  const kontoside = (
    <a class="meny-lenke" href={nettsti('/konto/')} target="_blank" rel="noopener">
      {medlem ? 'Min konto' : 'Logg inn eller lag konto'} <span aria-hidden="true">↗</span>
      <span class="visuelt-skjult"> (åpnes i ny fane)</span>
    </a>
  );
  return (
    <details class="filmeny brukerfelt" ref={rot}>
      <summary>{medlem ? medlem.navn : 'Logg inn'}</summary>
      <div class="meny">
        {!kontoMulig ? (
          <p class="meny-merknad">
            Innlogging er ikke slått på her ennå. Du kan bruke editoren som den er, uten konto. Prosjektet
            lagres i denne nettleseren, og «Lagre som fil» tar vare på det.
          </p>
        ) : medlem ? (
          <>
            <p class="meny-merknad">
              Logget inn som {medlem.navn}. Skiltene dine er private til du velger «Publiser i galleriet» i
              Fil-menyen. «Lagre på kontoen» i samme meny lagrer prosjektet på kontoen.
            </p>
            {kontoside}
          </>
        ) : (
          <>
            <p class="meny-merknad">
              Du kan bruke editoren uten konto. Med en konto kan du lagre prosjekter på kontoen og publisere
              skilt i galleriet «Nylig laget» med navnet ditt.
            </p>
            {kontoside}
          </>
        )}
      </div>
    </details>
  );
}
