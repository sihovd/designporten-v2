/**
 * «Fra CSV» (Sivert, 2026-10-06, §24): a workflow, not a window. Import,
 * connect the columns, design the master (on the canvas, with the tray
 * from Csvbrett.tsx), choose rows, validate and generate, then the
 * production plates. The master step has no window: the canvas is the work.
 * Every other step is one window with the step bar on top.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { brukBenk } from '../../shell/bruk-benk';
import { lesArbeid, lesInstans } from './csvflyt';
import { stegNavn } from './csvhandlinger';
import { Stegrad } from './Csvfelles';
import { ImportSteg, KobleSteg } from './Csvimport';
import { GenererSteg, RaderSteg } from './Csvrader';
import { PlaterSteg } from './Csvplater';
import { brukSigntilstand, signtilstand } from './tilstand';

export function Csvflyt({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const t = brukBenk(benk);
  const steg = st.csv;
  if (!steg || steg === 'master' || lesInstans(t.dok)) return null;
  const lukk = () => {
    // closing a window goes back to the master once it exists, else out of the workflow
    const a = lesArbeid(benk.dok);
    signtilstand(benk).sett({ csv: a && a.steg !== 'koble' ? 'master' : null });
  };
  return (
    <Dialog tittel={`Fra CSV: ${stegNavn(steg)}`} lukk={lukk} klasse="csvflyt">
      <Stegrad benk={benk} aktiv={steg} />
      {steg === 'importer' && <ImportSteg benk={benk} />}
      {steg === 'koble' && <KobleSteg benk={benk} />}
      {steg === 'rader' && <RaderSteg benk={benk} />}
      {steg === 'generer' && <GenererSteg benk={benk} />}
      {steg === 'plater' && <PlaterSteg benk={benk} />}
    </Dialog>
  );
}
