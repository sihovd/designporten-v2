/**
 * Swapping a picture on the page (CMS, php build). Used by cmsverktoy.ts.
 *
 * `velgBilde` opens a dialog: pick from the media library or upload, write
 * what the picture shows (or mark it as decoration), and set the focus point
 * for large screens and, if needed, for phones. Nothing is saved here; the
 * toolbar saves the choice as a draft with the texts.
 *
 * `visBilde` shows an image field value on an <img> the same way the server
 * does (api/cms/side.php), so the editor's preview matches what visitors get.
 */
import { cms, type Bildeinfo, type Bildeverdi, type Byggbilde, type Medium } from '@/lib/cms/api';
import { lagKnapp } from './redigering-felles';

const FOKUS = /^(\d{1,3})% (\d{1,3})%$/;

export function lesFokus(f: string | null | undefined, reserve = '50% 50%'): [number, number] {
  const m = FOKUS.exec(f ?? '') ?? FOKUS.exec(reserve)!;
  return [Math.min(100, Number(m[1])), Math.min(100, Number(m[2]))];
}

export const fokusTekst = ([x, y]: [number, number]) => `${Math.round(x)}% ${Math.round(y)}%`;

/** A media row as the resolved value of a field (for previews before saving). */
export function infoFra(m: Medium, v: Bildeverdi): Bildeinfo {
  return {
    medium: m.id,
    src: m.src,
    srcset: m.srcset,
    miniatyr: m.miniatyr,
    bredde: m.bredde,
    hoyde: m.hoyde,
    konsept: m.konsept,
    navn: m.navn,
    alt: v.dekorativ ? '' : (v.alt ?? ''),
    dekorativ: Boolean(v.dekorativ),
    fokus: v.fokus ?? '50% 50%',
    fokusMobil: v.fokusMobil ?? null,
  };
}

interface Opprinnelig {
  src: string;
  srcset: string | null;
  width: string | null;
  height: string | null;
  alt: string;
  style: string | null;
  konsept: string | null;
}

const opprinnelig = new WeakMap<HTMLImageElement, Opprinnelig>();

function husk(img: HTMLImageElement): Opprinnelig {
  let o = opprinnelig.get(img);
  if (!o) {
    o = {
      src: img.getAttribute('src') ?? '',
      srcset: img.getAttribute('srcset'),
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
      alt: img.getAttribute('alt') ?? '',
      style: img.getAttribute('style'),
      konsept: img.getAttribute('data-konsept'),
    };
    opprinnelig.set(img, o);
  }
  return o;
}

const sett = (el: Element, navn: string, verdi: string | null) =>
  verdi === null ? el.removeAttribute(navn) : el.setAttribute(navn, verdi);

/**
 * Show a picture on the page: `info` from the library, or null for the
 * picture the page was built with (as the server sent it on first load).
 */
export function visBilde(img: HTMLImageElement, info: Bildeinfo | null, bygget?: Byggbilde | null) {
  const o = husk(img);
  const merker = document.querySelectorAll(
    `[data-konseptmerke="${CSS.escape(img.dataset.redigerBilde ?? '')}"]`,
  );
  if (!info) {
    // Back to what the page showed for visitors when it loaded, or to the built picture.
    const b = bygget;
    sett(img, 'src', b ? b.src : o.src);
    sett(img, 'srcset', b ? null : o.srcset);
    sett(img, 'width', b?.bredde ? String(b.bredde) : o.width);
    sett(img, 'height', b?.hoyde ? String(b.hoyde) : o.height);
    sett(img, 'alt', b ? b.alt : o.alt);
    sett(img, 'style', b ? null : o.style);
    const konsept = b ? (b.konsept ? '1' : '0') : o.konsept;
    sett(img, 'data-konsept', konsept);
    for (const m of merker) (m as HTMLElement).hidden = konsept !== '1';
    return;
  }
  img.src = info.src;
  sett(img, 'srcset', info.srcset || null);
  img.width = info.bredde;
  img.height = info.hoyde;
  img.alt = info.dekorativ ? '' : info.alt;
  img.style.setProperty('--fokus', info.fokus);
  if (info.fokusMobil) img.style.setProperty('--fokus-mobil', info.fokusMobil);
  else img.style.removeProperty('--fokus-mobil');
  img.dataset.konsept = info.konsept ? '1' : '0';
  for (const m of merker) (m as HTMLElement).hidden = !info.konsept;
}

/** The picture the visitor sees on first load, before any CMS work in this tab. */
export const forsteBilde = (img: HTMLImageElement) => husk(img);

let lopenummer = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  egenskaper: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...barn: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: klasse, ...rest } = egenskaper;
  if (klasse) e.className = klasse;
  Object.assign(e, rest);
  e.append(...barn);
  return e;
}

/**
 * Let the editor choose a picture for a field. Resolves with the new value
 * and its preview info, `null` for «the picture the page was built with», or
 * `undefined` when cancelled.
 */
export function velgBilde(o: {
  tittel: string;
  naa: Bildeverdi | null;
  naaInfo: Bildeinfo | null;
  bygget: Byggbilde | null;
}): Promise<{ verdi: Bildeverdi; info: Bildeinfo | null } | undefined> {
  const id = `dp-bv-${++lopenummer}`;
  const dialog = el('dialog', { class: 'dp-bildevelger' });
  dialog.setAttribute('aria-labelledby', `${id}-tittel`);
  document.body.append(dialog);

  let medier: Medium[] = [];
  let valgt: Medium | null = null;
  let alt = o.naa?.alt ?? o.naaInfo?.alt ?? '';
  let dekorativ = Boolean(o.naa?.dekorativ);
  let fokus = lesFokus(o.naa?.fokus ?? o.naaInfo?.fokus);
  let mobil = o.naa?.fokusMobil ? lesFokus(o.naa.fokusMobil) : null;
  let redigererMobil = false;

  const melding = el('p', { class: 'dp-bildevelger__melding' });
  melding.setAttribute('role', 'status');
  const vis = (tekst: string, feil = false) => {
    melding.textContent = tekst;
    melding.classList.toggle('dp-bildevelger__melding--feil', feil);
    melding.setAttribute('role', feil ? 'alert' : 'status');
  };

  // ---- Library and upload
  const fil = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true });
  fil.id = `${id}-fil`;
  const filEtikett = el(
    'label',
    { htmlFor: fil.id, class: 'dp-red__knapp dp-red__knapp--primar' },
    'Last opp bilde',
  );
  const framdrift = el('progress', { max: 1, value: 0, hidden: true });
  framdrift.setAttribute('aria-label', 'Opplasting');
  const sok = el('input', { type: 'search', placeholder: 'Søk etter navn' });
  sok.setAttribute('aria-label', 'Søk i bildebiblioteket');
  const rutenett = el('ul', { class: 'dp-bildevelger__rutenett' });
  rutenett.setAttribute('aria-label', 'Bildebiblioteket');

  function tegnRutenett() {
    const ord = sok.value.trim().toLowerCase();
    const liste = medier.filter((m) => !ord || `${m.navn} ${m.alt}`.toLowerCase().includes(ord));
    rutenett.replaceChildren(
      ...liste.map((m) => {
        const knapp = el(
          'button',
          { type: 'button', class: 'dp-bildevelger__kort' },
          el('img', { src: m.miniatyr, alt: '', loading: 'lazy', width: 160, height: 120 }),
          el('span', {}, m.navn),
        );
        knapp.setAttribute('aria-pressed', String(valgt?.id === m.id));
        knapp.addEventListener('click', () => velg(m));
        return el('li', {}, knapp);
      }),
    );
    if (!liste.length)
      rutenett.append(
        el(
          'li',
          { class: 'dp-bildevelger__tom' },
          medier.length ? 'Ingen bilder passer søket.' : 'Ingen bilder ennå. Last opp det første.',
        ),
      );
  }
  sok.addEventListener('input', tegnRutenett);

  fil.addEventListener('change', async () => {
    const filer = [...(fil.files ?? [])];
    fil.value = '';
    if (!filer.length) return;
    const feil: string[] = [];
    let siste: Medium | null = null;
    framdrift.hidden = false;
    for (const [i, f] of filer.entries()) {
      vis(`Laster opp ${f.name} (${i + 1} av ${filer.length}) …`);
      framdrift.value = 0;
      try {
        const { medium, gjentatt } = await cms.lastOpp(f, (andel) => (framdrift.value = andel));
        if (!medier.some((m) => m.id === medium.id)) medier.unshift(medium);
        siste = medium;
        if (gjentatt) feil.push(`${f.name} finnes allerede i biblioteket, og er valgt.`);
      } catch (e) {
        feil.push(`${f.name}: ${e instanceof Error ? e.message : 'kunne ikke lastes opp.'}`);
      }
    }
    framdrift.hidden = true;
    if (siste) velg(siste);
    else tegnRutenett();
    const ok = filer.length - feil.filter((f) => !f.includes('finnes allerede')).length;
    vis(
      [ok ? `${ok} ${ok === 1 ? 'bilde' : 'bilder'} lastet opp.` : '', ...feil].filter(Boolean).join(' '),
      feil.some((f) => !f.includes('finnes allerede')),
    );
  });

  // ---- Details: preview with focus point, alt text
  const forhand = el('div', { class: 'dp-bildevelger__forhand' });
  const forhandBilde = el('img', { alt: '' });
  const punkt = el('span', { class: 'dp-bildevelger__punkt' });
  punkt.setAttribute('aria-hidden', 'true');
  forhand.append(forhandBilde, punkt);
  const fokusHjelp = el(
    'p',
    { class: 'dp-bildevelger__hjelp' },
    'Klikk i bildet på det som alltid skal synes når bildet beskjæres.',
  );

  const tall = (etikett: string) => {
    const inp = el('input', { type: 'number', min: '0', max: '100', step: '1' });
    const lab = el('label', { class: 'dp-bildevelger__tall' }, el('span', {}, etikett), inp, ' %');
    return { inp, lab };
  };
  const fx = tall('Fra venstre');
  const fy = tall('Fra toppen');
  const skjerm = el('div', { class: 'dp-bildevelger__bytt' });
  skjerm.setAttribute('role', 'group');
  skjerm.setAttribute('aria-label', 'Utsnitt for');
  const storKnapp = el('button', { type: 'button', class: 'dp-red__knapp' }, 'Stor skjerm');
  const mobilKnapp = el('button', { type: 'button', class: 'dp-red__knapp' }, 'Mobil');
  skjerm.append(storKnapp, mobilKnapp);
  const egetMobil = el('input', { type: 'checkbox' });
  const egetMobilEtikett = el(
    'label',
    { class: 'dp-bildevelger__avkryss' },
    egetMobil,
    'Eget utsnitt på mobil',
  );

  const dekorBoks = el('input', { type: 'checkbox' });
  const dekorEtikett = el(
    'label',
    { class: 'dp-bildevelger__avkryss' },
    dekorBoks,
    'Bildet er bare pynt (skjermlesere hopper over det)',
  );
  const altFelt = el('textarea', { rows: 2, maxLength: 300 });
  altFelt.id = `${id}-alt`;
  const altEtikett = el('label', { htmlFor: altFelt.id }, 'Hva viser bildet? (alt-tekst)');

  const detaljer = el(
    'div',
    { class: 'dp-bildevelger__detaljer' },
    forhand,
    fokusHjelp,
    skjerm,
    el('div', { class: 'dp-bildevelger__fokus' }, fx.lab, fy.lab),
    egetMobilEtikett,
    altEtikett,
    altFelt,
    dekorEtikett,
  );

  function aktivtPunkt(): [number, number] {
    return redigererMobil && mobil ? mobil : fokus;
  }

  function tegnDetaljer() {
    const bilde = valgt ?? null;
    detaljer.hidden = !bilde;
    if (!bilde) return;
    if (forhandBilde.dataset.id !== String(bilde.id)) {
      forhandBilde.dataset.id = String(bilde.id);
      forhandBilde.src = bilde.miniatyr;
      forhandBilde.srcset = bilde.srcset;
      forhandBilde.sizes = '22rem';
    }
    const [x, y] = aktivtPunkt();
    punkt.style.left = `${x}%`;
    punkt.style.top = `${y}%`;
    fx.inp.value = String(Math.round(x));
    fy.inp.value = String(Math.round(y));
    egetMobil.checked = mobil !== null;
    mobilKnapp.disabled = mobil === null;
    if (mobil === null) redigererMobil = false;
    storKnapp.setAttribute('aria-pressed', String(!redigererMobil));
    mobilKnapp.setAttribute('aria-pressed', String(redigererMobil));
    altFelt.value = alt;
    altFelt.disabled = dekorativ;
    dekorBoks.checked = dekorativ;
    bruk.disabled = !dekorativ && !alt.trim();
  }

  function settPunkt(p: [number, number]) {
    const rett: [number, number] = [Math.max(0, Math.min(100, p[0])), Math.max(0, Math.min(100, p[1]))];
    if (redigererMobil && mobil) mobil = rett;
    else fokus = rett;
    tegnDetaljer();
  }

  forhand.addEventListener('click', (e) => {
    const r = forhandBilde.getBoundingClientRect();
    settPunkt([((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100]);
  });
  fx.inp.addEventListener('change', () => settPunkt([Number(fx.inp.value), aktivtPunkt()[1]]));
  fy.inp.addEventListener('change', () => settPunkt([aktivtPunkt()[0], Number(fy.inp.value)]));
  storKnapp.addEventListener('click', () => {
    redigererMobil = false;
    tegnDetaljer();
  });
  mobilKnapp.addEventListener('click', () => {
    redigererMobil = true;
    tegnDetaljer();
  });
  egetMobil.addEventListener('change', () => {
    mobil = egetMobil.checked ? [...fokus] : null;
    redigererMobil = egetMobil.checked;
    tegnDetaljer();
  });
  altFelt.addEventListener('input', () => {
    alt = altFelt.value;
    bruk.disabled = !dekorativ && !alt.trim();
  });
  dekorBoks.addEventListener('change', () => {
    dekorativ = dekorBoks.checked;
    tegnDetaljer();
  });

  function velg(m: Medium) {
    const forrige = valgt;
    valgt = m;
    // A new picture brings its own description from the library unless one is written.
    if (!forrige || !alt.trim() || alt === forrige.alt) alt = m.alt;
    tegnRutenett();
    tegnDetaljer();
    vis(`Valgt: ${m.navn}.`);
  }

  // ---- Actions
  let svar: { verdi: Bildeverdi; info: Bildeinfo | null } | undefined;
  const bruk = lagKnapp('Bruk bildet', 'dp-red__knapp--primar', () => {
    if (!valgt) return;
    const verdi: Bildeverdi = {
      medium: valgt.id,
      alt: dekorativ ? '' : alt.trim(),
      dekorativ,
      fokus: fokusTekst(fokus),
      fokusMobil: mobil ? fokusTekst(mobil) : null,
    };
    svar = { verdi, info: infoFra(valgt, verdi) };
    dialog.close();
  });
  const original = lagKnapp('Bruk bildet siden ble laget med', '', () => {
    svar = { verdi: { medium: null }, info: null };
    dialog.close();
  });
  original.hidden = o.naa === null || o.naa.medium === null;
  const avbryt = lagKnapp('Avbryt', '', () => dialog.close());

  dialog.append(
    el('h2', { id: `${id}-tittel` }, o.tittel),
    el(
      'div',
      { class: 'dp-bildevelger__innhold' },
      el(
        'section',
        { class: 'dp-bildevelger__bibliotek' },
        el('div', { class: 'dp-bildevelger__verktoy' }, fil, filEtikett, sok),
        framdrift,
        rutenett,
      ),
      detaljer,
    ),
    melding,
    el('div', { class: 'dp-bildevelger__knapper' }, bruk, original, avbryt),
  );
  detaljer.hidden = true;
  rutenett.append(el('li', { class: 'dp-bildevelger__tom' }, 'Henter bildene …'));

  return new Promise((ferdig) => {
    dialog.addEventListener('close', () => {
      dialog.remove();
      ferdig(svar);
    });
    dialog.showModal();
    cms
      .medier()
      .then((d) => {
        medier = d.medier;
        if (!d.kanLageBilder)
          vis('Serveren kan ikke gjøre om bilder ennå (mangler GD). Se «Drift» i CMS-et.', true);
        const naa = o.naa?.medium ?? null;
        const m = naa === null ? null : medier.find((x) => x.id === naa);
        if (m) velg(m);
        else tegnRutenett();
        if (m) vis('');
      })
      .catch((e) => {
        rutenett.replaceChildren();
        vis(e instanceof Error ? e.message : 'Fant ikke bildebiblioteket.', true);
      });
  });
}
