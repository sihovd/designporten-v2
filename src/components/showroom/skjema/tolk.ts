/**
 * Reads and validates a submitted idea or contact form (server side).
 * Pure apart from reading uploaded files, so it can be unit tested.
 * Delivery itself is src/lib/skjema/levering.ts.
 */
import { opplasting, sjekkFil, type Innsending, type Vedlegg } from '@/lib/skjema/levering';
import { erStartpunkt, startpunkter } from '../startpunkter';

export type Skjematype = 'ide' | 'kontakt';

export const antallValg = ['1', '2–10', '11–100', '100+'] as const;

export type Tolkning =
  { ok: true; innsending: Innsending; honningkrukke: boolean } | { ok: false; feil: Record<string, string> };

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tekst(data: FormData, navn: string, maks = 4000): string {
  const v = data.get(navn);
  return typeof v === 'string' ? v.trim().slice(0, maks) : '';
}

export async function tolkSkjema(data: FormData): Promise<Tolkning> {
  const type: Skjematype = tekst(data, 'skjema') === 'kontakt' ? 'kontakt' : 'ide';
  const feil: Record<string, string> = {};

  const beskrivelse = tekst(data, 'beskrivelse', 8000);
  const navn = tekst(data, 'navn', 200);
  const epost = tekst(data, 'epost', 200);
  const telefon = tekst(data, 'telefon', 40);

  if (!beskrivelse) {
    feil.beskrivelse = type === 'ide' ? 'Skriv litt om hva du vil lage.' : 'Skriv hva henvendelsen gjelder.';
  }
  if (!navn) feil.navn = 'Skriv navnet ditt.';
  if (!epost) feil.epost = 'Skriv e-postadressen din, så vi kan svare.';
  else if (!EPOST.test(epost)) feil.epost = 'E-postadressen ser ikke riktig ut.';

  const filer = data.getAll('filer').filter((f): f is File => f instanceof File && f.size > 0);
  if (filer.length > opplasting.maksFiler) {
    feil.filer = `Du kan laste opp opptil ${opplasting.maksFiler} filer.`;
  } else {
    const filfeil = filer.map(sjekkFil).filter((m): m is string => m !== null);
    if (filfeil.length) feil.filer = filfeil.join(' ');
  }

  if (Object.keys(feil).length) return { ok: false, feil };

  const vedlegg: Vedlegg[] = await Promise.all(
    filer.map(async (f) => ({
      filnavn: f.name,
      type: f.type || 'application/octet-stream',
      innhold: new Uint8Array(await f.arrayBuffer()),
    })),
  );

  const kundetype = tekst(data, 'kundetype') === 'bedrift' ? 'bedrift' : 'privat';
  const firma = tekst(data, 'firma', 200);
  const felter: [string, string][] = [];

  if (type === 'ide') {
    const start = tekst(data, 'start');
    const startvalg = erStartpunkt(start) ? startpunkter.find((s) => s.id === start)!.tittel : '';
    const antall = tekst(data, 'antall');
    felter.push(
      ['Utgangspunkt', startvalg],
      ['Hva vil du lage?', beskrivelse],
      ['Omtrentlige mål', tekst(data, 'mal', 400)],
      ['Antall', (antallValg as readonly string[]).includes(antall) ? antall : ''],
      ['Til når?', tekst(data, 'ingenHast') ? 'Ingen hast' : tekst(data, 'frist', 40)],
    );
  } else {
    felter.push(['Melding', beskrivelse]);
  }
  felter.push(
    ['Navn', navn],
    ['E-post', epost],
    ['Telefon', telefon],
    ['Privat eller bedrift', kundetype === 'bedrift' ? `Bedrift${firma ? `: ${firma}` : ''}` : 'Privat'],
    ['Vedlegg', vedlegg.map((v) => v.filnavn).join(', ')],
  );

  return {
    ok: true,
    honningkrukke: tekst(data, 'nettside') !== '',
    innsending: {
      type,
      emne: type === 'ide' ? `Ny idé fra ${navn}` : `Melding fra ${navn}`,
      felter,
      svarTil: epost,
      vedlegg,
    },
  };
}
