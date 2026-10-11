/**
 * Reading page texts at build time. `sidetekst('forside')` validates the
 * page's JSON against its definition (a missing or misspelt field stops the
 * build) and returns a reader:
 *
 *   const t = sidetekst('forside');
 *   <h2 {...t.r('portal.tittel')}>{t('portal.tittel')}</h2>
 *
 * `t.r()` marks the element as editable on the page (data-rediger), with the
 * address the inline editor saves to.
 */
import { z } from 'zod';
import { sider, type Felt, type SideId } from './definisjon';

const filer = import.meta.glob<unknown>('/src/content/sider/*.json', { eager: true, import: 'default' });

export function skjemaFor(felt: Record<string, Felt>): z.ZodType {
  const form: Record<string, z.ZodType> = {};
  for (const [navn, f] of Object.entries(felt)) {
    if (f.type === 'tekst') {
      const tekst = z.string().trim();
      form[navn] = f.valgfri ? tekst : tekst.min(1, `«${f.etikett}» kan ikke være tom`);
    } else if (f.type === 'gruppe') {
      form[navn] = skjemaFor(f.felt);
    } else {
      form[navn] = z
        .array(skjemaFor(f.felt))
        .min(f.min ?? 0)
        .max(f.max ?? 100);
    }
  }
  return z.object(form);
}

/** Raw page data, validated. Throws with the page and field named. */
export function sidedata(id: SideId): Record<string, unknown> {
  const data = filer[`/src/content/sider/${id}.json`];
  if (data === undefined) throw new Error(`Sidetekster mangler: src/content/sider/${id}.json`);
  const resultat = skjemaFor(sider[id].felt).safeParse(data);
  if (!resultat.success) {
    const feil = resultat.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Sidetekster for «${id}» er ugyldige: ${feil}`);
  }
  return resultat.data as Record<string, unknown>;
}

function hent(data: unknown, sti: string): unknown {
  return sti.split('.').reduce<unknown>((verdi, del) => {
    if (verdi === null || typeof verdi !== 'object') return undefined;
    return (verdi as Record<string, unknown>)[del];
  }, data);
}

export interface Sidetekst {
  /** The text at a dotted path, e.g. 'helt.tittel' or 'snarveier.0.tekst'. */
  (sti: string): string;
  /** Attributes that make an element editable inline. */
  r(sti: string, type?: 'linje' | 'avsnitt'): Record<string, string>;
  /** Number of entries in a list field. */
  antall(sti: string): number;
  /** Address prefix for components that mark their own fields (BildeHelt, SideHode). */
  kilde(sti: string): string;
}

export function sidetekst(id: SideId): Sidetekst {
  const data = sidedata(id);
  const t = ((sti: string) => {
    const verdi = hent(data, sti);
    if (typeof verdi !== 'string') throw new Error(`Sidetekst finnes ikke: ${id} → ${sti}`);
    return verdi;
  }) as Sidetekst;
  t.r = (sti, type = 'linje') => {
    t(sti);
    const attr: Record<string, string> = { 'data-rediger': `sider/${id}#${sti}` };
    if (type === 'avsnitt') attr['data-rediger-type'] = 'avsnitt';
    return attr;
  };
  t.antall = (sti) => {
    const verdi = hent(data, sti);
    if (!Array.isArray(verdi)) throw new Error(`Sideteksten er ikke en liste: ${id} → ${sti}`);
    return verdi.length;
  };
  t.kilde = (sti) => `sider/${id}#${sti}`;
  return t;
}

/** Attributes for one field under a component's address prefix (see `Sidetekst.kilde`). */
export const redigerbar = (kilde: string | undefined, felt: string): Record<string, string> =>
  kilde ? { 'data-rediger': `${kilde}.${felt}` } : {};
