/** The bottom tray: the history timeline, and the CSV workflow's tray while that is open. */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Csvbrett } from './Csvbrett';
import { lesInstans } from './csvflyt';
import { brukSigntilstand } from './tilstand';
import { Tidslinje } from './Tidslinje';

export function SigngenBunnbrett({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  if (lesInstans(t.dok) || st.csv === 'master') return <Csvbrett benk={benk} />;
  return <Tidslinje benk={benk} />;
}
