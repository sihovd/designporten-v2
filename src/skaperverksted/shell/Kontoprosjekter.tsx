/**
 * Projects on the account (stage C, Sivert 2026-10-18): «Lagre på kontoen»
 * and «Mine prosjekter …» in the file menu, and `?prosjekt=<id>` from
 * «Min konto». Only for tools listed in tjenester.json `prosjektapper`, and
 * only where accounts are switched on. The server decides who owns what and
 * how many projects fit; this shows its answers. Nothing is uploaded on its
 * own, and nothing in the browser is lost: the open project keeps its
 * autosave, a refused save leaves it as it is, and opening a project from the
 * account first puts unsaved work aside («Last ned forrige prosjekt»).
 */
import { useEffect, useState } from 'preact/hooks';
import { nettsti } from '@/lib/nettsti';
import { konto, KontoFeil, type Kvote, type Prosjekt } from '@/lib/konto/api';
import { PROSJEKTAPPER } from '@/lib/konto/tjenester';
import type { Arbeidsbenk } from '../core/arbeidsbenk';
import { fraJson, tilJson, DokumentFeil } from '../core/dokument';
import { harUlagret, hentKobling, settKobling } from '../core/kontokobling';
import { hentReserve, lastNed, leggTilSide } from '../core/lagring';
import { filnavn } from '../eksport/tremf';
import { Dialog } from './Dialog';
import { Ikon } from './ikoner';

type Vindu =
  | { type: 'liste' }
  | { type: 'konflikt'; revisjon: number; endret: string }
  | { type: 'beskjed'; tittel: string; tekst: string; loggInn?: boolean };

const dato = (v: string) => new Date(v).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
const kb = (b: number) => (b < 1000 ? '1 kB' : `${Math.round(b / 1000)} kB`);
const feiltekst = (e: unknown) => (e instanceof Error ? e.message : 'Noe gikk galt.');
const lukkMeny = (e: Event) => (e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');

/** The project's JSON file name, as «Lagre som fil» names it. */
const jsonnavn = (navn: string) => filnavn(navn, 'stl').replace(/\.stl$/, '.skaperverksted.json');

export function brukKontoprosjekter(
  benk: Arbeidsbenk,
  generator: string,
  aktiv: boolean,
  reserveEndret: (json: string | null) => void,
) {
  const [vindu, settVindu] = useState<Vindu | null>(null);
  const [arbeider, settArbeider] = useState(false);

  const beskjed = (tittel: string, tekst: string, loggInn = false) =>
    settVindu({ type: 'beskjed', tittel, tekst, loggInn });

  /** Open a project from the account; unsaved work in the browser is put aside first. */
  const apne = async (id: string, sporForErstatt = true): Promise<boolean> => {
    let p: Prosjekt & { dokument: unknown };
    try {
      p = (await konto.prosjekt(id)).prosjekt;
    } catch (e) {
      if (e instanceof KontoFeil && e.status === 401)
        beskjed('Logg inn for å åpne', 'Du må være logget inn for å åpne prosjekter fra kontoen.', true);
      else beskjed('Prosjektet ble ikke åpnet', feiltekst(e));
      return false;
    }
    if (p.app !== generator) {
      beskjed('Prosjektet ble ikke åpnet', `Prosjektet er laget i et annet verktøy (${p.app}).`);
      return false;
    }
    let dok;
    try {
      dok = fraJson(JSON.stringify(p.dokument));
    } catch (e) {
      beskjed(
        'Prosjektet ble ikke åpnet',
        e instanceof DokumentFeil ? e.message : 'Prosjektet kunne ikke leses.',
      );
      return false;
    }
    const naa = benk.dok;
    const leggesTilSide = naa.id !== dok.id || harUlagret(naa);
    if (leggesTilSide) {
      if (
        sporForErstatt &&
        hentReserve(generator) &&
        !confirm(
          'Det du har åpent nå, legges til side før prosjektet åpnes. Et prosjekt som allerede er lagt til side, blir da erstattet. Fortsette?',
        )
      )
        return false;
      const json = tilJson(naa);
      if (
        !leggTilSide(generator, json) &&
        !confirm('Det du har åpent, kunne ikke lagres til side. Åpne likevel?')
      )
        return false;
      reserveEndret(json);
    }
    benk.lastInn(dok);
    settKobling(benk.dok, { id: p.id, app: p.app, revisjon: p.revisjon });
    benk.settUtsnitt({ zoom: 1, senterX: 0, senterY: 0 });
    benk.kommando('tilpass');
    benk.melde(
      leggesTilSide
        ? `Åpnet «${p.navn}» fra kontoen. Det du hadde åpent, er lagt til side: Fil → «Last ned forrige prosjekt».`
        : `Åpnet «${p.navn}» fra kontoen.`,
    );
    return true;
  };

  const lagre = async (somKopi = false) => {
    const dok = benk.dok;
    const k = somKopi ? null : hentKobling(dok);
    settArbeider(true);
    try {
      const { prosjekt, kvote } = await konto.lagreProsjekt({
        app: generator,
        navn: dok.navn,
        dokument: JSON.parse(tilJson(dok)) as unknown,
        ...(k ? { id: k.id, revisjon: k.revisjon } : {}),
      });
      settKobling(dok, { id: prosjekt.id, app: prosjekt.app, revisjon: prosjekt.revisjon });
      settVindu(null);
      benk.melde(
        `«${prosjekt.navn}» er lagret på kontoen${somKopi ? ' som en kopi' : ''}. Du har ${kvote.brukt} av ${kvote.maks} prosjekter.`,
      );
    } catch (e) {
      if (e instanceof KontoFeil && e.status === 409 && k) {
        settVindu({
          type: 'konflikt',
          revisjon: Number(e.data.revisjon),
          endret: String(e.data.endret ?? ''),
        });
      } else if (e instanceof KontoFeil && e.status === 404 && k) {
        settKobling(dok, null);
        beskjed(
          'Finnes ikke lenger på kontoen',
          'Prosjektet er slettet fra kontoen siden du åpnet det. Velg «Lagre på kontoen» igjen for å lagre det som et nytt prosjekt. Det ligger fortsatt i denne nettleseren.',
        );
      } else if (e instanceof KontoFeil && e.status === 401) {
        beskjed(
          'Logg inn for å lagre',
          'Du må være logget inn for å lagre prosjekter på kontoen. Prosjektet ligger fortsatt i denne nettleseren, og «Lagre som fil» tar vare på det.',
          true,
        );
      } else {
        const tekst = feiltekst(e);
        beskjed(
          'Ikke lagret på kontoen',
          /nettleseren|som fil/.test(tekst)
            ? tekst
            : `${tekst} Prosjektet ligger fortsatt i denne nettleseren.`,
        );
      }
    } finally {
      settArbeider(false);
    }
  };

  // «Åpne» under Min konto opens the tool with ?prosjekt=<id>
  useEffect(() => {
    if (!aktiv) return;
    const url = new URL(location.href);
    const id = url.searchParams.get('prosjekt');
    if (!id) return;
    url.searchParams.delete('prosjekt');
    history.replaceState(history.state, '', url);
    void apne(id, false);
  }, [benk, aktiv]);

  const menyvalg = aktiv ? (
    <>
      <button
        type="button"
        role="menuitem"
        class="med-ikon"
        disabled={arbeider}
        onClick={(e) => {
          lukkMeny(e);
          void lagre();
        }}
      >
        <Ikon id="save" storrelse={16} />
        {arbeider ? 'Lagrer på kontoen …' : 'Lagre på kontoen'}
      </button>
      <button
        type="button"
        role="menuitem"
        class="med-ikon"
        onClick={(e) => {
          lukkMeny(e);
          settVindu({ type: 'liste' });
        }}
      >
        <Ikon id="open" storrelse={16} />
        Mine prosjekter på kontoen …
      </button>
    </>
  ) : null;

  const lukk = () => settVindu(null);
  const dialog = !vindu ? null : vindu.type === 'liste' ? (
    <Prosjektliste generator={generator} lukk={lukk} apne={apne} />
  ) : vindu.type === 'konflikt' ? (
    <Dialog tittel="Endret et annet sted" lukk={lukk} klasse="kontoprosjekt">
      <div class="malvindu-innhold">
        <p>
          Prosjektet på kontoen er lagret fra et annet sted
          {vindu.endret ? ` (${dato(vindu.endret)})` : ''} etter at du åpnet det her. Ingenting er
          overskrevet.
        </p>
        <ul>
          <li>
            <strong>Åpne nyeste</strong> henter versjonen på kontoen. Det du har her, legges til side og kan
            lastes ned fra Fil-menyen.
          </li>
          <li>
            <strong>Lagre som kopi</strong> lagrer det du har her som et nytt prosjekt. Det teller som ett
            prosjekt til.
          </li>
        </ul>
        <div class="knapperad">
          <button
            type="button"
            class="primar"
            disabled={arbeider}
            onClick={() => {
              const k = hentKobling(benk.dok);
              lukk();
              if (k) void apne(k.id);
            }}
          >
            Åpne nyeste
          </button>
          <button type="button" class="sekundar" disabled={arbeider} onClick={() => void lagre(true)}>
            Lagre som kopi
          </button>
          <button type="button" class="sekundar" onClick={lukk}>
            Avbryt
          </button>
        </div>
      </div>
    </Dialog>
  ) : (
    <Dialog tittel={vindu.tittel} lukk={lukk} klasse="kontoprosjekt">
      <div class="malvindu-innhold">
        <p role="alert">{vindu.tekst}</p>
        <div class="knapperad">
          {vindu.loggInn && (
            <a class="primar" href={nettsti('/konto/')} target="_blank" rel="noopener">
              Logg inn eller lag konto<span class="visuelt-skjult"> (åpnes i ny fane)</span>
            </a>
          )}
          <button type="button" class="sekundar" onClick={lukk}>
            Lukk
          </button>
        </div>
      </div>
    </Dialog>
  );

  return { menyvalg, dialog };
}

/** The member's projects in this tool, to open or download; the quota counts every tool. */
function Prosjektliste({
  generator,
  lukk,
  apne,
}: {
  generator: string;
  lukk: () => void;
  apne: (id: string) => Promise<boolean>;
}) {
  const [liste, settListe] = useState<{ prosjekter: Prosjekt[]; kvote: Kvote } | null>(null);
  const [feil, settFeil] = useState<{ tekst: string; loggInn: boolean } | null>(null);
  const [arbeider, settArbeider] = useState(false);

  useEffect(() => {
    konto
      .prosjekter(generator)
      .then(settListe)
      .catch((e: unknown) =>
        settFeil({
          tekst:
            e instanceof KontoFeil && e.status === 401
              ? 'Du må være logget inn for å se prosjektene på kontoen.'
              : feiltekst(e),
          loggInn: e instanceof KontoFeil && e.status === 401,
        }),
      );
  }, [generator]);

  const lastNedProsjekt = async (p: Prosjekt) => {
    settArbeider(true);
    try {
      const { prosjekt } = await konto.prosjekt(p.id);
      lastNed(JSON.stringify(prosjekt.dokument), jsonnavn(prosjekt.navn), 'application/json');
    } catch (e) {
      settFeil({ tekst: feiltekst(e), loggInn: false });
    } finally {
      settArbeider(false);
    }
  };

  return (
    <Dialog tittel="Mine prosjekter på kontoen" lukk={lukk} klasse="kontoprosjekt">
      <div class="malvindu-innhold">
        {!liste && !feil && (
          <p class="dempet" role="status">
            Henter prosjektene …
          </p>
        )}
        {feil && (
          <p class="merknad" role="alert">
            {feil.tekst}{' '}
            {feil.loggInn && (
              <a href={nettsti('/konto/')} target="_blank" rel="noopener">
                Logg inn eller lag en konto (åpnes i ny fane)
              </a>
            )}
          </p>
        )}
        {liste && (
          <>
            <p class="dempet">
              {liste.kvote.brukt} av {liste.kvote.maks} prosjekter brukt ({liste.kvote.pakkenavn}, alle
              verktøy sammen).
            </p>
            {liste.prosjekter.length === 0 ? (
              <p>
                Ingen {PROSJEKTAPPER[generator] ?? generator}-prosjekter på kontoen ennå. Velg «Lagre på
                kontoen» i Fil-menyen for å lagre det du har åpent.
              </p>
            ) : (
              <ul class="kontoprosjekter" role="list">
                {liste.prosjekter.map((p) => (
                  <li key={p.id}>
                    <span>
                      <strong>{p.navn}</strong>
                      <small class="dempet">
                        Endret {dato(p.endret)} · {kb(p.storrelse)}
                      </small>
                    </span>
                    <span class="knapperad">
                      <button
                        type="button"
                        class="primar"
                        disabled={arbeider}
                        onClick={() => {
                          settArbeider(true);
                          void apne(p.id).then((ok) => {
                            settArbeider(false);
                            if (ok) lukk();
                          });
                        }}
                      >
                        Åpne<span class="visuelt-skjult"> {p.navn}</span>
                      </button>
                      <button
                        type="button"
                        class="sekundar"
                        disabled={arbeider}
                        onClick={() => void lastNedProsjekt(p)}
                      >
                        Last ned<span class="visuelt-skjult"> {p.navn}</span>
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p class="merknad">
          Prosjektene lagres bare på kontoen når du velger «Lagre på kontoen». Slette prosjekter gjør du under{' '}
          <a href={nettsti('/konto/#mine-prosjekter')} target="_blank" rel="noopener">
            Min konto (ny fane)
          </a>
          .
        </p>
      </div>
    </Dialog>
  );
}
