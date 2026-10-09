/**
 * The user field at the top right (Sivert, 2026-10-08). Accounts do not exist yet, so this is a
 * labelled placeholder: nothing is asked for, nothing blocks the editor, and it says so.
 */
import { useRef } from 'preact/hooks';
import { useLukkMeny } from './lukk-meny';

export function Brukerfelt() {
  const rot = useRef<HTMLDetailsElement>(null);
  useLukkMeny(rot);
  return (
    <details class="filmeny brukerfelt" ref={rot}>
      <summary>Logg inn</summary>
      <div class="meny">
        <p class="meny-merknad">
          Innlogging er ikke laget ennå. Du kan bruke editoren som den er, uten konto. Prosjektet lagres i
          denne nettleseren, og «Lagre som fil» tar vare på det.
        </p>
      </div>
    </details>
  );
}
