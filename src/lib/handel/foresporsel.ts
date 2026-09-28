/**
 * Server side of the «forespørsel» provider: checks an order request against
 * the catalogue and turns it into a form submission (src/lib/skjema/levering.ts).
 * Prices are recomputed here; the browser's numbers are never trusted.
 * Pure (the catalogue is passed in), so it is unit tested.
 */
import type { Innsending } from '@/lib/skjema/levering';
import type { Bestilling } from './bestilling';
import { formaterKroner } from './kurv';
import { beregnPris } from './pris';
import type { ProduktVisning } from './visning';

export type Kontroll = { ok: true; innsending: Innsending } | { ok: false; grunn: string };

export function lagInnsending(
  b: Bestilling,
  finnProdukt: (id: string) => ProduktVisning | undefined,
): Kontroll {
  const varelinjer: string[] = [];
  let sum = 0;
  let utenPris = 0;

  for (const l of b.linjer) {
    const p = finnProdukt(l.produktId);
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
    },
  };
}
