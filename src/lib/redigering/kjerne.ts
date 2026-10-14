/**
 * Inline text editing on the pages: the parts that do not touch the page.
 *
 * Who may edit: whoever is signed in to the content editor at /admin in this
 * browser. Sveltia CMS keeps its GitHub token in localStorage on the same
 * site, so the page reads it from there, and GitHub decides (push access to
 * the repository) whether the token may write. No server is involved, so it
 * works the same on the static one.com build as on Render.
 *
 * Where it saves: the same JSON files /admin edits (src/content/sider/ and
 * src/content/produkter/data/), committed to `main` through GitHub's contents
 * API. The host rebuilds the site from that commit.
 */

export const REPO = 'sihovd/designporten-v2';
export const GREN = 'main';
export const API = 'https://api.github.com';
/** Where Sveltia CMS keeps the signed-in user (with its token). */
export const CMS_BRUKER = 'sveltia-cms.user';

export type Felttype = 'linje' | 'avsnitt';

export interface Adresse {
  /** Repository path of the JSON file. */
  fil: string;
  /** Path inside the JSON, e.g. ['snarveier', '0', 'tekst']. */
  sti: string[];
  /** Short name for commit messages: «sidetekst «forside»», «produkt «vase»». */
  navn: string;
}

const SIDE = /^sider\/([a-z0-9-]+)$/;
const PRODUKT = /^produkter\/data\/([a-z0-9-]+)$/;
const STI = /^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$/;

/**
 * Parse a data-rediger address such as `sider/forside#helt.tittel` or
 * `produkter/data/vase#navn`. Only page texts and products can be written to.
 */
export function tolkAdresse(adresse: string): Adresse | null {
  const [fil, sti, ...rest] = adresse.split('#');
  if (!fil || !sti || rest.length || !STI.test(sti)) return null;
  const side = SIDE.exec(fil);
  const produkt = PRODUKT.exec(fil);
  if (!side && !produkt) return null;
  return {
    fil: `src/content/${fil}.json`,
    sti: sti.split('.'),
    navn: side ? `sidetekst «${side[1]}»` : `produkt «${produkt![1]}»`,
  };
}

/**
 * The text an element holds, as it is stored: one line with single spaces, or
 * paragraphs separated by a blank line.
 */
export function normaliser(tekst: string, type: Felttype): string {
  if (type === 'linje') return tekst.replace(/\s+/g, ' ').trim();
  return tekst
    .split(/\n\s*\n|\n/)
    .map((a) => a.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export type Settresultat = 'ok' | 'endret-andre-steder' | 'finnes-ikke';

/**
 * Write one text into parsed JSON. Only an existing string is replaced, never
 * structure created. If the file no longer holds the text the page was built
 * with, someone changed it elsewhere (in /admin) and it is left alone.
 */
export function settTekst(
  data: unknown,
  sti: string[],
  forventet: string,
  ny: string,
  type: Felttype,
): Settresultat {
  let node = data;
  for (const del of sti.slice(0, -1)) {
    if (node === null || typeof node !== 'object') return 'finnes-ikke';
    node = (node as Record<string, unknown>)[del];
  }
  const siste = sti[sti.length - 1]!;
  if (node === null || typeof node !== 'object' || !Object.hasOwn(node, siste)) return 'finnes-ikke';
  const forelder = node as Record<string, unknown>;
  const naa = forelder[siste];
  if (typeof naa !== 'string') return 'finnes-ikke';
  if (normaliser(naa, type) !== normaliser(forventet, type)) return 'endret-andre-steder';
  forelder[siste] = ny;
  return 'ok';
}

/** The JSON text written back, in the same style as /admin writes it. */
export const tilJson = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

export function base64TilTekst(b64: string): string {
  const binar = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binar, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function tekstTilBase64(tekst: string): string {
  const bytes = new TextEncoder().encode(tekst);
  let binar = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binar += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binar);
}

/** The /admin token in this browser, if someone is signed in there. */
export function lesToken(lager: Pick<Storage, 'getItem'> | undefined): string | null {
  try {
    const raa = lager?.getItem(CMS_BRUKER);
    if (!raa) return null;
    const bruker = JSON.parse(raa) as { backendName?: unknown; token?: unknown };
    return bruker.backendName === 'github' && typeof bruker.token === 'string' && bruker.token
      ? bruker.token
      : null;
  } catch {
    return null;
  }
}

type Henter = typeof fetch;

const hoder = (token: string): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

export type Tilgang = 'kan-skrive' | 'kan-ikke-skrive' | 'utlopt' | 'nettfeil';

/** Ask GitHub whether the token may write to the repository. */
export async function sjekkTilgang(token: string, henter: Henter = fetch): Promise<Tilgang> {
  try {
    const svar = await henter(`${API}/repos/${REPO}`, { headers: hoder(token) });
    if (svar.status === 401) return 'utlopt';
    if (!svar.ok) return 'kan-ikke-skrive';
    const repo = (await svar.json()) as { permissions?: { push?: boolean } };
    return repo.permissions?.push ? 'kan-skrive' : 'kan-ikke-skrive';
  } catch {
    return 'nettfeil';
  }
}

export interface Endring {
  adresse: string;
  type: Felttype;
  /** The text the page was built with (or last saved). */
  original: string;
  ny: string;
}

export interface Lagreresultat {
  adresse: string;
  status: Settresultat | 'feil';
  melding?: string;
}

/**
 * Save changes: one commit per file. Each file is read fresh from GitHub just
 * before writing, so a change made in /admin since the page was built is never
 * overwritten (that field is reported instead).
 */
export async function lagreEndringer(
  token: string,
  endringer: Endring[],
  henter: Henter = fetch,
): Promise<Lagreresultat[]> {
  const perFil = new Map<string, { adresse: Adresse; endring: Endring }[]>();
  const resultater: Lagreresultat[] = [];
  for (const endring of endringer) {
    const adresse = tolkAdresse(endring.adresse);
    if (!adresse) {
      resultater.push({ adresse: endring.adresse, status: 'finnes-ikke' });
      continue;
    }
    perFil.set(adresse.fil, [...(perFil.get(adresse.fil) ?? []), { adresse, endring }]);
  }

  for (const [fil, liste] of perFil) {
    const url = `${API}/repos/${REPO}/contents/${fil}`;
    try {
      const svar = await henter(`${url}?ref=${GREN}`, { headers: hoder(token), cache: 'no-store' });
      if (!svar.ok)
        throw new Error(svar.status === 401 ? 'Innloggingen har gått ut.' : `GitHub svarte ${svar.status}.`);
      const fra = (await svar.json()) as { sha: string; content: string };
      const data: unknown = JSON.parse(base64TilTekst(fra.content));
      const ok: string[] = [];
      for (const { adresse, endring } of liste) {
        const status = settTekst(data, adresse.sti, endring.original, endring.ny, endring.type);
        resultater.push({ adresse: endring.adresse, status });
        if (status === 'ok') ok.push(endring.adresse);
      }
      if (!ok.length) continue;
      const lagret = await henter(url, {
        method: 'PUT',
        headers: { ...hoder(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Innhold: oppdaterer ${liste[0]!.adresse.navn} fra siden`,
          content: tekstTilBase64(tilJson(data)),
          sha: fra.sha,
          branch: GREN,
        }),
      });
      if (!lagret.ok) {
        const grunn =
          lagret.status === 409
            ? 'Filen ble endret samtidig. Prøv igjen.'
            : lagret.status === 401
              ? 'Innloggingen har gått ut.'
              : lagret.status === 403 || lagret.status === 404
                ? 'Innloggingen har ikke lov til å lagre i repoet.'
                : `GitHub svarte ${lagret.status}.`;
        throw new Error(grunn);
      }
    } catch (e) {
      const melding = e instanceof Error ? e.message : 'Ukjent feil.';
      for (const { endring } of liste) {
        const i = resultater.findIndex((r) => r.adresse === endring.adresse);
        const ny: Lagreresultat = { adresse: endring.adresse, status: 'feil', melding };
        if (i >= 0) resultater[i] = ny;
        else resultater.push(ny);
      }
    }
  }
  return resultater;
}
