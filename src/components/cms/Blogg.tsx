import { useEffect, useRef, useState } from 'preact/hooks';
import {
  cms,
  type Bruker,
  type Innlegg,
  type InnleggDokument,
  type InnleggBlokk,
  type InnleggRevisjon,
  type Medium,
} from '@/lib/cms/api';
import { nettsti } from '@/lib/nettsti';

const feiltekst = (e: unknown) => (e instanceof Error ? e.message : 'Kunne ikke fullføre handlingen.');
const dato = (v: string) => new Date(v).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
const tomt = (navn: string): InnleggDokument => ({
  tittel: '',
  slug: '',
  ingress: '',
  kategori: 'Fra verkstedet',
  forfatter: navn,
  emneknagger: [],
  bilde: null,
  alt: '',
  seoTittel: '',
  seoBeskrivelse: '',
  blokker: [{ type: 'avsnitt', tekst: '' }],
});
const lagSlug = (v: string) =>
  v
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

function VelgBilde({
  id,
  medier,
  endre,
  etikett = 'Bilde',
}: {
  id: number | null;
  medier: Medium[];
  endre: (id: number | null) => void;
  etikett?: string;
}) {
  const bilde = medier.find((m) => m.id === id);
  return (
    <div>
      <label class="cms__felt">
        <span>{etikett}</span>
        <select
          value={id ?? ''}
          onChange={(e) => endre(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
        >
          <option value="">Ingen valgt</option>
          {id && !bilde && <option value={id}>Bilde #{id} (ikke i aktivt bibliotek)</option>}
          {medier.map((m) => (
            <option key={m.id} value={m.id}>
              {m.navn}
            </option>
          ))}
        </select>
      </label>
      {bilde && (
        <figure class="studio__bildevalg">
          <img src={bilde.miniatyr} width={bilde.bredde} height={bilde.hoyde} alt="" />
          {bilde.konsept && <figcaption>Konseptbilde</figcaption>}
        </figure>
      )}
    </div>
  );
}

export default function Blogg({
  bruker,
  ulagretEndret,
}: {
  bruker: Bruker;
  ulagretEndret: (v: boolean) => void;
}) {
  const [liste, settListe] = useState<Innlegg[]>([]);
  const [laster, settLaster] = useState(true);
  const [feil, settFeil] = useState('');
  const [melding, settMelding] = useState('');
  const [sok, settSok] = useState('');
  const [filter, settFilter] = useState('alle');
  const [side, settSide] = useState(1);
  const [valgt, settValgt] = useState<Innlegg | null>(null);
  const [dokument, settDokument] = useState<InnleggDokument | null>(null);
  const [revisjoner, settRevisjoner] = useState<InnleggRevisjon[]>([]);
  const [medier, settMedier] = useState<Medium[]>([]);
  const [ulagret, settUlagret] = useState(false);
  const [jobber, settJobber] = useState(false);
  const [visHistorikk, settVisHistorikk] = useState(false);
  const slugManuell = useRef(false);
  const henting = useRef(0);
  useEffect(() => {
    let aktiv = true;
    cms
      .innlegg()
      .then((d) => {
        if (aktiv) settListe(d.innlegg);
      })
      .catch((e) => {
        if (aktiv) settFeil(feiltekst(e));
      })
      .finally(() => {
        if (aktiv) settLaster(false);
      });
    return () => {
      aktiv = false;
      henting.current++;
    };
  }, []);
  useEffect(() => {
    ulagretEndret(ulagret);
    return () => ulagretEndret(false);
  }, [ulagret, ulagretEndret]);
  useEffect(() => {
    const vern = (e: BeforeUnloadEvent) => {
      if (ulagret) e.preventDefault();
    };
    window.addEventListener('beforeunload', vern);
    return () => window.removeEventListener('beforeunload', vern);
  }, [ulagret]);
  async function oppdaterListe() {
    settListe((await cms.innlegg()).innlegg);
  }
  async function apne(id: number) {
    const nr = ++henting.current;
    settFeil('');
    settMelding('');
    settJobber(true);
    try {
      const [res, bilder] = await Promise.all([id ? cms.innleggEn(id) : Promise.resolve(null), cms.medier()]);
      if (nr !== henting.current) return;
      const p = res?.innlegg ?? {
        id: 0,
        versjon: 0,
        utkast: tomt(bruker.navn),
        publisert: null,
        url: null,
        opprettet: '',
        endret: '',
        publisertTid: null,
      };
      settValgt(p);
      settDokument(structuredClone(p.utkast ?? p.publisert ?? tomt(bruker.navn)));
      settRevisjoner(res?.revisjoner ?? []);
      settMedier(bilder.medier);
      settUlagret(false);
      slugManuell.current = !!p.id;
      settVisHistorikk(false);
    } catch (e) {
      settFeil(feiltekst(e));
    } finally {
      if (nr === henting.current) settJobber(false);
    }
  }
  function endre<K extends keyof InnleggDokument>(felt: K, verdi: InnleggDokument[K]) {
    settDokument((d) =>
      d
        ? {
            ...d,
            [felt]: verdi,
            ...(felt === 'tittel' && !slugManuell.current ? { slug: lagSlug(String(verdi)) } : {}),
          }
        : d,
    );
    settUlagret(true);
    settMelding('');
  }
  function endreBlokk(i: number, b: InnleggBlokk) {
    if (dokument)
      endre(
        'blokker',
        dokument.blokker.map((v, j) => (i === j ? b : v)),
      );
  }
  function flytt(i: number, delta: number) {
    if (!dokument) return;
    const ny = [...dokument.blokker];
    const b = ny.splice(i, 1)[0];
    if (b) {
      ny.splice(i + delta, 0, b);
      endre('blokker', ny);
    }
  }
  function tilbake() {
    if (ulagret && !window.confirm('Du har ulagrede endringer. Vil du gå tilbake uten å lagre?')) return;
    henting.current++;
    settValgt(null);
    settDokument(null);
    settUlagret(false);
    settFeil('');
  }
  async function handling(type: 'lagre' | 'publiser' | 'avpubliser' | 'gjenopprett', revisjon?: number) {
    if (!valgt || !dokument || jobber) return;
    if (
      type === 'avpubliser' &&
      !window.confirm('Innlegget tas bort fra bloggen. Utkast og historikk beholdes. Fortsette?')
    )
      return;
    if (
      type === 'gjenopprett' &&
      ulagret &&
      !window.confirm('Erstatt ulagret tekst med den valgte revisjonen?')
    )
      return;
    settJobber(true);
    settFeil('');
    settMelding('');
    try {
      let neste = valgt;
      if (type === 'lagre' || (type === 'publiser' && (ulagret || !valgt.id))) {
        neste = (await cms.innleggLagre(valgt.id, valgt.versjon, dokument)).innlegg;
        settValgt(neste);
        settUlagret(false);
      }
      // Retain the successful save even if a subsequent publication fails.
      if (type !== 'lagre')
        neste = (await cms.innleggHandling(type, neste.id, neste.versjon, revisjon)).innlegg;
      settValgt(neste);
      settUlagret(false);
      settDokument(structuredClone(neste.utkast ?? neste.publisert ?? dokument));
      const fersk = await cms.innleggEn(neste.id);
      settRevisjoner(fersk.revisjoner);
      await oppdaterListe();
      settMelding(
        type === 'lagre'
          ? 'Utkastet er lagret på serveren.'
          : type === 'publiser'
            ? 'Innlegget er publisert og tilgjengelig i bloggen.'
            : type === 'avpubliser'
              ? 'Innlegget er avpublisert. Historikken er beholdt.'
              : 'Revisjonen er gjenopprettet som utkast.',
      );
    } catch (e) {
      settFeil(feiltekst(e));
    } finally {
      settJobber(false);
    }
  }
  if (laster) return <p role="status">Henter blogginnlegg …</p>;
  if (dokument && valgt)
    return (
      <div class="studio__bloggredaktor" aria-busy={jobber}>
        <div class="studio__redaktorhode">
          <button type="button" class="cms__lenkeknapp" disabled={jobber} onClick={tilbake}>
            ← Alle innlegg
          </button>
          <p role="status">
            {ulagret
              ? 'Ulagrede endringer'
              : valgt.id
                ? 'Sist lagret: ' + dato(valgt.endret)
                : 'Nytt innlegg'}
          </p>
          <div class="cms__radknapper">
            {valgt.id > 0 && (
              <a class="cms__knapp" href={cms.innleggPreview(valgt.id)} target="_blank" rel="noopener">
                Vis sist lagret ↗
              </a>
            )}
            <button type="button" class="cms__knapp" disabled={jobber} onClick={() => void handling('lagre')}>
              Lagre utkast
            </button>
            <button
              type="button"
              class="cms__knapp cms__knapp--primar"
              disabled={jobber || (!ulagret && !valgt.utkast && !!valgt.id)}
              onClick={() => void handling('publiser')}
            >
              {jobber ? 'Arbeider …' : 'Publiser innlegg'}
            </button>
          </div>
        </div>
        {feil && (
          <div class="cms__melding cms__melding--feil" role="alert">
            <p>{feil}</p>
            <p>
              Teksten din er fortsatt i redaktøren. Kopier den ved behov før du laster den nyeste versjonen.
            </p>
            <button
              class="cms__knapp"
              disabled={jobber}
              onClick={() => {
                if (window.confirm('Last inn serverversjonen og erstatt redaktøren?')) void apne(valgt.id);
              }}
            >
              Last nyeste versjon
            </button>
          </div>
        )}
        {melding && (
          <p class="cms__melding" role="status">
            {melding}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handling('lagre');
          }}
        >
          <fieldset class="studio__redaktorrutenett studio__redaktorfelt" disabled={jobber}>
            <legend class="visuelt-skjult">Rediger blogginnlegget</legend>
            <section class="studio__panel">
              <label class="cms__felt studio__tittelfelt">
                <span>Overskrift</span>
                <input
                  maxLength={200}
                  required
                  value={dokument.tittel}
                  onInput={(e) => endre('tittel', e.currentTarget.value)}
                  placeholder="En god historie begynner her …"
                />
              </label>
              <label class="cms__felt">
                <span>Kort introduksjon</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={dokument.ingress}
                  onInput={(e) => endre('ingress', e.currentTarget.value)}
                />
              </label>
              <h2>Artikkelinnhold</h2>
              <p class="studio__dempet">Bygg historien med avsnitt, mellomtitler og bilder.</p>
              {dokument.blokker.map((b, i) => (
                <fieldset class="studio__blokk" key={i}>
                  <legend>
                    {i + 1}.{' '}
                    {b.type === 'bilde' ? 'Bilde' : b.type === 'overskrift' ? 'Mellomtittel' : 'Avsnitt'}
                  </legend>
                  <div class="studio__blokkverktoy">
                    <button
                      type="button"
                      class="cms__lenkeknapp"
                      disabled={i === 0 || jobber}
                      aria-label={`Flytt blokk ${i + 1} opp`}
                      onClick={() => flytt(i, -1)}
                    >
                      Opp
                    </button>
                    <button
                      type="button"
                      class="cms__lenkeknapp"
                      disabled={i === dokument.blokker.length - 1 || jobber}
                      aria-label={`Flytt blokk ${i + 1} ned`}
                      onClick={() => flytt(i, 1)}
                    >
                      Ned
                    </button>
                    <button
                      type="button"
                      class="cms__lenkeknapp"
                      disabled={jobber}
                      onClick={() => {
                        if (window.confirm('Fjerne denne blokken fra utkastet?'))
                          endre(
                            'blokker',
                            dokument.blokker.filter((_, j) => j !== i),
                          );
                      }}
                    >
                      Fjern
                    </button>
                  </div>
                  {b.type === 'bilde' ? (
                    <>
                      <VelgBilde
                        id={b.medium}
                        medier={medier}
                        etikett={`Bilde i blokk ${i + 1}`}
                        endre={(id) =>
                          endreBlokk(i, {
                            ...b,
                            medium: id,
                            alt: b.alt || medier.find((m) => m.id === id)?.alt || '',
                          })
                        }
                      />
                      <label class="cms__felt">
                        <span>Alternativ tekst for bilde {i + 1}</span>
                        <input
                          required
                          maxLength={500}
                          value={b.alt}
                          onInput={(e) => endreBlokk(i, { ...b, alt: e.currentTarget.value })}
                        />
                      </label>
                      <label class="cms__felt">
                        <span>Bildetekst {i + 1}</span>
                        <input
                          maxLength={1000}
                          value={b.bildetekst}
                          onInput={(e) => endreBlokk(i, { ...b, bildetekst: e.currentTarget.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <label class="cms__felt">
                      <span>
                        {b.type === 'overskrift' ? 'Mellomtittel' : 'Avsnitt'} {i + 1}
                      </span>
                      <textarea
                        rows={b.type === 'overskrift' ? 2 : 6}
                        maxLength={b.type === 'overskrift' ? 200 : 10000}
                        value={b.tekst}
                        onInput={(e) => endreBlokk(i, { ...b, tekst: e.currentTarget.value })}
                      />
                    </label>
                  )}
                </fieldset>
              ))}
              <div class="cms__radknapper">
                {(['avsnitt', 'overskrift', 'bilde'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    class="cms__knapp"
                    disabled={dokument.blokker.length >= 100 || jobber}
                    onClick={() =>
                      endre('blokker', [
                        ...dokument.blokker,
                        t === 'bilde'
                          ? { type: t, medium: null, alt: '', bildetekst: '' }
                          : { type: t, tekst: '' },
                      ])
                    }
                  >
                    ＋ {t === 'bilde' ? 'Bilde' : t === 'overskrift' ? 'Mellomtittel' : 'Avsnitt'}
                  </button>
                ))}
              </div>
            </section>
            <aside class="studio__redaktorside">
              <section class="studio__panel">
                <h2>Historien din</h2>
                <p class="studio__status">
                  {valgt.utkast || !valgt.id ? 'Utkast' : 'Publisert'}
                  {valgt.publisert && valgt.utkast ? ' · en eldre versjon er offentlig' : ''}
                </p>
                <label class="cms__felt">
                  <span>Nettadresse</span>
                  <input
                    value={dokument.slug}
                    disabled={!!valgt.publisert || jobber}
                    maxLength={120}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    required
                    onInput={(e) => {
                      slugManuell.current = true;
                      endre('slug', e.currentTarget.value);
                    }}
                  />
                  <small>Publiserte adresser beholdes for å unngå brutte lenker.</small>
                </label>
                <label class="cms__felt">
                  <span>Kategori</span>
                  <input
                    maxLength={100}
                    value={dokument.kategori}
                    list="blogg-kategorier"
                    onInput={(e) => endre('kategori', e.currentTarget.value)}
                  />
                  <datalist id="blogg-kategorier">
                    <option>Fra verkstedet</option>
                    <option>Inspirasjon</option>
                    <option>Guider</option>
                    <option>Nyheter</option>
                  </datalist>
                </label>
                <label class="cms__felt">
                  <span>Forfatter</span>
                  <input
                    maxLength={191}
                    value={dokument.forfatter}
                    onInput={(e) => endre('forfatter', e.currentTarget.value)}
                  />
                </label>
                <label class="cms__felt">
                  <span>Emneknagger (komma mellom)</span>
                  <input
                    value={dokument.emneknagger.join(', ')}
                    onChange={(e) =>
                      endre(
                        'emneknagger',
                        e.currentTarget.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                  <small>Høyst 15 emneknagger.</small>
                </label>
                <VelgBilde
                  id={dokument.bilde}
                  medier={medier}
                  endre={(id) => endre('bilde', id)}
                  etikett="Forsidebilde"
                />
                <label class="cms__felt">
                  <span>Alternativ tekst for forsidebildet</span>
                  <input
                    value={dokument.alt}
                    required={dokument.bilde !== null}
                    maxLength={500}
                    onInput={(e) => endre('alt', e.currentTarget.value)}
                  />
                </label>
                <p class="studio__dempet">
                  Last opp nye bilder i mediebiblioteket, og åpne innlegget igjen etter at utkastet er lagret.
                </p>
              </section>
              <section class="studio__panel">
                <h2>Bli funnet og delt</h2>
                <label class="cms__felt">
                  <span>SEO-tittel</span>
                  <input
                    value={dokument.seoTittel}
                    maxLength={200}
                    onInput={(e) => endre('seoTittel', e.currentTarget.value)}
                  />
                  <small>Tomt felt bruker overskriften.</small>
                </label>
                <label class="cms__felt">
                  <span>SEO-beskrivelse</span>
                  <textarea
                    rows={3}
                    value={dokument.seoBeskrivelse}
                    maxLength={500}
                    onInput={(e) => endre('seoBeskrivelse', e.currentTarget.value)}
                  />
                  <small>Tomt felt bruker introduksjonen.</small>
                </label>
                {valgt.url && (
                  <a href={valgt.url} target="_blank" rel="noopener">
                    Åpne offentlig innlegg ↗
                  </a>
                )}
                <p class="studio__dempet">
                  Planlagt publisering og produktkoblinger er ikke tilgjengelige ennå. Publisering skjer når
                  du trykker «Publiser innlegg».
                </p>
              </section>
              <section class="studio__panel">
                <h2>Historikk og synlighet</h2>
                <button
                  type="button"
                  class="cms__lenkeknapp"
                  onClick={() => settVisHistorikk(!visHistorikk)}
                  aria-expanded={visHistorikk}
                >
                  Vis revisjoner ({revisjoner.length})
                </button>
                {visHistorikk && (
                  <ol class="studio__revisjoner">
                    {revisjoner.map((r) => (
                      <li key={r.id}>
                        <strong>
                          Versjon {r.versjon} · {r.handling}
                        </strong>
                        <time dateTime={r.tid}>{dato(r.tid)}</time>
                        <button
                          type="button"
                          class="cms__lenkeknapp"
                          disabled={jobber}
                          onClick={() => void handling('gjenopprett', r.id)}
                        >
                          Bruk som utkast
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {valgt.publisert && (
                  <p>
                    <button
                      type="button"
                      class="cms__knapp"
                      disabled={jobber}
                      onClick={() => void handling('avpubliser')}
                    >
                      Avpubliser innlegg
                    </button>
                  </p>
                )}
              </section>
            </aside>
          </fieldset>
        </form>
      </div>
    );

  const filtrert = liste.filter((p) => {
    const d = p.utkast ?? p.publisert;
    return (
      d &&
      (!sok ||
        `${d.tittel} ${d.kategori} ${d.emneknagger.join(' ')}`.toLowerCase().includes(sok.toLowerCase())) &&
      (filter === 'alle' || (filter === 'utkast' ? !!p.utkast : !!p.publisert))
    );
  });
  const sideAntall = Math.max(1, Math.ceil(filtrert.length / 12));
  const gjeldendeSide = Math.min(side, sideAntall);
  return (
    <section aria-labelledby="studio-blogg">
      <div class="studio__velkomstlinje">
        <div>
          <h2 id="studio-blogg">Historier som gir ideer.</h2>
          <p>Blogg, guider og glimt fra verkstedet. Lagres i databasen, ikke i GitHub.</p>
        </div>
        <div class="cms__radknapper">
          <a class="cms__knapp" href={nettsti('/blogg/')} target="_blank" rel="noopener">
            Se bloggen ↗
          </a>
          <button
            type="button"
            class="cms__knapp cms__knapp--primar"
            disabled={jobber}
            onClick={() => void apne(0)}
          >
            ＋ Nytt innlegg
          </button>
        </div>
      </div>
      {feil && (
        <p role="alert" class="cms__melding cms__melding--feil">
          {feil}
        </p>
      )}
      <div class="studio__filterlinje">
        <div class="studio__filtre" aria-label="Filtrer innlegg">
          {[
            ['alle', 'Alle'],
            ['publisert', 'Publiserte'],
            ['utkast', 'Utkast'],
          ].map(([id, t]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                settFilter(id!);
                settSide(1);
              }}
            >
              {t} (
              {id === 'alle'
                ? liste.length
                : liste.filter((p) => (id === 'utkast' ? p.utkast : p.publisert)).length}
              )
            </button>
          ))}
        </div>
        <label class="cms__felt">
          <span>Søk i blogginnlegg</span>
          <input
            type="search"
            value={sok}
            onInput={(e) => {
              settSok(e.currentTarget.value);
              settSide(1);
            }}
          />
        </label>
      </div>
      {!filtrert.length ? (
        <div class="studio__tomtilstand">
          <h3>{liste.length ? 'Ingen innlegg passer søket.' : 'Den første historien begynner her.'}</h3>
          <p>
            {liste.length
              ? 'Prøv et annet søk eller velg «Alle».'
              : 'Del noe fra verkstedet, lag en guide eller fortell om ideen bak et produkt.'}
          </p>
        </div>
      ) : (
        <div class="studio__innleggrutenett">
          {filtrert.slice((gjeldendeSide - 1) * 12, gjeldendeSide * 12).map((p) => {
            const d = (p.utkast ?? p.publisert)!;
            return (
              <article key={p.id} class="studio__panel studio__innleggkort">
                <span class="studio__status">
                  {p.utkast ? (p.publisert ? 'Endringer i utkast' : 'Utkast') : 'Publisert'}
                </span>
                <p class="studio__kategori">{d.kategori || 'Uten kategori'}</p>
                <h3>{d.tittel}</h3>
                <p>{d.ingress || 'Ingen introduksjon ennå.'}</p>
                <time dateTime={p.endret}>Endret {dato(p.endret)}</time>
                <button
                  type="button"
                  class="cms__lenkeknapp"
                  disabled={jobber}
                  onClick={() => void apne(p.id)}
                >
                  Rediger «{d.tittel}» ↗
                </button>
              </article>
            );
          })}
        </div>
      )}
      {sideAntall > 1 && (
        <nav class="studio__paginering" aria-label="Innleggssider">
          <button
            type="button"
            class="cms__knapp"
            disabled={gjeldendeSide <= 1}
            onClick={() => settSide((v) => v - 1)}
          >
            Forrige
          </button>
          <span>
            Side {gjeldendeSide} av {sideAntall}
          </span>
          <button
            type="button"
            class="cms__knapp"
            disabled={gjeldendeSide >= sideAntall}
            onClick={() => settSide((v) => v + 1)}
          >
            Neste
          </button>
        </nav>
      )}
    </section>
  );
}
