/**
 * What the CSV workflow does to the open project and to the screen: read a
 * file, go to a step, prepare the master, open a generated sign for editing
 * and put it away again. The rules are in csvflyt.ts.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import { tolkCsv } from './batch';
import {
  STEGNAVN,
  MAKS_RADER,
  bygSkilt,
  grunnskilt,
  klargjorMaster,
  lagreRedigertSkilt,
  lesArbeid,
  lesInstans,
  nyttArbeid,
  settArbeid,
  type Csvarbeid,
  type Csvsteg,
} from './csvflyt';
import { lastFonter } from './modell';
import { signtilstand } from './tilstand';

/** Change the CSV work through history. Rapid changes with the same `slaSammen` become one step. */
export function endreArbeid(
  benk: Arbeidsbenk,
  navn: string,
  fn: (a: Csvarbeid) => Csvarbeid,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    ...(slaSammen ? { slaSammen } : {}),
    anvend: (d) => {
      const a = lesArbeid(d);
      return a ? settArbeid(d, fn(a)) : d;
    },
  });
}

export const stegNavn = (s: Csvsteg) => STEGNAVN[s];

/** Where the workflow resumes for a project: the furthest step reached, or the import when there is no work yet. */
export function fortsettSteg(dok: Dokument): Csvsteg {
  const a = lesArbeid(dok);
  if (!a) return 'importer';
  // the old step names live on in saved projects
  if (a.steg === 'rader') return 'generer';
  if (a.steg === 'plater') return a.generert.length ? 'generer' : 'master';
  return a.steg;
}

/** Open the workflow where the project left off. */
export function apneCsv(benk: Arbeidsbenk): void {
  // a phone's open sheet would cover the tray under the canvas
  benk.settInnstillinger({ ark: 'ingen' });
  signtilstand(benk).sett({ csv: fortsettSteg(benk.dok) });
}

/** Leave the workflow; the master stays an ordinary sign and the work is kept in the project. */
export function lukkCsv(benk: Arbeidsbenk): void {
  signtilstand(benk).sett({ csv: null });
}

/** Go to a step; the step is remembered in the project once the master exists. */
export function gaTilSteg(benk: Arbeidsbenk, steg: Csvsteg, husk = false): void {
  if (steg === 'master') benk.settInnstillinger({ ark: 'ingen' });
  signtilstand(benk).sett({ csv: steg });
  if (husk && lesArbeid(benk.dok)) endreArbeid(benk, 'CSV: steg', (a) => ({ ...a, steg }));
}

/** Read a CSV text into the project. Returns an error to show, or null. */
export function lesInnCsv(benk: Arbeidsbenk, tekst: string, kilde: string): string | null {
  const csv = tolkCsv(tekst);
  if (!csv.kolonner.length || !csv.rader.length) {
    return 'Fant ingen rader. Første linje må være kolonnenavn, og hver rad ett skilt.';
  }
  if (csv.rader.length > MAKS_RADER) {
    return `Filen har ${csv.rader.length} rader. Sign Forge tar opptil ${MAKS_RADER} om gangen; del filen opp.`;
  }
  const dok = benk.dok;
  const a = nyttArbeid(csv, kilde, lesInstans(dok)?.master ?? dok);
  benk.endre({ navn: 'Importer CSV', anvend: (d) => settArbeid(d, a) });
  benk.melde(`${csv.rader.length} rader og ${csv.kolonner.length} kolonner er lest fra ${kilde}.`);
  return null;
}

/** Make the master from the master row and go on to design it. */
export async function tilMaster(benk: Arbeidsbenk): Promise<void> {
  const a = lesArbeid(benk.dok);
  if (!a) return;
  const ferdig: Csvarbeid = { ...a, steg: 'master' };
  const master = await klargjorMaster(benk.dok, ferdig);
  benk.endre({ navn: 'Lag masteren fra CSV', anvend: () => master });
  benk.kommando('tilpass');
  benk.settInnstillinger({ ark: 'ingen' });
  signtilstand(benk).sett({ csv: 'master', verktoy: 'velg' });
  benk.melde(
    `Masteren er laget fra rad ${ferdig.masterRad + 1}. Plasser, skaler og velg fonter slik du vil ha det.`,
  );
}

// ---------- a generated sign, opened for editing ----------

/** Open one generated sign on the canvas. What is changed is kept as overrides on that sign only. */
export async function startInstans(benk: Arbeidsbenk, rad: number): Promise<boolean> {
  const master = benk.dok;
  const a = lesArbeid(master);
  if (!a || lesInstans(master)) return false;
  await lastFonter(master);
  // the sign as it is now: master and row, then its overrides
  const naa = bygSkilt(master, a, [rad])[0];
  if (!naa) return false;
  const dok: Dokument = {
    ...naa.dok,
    navn: master.navn,
    parametre: { ...naa.dok.parametre, csvinstans: { rad, master } },
  };
  benk.endre({ navn: `Rediger skilt ${rad + 1}`, anvend: () => dok });
  benk.velg({ objekter: [], lag: dok.lag.at(-1)?.id ?? null });
  signtilstand(benk).sett({ csv: 'master', csvrad: rad });
  benk.kommando('tilpass');
  benk.melde(`Du redigerer skilt ${rad + 1}. Endringene gjelder bare dette skiltet.`);
  return true;
}

/**
 * Put the opened sign away: keep what was changed as overrides (`lagre`) or
 * drop it, and return to the master. Returns what could not be kept.
 */
export async function avsluttInstans(benk: Arbeidsbenk, lagre: boolean): Promise<string[]> {
  const inst = lesInstans(benk.dok);
  if (!inst) return [];
  let master = inst.master;
  let utenfor: string[] = [];
  const a = lesArbeid(master);
  if (lagre && a) {
    await lastFonter(master);
    const grunn = grunnskilt(master, a, inst.rad);
    if (grunn) {
      const r = lagreRedigertSkilt(a, inst.rad, grunn.dok, benk.dok);
      utenfor = r.avvik.utenfor;
      master = settArbeid(master, { ...r.arbeid, steg: 'generer' });
    }
  }
  benk.endre({
    navn: lagre ? `Lagre skilt ${inst.rad + 1}` : 'Forkast skiltendringer',
    anvend: () => master,
  });
  benk.velg({ objekter: [], lag: master.lag.at(-1)?.id ?? null });
  signtilstand(benk).sett({ csv: lagre ? 'generer' : 'master', csvrad: inst.rad });
  benk.kommando('tilpass');
  benk.melde(
    lagre
      ? `Skilt ${inst.rad + 1} er lagret med egne verdier. Resten følger masteren.`
      : `Endringene på skilt ${inst.rad + 1} er forkastet.`,
  );
  return utenfor;
}
