/**
 * «Fra CSV» (Sivert, 2026-10-06, §24; three tabs 2026-10-08, §11): a workflow, not a window. Importer
 * (read the file, choose columns and rows), Koble (connect the columns, add own columns for decoration
 * and colour profile), design the master on the canvas (with the tray from Csvbrett.tsx), and Generer
 * (a short status, then the build plates once «Generer» is pressed). The master has no window and no
 * tab: the canvas is the work. Every tab is one window with the tab bar on top.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { brukBenk } from '../../shell/bruk-benk';
import { lesArbeid, lesInstans } from './csvflyt';
import { stegNavn } from './csvhandlinger';
import { Stegrad } from './Csvfelles';
import { ImportSteg, KobleSteg } from './Csvimport';
import { GenererSteg } from './Csvgenerer';
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
      {(steg === 'importer' || steg === 'rader') && <ImportSteg benk={benk} />}
      {steg === 'koble' && <KobleSteg benk={benk} />}
      {(steg === 'generer' || steg === 'plater') && <GenererSteg benk={benk} />}
    </Dialog>
  );
}
