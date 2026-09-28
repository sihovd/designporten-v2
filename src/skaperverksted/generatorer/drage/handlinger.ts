/** Document changes for the dragon, all through the workbench history. */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { lesParametre, type DrageParametre } from './parametre';

export function parametre(benk: Arbeidsbenk): DrageParametre {
  return lesParametre(benk.dok.parametre);
}

export function endreDrage(
  benk: Arbeidsbenk,
  navn: string,
  endring: (p: DrageParametre) => DrageParametre,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    slaSammen,
    anvend: (d) => {
      const forrige = lesParametre(d.parametre);
      const neste = lesParametre({ ...endring(forrige) });
      if (JSON.stringify(neste) === JSON.stringify(forrige)) return d;
      return { ...d, parametre: { ...neste } };
    },
  });
}

/** A random but always valid dragon (the «Overrask meg» button). */
export function tilfeldig<T>(liste: readonly T[], tall: () => number): T {
  return liste[Math.floor(tall() * liste.length)]!;
}
