/**
 * Server side of the «forespørsel» provider: checks an order request against
 * the catalogue and turns it into a form submission (src/lib/skjema/levering.ts).
 * Prices are recomputed here; the browser's numbers are never trusted.
 * Skaperverksted designs have no catalogue price («pris avtales»); their
 * summary goes in the message and their document JSON as an attachment.
 * Pure (catalogue and document check are passed in), so it is unit tested.
 */
import type { Innsending, Vedlegg } from '@/lib/skjema/levering';
import { DESIGN_PREFIKS, erDesignlinje, type Bestilling, type Bestillingslinje } from './bestilling';
import { formaterKroner } from './kurv';
import { beregnPris } from './pris';
import type { ProduktVisning } from './visning';

export type Kontroll = { ok: true; innsending: Innsending } | { ok: false; grunn: string };

export interface Oppslag {
  finnProdukt: (id: string) => ProduktVisning | undefined;
  /** Returns the normalised document JSON, or null when it is not a valid document. */
  sjekkDokument: (dokument: unknown, generator: string) => string | null;
}

function designlinje(
  l: Bestillingslinje,
  sjekk: Oppslag['sjekkDokument'],
): { tekst: string; vedlegg: Vedlegg } | string {
  const d = l.design;
  if (!d)
    return 'Et design i handlekurven mangler. Fjern linjen og legg designet inn på nytt fra Skaperverksted.';
  if (l.produktId !== `${DESIGN_PREFIKS}${d.generator}`)
    return 'Et design i handlekurven passer ikke med linjen sin.';
  const json = sjekk(d.dokument, d.generator);
  if (!json) return `Designet «${d.navn}» kunne ikke leses. Legg det inn på nytt fra Skaperverksted.`;
  const valg = Object.entries(l.valg).map(([k, v]) => `${k}: ${v}`);
  const tekst = [
    `${l.antall} × ${l.navn || d.navn} [Skaperverksted: ${d.generator}, pris avtales]`,
    ...[...valg, ...d.sammendrag].map((x) => `  ${x}`),
    `  Designfil: design-${d.id}.json (vedlagt)`,
  ].join('\n');
  return {
    tekst,
    vedlegg: {
      filnavn: `design-${d.id}.json`,
      type: 'application/json',
      innhold: new TextEncoder().encode(json),
    },
  };
}

export function lagInnsending(b: Bestilling, oppslag: Oppslag): Kontroll {
  const varelinjer: string[] = [];
  const vedlegg: Vedlegg[] = [];
  let sum = 0;
  let utenPris = 0;
  let design = 0;

  for (const l of b.linjer) {
    if (erDesignlinje(l)) {
      const r = designlinje(l, oppslag.sjekkDokument);
      if (typeof r === 'string') return { ok: false, grunn: r };
      varelinjer.push(r.tekst);
      vedlegg.push(r.vedlegg);
      design += l.antall;
      continue;
    }

    const p = oppslag.finnProdukt(l.produktId);
    if (!p)
      return { ok: false, grunn: 'Et produkt i handlekurven finnes ikke lenger. Fjern det og prøv igjen.' };

    const farge = p.farger.find((f) => f.id === l.valg.farge);
    const materiale = p.materialer.find((m) => m.type === l.valg.materiale);
    if (!farge || !materiale) {
      return {
        ok: false,
        grunn: `Valgene for «${p.navn}» er ikke gyldige lenger. Fjern varen og legg den inn på nytt.`,
      };
    }
    const tekst = (l.valg.tekst ?? '').trim();
    if (tekst && (!p.egenTekst || tekst.length > p.egenTekst.maksTegn)) {
      return { ok: false, grunn: `Teksten for «${p.navn}» er for lang eller ikke tillatt.` };
    }
    const ukjente = Object.keys(l.valg).filter((k) => !['farge', 'materiale', 'tekst'].includes(k));
    if (ukjente.length) return { ok: false, grunn: 'Handlekurven inneholder ukjente valg.' };

    const pris = beregnPris(p, { tekst });
    if (pris === null) utenPris += l.antall;
    else sum += pris * l.antall;

    const valg = [`Farge: ${farge.navn}`, `Materiale: ${materiale.type}`, tekst ? `Tekst: «${tekst}»` : null]
      .filter(Boolean)
      .join(', ');
    const prisTekst = pris === null ? 'pris ikke fastsatt' : `${formaterKroner(pris)} per stk.`;
    const status = p.status === 'plassholder' ? ' [plassholderprodukt]' : '';
    varelinjer.push(`${l.antall} × ${p.navn} (${p.id})${status}\n  ${valg}\n  ${prisTekst}`);
  }

  const antall = b.linjer.reduce((s, l) => s + l.antall, 0);
  const sumTekst = [
    sum > 0 ? `${formaterKroner(sum)} for varer med pris` : null,
    utenPris > 0 ? `${utenPris} ${utenPris === 1 ? 'vare' : 'varer'} uten fastsatt pris` : null,
    design > 0 ? `${design} design fra Skaperverksted, pris avtales` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ok: true,
    innsending: {
      type: 'bestilling',
      emne: `Bestillingsforespørsel fra ${b.navn} (${antall} ${antall === 1 ? 'vare' : 'varer'})`,
      svarTil: b.epost,
      felter: [
        ['Navn', b.navn],
        ['E-post', b.epost],
        ['Telefon', b.telefon],
        ['Melding', b.melding],
        ['Varer', varelinjer.join('\n\n')],
        ['Sum', sumTekst],
        ['Betaling', 'Ingen betaling er tatt. Dette er en bestillingsforespørsel fra nettsiden.'],
      ],
      vedlegg,
    },
  };
}
