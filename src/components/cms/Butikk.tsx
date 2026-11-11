/**
 * Studio → Butikk og betaling (Sivert 2026-11-09: «vi må ha alt i cms
 * funksjonen»). Products (status, price, text surcharge, name, texts), the
 * card payment switch and shipping, and the paid orders Stripe reports.
 * Every product field lives here, including pictures from the media
 * library, colours, materials, sizes and new products (Sivert 2026-11-11).
 * Every save is used on the site at once (php/api/cms/_handel.php,
 * php/api/_katalog.php): no new build and no GitHub. Stripe keys are never
 * shown or typed here: they live in api/stripe/konfig.php.
 */
import { useEffect, useId, useState } from 'preact/hooks';
import {
  cms,
  type Butikkinnstillinger,
  type Butikkoversikt,
  type Butikkprodukt,
  type Fraktvalg,
  type Medium,
  type Ordre,
  type Produktbilde,
} from '@/lib/cms/api';
import { formaterKroner } from '@/lib/handel/kurv';

type Visning = 'produkter' | 'betaling' | 'ordrer';
type Produktrad = Butikkoversikt['produkter'][number];
type Melding = { feil: boolean; tekst: string } | null;

const dato = (v: string | null) =>
  v ? new Date(v).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const feiltekst = (e: unknown, standard: string) => (e instanceof Error ? e.message : standard);

/** «149» → 14900. Empty → null. Anything else (decimals, letters) → NaN. */
export function kronerTilOre(v: string): number | null {
  const t = v.trim().replace(/\s/g, '');
  if (t === '') return null;
  return /^\d{1,7}$/.test(t) ? Number(t) * 100 : NaN;
}
const oreTilKroner = (ore: number | null | undefined) => (ore == null ? '' : String(Math.round(ore / 100)));

function Meldingslinje({ melding }: { melding: Melding }) {
  if (!melding) return null;
  return (
    <p
      class={`cms__melding ${melding.feil ? 'cms__melding--feil' : ''}`}
      role={melding.feil ? 'alert' : 'status'}
    >
      {melding.tekst}
    </p>
  );
}

function Kronefelt({
  navn,
  verdi,
  sett,
  hjelp,
}: {
  navn: string;
  verdi: string;
  sett: (v: string) => void;
  hjelp?: string;
}) {
  return (
    <label class="cms__felt">
      {navn}
      <span class="cms__tallfelt">
        <input
          type="text"
          inputMode="numeric"
          autocomplete="off"
          pattern="[0-9 ]*"
          value={verdi}
          onInput={(e) => sett((e.target as HTMLInputElement).value)}
        />
        <span class="cms__dempet">kr inkl. mva</span>
      </span>
      {hjelp && <span class="cms__dempet butikk__hjelp">{hjelp}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- Products

const idag = () => new Date().toISOString().slice(0, 10);

/** «Spiral­vase i tre» → «spiralvase-i-tre»: a suggestion for a new product's address. */
export function lagAdresse(navn: string): string {
  return navn
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
}

/** «12,5» → 12.5. Empty → null. Anything else → NaN. */
export function lesMillimeter(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d{1,5}(\.\d)?$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
}
const mmTekst = (n: number | undefined) => (n == null ? '' : String(n).replace('.', ','));

function tomtProdukt(data: Butikkoversikt): Butikkprodukt {
  const ref = data.referanse;
  const sist = Math.max(0, ...data.produkter.map((r) => r.skjema?.rekkefolge ?? 0));
  return {
    status: 'plassholder',
    prisOre: null,
    navn: '',
    kortBeskrivelse: '',
    beskrivelse: '',
    kategori: ref.kategorier[0]?.slug ?? '',
    bilde: null,
    bildeAlternativ: null,
    mal: null,
    materialer: ref.materialer.slice(0, 1).map((m) => m.type),
    farger: ref.farger.slice(0, 1).map((f) => f.id),
    egenTekst: null,
    generator: null,
    rekkefolge: sist + 1,
    lagtTil: idag(),
    // New products start hidden, so nothing half-done shows on the site.
    skjult: true,
  };
}

/** Picks a picture from the media library, with its alt text. */
function Bildevalg({
  etikett,
  hjelp,
  verdi,
  medier,
  bygget,
  tillatTomt,
  endre,
}: {
  etikett: string;
  hjelp: string;
  verdi: Produktbilde | 'bygget' | null;
  medier: Medium[];
  /** The build's picture, offered as «as built» when there is one. */
  bygget: string | null;
  tillatTomt: boolean;
  endre: (v: Produktbilde | 'bygget' | null) => void;
}) {
  const id = useId();
  const valgt = verdi && verdi !== 'bygget' ? verdi : null;
  const medium = valgt ? medier.find((m) => m.id === valgt.medium) : undefined;
  const forhand = verdi === 'bygget' ? bygget : (medium?.miniatyr ?? null);
  const velg = (v: string) => {
    if (v === 'bygget') return endre('bygget');
    if (v === '') return endre(null);
    const m = medier.find((x) => x.id === Number(v));
    endre({ medium: Number(v), alt: valgt?.alt || m?.alt || '' });
  };
  return (
    <fieldset class="butikk__bilde">
      <legend>{etikett}</legend>
      <div class="butikk__bildevalg">
        {forhand ? (
          <img src={forhand} alt="" width={96} height={96} loading="lazy" />
        ) : (
          <span class="butikk__ingenbilde" aria-hidden="true">
            Ingen
          </span>
        )}
        <div class="butikk__bildefelt">
          <label class="cms__felt" for={`${id}-velg`}>
            Bilde
          </label>
          <select
            id={`${id}-velg`}
            value={verdi === 'bygget' ? 'bygget' : (valgt?.medium ?? '')}
            onChange={(e) => velg(e.currentTarget.value)}
          >
            {tillatTomt && <option value="">Ingen</option>}
            {!tillatTomt && !bygget && !valgt && <option value="">Velg et bilde …</option>}
            {bygget && <option value="bygget">Bildet fra nettsidebygget</option>}
            {valgt && !medium && (
              <option value={valgt.medium}>Bilde #{valgt.medium} (ikke i aktivt bibliotek)</option>
            )}
            {medier.map((m) => (
              <option key={m.id} value={m.id}>
                {m.navn}
                {m.konsept ? ' (konseptbilde)' : ''}
              </option>
            ))}
          </select>
          {valgt && (
            <label class="cms__felt">
              Hva viser bildet? <span class="cms__dempet">(alt-tekst for dem som ikke ser det)</span>
              <input
                value={valgt.alt}
                maxLength={300}
                required
                minLength={3}
                onInput={(e) => endre({ ...valgt, alt: (e.target as HTMLInputElement).value })}
              />
            </label>
          )}
          <span class="cms__dempet butikk__hjelp">{hjelp}</span>
        </div>
      </div>
    </fieldset>
  );
}

function Produktskjema({
  rad,
  data,
  medier,
  lagret,
  lukk,
}: {
  /** null: a new product. */
  rad: Produktrad | null;
  data: Butikkoversikt;
  medier: Medium[];
  lagret: (b: Butikkoversikt) => void;
  lukk: () => void;
}) {
  const ny = rad === null;
  const ref = data.referanse;
  const [p, settP] = useState<Butikkprodukt>(() => rad?.skjema ?? tomtProdukt(data));
  const [adresse, settAdresse] = useState('');
  const [adresseRort, settAdresseRort] = useState(false);
  const [pris, settPris] = useState(oreTilKroner(p.prisOre));
  const [tillegg, settTillegg] = useState(oreTilKroner(p.egenTekst?.tilleggOre));
  const [mal, settMal] = useState({
    bredde: mmTekst(p.mal?.bredde),
    dybde: mmTekst(p.mal?.dybde),
    hoyde: mmTekst(p.mal?.hoyde),
  });
  const [melding, settMelding] = useState<Melding>(null);
  const [lagrer, settLagrer] = useState(false);
  const id = useId();
  const sett = <K extends keyof Butikkprodukt>(k: K, v: Butikkprodukt[K]) => {
    settP((x) => ({ ...x, [k]: v }));
    // an old error no longer says what is wrong
    settMelding((m) => (m?.feil ? null : m));
  };
  const veksle = (liste: string[], v: string) =>
    liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v];
  const nyAdresse = adresseRort ? adresse : lagAdresse(p.navn);

  async function send(verdi: Butikkprodukt | null) {
    settLagrer(true);
    settMelding(null);
    try {
      const svar = await cms.butikkProdukt(ny ? nyAdresse : rad.id, rad?.versjon ?? 0, verdi, ny);
      lagret(svar.butikk);
      if (ny) return lukk();
      const oppdatert = svar.butikk.produkter.find((r) => r.id === rad.id);
      if (!verdi && oppdatert?.skjema) settP(oppdatert.skjema);
      if (!verdi && !oppdatert) return lukk();
      settMelding({
        feil: false,
        tekst: verdi
          ? verdi.skjult
            ? 'Lagret. Produktet er skjult på nettsiden.'
            : 'Lagret. Endringen gjelder på nettsiden nå.'
          : 'Tilbakestilt til verdiene fra nettsidebygget.',
      });
    } catch (e) {
      settMelding({ feil: true, tekst: feiltekst(e, 'Kunne ikke lagre produktet.') });
    } finally {
      settLagrer(false);
    }
  }

  function lagre(e: Event) {
    e.preventDefault();
    const prisOre = kronerTilOre(pris);
    const tilleggOre = kronerTilOre(tillegg);
    if (Number.isNaN(prisOre))
      return settMelding({ feil: true, tekst: 'Skriv prisen i hele kroner, for eksempel 249.' });
    if (p.egenTekst && Number.isNaN(tilleggOre))
      return settMelding({ feil: true, tekst: 'Skriv tillegget for egen tekst i hele kroner.' });
    const tall = [lesMillimeter(mal.bredde), lesMillimeter(mal.dybde), lesMillimeter(mal.hoyde)];
    if (tall.some((t) => Number.isNaN(t)))
      return settMelding({ feil: true, tekst: 'Skriv målene i millimeter, for eksempel 120 eller 12,5.' });
    const antallMal = tall.filter((t) => t !== null).length;
    if (antallMal !== 0 && antallMal !== 3)
      return settMelding({
        feil: true,
        tekst: 'Fyll ut alle tre målene, eller ingen hvis de ikke er fastsatt.',
      });
    if (!p.materialer.length) return settMelding({ feil: true, tekst: 'Velg minst ett materiale.' });
    if (!p.farger.length) return settMelding({ feil: true, tekst: 'Velg minst én farge.' });
    if (ny && !p.bilde) return settMelding({ feil: true, tekst: 'Velg et bilde fra bildebiblioteket.' });
    void send({
      ...p,
      prisOre,
      mal: antallMal === 3 ? { bredde: tall[0]!, dybde: tall[1]!, hoyde: tall[2]! } : null,
      egenTekst: p.egenTekst ? { maksTegn: p.egenTekst.maksTegn, tilleggOre } : null,
    });
  }

  const rekkefolge = (a: string[], alle: string[]) => alle.filter((x) => a.includes(x));
  return (
    <form class="butikk__skjema" onSubmit={lagre} aria-label={ny ? 'Nytt produkt' : `Rediger ${p.navn}`}>
      {ny && <h3>Nytt produkt</h3>}
      <fieldset class="butikk__valg">
        <legend>Status</legend>
        <label>
          <input
            type="radio"
            name={`${id}-status`}
            checked={p.status === 'bekreftet'}
            onChange={() => sett('status', 'bekreftet')}
          />{' '}
          Klar for salg
        </label>
        <label>
          <input
            type="radio"
            name={`${id}-status`}
            checked={p.status === 'plassholder'}
            onChange={() => sett('status', 'plassholder')}
          />{' '}
          Plassholder (merkes tydelig, kan bare sendes som forespørsel)
        </label>
      </fieldset>
      <label class="butikk__bryter">
        <input
          type="checkbox"
          checked={!p.skjult}
          onChange={(e) => sett('skjult', !e.currentTarget.checked)}
        />
        <span>Vis produktet på nettsiden</span>
      </label>
      {p.skjult && (
        <p class="cms__dempet">
          Skjult: produktet ligger trygt i Studio, men vises ikke i butikken og kan ikke bestilles.
        </p>
      )}

      <label class="cms__felt">
        Navn
        <input
          value={p.navn}
          maxLength={80}
          required
          onInput={(e) => sett('navn', (e.target as HTMLInputElement).value)}
        />
      </label>
      {ny && (
        <label class="cms__felt">
          Adresse <span class="cms__dempet">(kan ikke endres senere)</span>
          <span class="butikk__adresse-felt">
            <span class="cms__dempet">/produkter/</span>
            <input
              value={nyAdresse}
              maxLength={60}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onInput={(e) => {
                settAdresseRort(true);
                settAdresse((e.target as HTMLInputElement).value);
              }}
            />
            <span class="cms__dempet">/</span>
          </span>
        </label>
      )}
      <label class="cms__felt">
        Kategori
        <select value={p.kategori} onChange={(e) => sett('kategori', e.currentTarget.value)}>
          {ref.kategorier.map((k) => (
            <option key={k.slug} value={k.slug}>
              {k.navn}
            </option>
          ))}
        </select>
      </label>
      <div class="cms__pakkefelt">
        <Kronefelt
          navn="Pris"
          verdi={pris}
          sett={settPris}
          hjelp="Tomt felt betyr at prisen ikke er fastsatt. Hele kroner."
        />
      </div>
      {p.status === 'bekreftet' && kronerTilOre(pris) === null && (
        <p class="cms__dempet">
          Uten pris kan varen ikke betales med kort. Kunden kan sende den som forespørsel.
        </p>
      )}
      <label class="cms__felt">
        Kort beskrivelse{' '}
        <span class="cms__dempet">({p.kortBeskrivelse.length}/160, vises på kort og i søk)</span>
        <input
          value={p.kortBeskrivelse}
          maxLength={160}
          required
          onInput={(e) => sett('kortBeskrivelse', (e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="cms__felt">
        Beskrivelse <span class="cms__dempet">(produktsiden, tom linje mellom avsnitt)</span>
        <textarea
          rows={6}
          value={p.beskrivelse}
          required
          onInput={(e) => sett('beskrivelse', (e.target as HTMLTextAreaElement).value)}
        />
      </label>

      <Bildevalg
        etikett="Hovedbilde"
        hjelp="Last opp nye bilder under Bilder i menyen. Bruk et kvadratisk bilde. Konseptbilder merkes «Konseptbilde» på siden."
        verdi={p.bilde ?? (rad?.byggetBilde ? 'bygget' : null)}
        medier={medier}
        bygget={rad?.fraBygget ? rad.byggetBilde : null}
        tillatTomt={false}
        endre={(v) => sett('bilde', v === 'bygget' || v === null ? null : v)}
      />
      <Bildevalg
        etikett="Ekstra bilde (valgfritt)"
        hjelp="Vises når musen holdes over produktkortet, for eksempel en annen vinkel."
        verdi={p.bildeAlternativ}
        medier={medier}
        bygget={rad?.fraBygget ? rad.byggetAlternativ : null}
        tillatTomt
        endre={(v) => sett('bildeAlternativ', v)}
      />

      <fieldset class="butikk__mal">
        <legend>Mål i millimeter</legend>
        {(['bredde', 'dybde', 'hoyde'] as const).map((k) => (
          <label class="cms__felt" key={k}>
            {k === 'bredde' ? 'Bredde' : k === 'dybde' ? 'Dybde' : 'Høyde'}
            <span class="cms__tallfelt">
              <input
                type="text"
                inputMode="decimal"
                value={mal[k]}
                onInput={(e) => settMal((m) => ({ ...m, [k]: (e.target as HTMLInputElement).value }))}
              />
              <span class="cms__dempet">mm</span>
            </span>
          </label>
        ))}
        <span class="cms__dempet butikk__hjelp">Tomme felt: siden sier «Ikke fastsatt ennå».</span>
      </fieldset>

      <fieldset class="butikk__avkrysning">
        <legend>Materialer</legend>
        {ref.materialer.map((m) => (
          <label key={m.type}>
            <input
              type="checkbox"
              checked={p.materialer.includes(m.type)}
              onChange={() =>
                sett(
                  'materialer',
                  rekkefolge(
                    veksle(p.materialer, m.type),
                    ref.materialer.map((x) => x.type),
                  ),
                )
              }
            />{' '}
            {m.type}
          </label>
        ))}
        <span class="cms__dempet butikk__hjelp">Det første i listen er forhåndsvalgt for kunden.</span>
      </fieldset>

      <fieldset class="butikk__avkrysning butikk__farger">
        <legend>Farger</legend>
        {ref.farger.map((f) => (
          <label key={f.id}>
            <input
              type="checkbox"
              checked={p.farger.includes(f.id)}
              onChange={() =>
                sett(
                  'farger',
                  rekkefolge(
                    veksle(p.farger, f.id),
                    ref.farger.map((x) => x.id),
                  ),
                )
              }
            />
            <span class="butikk__prikk" style={{ '--prikk': f.hex }} aria-hidden="true" /> {f.navn}
            {ref.farger.filter((x) => x.navn === f.navn).length > 1 && (
              <span class="cms__dempet"> ({f.id.split('-')[0]?.toUpperCase()})</span>
            )}
          </label>
        ))}
        <span class="cms__dempet butikk__hjelp">
          Fargelisten er den samme som i Skaperverkstedet. Den første valgte er forhåndsvalgt for kunden.
        </span>
      </fieldset>

      <fieldset class="butikk__valg">
        <legend>Egen tekst</legend>
        <label class="butikk__bryter">
          <input
            type="checkbox"
            checked={p.egenTekst !== null}
            onChange={(e) =>
              sett('egenTekst', e.currentTarget.checked ? { maksTegn: 20, tilleggOre: null } : null)
            }
          />
          <span>Kunden kan skrive en egen tekst på produktet</span>
        </label>
        {p.egenTekst && (
          <div class="cms__pakkefelt">
            <label class="cms__felt">
              Høyst antall tegn
              <input
                type="number"
                min={1}
                max={60}
                value={p.egenTekst.maksTegn}
                onInput={(e) =>
                  sett('egenTekst', {
                    maksTegn: Math.max(1, Math.min(60, Number((e.target as HTMLInputElement).value) || 1)),
                    tilleggOre: p.egenTekst?.tilleggOre ?? null,
                  })
                }
              />
            </label>
            <Kronefelt
              navn="Tillegg for egen tekst"
              verdi={tillegg}
              sett={settTillegg}
              hjelp="Tomt felt: varer med egen tekst får ingen pris og sendes som forespørsel."
            />
          </div>
        )}
      </fieldset>

      <div class="cms__pakkefelt">
        <label class="cms__felt">
          Tilpass i Skaperverkstedet
          <select
            value={p.generator ?? ''}
            onChange={(e) => sett('generator', e.currentTarget.value || null)}
          >
            <option value="">Ingen lenke</option>
            {ref.generatorer.map((g) => (
              <option key={g.id} value={g.id}>
                {g.navn}
              </option>
            ))}
          </select>
        </label>
        <label class="cms__felt">
          Rekkefølge <span class="cms__dempet">(lavest først under «Utvalgt»)</span>
          <input
            type="number"
            min={0}
            max={100000}
            value={p.rekkefolge}
            onInput={(e) =>
              sett('rekkefolge', Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)))
            }
          />
        </label>
      </div>

      <Meldingslinje melding={melding} />
      <div class="cms__knapper">
        <button type="submit" class="cms__knapp cms__knapp--primar" disabled={lagrer}>
          {lagrer ? 'Lagrer …' : ny ? 'Lagre det nye produktet' : 'Lagre og bruk på nettsiden'}
        </button>
        <button type="button" class="cms__knapp" onClick={lukk}>
          {ny ? 'Avbryt' : 'Lukk'}
        </button>
        {rad?.studio && rad.fraBygget && (
          <button type="button" class="cms__lenkeknapp" disabled={lagrer} onClick={() => void send(null)}>
            Tilbakestill til nettsidebygget
          </button>
        )}
        {rad && !rad.fraBygget && (
          <button
            type="button"
            class="cms__lenkeknapp"
            disabled={lagrer}
            onClick={() => {
              if (
                window.confirm(
                  `Slette «${p.navn}» for godt? Vil du bare ta det bort fra butikken, skjul det i stedet.`,
                )
              )
                void send(null);
            }}
          >
            Slett produktet
          </button>
        )}
      </div>
    </form>
  );
}

function Produkter({ data, lagret }: { data: Butikkoversikt; lagret: (b: Butikkoversikt) => void }) {
  const [apen, settApen] = useState<string | null>(null);
  const [medier, settMedier] = useState<Medium[]>([]);
  const [feil, settFeil] = useState('');
  useEffect(() => {
    cms
      .medier()
      .then((d) => settMedier(d.medier))
      .catch((e) => settFeil(feiltekst(e, 'Kunne ikke hente bildebiblioteket.')));
  }, []);
  return (
    <>
      {feil && <p role="alert">{feil}</p>}
      {apen === 'ny' ? (
        <Produktskjema rad={null} data={data} medier={medier} lagret={lagret} lukk={() => settApen(null)} />
      ) : (
        <button type="button" class="cms__knapp" onClick={() => settApen('ny')}>
          + Nytt produkt
        </button>
      )}
      <ul class="cms__liste">
        {data.produkter.map((rad) => {
          const p = rad.skjema;
          const klar = p?.status === 'bekreftet';
          return (
            <li
              key={rad.id}
              class={`cms__rad ${rad.vises && klar && p?.prisOre !== null ? 'cms__rad--publisert' : ''}`}
            >
              <div class="butikk__produkt">
                {rad.bilde && (
                  <img class="cms__miniatyr" src={rad.bilde} alt="" width={56} height={56} loading="lazy" />
                )}
                <div class="butikk__produkttekst">
                  <div class="cms__radhode">
                    <span class="cms__feltnavn">{p?.navn ?? rad.id}</span>
                    <span>
                      {!rad.vises && (
                        <span class="cms__merke cms__merke--utkast">
                          {p?.skjult ? 'Skjult' : 'Mangler noe'}
                        </span>
                      )}{' '}
                      {p && (
                        <span class={`cms__merke ${klar ? 'cms__merke--publisert' : ''}`}>
                          {klar ? 'Klar for salg' : 'Plassholder'}
                        </span>
                      )}{' '}
                      {!rad.fraBygget && <span class="cms__merke">Laget i Studio</span>}
                      {rad.fraBygget && rad.studio && (
                        <span class="cms__merke cms__merke--utkast">Endret i Studio</span>
                      )}
                    </span>
                  </div>
                  <p class="cms__dempet">
                    {rad.kategoriNavn} ·{' '}
                    {p?.prisOre != null ? formaterKroner(p.prisOre) : 'Pris ikke fastsatt'}
                    {p?.egenTekst &&
                      ` · egen tekst ${p.egenTekst.tilleggOre != null ? `+${formaterKroner(p.egenTekst.tilleggOre)}` : 'uten pris'}`}
                    {rad.endret &&
                      ` · endret ${dato(rad.endret)}${rad.endretAv ? ` av ${rad.endretAv}` : ''}`}
                    {rad.vises && rad.href && (
                      <>
                        {' · '}
                        <a href={rad.href} target="_blank" rel="noopener">
                          Se siden ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>
                {apen !== rad.id && p && (
                  <button type="button" class="cms__knapp" onClick={() => settApen(rad.id)}>
                    Rediger<span class="visuelt-skjult"> {p.navn}</span>
                  </button>
                )}
              </div>
              {apen === rad.id && (
                <Produktskjema
                  key={rad.id}
                  rad={rad}
                  data={data}
                  medier={medier}
                  lagret={lagret}
                  lukk={() => settApen(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- Payment and shipping

type Fraktrad = { navn: string; pris: string; min: string; maks: string };
const tilRad = (f: Fraktvalg): Fraktrad => ({
  navn: f.navn,
  pris: oreTilKroner(f.prisOre),
  min: f.dagerMin == null ? '' : String(f.dagerMin),
  maks: f.dagerMaks == null ? '' : String(f.dagerMaks),
});

function Betaling({ data, lagret }: { data: Butikkoversikt; lagret: (b: Butikkoversikt) => void }) {
  const i = data.innstillinger;
  const start: Butikkinnstillinger = i.studio ?? i.bygget;
  const [betaling, settBetaling] = useState(start.betaling);
  const [frakt, settFrakt] = useState<Fraktrad[]>(start.frakt.map(tilRad));
  const [melding, settMelding] = useState<Melding>(null);
  const [lagrer, settLagrer] = useState(false);

  const endre = (n: number, felt: keyof Fraktrad, v: string) =>
    settFrakt((f) => f.map((r, j) => (j === n ? { ...r, [felt]: v } : r)));

  async function send(verdi: Butikkinnstillinger | null) {
    settLagrer(true);
    settMelding(null);
    try {
      const svar = await cms.butikkInnstillinger(i.versjon, verdi);
      lagret(svar.butikk);
      const ny = svar.butikk.innstillinger;
      const s = ny.studio ?? ny.bygget;
      settBetaling(s.betaling);
      settFrakt(s.frakt.map(tilRad));
      settMelding({
        feil: false,
        tekst: verdi ? 'Lagret. Gjelder i kassen nå.' : 'Tilbakestilt til nettsidebygget.',
      });
    } catch (e) {
      settMelding({ feil: true, tekst: feiltekst(e, 'Kunne ikke lagre.') });
    } finally {
      settLagrer(false);
    }
  }

  function lagre(e: Event) {
    e.preventDefault();
    const dager = (v: string) => (v.trim() === '' ? null : /^\d{1,2}$/.test(v.trim()) ? Number(v) : NaN);
    const ut: Fraktvalg[] = [];
    for (const [n, r] of frakt.entries()) {
      const pris = kronerTilOre(r.pris);
      const min = dager(r.min);
      const maks = dager(r.maks);
      if (pris === null || Number.isNaN(pris))
        return settMelding({
          feil: true,
          tekst: `Skriv prisen for fraktvalg ${n + 1} i hele kroner (0 for gratis).`,
        });
      if (Number.isNaN(min) || Number.isNaN(maks))
        return settMelding({
          feil: true,
          tekst: `Skriv leveringstiden for fraktvalg ${n + 1} som hele dager.`,
        });
      ut.push({ navn: r.navn, prisOre: pris, dagerMin: min, dagerMaks: maks });
    }
    void send({ betaling, frakt: ut });
  }

  return (
    <form onSubmit={lagre} aria-label="Kortbetaling og frakt">
      <section class="studio__panel">
        <h2>Kortbetaling</h2>
        <label class="butikk__bryter">
          <input
            type="checkbox"
            checked={betaling}
            onChange={(e) => settBetaling((e.target as HTMLInputElement).checked)}
          />
          <span>Ta imot kortbetaling med Stripe Checkout</span>
        </label>
        <p class="cms__dempet">
          Kunden betaler på Stripes egen side. Kortbetaling åpner bare når bryteren er på, Stripe er koblet
          til og minst ett fraktvalg finnes, og bare for varer som er klare for salg og har pris.
          Stripe-nøklene skrives aldri her: de ligger i api/stripe/konfig.php på serveren.
        </p>
      </section>

      <section class="studio__panel">
        <h2>Frakt</h2>
        <p class="cms__dempet">Vises i Stripe Checkout. Høyst fem valg. Prisene er hele kroner inkl. mva.</p>
        {frakt.length === 0 && <p>Ingen fraktvalg ennå. Kortbetaling åpner ikke uten frakt.</p>}
        <ol class="cms__liste">
          {frakt.map((r, n) => (
            <li class="cms__rad" key={n}>
              <fieldset class="butikk__frakt">
                <legend>Fraktvalg {n + 1}</legend>
                <label class="cms__felt butikk__fraktnavn">
                  Navn i kassen
                  <input
                    value={r.navn}
                    maxLength={80}
                    required
                    placeholder="For eksempel: Posten, liten pakke"
                    onInput={(e) => endre(n, 'navn', (e.target as HTMLInputElement).value)}
                  />
                </label>
                <Kronefelt navn="Pris" verdi={r.pris} sett={(v) => endre(n, 'pris', v)} />
                <label class="cms__felt">
                  Levering fra
                  <span class="cms__tallfelt">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.min}
                      onInput={(e) => endre(n, 'min', (e.target as HTMLInputElement).value)}
                    />
                    <span class="cms__dempet">virkedager</span>
                  </span>
                </label>
                <label class="cms__felt">
                  til
                  <span class="cms__tallfelt">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.maks}
                      onInput={(e) => endre(n, 'maks', (e.target as HTMLInputElement).value)}
                    />
                    <span class="cms__dempet">virkedager</span>
                  </span>
                </label>
              </fieldset>
              <button
                type="button"
                class="cms__lenkeknapp"
                onClick={() => settFrakt((f) => f.filter((_, j) => j !== n))}
              >
                Fjern fraktvalg {n + 1}
              </button>
            </li>
          ))}
        </ol>
        {frakt.length < 5 && (
          <button
            type="button"
            class="cms__knapp"
            onClick={() => settFrakt((f) => [...f, { navn: '', pris: '', min: '', maks: '' }])}
          >
            + Legg til fraktvalg
          </button>
        )}
      </section>
      <Meldingslinje melding={melding} />
      <div class="cms__knapper">
        <button type="submit" class="cms__knapp cms__knapp--primar" disabled={lagrer}>
          {lagrer ? 'Lagrer …' : 'Lagre og bruk i kassen'}
        </button>
        {i.studio && (
          <button type="button" class="cms__lenkeknapp" disabled={lagrer} onClick={() => void send(null)}>
            Tilbakestill til nettsidebygget
          </button>
        )}
      </div>
      {i.endret && (
        <p class="cms__dempet">
          Sist endret {dato(i.endret)}
          {i.endretAv ? ` av ${i.endretAv}` : ''}.
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- Orders

function Ordrekort({
  ordre,
  leveringer,
  oppdatert,
}: {
  ordre: Ordre;
  leveringer: Record<string, string>;
  oppdatert: (o: Ordre) => void;
}) {
  const [notat, settNotat] = useState(ordre.notat ?? '');
  const [melding, settMelding] = useState<Melding>(null);
  const [opptatt, settOpptatt] = useState(false);

  async function gjor(handling: () => Promise<{ ordre: Ordre }>, ok: string) {
    settOpptatt(true);
    settMelding(null);
    try {
      oppdatert((await handling()).ordre);
      settMelding({ feil: false, tekst: ok });
    } catch (e) {
      settMelding({ feil: true, tekst: feiltekst(e, 'Kunne ikke lagre ordren.') });
    } finally {
      settOpptatt(false);
    }
  }

  const stripe = ordre.betalingId
    ? `https://dashboard.stripe.com/${ordre.modus === 'test' ? 'test/' : ''}payments/${ordre.betalingId}`
    : null;
  return (
    <li class={`cms__rad ${ordre.levering === 'ny' ? 'cms__rad--utkast' : ''}`}>
      <div class="cms__radhode">
        <span class="cms__feltnavn">
          {ordre.referanse} · {ordre.navn}
        </span>
        <span>
          {ordre.modus === 'test' && <span class="cms__merke">Testbetaling</span>}{' '}
          <span class="cms__merke cms__merke--publisert">Betalt</span>
        </span>
      </div>
      <p class="cms__dempet">
        {dato(ordre.opprettet)} · {ordre.totalOre !== null ? formaterKroner(ordre.totalOre) : 'beløp ukjent'}
        {ordre.fraktOre !== null && ` (frakt ${formaterKroner(ordre.fraktOre)})`}
      </p>
      {!ordre.varslet && (
        <p class="cms__melding cms__melding--feil">
          E-posten om denne ordren er ikke sendt.{' '}
          <button
            type="button"
            class="cms__lenkeknapp"
            disabled={opptatt}
            onClick={() => void gjor(() => cms.ordreVarsle(ordre.id), 'E-posten er sendt.')}
          >
            Send på nytt
          </button>
        </p>
      )}
      <details class="butikk__detaljer">
        <summary>Varer, kunde og levering</summary>
        <ul>
          {(ordre.linjer ?? []).map((l, n) => (
            <li key={n}>
              {l.antall} × {l.navn} · {formaterKroner(l.belopOre)}
            </li>
          ))}
          {ordre.linjer === null && <li>Varelinjene kunne ikke hentes. Se betalingen i Stripe.</li>}
        </ul>
        <dl class="studio__fakta">
          <div>
            <dt>E-post</dt>
            <dd>{ordre.epost || '–'}</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>{ordre.telefon || '–'}</dd>
          </div>
          <div>
            <dt>Leveringsadresse</dt>
            <dd class="butikk__adresse">{ordre.adresse || '–'}</dd>
          </div>
          {ordre.melding && (
            <div>
              <dt>Melding</dt>
              <dd class="butikk__adresse">{ordre.melding}</dd>
            </div>
          )}
        </dl>
        <label class="cms__felt">
          Internt notat
          <textarea
            rows={3}
            value={notat}
            onInput={(e) => settNotat((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <button
          type="button"
          class="cms__knapp"
          disabled={opptatt}
          onClick={() => void gjor(() => cms.ordre({ id: ordre.id, notat }), 'Notatet er lagret.')}
        >
          Lagre notat
        </button>
        {stripe && (
          <p>
            <a href={stripe} target="_blank" rel="noopener noreferrer">
              Åpne betalingen i Stripe ↗
            </a>{' '}
            <span class="cms__dempet">(refusjon gjøres der)</span>
          </p>
        )}
      </details>
      <label class="cms__felt butikk__levering">
        Levering
        <select
          value={ordre.levering}
          disabled={opptatt}
          onChange={(e) =>
            void gjor(
              () => cms.ordre({ id: ordre.id, levering: (e.target as HTMLSelectElement).value }),
              'Leveringsstatusen er lagret.',
            )
          }
        >
          {Object.entries(leveringer).map(([verdi, navn]) => (
            <option key={verdi} value={verdi}>
              {navn}
            </option>
          ))}
        </select>
      </label>
      <Meldingslinje melding={melding} />
    </li>
  );
}

function Ordrer() {
  const [data, settData] = useState<{ ordrer: Ordre[]; leveringer: Record<string, string> } | null>(null);
  const [feil, settFeil] = useState('');
  useEffect(() => {
    cms
      .ordrer()
      .then(settData)
      .catch((e) => settFeil(feiltekst(e, 'Kunne ikke hente ordrene.')));
  }, []);
  if (feil) return <p role="alert">{feil}</p>;
  if (!data) return <p role="status">Henter ordrene …</p>;
  if (!data.ordrer.length)
    return (
      <p class="studio__tomtilstand">
        Ingen betalte ordrer ennå. Når en kunde betaler med kort, lagrer Stripe-varselet (webhooken) ordren
        her.
      </p>
    );
  return (
    <ul class="cms__liste">
      {data.ordrer.map((o) => (
        <Ordrekort
          key={o.id}
          ordre={o}
          leveringer={data.leveringer}
          oppdatert={(ny) => settData({ ...data, ordrer: data.ordrer.map((x) => (x.id === ny.id ? ny : x)) })}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- The tab

export default function Butikk() {
  const [data, settData] = useState<Butikkoversikt | null>(null);
  const [feil, settFeil] = useState('');
  const [visning, settVisning] = useState<Visning>('produkter');
  useEffect(() => {
    cms
      .butikk()
      .then((d) => settData(d.butikk))
      .catch((e) => settFeil(feiltekst(e, 'Kunne ikke hente butikken.')));
  }, []);
  if (feil) return <p role="alert">{feil}</p>;
  if (!data) return <p role="status">Henter butikken fra CMS-databasen …</p>;

  const innst = data.innstillinger.studio ?? data.innstillinger.bygget;
  const synlige = data.produkter.filter((r) => r.vises);
  const klare = synlige.filter((r) => r.skjema?.status === 'bekreftet' && r.skjema.prisOre !== null).length;
  const faner: [Visning, string][] = [
    ['produkter', `Produkter (${synlige.length})`],
    ['betaling', 'Kortbetaling og frakt'],
    ['ordrer', `Ordrer${data.nyeOrdrer ? ` (${data.nyeOrdrer} nye)` : ''}`],
  ];
  return (
    <>
      <section class="studio__panel">
        <h2>Status for kassen</h2>
        <dl class="studio__fakta">
          <div>
            <dt>Kortbetaling</dt>
            <dd>{data.kasse.aktiv ? 'Åpen for kunder' : `Stengt: ${data.kasse.grunn ?? ''}`}</dd>
          </div>
          <div>
            <dt>Bryteren</dt>
            <dd>{innst.betaling ? 'På' : 'Av'}</dd>
          </div>
          <div>
            <dt>Stripe</dt>
            <dd>
              {data.stripe.tilkoblet
                ? `Koblet til (${data.stripe.modus === 'live' ? 'ekte betalinger' : 'testmodus'})${data.stripe.webhook ? '' : ', men webhook-hemmeligheten mangler'}`
                : `Ikke koblet til. ${data.stripe.grunn ?? ''}`}
            </dd>
          </div>
          <div>
            <dt>Fraktvalg</dt>
            <dd>{innst.frakt.length}</dd>
          </div>
          <div>
            <dt>Klare for salg med pris</dt>
            <dd>
              {klare} av {synlige.length}
            </dd>
          </div>
        </dl>
      </section>

      <nav class="cms__faner" aria-label="Butikken">
        {faner.map(([id, navn]) => (
          <button
            key={id}
            type="button"
            class="cms__fane"
            aria-current={visning === id ? 'page' : undefined}
            onClick={() => settVisning(id)}
          >
            {navn}
          </button>
        ))}
      </nav>

      <div class="butikk__innhold">
        {visning === 'produkter' && (
          <>
            <p class="cms__dempet">
              Alt om produktene lagres her og gjelder på nettsiden med en gang: bilder, farger, materialer,
              mål, priser, tekster og nye produkter. Bildene hentes fra bildebiblioteket under Bilder.
            </p>
            <Produkter data={data} lagret={settData} />
          </>
        )}
        {visning === 'betaling' && <Betaling data={data} lagret={settData} />}
        {visning === 'ordrer' && <Ordrer />}
      </div>
    </>
  );
}
