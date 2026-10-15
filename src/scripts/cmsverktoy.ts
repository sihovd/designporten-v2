import { nettsti } from '@/lib/nettsti';
/**
 * Inline editing against the CMS (php build, docs/cms/README.md). Loaded only
 * when someone is signed in to /cms/ in this browser (see redigering.ts).
 *
 * Visitors get the published text from the server (api/cms/side.php). Here the
 * editor sees drafts on top, edits in place, saves drafts, and publishes when
 * ready; nothing is committed to GitHub and nothing needs a new deploy.
 */
import { cms, CmsFeil, gjeldende, sideSti, visning, type Bruker, type Felt } from '@/lib/cms/api';
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

interface Plass {
  el: HTMLElement;
  felt: Felt;
  /** The text the element shows when not edited (draft or published). */
  vist: string;
}

function husk(pa: boolean) {
  try {
    if (pa) sessionStorage.setItem(HUSK, '1');
    else sessionStorage.removeItem(HUSK);
  } catch {
    /* private mode: just don't remember */
  }
}

const huskes = () => {
  try {
    return sessionStorage.getItem(HUSK) === '1';
  } catch {
    return false;
  }
};

const tid = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '';

const HANDLINGER: Record<string, string> = {
  utkast: 'Utkast lagret',
  publisert: 'Publisert',
  forkastet: 'Utkast forkastet',
  gjenopprettet: 'Gjenopprettet som utkast',
};

export async function startCmsVerktoy() {
  let bruker: Bruker;
  let felt: Felt[];
  try {
    bruker = (await cms.meg()).bruker;
    felt = (await cms.innhold(sideSti(location.pathname, import.meta.env.BASE_URL))).felt;
  } catch {
    return;
  }
  const kanPublisere = bruker.rolle !== 'agent';
  const perNokkel = new Map(felt.map((f) => [f.nokkel, f]));
  const plasser: Plass[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-rediger^="sider/"]')) {
    const f = perNokkel.get(el.dataset.rediger!);
    if (f) plasser.push({ el, felt: f, vist: visning(f) });
  }
  if (!plasser.length) return;

  const finn = (el: Element | null) => plasser.find((p) => p.el === el);
  let pa = false;
  let opptatt = false;
  let somBesokende = false;
  let aktiv: Plass | undefined;

  // Toolbar
  const bar = document.createElement('div');
  bar.className = 'dp-red';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Redigering av innhold');
  const merke = document.createElement('span');
  merke.className = 'dp-red__merke';
  merke.textContent = 'CMS';
  const status = document.createElement('p');
  status.className = 'dp-red__status';
  status.setAttribute('aria-live', 'polite');
  const bryter = lagKnapp('Rediger innhold', 'dp-red__knapp--primar', () => settPa(!pa));
  bryter.setAttribute('aria-pressed', 'false');
  const lagre = lagKnapp('Lagre utkast', 'dp-red__knapp--primar', () => void lagreAlt());
  const angre = lagKnapp('Angre endringer', '', angreAlt);
  const publiser = lagKnapp('Publiser', 'dp-red__knapp--primar', () => void publiserAlt());
  const forkast = lagKnapp('Forkast utkast', '', () => void forkastAlt());
  const besokende = lagKnapp('Vis som besøkende', '', () => visSomBesokende(!somBesokende));
  besokende.setAttribute('aria-pressed', 'false');
  const historikk = lagKnapp('Historikk', '', () => void visHistorikk());
  const panel = document.createElement('a');
  panel.className = 'dp-red__knapp dp-red__knapp--lenke';
  panel.href = nettsti('/cms/');
  panel.textContent = 'Åpne CMS';
  bar.append(merke, status, bryter, lagre, angre, publiser, forkast, historikk, besokende, panel);
  document.body.append(bar);
  document.documentElement.classList.add('dp-har-redigering');

  const endrede = () => plasser.filter((p) => p.el.hasAttribute('data-endret'));
  const utkast = () => plasser.filter((p) => p.felt.utkast !== null);

  function merk(p: Plass) {
    p.el.toggleAttribute('data-utkast', !somBesokende && p.felt.utkast !== null);
  }

  function oppdaterBar(melding?: string) {
    const n = endrede().length;
    const u = new Set(utkast().map((p) => p.felt.nokkel)).size;
    const tomme = plasser.some((p) => p.el.hasAttribute('data-tom'));
    lagre.hidden = n === 0;
    angre.hidden = n === 0;
    lagre.disabled = opptatt || tomme;
    publiser.hidden = !kanPublisere || u === 0 || n > 0 || somBesokende;
    forkast.hidden = u === 0 || n > 0 || somBesokende;
    publiser.disabled = forkast.disabled = opptatt;
    publiser.textContent = u > 1 ? `Publiser ${u}` : 'Publiser';
    historikk.hidden = !pa || !aktiv;
    besokende.hidden = pa || u === 0;
    besokende.textContent = somBesokende ? 'Vis utkast' : 'Vis som besøkende';
    besokende.setAttribute('aria-pressed', String(somBesokende));
    bryter.hidden = somBesokende;
    bryter.textContent = pa ? 'Ferdig' : 'Rediger innhold';
    bryter.setAttribute('aria-pressed', String(pa));
    bryter.classList.toggle('dp-red__knapp--primar', n === 0 && u === 0);
    if (melding !== undefined) status.textContent = melding;
    else if (tomme) status.textContent = 'En tekst er tom. Skriv noe i den eller angre.';
    else if (n) status.textContent = `${flertall(n, 'endring', 'endringer')} er ikke lagret.`;
    else if (somBesokende) status.textContent = 'Slik ser besøkende siden nå.';
    else if (u)
      status.textContent = `${flertall(u, 'utkast', 'utkast')} på denne siden er ikke publisert. Besøkende ser dem ikke ennå.`;
    else status.textContent = pa ? 'Klikk på en tekst for å endre den.' : '';
  }

  /** Show a field's current text everywhere it appears on the page. */
  function oppdaterFelt(f: Felt) {
    perNokkel.set(f.nokkel, f);
    for (const p of plasser.filter((x) => x.felt.nokkel === f.nokkel)) {
      p.felt = f;
      p.vist = visning(f);
      skrivTekst(p.el, somBesokende ? gjeldende(f) : p.vist, f.type);
      p.el.removeAttribute('data-endret');
      p.el.removeAttribute('data-tom');
      p.el.removeAttribute('data-konflikt');
      merk(p);
    }
  }

  function vurder(p: Plass) {
    const naa = lesTekst(p.el, p.felt.type);
    p.el.toggleAttribute('data-endret', naa !== p.vist);
    p.el.toggleAttribute('data-tom', naa === '');
    p.el.removeAttribute('data-konflikt');
  }

  function settPa(ny: boolean) {
    pa = ny;
    husk(pa);
    document.documentElement.classList.toggle(PA, pa);
    settRedigerbar(
      plasser.map((p) => p.el),
      pa,
    );
    if (!pa) aktiv = undefined;
    oppdaterBar();
  }

  function visSomBesokende(ja: boolean) {
    somBesokende = ja;
    for (const p of plasser) {
      skrivTekst(p.el, ja ? gjeldende(p.felt) : p.vist, p.felt.type);
      merk(p);
    }
    oppdaterBar();
  }

  function angreAlt() {
    for (const p of endrede()) {
      skrivTekst(p.el, p.vist, p.felt.type);
      p.el.removeAttribute('data-endret');
      p.el.removeAttribute('data-tom');
    }
    oppdaterBar('Endringene er angret.');
  }

  /** Run a request with the toolbar busy; report problems in the status line. */
  async function med(arbeid: () => Promise<string>) {
    if (opptatt) return;
    opptatt = true;
    oppdaterBar('Lagrer …');
    let melding: string;
    try {
      melding = await arbeid();
    } catch (e) {
      melding =
        e instanceof CmsFeil && e.status === 401
          ? 'Innloggingen har gått ut. Logg inn i CMS-et igjen.'
          : e instanceof Error
            ? e.message
            : 'Noe gikk galt.';
    }
    opptatt = false;
    oppdaterBar(melding);
  }

  function tolk(resultater: Awaited<ReturnType<typeof cms.lagre>>['resultater'], ferdig: string): string {
    let ok = 0;
    const problemer = new Set<string>();
    for (const r of resultater) {
      if (r.felt) oppdaterFelt(r.felt);
      if (r.status === 'ok') ok++;
      else if (r.status === 'konflikt') {
        for (const p of plasser.filter((x) => x.felt.nokkel === r.nokkel))
          p.el.setAttribute('data-konflikt', '');
        problemer.add(
          'Noen andre endret en av tekstene i mellomtiden. Den viser nå deres versjon; skriv endringen din på nytt.',
        );
      } else if (r.melding) problemer.add(r.melding);
    }
    return [ok ? `${flertall(ok, 'tekst', 'tekster')} ${ferdig}` : '', ...problemer]
      .filter(Boolean)
      .join(' ');
  }

  const lagreAlt = () =>
    med(async () => {
      const liste = endrede();
      if (!liste.length) return '';
      const unike = new Map(liste.map((p) => [p.felt.nokkel, p]));
      const { resultater } = await cms.lagre(
        [...unike.values()].map((p) => ({
          nokkel: p.felt.nokkel,
          verdi: lesTekst(p.el, p.felt.type),
          versjon: p.felt.versjon,
        })),
      );
      return tolk(resultater, 'lagret som utkast. Trykk «Publiser» når du vil vise dem.');
    });

  const unikeUtkast = () => [...new Map(utkast().map((p) => [p.felt.nokkel, p.felt])).values()];

  const publiserAlt = () =>
    med(async () => {
      const { resultater } = await cms.publiser(
        unikeUtkast().map((f) => ({ nokkel: f.nokkel, versjon: f.versjon })),
      );
      return tolk(resultater, 'publisert. Besøkende ser dem nå.');
    });

  const forkastAlt = () =>
    med(async () => {
      const { resultater } = await cms.forkast(
        unikeUtkast().map((f) => ({ nokkel: f.nokkel, versjon: f.versjon })),
      );
      return tolk(resultater, 'tilbake til det som er publisert.');
    });

  // History for the field last focused while editing.
  const dialog = document.createElement('dialog');
  dialog.className = 'dp-red-historikk';
  dialog.setAttribute('aria-labelledby', 'dp-red-historikk-tittel');
  document.body.append(dialog);

  async function visHistorikk() {
    const p = aktiv;
    if (!p) return;
    let data: Awaited<ReturnType<typeof cms.historikk>>;
    try {
      data = await cms.historikk(p.felt.nokkel);
    } catch (e) {
      oppdaterBar(e instanceof Error ? e.message : 'Fant ikke historikken.');
      return;
    }
    oppdaterFelt(data.felt);
    const tittel = document.createElement('h2');
    tittel.id = 'dp-red-historikk-tittel';
    tittel.textContent = 'Historikk for teksten';
    const liste = document.createElement('ol');
    const bruk = (verdi: { revisjon?: number; standard?: boolean }) => {
      dialog.close();
      void med(async () => {
        const r = await cms.gjenopprett({
          ...verdi,
          nokkel: data.felt.nokkel,
          versjon: perNokkel.get(data.felt.nokkel)!.versjon,
        });
        return tolk([r], 'gjenopprettet som utkast. Publiser for å vise den.');
      });
    };
    const standard = document.createElement('li');
    const standardTekst = document.createElement('p');
    standardTekst.textContent = data.felt.standard;
    standard.append(
      Object.assign(document.createElement('strong'), { textContent: 'Standardtekst fra koden' }),
      standardTekst,
      lagKnapp('Bruk denne', '', () => bruk({ standard: true })),
    );
    liste.append(standard);
    for (const r of data.revisjoner) {
      const li = document.createElement('li');
      const hode = document.createElement('strong');
      hode.textContent = `${HANDLINGER[r.handling] ?? r.handling} · ${tid(r.tid)}${r.av ? ` · ${r.av}` : ''}`;
      li.append(hode);
      if (r.verdi !== null) {
        const tekst = document.createElement('p');
        tekst.textContent = r.verdi;
        li.append(
          tekst,
          lagKnapp('Bruk denne', '', () => bruk({ revisjon: r.id })),
        );
      }
      liste.append(li);
    }
    const lukk = lagKnapp('Lukk', 'dp-red__knapp--primar', () => dialog.close());
    dialog.replaceChildren(tittel, liste, lukk);
    dialog.showModal();
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

  document.addEventListener('focusin', (e) => {
    const p = finn((e.target as Element | null)?.closest?.('[data-rediger]') ?? null);
    if (p && pa) {
      aktiv = p;
      oppdaterBar();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (endrede().length) e.preventDefault();
  });

  // Drafts replace the published text for the editor (visitors never see them).
  for (const p of plasser) {
    if (p.felt.utkast !== null || lesTekst(p.el, p.felt.type) !== p.vist)
      skrivTekst(p.el, p.vist, typeFor(p.el));
    merk(p);
  }
  settPa(huskes());
}
