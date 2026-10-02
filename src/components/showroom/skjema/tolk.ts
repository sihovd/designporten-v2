/**
 * Reads and validates a submitted enquiry or contact form (server side).
 * Pure apart from reading uploaded files, so it can be unit tested.
 * Delivery itself is src/lib/skjema/levering.ts. The PHP version for one.com
 * is php/api/foresporsel/index.php; src/server/php.test.ts keeps them in step.
 *
 * One form engine (design revision 2026-10-02, §15–17): the enquiry form asks
 * private or business first, then what the customer has to start with, and
 * shows the fields that fit. Business adds company, organisation number,
 * quantity, material wishes and technical requirements.
 */
import { opplasting, sjekkFil, sjekkTotal } from '@/lib/skjema/grenser';
import type { Innsending, Vedlegg } from '@/lib/skjema/levering';
import { erStartpunkt, startpunkter } from '../startpunkter';

export type Skjematype = 'ide' | 'kontakt';
export type Kundetype = 'privat' | 'bedrift';

export const antallValg = ['1', '2–10', '11–100', '100+'] as const;

export type Tolkning =
  { ok: true; innsending: Innsending; honningkrukke: boolean } | { ok: false; feil: Record<string, string> };

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORGNR = /^\d{9}$/;
const LENKE = /^https?:\/\/\S+$/i;

function tekst(data: FormData, navn: string, maks = 4000): string {
  const v = data.get(navn);
  return typeof v === 'string' ? v.trim().slice(0, maks) : '';
}

export async function tolkSkjema(data: FormData): Promise<Tolkning> {
  const type: Skjematype = tekst(data, 'skjema') === 'kontakt' ? 'kontakt' : 'ide';
  const kundetype: Kundetype = tekst(data, 'kundetype') === 'bedrift' ? 'bedrift' : 'privat';
  const bedrift = type === 'ide' && kundetype === 'bedrift';
  const feil: Record<string, string> = {};

  const beskrivelse = tekst(data, 'beskrivelse', 8000);
  const navn = tekst(data, 'navn', 200);
  const epost = tekst(data, 'epost', 200);
  const telefon = tekst(data, 'telefon', 40);
  const firma = tekst(data, 'firma', 200);
  const orgnr = tekst(data, 'orgnr', 20).replace(/\s/g, '');
  const fillenke = tekst(data, 'fillenke', 1000);

  if (!beskrivelse) {
    feil.beskrivelse =
      type === 'kontakt'
        ? 'Skriv hva henvendelsen gjelder.'
        : bedrift
          ? 'Skriv litt om prosjektet.'
          : 'Skriv litt om hva du ser for deg.';
  }
  if (!navn) feil.navn = bedrift ? 'Skriv navnet på kontaktpersonen.' : 'Skriv navnet ditt.';
  if (!epost) feil.epost = 'Skriv e-postadressen din, så vi kan svare.';
  else if (!EPOST.test(epost)) feil.epost = 'E-postadressen ser ikke riktig ut.';
  if (bedrift && !firma) feil.firma = 'Skriv navnet på firmaet.';
  if (bedrift && orgnr && !ORGNR.test(orgnr)) feil.orgnr = 'Organisasjonsnummeret har ni siffer.';
  if (fillenke && !LENKE.test(fillenke)) feil.fillenke = 'Lenken må begynne med https://';

  // `filer[]` is the form's field name (PHP needs the brackets to keep every file).
  const filer = [...data.getAll('filer[]'), ...data.getAll('filer')].filter(
    (f): f is File => f instanceof File && f.size > 0,
  );
  if (filer.length > opplasting.maksFiler) {
    feil.filer = `Du kan laste opp opptil ${opplasting.maksFiler} filer.`;
  } else {
    const filfeil = filer.map(sjekkFil).filter((m): m is string => m !== null);
    if (filfeil.length) feil.filer = filfeil.join(' ');
    else {
      const total = sjekkTotal(filer);
      if (total) feil.filer = total;
    }
  }

  if (Object.keys(feil).length) return { ok: false, feil };

  const vedlegg: Vedlegg[] = await Promise.all(
    filer.map(async (f) => ({
      filnavn: f.name,
      type: f.type || 'application/octet-stream',
      innhold: new Uint8Array(await f.arrayBuffer()),
    })),
  );

  const felter: [string, string][] = [];

  if (type === 'ide') {
    const start = tekst(data, 'start');
    const startvalg = erStartpunkt(start) ? startpunkter.find((s) => s.id === start)!.tittel : '';
    const antall = tekst(data, 'antall');
    felter.push(['Kundetype', bedrift ? 'Bedrift' : 'Privat']);
    if (bedrift) felter.push(['Firma', firma], ['Organisasjonsnummer', orgnr]);
    felter.push(
      ['Utgangspunkt', startvalg],
      [bedrift ? 'Prosjektbeskrivelse' : 'Hva ser du for deg?', beskrivelse],
      ['Omtrentlige mål', tekst(data, 'mal', 400)],
    );
    if (bedrift) {
      felter.push(
        ['Antall', (antallValg as readonly string[]).includes(antall) ? antall : ''],
        ['Materialønske', tekst(data, 'materiale', 400)],
        ['Tekniske krav', tekst(data, 'krav', 4000)],
      );
    }
    felter.push(
      [
        bedrift ? 'Ønsket leveringsfrist' : 'Til når?',
        tekst(data, 'ingenHast') ? 'Ingen hast' : tekst(data, 'frist', 40),
      ],
      ['Lenke til filer', fillenke],
    );
  } else {
    felter.push(['Melding', beskrivelse]);
  }
  felter.push(
    [bedrift ? 'Kontaktperson' : 'Navn', navn],
    ['E-post', epost],
    ['Telefon', telefon],
    ['Vedlegg', vedlegg.map((v) => v.filnavn).join(', ')],
  );

  const emne =
    type === 'kontakt'
      ? `Melding fra ${navn}`
      : bedrift
        ? `Ny bedriftsforespørsel fra ${firma}`
        : `Ny forespørsel fra ${navn}`;

  return {
    ok: true,
    honningkrukke: tekst(data, 'nettside') !== '',
    innsending: { type, emne, felter, svarTil: epost, vedlegg },
  };
}
