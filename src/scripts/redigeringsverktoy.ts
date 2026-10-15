import { nettsti } from '@/lib/nettsti';
/**
 * The inline editor's toolbar and editing mode (loaded only for a signed-in
 * editor, see redigering.ts). Texts marked data-rediger become editable in
 * place; «Lagre» commits them to the same files /admin edits.
 */
import { lagreEndringer, sjekkTilgang, type Endring, type Felttype } from '@/lib/redigering/kjerne';
import {
  flertall,
  lagKnapp,
  lesTekst,
  lyttEtterRedigering,
  settRedigerbar,
  skrivTekst,
  typeFor,
} from './redigering-felles';
import './redigering.css';

const PA = 'dp-redigerer';
const HUSK = 'dp-redigering-pa';

interface Felt {
  el: HTMLElement;
  adresse: string;
  type: Felttype;
  original: string;
}

function husk(pa: boolean) {
  try {
    if (pa) sessionStorage.setItem(HUSK, '1');
    else sessionStorage.removeItem(HUSK);
  } catch {
    /* private mode: just don't remember */
  }
}

function huskes(): boolean {
  try {
    return sessionStorage.getItem(HUSK) === '1';
  } catch {
    return false;
  }
}

function visUtlopt() {
  const bar = document.createElement('div');
  bar.className = 'dp-red';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Redigering');
  const tekst = document.createElement('p');
  tekst.className = 'dp-red__status';
  tekst.textContent = 'Innloggingen til redigering har gått ut.';
  const lenke = document.createElement('a');
  lenke.className = 'dp-red__knapp dp-red__knapp--primar';
  lenke.href = nettsti('/admin/');
  lenke.textContent = 'Logg inn på nytt';
  const lukk = lagKnapp('Lukk', '', () => bar.remove());
  bar.append(tekst, lenke, lukk);
  document.body.append(bar);
}

export async function startVerktoy(token: string) {
  const tilgang = await sjekkTilgang(token);
  if (tilgang === 'utlopt') return visUtlopt();
  if (tilgang !== 'kan-skrive') return;

  const felt: Felt[] = [...document.querySelectorAll<HTMLElement>('[data-rediger]')].map((el) => {
    const type = typeFor(el);
    return { el, adresse: el.dataset.rediger!, type, original: lesTekst(el, type) };
  });
  const finn = (el: Element | null) => felt.find((f) => f.el === el);
  let pa = false;
  let lagrer = false;

  // Toolbar
  const bar = document.createElement('div');
  bar.className = 'dp-red';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Redigering');
  const merke = document.createElement('span');
  merke.className = 'dp-red__merke';
  merke.textContent = 'Redaktør';
  const status = document.createElement('p');
  status.className = 'dp-red__status';
  status.setAttribute('aria-live', 'polite');
  const bryter = lagKnapp('Rediger tekst', 'dp-red__knapp--primar', () => settPa(!pa));
  bryter.setAttribute('aria-pressed', 'false');
  const lagre = lagKnapp('Lagre', 'dp-red__knapp--primar', () => void lagreAlt());
  const forkast = lagKnapp('Forkast', '', forkastAlt);
  const admin = document.createElement('a');
  admin.className = 'dp-red__knapp dp-red__knapp--lenke';
  admin.href = nettsti('/admin/');
  admin.textContent = 'Åpne /admin';
  bar.append(merke, status, bryter, lagre, forkast, admin);
  document.body.append(bar);
  document.documentElement.classList.add('dp-har-redigering');

  const endrede = () => felt.filter((f) => f.el.hasAttribute('data-endret'));

  function oppdaterBar(melding?: string) {
    const n = endrede().length;
    const tomme = felt.some((f) => f.el.hasAttribute('data-tom'));
    lagre.hidden = n === 0;
    forkast.hidden = n === 0;
    lagre.disabled = lagrer || tomme;
    lagre.textContent = lagrer ? 'Lagrer …' : 'Lagre';
    bryter.textContent = pa ? 'Ferdig' : 'Rediger tekst';
    bryter.setAttribute('aria-pressed', String(pa));
    bryter.classList.toggle('dp-red__knapp--primar', n === 0);
    if (melding !== undefined) status.textContent = melding;
    else if (tomme) status.textContent = 'En tekst er tom. Skriv noe i den eller forkast.';
    else if (n) status.textContent = `${flertall(n, 'endring', 'endringer')} er ikke lagret.`;
    else status.textContent = pa ? 'Klikk på en tekst for å endre den.' : '';
  }

  function vurder(f: Felt) {
    const naa = lesTekst(f.el, f.type);
    f.el.toggleAttribute('data-endret', naa !== f.original);
    f.el.toggleAttribute('data-tom', naa === '');
    f.el.removeAttribute('data-konflikt');
  }

  function settPa(ny: boolean) {
    pa = ny;
    husk(pa);
    document.documentElement.classList.toggle(PA, pa);
    settRedigerbar(
      felt.map((f) => f.el),
      pa,
    );
    oppdaterBar();
  }

  function forkastAlt() {
    for (const f of endrede()) {
      skrivTekst(f.el, f.original, f.type);
      f.el.removeAttribute('data-endret');
      f.el.removeAttribute('data-tom');
    }
    oppdaterBar('Endringene er forkastet.');
  }

  async function lagreAlt() {
    const liste = endrede();
    if (!liste.length || lagrer) return;
    lagrer = true;
    oppdaterBar('Lagrer …');
    const endringer: Endring[] = liste.map((f) => ({
      adresse: f.adresse,
      type: f.type,
      original: f.original,
      ny: lesTekst(f.el, f.type),
    }));
    const resultater = await lagreEndringer(token, endringer);
    lagrer = false;
    let lagret = 0;
    const problemer: string[] = [];
    for (const r of resultater) {
      const f = felt.find((x) => x.adresse === r.adresse);
      if (!f) continue;
      if (r.status === 'ok') {
        f.original = endringer.find((e) => e.adresse === r.adresse)!.ny;
        f.el.removeAttribute('data-endret');
        lagret++;
      } else if (r.status === 'endret-andre-steder') {
        f.el.setAttribute('data-konflikt', '');
        problemer.push(
          'En tekst er endret i /admin etter at siden ble bygget, så den ble ikke lagret. Last siden på nytt når den er bygget.',
        );
      } else if (r.status === 'feil') {
        problemer.push(r.melding ?? 'Lagring feilet.');
      } else {
        problemer.push('En tekst finnes ikke lenger i innholdsfilen.');
      }
    }
    const deler: string[] = [];
    if (lagret)
      deler.push(
        `${flertall(lagret, 'tekst', 'tekster')} lagret. Siden bygges på nytt, og endringen vises for alle når det er ferdig.`,
      );
    deler.push(...new Set(problemer));
    oppdaterBar(deler.join(' '));
  }

  lyttEtterRedigering({
    erPa: () => pa,
    erFelt: (el) => Boolean(finn(el)),
    bar,
    vedEndring: (el) => {
      vurder(finn(el)!);
      oppdaterBar();
    },
    vedLagre: () => void lagreAlt(),
  });

  window.addEventListener('beforeunload', (e) => {
    if (endrede().length) e.preventDefault();
  });

  settPa(huskes());
}
