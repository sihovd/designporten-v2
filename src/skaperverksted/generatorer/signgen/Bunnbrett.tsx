/**
 * The bottom tray: the CSV workflow's tray while that is open, otherwise nothing. The history timeline
 * that used to be here was removed (Sivert, 2026-11-10): undo and redo stay in the top bar and on
 * Ctrl+Z / Ctrl+Shift+Z.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Csvbrett } from './Csvbrett';
import { lesInstans } from './csvflyt';
import { brukSigntilstand } from './tilstand';

export function SigngenBunnbrett({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  if (lesInstans(t.dok) || st.csv === 'master') return <Csvbrett benk={benk} />;
  return null;
}
