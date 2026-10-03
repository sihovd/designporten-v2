/**
 * Browser behaviour for every enquiry and contact form on the page
 * (Foresporsel.astro): customer type and starting point, file previews,
 * errors by the fields, sending in place and the receipt.
 *
 * `settValg` lets the modal open the form with business or a starting point
 * already chosen (ForesporselModal.astro).
 */
import { MB, opplasting, sjekkFil, sjekkTotal } from '@/lib/skjema/grenser';
import { kanForhandsvise3d, lagMiniatyr3d } from './miniatyr3d';

interface Svar {
  ok: boolean;
  referanse?: string;
  kanal?: 'epost' | 'fil';
  feil?: Record<string, string>;
  grunn?: string;
}

const feltnavn: Record<string, string> = {
  beskrivelse: 'Beskrivelse',
  navn: 'Navn',
  epost: 'E-post',
  filer: 'Filer',
  firma: 'Firmanavn',
  orgnr: 'Organisasjonsnummer',
  fillenke: 'Lenke til filer',
};

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function storrelse(n: number): string {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(n / 1024))} kB`;
}

function endelse(navn: string): string {
  return (navn.split('.').pop() ?? '').toUpperCase();
}

/** Business or private: show the right fields, and keep the hidden ones out of the submission. */
function settKundetype(skjema: HTMLFormElement, type: string): void {
  const verdi = type === 'bedrift' ? 'bedrift' : 'privat';
  const radio = skjema.querySelector<HTMLInputElement>(`[data-kundetype][value="${verdi}"]`);
  if (!radio) return;
  radio.checked = true;
  skjema.dataset.kunde = verdi;
  skjema.querySelectorAll<HTMLElement>('[data-kun]').forEach((el) => {
    const av = el.dataset.kun !== verdi;
    el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    ).forEach((felt) => (felt.disabled = av));
  });
}

function settStart(skjema: HTMLFormElement, verdi: string): void {
  const valg = skjema.querySelector<HTMLInputElement>(`input[name="start"][value="${verdi}"]`);
  if (!valg) return;
  valg.checked = true;
  skjema.dataset.start = verdi;
  const beskrivelse = skjema.querySelector<HTMLTextAreaElement>('[data-beskrivelse]');
  if (beskrivelse) beskrivelse.placeholder = valg.dataset.eksempel ?? '';
}

export function settValg(skjema: HTMLFormElement, valg: { kundetype?: string; start?: string }): void {
  if (valg.kundetype) settKundetype(skjema, valg.kundetype);
  if (valg.start) settStart(skjema, valg.start);
}

function startFiler(skjema: HTMLFormElement): void {
  const input = skjema.querySelector<HTMLInputElement>('[data-filer]');
  const slipp = skjema.querySelector<HTMLElement>('[data-slipp]');
  const liste = skjema.querySelector<HTMLElement>('[data-filliste]');
  const status = skjema.querySelector<HTMLElement>('[data-filstatus]');
  if (!input || !liste) return;

  let valgte: File[] = [];
  const bilder = new Map<File, string>();

  function synk(): void {
    const dt = new DataTransfer();
    valgte.forEach((f) => dt.items.add(f));
    input!.files = dt.files;
  }

  function leggTil(nye: File[]): void {
    const kjente = new Set(valgte.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
    const avvist: string[] = [];
    for (const f of nye) {
      if (kjente.has(`${f.name}|${f.size}|${f.lastModified}`)) continue;
      const feil = sjekkFil(f);
      if (feil) avvist.push(feil);
      else if (valgte.length >= opplasting.maksFiler)
        avvist.push(`Du kan legge ved opptil ${opplasting.maksFiler} filer.`);
      else valgte.push(f);
    }
    const total = sjekkTotal(valgte);
    synk();
    tegn();
    const melding = [...new Set(avvist), ...(total ? [total] : [])].join(' ');
    if (status) {
      status.textContent = melding || `${valgte.length} ${valgte.length === 1 ? 'fil' : 'filer'} valgt.`;
      status.classList.toggle('skjema__feil', !!melding);
    }
  }

  function fjern(fil: File): void {
    valgte = valgte.filter((f) => f !== fil);
    const url = bilder.get(fil);
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    bilder.delete(fil);
    synk();
    tegn();
    if (status) {
      status.classList.remove('skjema__feil');
      status.textContent = `${fil.name} er fjernet.`;
    }
    input!.focus();
  }

  function forhandsvisning(fil: File, ramme: HTMLElement): void {
    const type = endelse(fil.name);
    const visType = () => {
      ramme.replaceChildren(
        Object.assign(document.createElement('span'), { className: 'fil__type', textContent: type }),
      );
    };
    const visBilde = (src: string, tredje = false) => {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.src = src;
      img.onerror = visType;
      ramme.classList.toggle('fil__bilde--3d', tredje);
      const merke = Object.assign(document.createElement('span'), {
        className: 'fil__merke',
        textContent: type,
      });
      ramme.replaceChildren(img, merke);
    };

    const kjent = bilder.get(fil);
    if (kjent) return visBilde(kjent, kanForhandsvise3d(fil.name));

    if (fil.type.startsWith('image/') && type !== 'HEIC') {
      const url = URL.createObjectURL(fil);
      bilder.set(fil, url);
      visBilde(url);
    } else if (kanForhandsvise3d(fil.name)) {
      ramme.replaceChildren(
        Object.assign(document.createElement('span'), {
          className: 'fil__laster',
          textContent: 'Lager bilde …',
        }),
      );
      lagMiniatyr3d(fil).then((url) => {
        if (!valgte.includes(fil)) return;
        if (url) {
          bilder.set(fil, url);
          visBilde(url, true);
        } else visType();
      });
    } else visType();
  }

  function tegn(): void {
    liste!.replaceChildren(
      ...valgte.map((fil) => {
        const li = document.createElement('li');
        li.className = 'fil';
        const ramme = document.createElement('span');
        ramme.className = 'fil__bilde';
        forhandsvisning(fil, ramme);
        const navn = Object.assign(document.createElement('span'), {
          className: 'fil__navn',
          textContent: fil.name,
          title: fil.name,
        });
        const str = Object.assign(document.createElement('span'), {
          className: 'fil__storrelse',
          textContent: storrelse(fil.size),
        });
        const knapp = document.createElement('button');
        knapp.type = 'button';
        knapp.className = 'fil__fjern';
        knapp.setAttribute('aria-label', `Fjern ${fil.name}`);
        knapp.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        knapp.addEventListener('click', () => fjern(fil));
        li.append(ramme, navn, str, knapp);
        return li;
      }),
    );
  }

  input.addEventListener('change', () => {
    const nye = [...(input.files ?? [])].filter((f) => !valgte.includes(f));
    // The picker replaces the input's list; keep what was chosen before.
    leggTil(nye);
  });
  if (slipp) {
    slipp.addEventListener('dragover', (e) => {
      e.preventDefault();
      slipp.classList.add('over');
    });
    slipp.addEventListener('dragleave', () => slipp.classList.remove('over'));
    slipp.addEventListener('drop', (e) => {
      e.preventDefault();
      slipp.classList.remove('over');
      leggTil([...(e.dataTransfer?.files ?? [])]);
    });
  }
}

export function startSkjema(skjema: HTMLFormElement): void {
  if (skjema.dataset.klar) return;
  skjema.dataset.klar = '1';
  const ramme = skjema.closest<HTMLElement>('[data-skjema-ramme]')!;
  const oppsummering = skjema.querySelector<HTMLElement>('[data-oppsummering]')!;
  const liste = skjema.querySelector<HTMLElement>('[data-oppsummering-liste]')!;
  const status = skjema.querySelector<HTMLElement>('[data-status]')!;
  const send = skjema.querySelector<HTMLButtonElement>('[data-send]')!;

  skjema
    .querySelectorAll<HTMLInputElement>('[data-kundetype]')
    .forEach((r) => r.addEventListener('change', () => settKundetype(skjema, r.value)));
  skjema
    .querySelectorAll<HTMLInputElement>('input[name="start"]')
    .forEach((r) => r.addEventListener('change', () => settStart(skjema, r.value)));
  settKundetype(skjema, skjema.dataset.kunde ?? 'privat');

  // «Ingen hast» disables the date.
  const frist = skjema.querySelector<HTMLInputElement>('[data-frist]');
  const ingenHast = skjema.querySelector<HTMLInputElement>('[data-ingen-hast]');
  ingenHast?.addEventListener('change', () => {
    if (frist) frist.disabled = ingenHast.checked;
  });

  startFiler(skjema);

  function nullstillFeil(): void {
    oppsummering.hidden = true;
    liste.replaceChildren();
    skjema.querySelectorAll<HTMLElement>('[data-feil-for]').forEach((el) => (el.textContent = ''));
    skjema.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function visFeil(feil: Record<string, string>): void {
    nullstillFeil();
    for (const [navn, melding] of Object.entries(feil)) {
      const felt = skjema.querySelector<HTMLElement>(`[name="${navn}"]:not(:disabled), [name="${navn}[]"]`);
      const tekst = skjema.querySelector<HTMLElement>(`[data-feil-for="${navn}"]`);
      if (tekst) tekst.textContent = melding;
      felt?.setAttribute('aria-invalid', 'true');
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${felt?.id ?? ''}`;
      a.textContent = `${feltnavn[navn] ?? navn}: ${melding}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        felt?.focus();
      });
      li.append(a);
      liste.append(li);
    }
    oppsummering.hidden = false;
    oppsummering.focus();
  }

  function sjekkLokalt(): Record<string, string> {
    const feil: Record<string, string> = {};
    const felt = (navn: string) => skjema.querySelector<HTMLInputElement>(`[name="${navn}"]:not(:disabled)`);
    const verdi = (navn: string) => felt(navn)?.value.trim() ?? '';
    const bedrift = skjema.dataset.kunde === 'bedrift' && verdi('skjema') === 'ide';
    if (!verdi('beskrivelse')) {
      feil.beskrivelse =
        verdi('skjema') === 'kontakt'
          ? 'Skriv hva henvendelsen gjelder.'
          : bedrift
            ? 'Skriv litt om prosjektet.'
            : 'Skriv litt om hva du ser for deg.';
    }
    if (felt('firma') && !verdi('firma')) feil.firma = 'Skriv navnet på firmaet.';
    const orgnr = verdi('orgnr').replace(/\s/g, '');
    if (orgnr && !/^\d{9}$/.test(orgnr)) feil.orgnr = 'Organisasjonsnummeret har ni siffer.';
    const lenke = verdi('fillenke');
    if (lenke && !/^https?:\/\/\S+$/i.test(lenke)) feil.fillenke = 'Lenken må begynne med https://';
    if (!verdi('navn')) feil.navn = bedrift ? 'Skriv navnet på kontaktpersonen.' : 'Skriv navnet ditt.';
    const epost = verdi('epost');
    if (!epost) feil.epost = 'Skriv e-postadressen din, så vi kan svare.';
    else if (!EPOST.test(epost)) feil.epost = 'E-postadressen ser ikke riktig ut.';
    const filer = [...(skjema.querySelector<HTMLInputElement>('[data-filer]')?.files ?? [])];
    const filfeil = sjekkTotal(filer);
    if (filfeil) feil.filer = filfeil;
    return feil;
  }

  skjema.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lokal = sjekkLokalt();
    if (Object.keys(lokal).length) {
      visFeil(lokal);
      return;
    }
    nullstillFeil();
    send.disabled = true;
    send.setAttribute('aria-busy', 'true');
    status.textContent = 'Sender …';
    try {
      const svar = await fetch(skjema.action, {
        method: 'POST',
        body: new FormData(skjema),
        headers: { accept: 'application/json' },
      });
      const data = (await svar.json().catch(() => ({
        ok: false,
        grunn:
          svar.status === 413
            ? `Filene er for store til å sendes. Hold deg under ${MB(opplasting.maksByteTotalt)} MB, eller send en lenke.`
            : undefined,
      }))) as Svar;
      if (data.ok) {
        const mal = ramme.querySelector<HTMLTemplateElement>('[data-kvittering-mal]')!;
        const kvittering = mal.content.firstElementChild!.cloneNode(true) as HTMLElement;
        const ref = kvittering.querySelector('[data-ref]');
        if (data.referanse && ref) ref.textContent = data.referanse;
        else kvittering.querySelector('[data-ref-linje]')?.remove();
        if (data.kanal !== 'fil') kvittering.querySelector('[data-utvikling]')?.remove();
        skjema.replaceWith(kvittering);
        kvittering.focus();
        ramme.dispatchEvent(new CustomEvent('skjema:sendt', { bubbles: true }));
        return;
      }
      if (data.feil && Object.keys(data.feil).length) visFeil(data.feil);
      status.textContent = data.grunn ?? 'Meldingen kunne ikke sendes. Prøv igjen om litt.';
    } catch {
      status.textContent = 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.';
    } finally {
      send.disabled = false;
      send.removeAttribute('aria-busy');
    }
  });

  // An inline form reads ?kundetype= and ?start= from the address.
  if (!skjema.closest('dialog')) {
    const sok = new URLSearchParams(location.search);
    settValg(skjema, { kundetype: sok.get('kundetype') ?? undefined, start: sok.get('start') ?? undefined });
  }
}

export function startSkjemaer(): void {
  document.querySelectorAll<HTMLFormElement>('[data-skjema]').forEach(startSkjema);
}
