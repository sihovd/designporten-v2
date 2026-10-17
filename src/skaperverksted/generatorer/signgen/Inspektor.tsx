/**
 * Signgen inspector: properties of the selection, the active layer (height,
 * colour, profile, Kontur, influences) and the project.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import {
  finnLag,
  type Dokument,
  type Lag,
  type LagPavirkning,
  type Objekt,
  type Omriss,
  type SvgKilde,
  type TekstKilde,
} from '../../core/dokument';
import { finnMateriale } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { Ikon } from '../../shell/ikoner';
import { tall } from '../../core/enheter';
import { alleFonter } from '../../geometri/tekst';
import { synkFonter } from './fontbibliotek';
import {
  parametre,
  oppdaterLag,
  oppdaterObjekter,
  flyttOmriss,
  grupperTekst,
  oppdaterOmriss,
  slettOmriss,
  standardNavn,
  HULLFORMER,
} from './dokument';
import {
  erOye,
  fotavtrykkBoks,
  lokalGeometri,
  MIN_OMRISSBREDDE,
  objektFarge,
  objektStorrelse,
  STANDARD_RINGBREDDE,
  verdensBoks,
} from './modell';
import { dupliserValgte, settObjektFarge, slettValgte, valgte } from './handlinger';
import { brukSigntilstand, signtilstand } from './tilstand';
import { Kurvepanel, Pennpanel } from './Kurvepanel';
import { antallAapne } from '../../geometri/bane';
import { hentBaner, settKurve, startKurveredigering } from './kurver';
import { nyttOmrissI } from './Lagpanel';
import { PROFILER, Profilseksjon } from './Profilseksjon';
import { Strekseksjon } from './Strekpanel';
import { Fargevelger } from './Fargevelger';
import { brukPanelKontekst } from '../../shell/paneler/kontekst';
import { folgerNavnet, hullanker, settHullavstand } from './batch';
import { kanForankres, kanTilpasses, kropper, plassFor } from './csvlayout';

/**
 * Colour: a swatch that opens a menu of the filaments in the sign's colour
 * profile (Sivert, 2026-10-06). More filaments are added in the Fargeprofil
 * panel.
 */
function Materialvelger({
  benk,
  verdi,
  endre,
  id,
}: {
  benk: Arbeidsbenk;
  verdi: string;
  endre: (id: string) => void;
  id: string;
}) {
  const m = finnMateriale(verdi);
  return (
    <div class="felt">
      <span id={`${id}-etikett`}>Farge</span>
      <span class="materialvalg">
        <Fargevelger
          benk={benk}
          verdi={verdi}
          endre={endre}
          etikett="Farge"
          medNavn
          klasse="materialvelger"
        />
        <span class="dempet fargetype">{m.produsent ? `${m.produsent} ${m.type}` : m.type}</span>
      </span>
    </div>
  );
}

// ---------- object ----------

const SIDENAVN = { venstre: 'til venstre for', hoyre: 'til høyre for', topp: 'over', bunn: 'under' } as const;

/**
 * The layout rule of an object in a CSV series (Sivert, 2026-10-16): a hole, a decoration or another free
 * object keeps its distance to the name; a plate round the name follows the content. Shown for the objects
 * a rule can hold, with the reference the master gives.
 */
function Forankring({
  benk,
  o,
  endre,
}: {
  benk: Arbeidsbenk;
  o: Objekt;
  endre: (navn: string, fn: (o: Objekt) => Objekt, slaSammen?: string) => void;
}) {
  const t = brukBenk(benk);
  if (o.kilde.type === 'tekst') return null;
  const erKropp = kropper(t.dok).some((k) => k.id === o.id);
  if (!erKropp && !kanForankres(t.dok, o)) return null;
  const valg = plassFor(o);
  if (erKropp) {
    return (
      <>
        <div class="felt stablet">
          <span>Størrelse i en CSV-serie</span>
          <Segment
            etikett="Størrelse i en CSV-serie"
            valg={[
              { id: 'auto', navn: 'Følger innholdet' },
              { id: 'fast', navn: 'Fast størrelse' },
            ]}
            verdi={valg === 'fast' ? 'fast' : 'auto'}
            endre={(v) => endre('Størrelse i serie', (x) => ({ ...x, plass: v as 'auto' | 'fast' }))}
          />
        </div>
        <p class="merknad">
          {kanTilpasses(o)
            ? 'Plata blir bredere og smalere med navnet. Hver kant flytter seg like langt som innholdet, så marger og avstanden fra hull og dekor til kanten er den samme på alle skilt. Høyden og hjørneradius endres ikke.'
            : valg === 'fast'
              ? 'Plata beholder størrelsen sin. Hull og dekor på den beholder plassen, og et navn som ikke får plass blir meldt.'
              : 'Denne formen kan ikke endre størrelse. Da beholder hull og dekor plassen sin, og et navn som ikke får plass blir meldt.'}
        </p>
      </>
    );
  }
  const anker = hullanker(t.dok, o);
  if (!anker) return null;
  const folger = folgerNavnet(t.dok, o);
  const b = verdensBoks(o);
  const fot = fotavtrykkBoks(t.dok);
  const tilKant =
    fot &&
    Math.min(
      (b.minX + b.maksX) / 2 - fot.minX,
      fot.maksX - (b.minX + b.maksX) / 2,
      (b.minY + b.maksY) / 2 - fot.minY,
      fot.maksY - (b.minY + b.maksY) / 2,
    );
  const referanse = anker.innvendig
    ? `Ligger på navnet og holder plassen langs det: ${tall(Math.abs(anker.innvendig.dx))} mm fra ${anker.innvendig.ref === 'midt' ? 'midten' : anker.innvendig.ref === 'venstre' ? 'venstre kant' : 'høyre kant'} av navnet.`
    : `Referanse: ${tall(Math.abs(anker.gap))} mm ${anker.gap < 0 ? 'inn i' : SIDENAVN[anker.side]} bokstavene.`;
  return (
    <>
      <div class="felt stablet">
        <span>Plass når navnet er et felt i CSV</span>
        <Segment
          etikett="Plass når navnet er et felt i CSV"
          valg={[
            { id: 'auto', navn: 'Automatisk' },
            { id: 'navn', navn: 'Følger navnet' },
            { id: 'fast', navn: 'Fast plass' },
          ]}
          verdi={valg}
          endre={(v) =>
            endre('Plass i serie', (x) => ({
              ...x,
              plass: v as 'auto' | 'navn' | 'fast',
              kilde: x.kilde.type === 'form' && x.kilde.plass ? { ...x.kilde, plass: undefined } : x.kilde,
            }))
          }
        />
      </div>
      <p class="merknad">
        {folger
          ? `${referanse} På hvert skilt i en CSV-serie flyttes elementet så det får samme avstand, også når navnet blir lengre.${tilKant !== null && tilKant !== undefined ? ` Midten ligger ${tall(tilKant)} mm fra skiltets kant, og plata følger med.` : ''}`
          : 'Elementet beholder plassen sin på alle skilt i en CSV-serie. «Automatisk» lar det følge navnet så lenge plata rundt navnet kan endre størrelse.'}
      </p>
      {folger && !anker.innvendig && (
        <TallFelt
          etikett="Avstand fra navnet"
          verdi={anker.gap}
          min={-20}
          maks={80}
          steg={0.5}
          endre={(v) =>
            benk.endre({
              navn: 'Avstand fra navnet',
              slaSammen: 'hullavstand',
              anvend: (d) => settHullavstand(d, o.id, v),
            })
          }
        />
      )}
    </>
  );
}

/** What a hanging hole's height does, in plain words (it never changes the other layers). */
function hullHoydeTekst(dok: Dokument, hoyde: number | undefined, oye: boolean): string {
  if (!hoyde || hoyde <= 0) {
    return oye
      ? 'Øyet er like høyt som laget det henger på.'
      : 'Hullet går gjennom alle lag. Gi det egen høyde for å bare kutte de nederste lagene.';
  }
  if (oye) return `Øyet blir en egen ring på ${tall(hoyde)} mm. Resten av skiltet endres ikke.`;
  const synlige = dok.lag.filter((l) => l.synlig);
  const kuttet = synlige.filter((l) => l.zBunn < hoyde - 1e-6);
  const delvis = synlige.find((l) => l.zBunn < hoyde - 1e-6 && l.zBunn + l.hoyde > hoyde + 1e-6);
  if (!kuttet.length) return 'Hullet når ikke opp i noe lag, så det kutter ingenting.';
  return delvis
    ? `Hullet slutter inne i «${delvis.navn}» (${tall(delvis.zBunn)}–${tall(delvis.zBunn + delvis.hoyde)} mm), så det laget kuttes helt. Lagene over blir som de er.`
    : `Hullet kutter ${kuttet.length === 1 ? 'laget' : 'lagene'} under ${tall(hoyde)} mm. Lagene over blir som de er.`;
}

/** A hanging hole: a hole through the model, or an eye outside it (Sivert, 2026-10-05). */
function Hullvalg({
  benk,
  o,
  endre,
}: {
  benk: Arbeidsbenk;
  o: Objekt;
  endre: (navn: string, fn: (o: Objekt) => Objekt, slaSammen?: string) => void;
}) {
  const t = brukBenk(benk);
  if (o.kilde.type !== 'form') return null;
  const kilde = o.kilde;
  const oye = erOye(t.dok, o.id);
  const egenHoyde = kilde.hullHoyde !== undefined && kilde.hullHoyde > 0;
  const bunnLag = t.dok.lag.find((l) => l.synlig);
  const standardHoyde = bunnLag ? bunnLag.hoyde : 2;
  const hoydeMerknad = hullHoydeTekst(t.dok, kilde.hullHoyde, oye);
  return (
    <>
      <p class="merknad med-ikon">
        <Ikon id={oye ? 'keyring-eye' : 'hole'} storrelse={20} />
        {oye
          ? `Øye utenfor skiltet: en ring med hull på ${tall(kilde.bredde)} mm til nøkkelring. Dra det inn over skiltet for å gjøre det til et hull.`
          : `Hull gjennom skiltet, ${tall(kilde.bredde)} mm innvendig. Dra det utenfor kanten for å gjøre det til et øye til nøkkelring.`}
      </p>
      <div class="felt">
        <span>Form</span>
        <Segment
          etikett="Form på hullet"
          valg={HULLFORMER.map((f) => ({ id: f.id, navn: f.navn }))}
          verdi={kilde.hullform ?? 'sirkel'}
          endre={(v) =>
            endre('Form på hull', (x) =>
              x.kilde.type === 'form' ? { ...x, kilde: { ...x.kilde, hullform: v } } : x,
            )
          }
        />
      </div>
      <Forankring benk={benk} o={o} endre={endre} />
      {oye && (
        <TallFelt
          etikett="Ringbredde"
          verdi={kilde.ringBredde ?? STANDARD_RINGBREDDE}
          min={MIN_OMRISSBREDDE}
          maks={20}
          steg={0.5}
          endre={(v) =>
            endre('Ringbredde', (x) => ({ ...x, kilde: { ...kilde, ringBredde: v } }), 'ringbredde')
          }
        />
      )}
      <div class="felt">
        <span>{oye ? 'Høyde på øyet' : 'Hullet går'}</span>
        <Segment
          etikett={oye ? 'Høyde på øyet' : 'Hvor langt hullet går'}
          valg={[
            { id: 'laget', navn: oye ? 'Som laget' : 'Hele veien' },
            { id: 'egen', navn: 'Egen' },
          ]}
          verdi={egenHoyde ? 'egen' : 'laget'}
          endre={(v) =>
            endre('Høyde på hull', (x) =>
              x.kilde.type === 'form'
                ? { ...x, kilde: { ...x.kilde, hullHoyde: v === 'egen' ? standardHoyde : undefined } }
                : x,
            )
          }
        />
      </div>
      {egenHoyde && (
        <TallFelt
          etikett={oye ? 'Øyets høyde' : 'Hullet går opp til'}
          verdi={kilde.hullHoyde!}
          min={0.2}
          maks={50}
          steg={0.2}
          endre={(v) =>
            endre('Høyde på hull', (x) => ({ ...x, kilde: { ...kilde, hullHoyde: v } }), 'hullhoyde')
          }
        />
      )}
      <p class="merknad">{hoydeMerknad}</p>
    </>
  );
}

/** Select value for «take the text out of its group». */

function EttObjekt({ benk, o }: { benk: Arbeidsbenk; o: Objekt }) {
  const t = brukBenk(benk);
  const lagForObjekt = finnLag(t.dok, o.lagId);
  const tekstfelt = useRef<HTMLTextAreaElement>(null);
  const [laas, settLaas] = useState(true);
  useEffect(() => {
    const fokus = () => {
      tekstfelt.current?.focus();
      tekstfelt.current?.select();
    };
    window.addEventListener('signgen:rediger-tekst', fokus);
    return () => window.removeEventListener('signgen:rediger-tekst', fokus);
  }, []);
  const endre = (navn: string, fn: (o: Objekt) => Objekt, slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterObjekter(d, [o.id], fn) });
  const str = objektStorrelse(o);
  const g = lokalGeometri(o.kilde);
  const lokalB = g ? g.boks.maksX - g.boks.minX : 1;
  const lokalH = g ? g.boks.maksY - g.boks.minY : 1;
  const settStr = (bredde: number | null, hoyde: number | null, kilde: 'skriv' | 'pil') => {
    let sx = bredde !== null ? bredde / Math.max(1e-6, str.bredde) : 1;
    let sy = hoyde !== null ? hoyde / Math.max(1e-6, str.hoyde) : 1;
    if (laas) {
      const s = bredde !== null ? sx : sy;
      sx = sy = s;
    }
    endre(
      'Endre størrelse',
      (x) =>
        x.kilde.type === 'form'
          ? {
              ...x,
              kilde: {
                ...x.kilde,
                bredde: Math.max(0.2, x.kilde.bredde * sx),
                hoyde: Math.max(0.2, x.kilde.hoyde * sy),
              },
            }
          : {
              ...x,
              transform: { ...x.transform, skalaX: x.transform.skalaX * sx, skalaY: x.transform.skalaY * sy },
            },
      kilde === 'pil' ? 'str-pil' : undefined,
    );
  };
  const tekst = o.kilde.type === 'tekst' ? o.kilde : null;
  /** A font change also updates the project's copy of the added fonts, in the same undo step. */
  const byttFont = (fontId: string) =>
    benk.endre({
      navn: 'Bytt font',
      anvend: (d) =>
        synkFonter(
          oppdaterObjekter(d, [o.id], (x) => {
            if (x.kilde.type !== 'tekst') return x;
            const kilde = { ...x.kilde, fontId };
            return { ...x, kilde, navn: x.navn === standardNavn(x.kilde) ? standardNavn(kilde) : x.navn };
          }),
        ),
    });
  const endreTekst = (navn: string, endring: Partial<TekstKilde>, slaSammen?: string) =>
    endre(
      navn,
      (x) => {
        const kilde = { ...(x.kilde as TekstKilde), ...endring };
        const autoNavn = x.navn === standardNavn(x.kilde);
        return { ...x, kilde, navn: autoNavn ? standardNavn(kilde) : x.navn };
      },
      slaSammen,
    );

  return (
    <>
      <Panel
        tittel={
          o.kilde.type === 'tekst'
            ? 'Tekst'
            : o.kilde.type === 'svg'
              ? o.kilde.strek
                ? 'Strek'
                : 'SVG'
              : 'Form'
        }
      >
        {tekst && (
          <>
            <label class="felt stablet" for="signgen-tekst">
              <span class="visuelt-skjult">Tekst</span>
              <textarea
                id="signgen-tekst"
                ref={tekstfelt}
                rows={2}
                value={tekst.tekst}
                onInput={(e) =>
                  endreTekst(
                    'Skriv tekst',
                    { tekst: (e.target as HTMLTextAreaElement).value },
                    `tekst-${o.id}`,
                  )
                }
              />
            </label>
            <div class="felt fontrad">
              <label for="signgen-font">Font</label>
              <select
                id="signgen-font"
                value={tekst.fontId}
                onChange={(e) => byttFont((e.target as HTMLSelectElement).value)}
              >
                {alleFonter().map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.navn} ({f.preg.toLowerCase()})
                  </option>
                ))}
              </select>
              <button
                type="button"
                class="kontroll-knapp fontknapp"
                aria-label="Flere fonter fra Google Fonts …"
                title="Flere fonter fra Google Fonts"
                onClick={() => signtilstand(benk).sett({ fontvindu: true })}
              >
                <span aria-hidden="true">
                  A<span class="fontknapp-liten">a</span>+
                </span>
              </button>
            </div>
            <TallFelt
              etikett="Skriftstørrelse"
              verdi={tekst.storrelse}
              min={1}
              maks={400}
              steg={0.5}
              endre={(v, k) =>
                endreTekst('Skriftstørrelse', { storrelse: v }, k === 'pil' ? 'str' : undefined)
              }
            />
            <TallFelt
              etikett="Bokstavavstand"
              enhet="%"
              verdi={tekst.sperring * 100}
              min={-20}
              maks={200}
              steg={1}
              desimaler={0}
              endre={(v) => endreTekst('Bokstavavstand', { sperring: v / 100 })}
            />
            {tekst.tekst.includes('\n') && (
              <TallFelt
                etikett="Linjeavstand"
                enhet="×"
                verdi={tekst.linjeavstand}
                min={0.6}
                maks={3}
                steg={0.05}
                desimaler={2}
                endre={(v) => endreTekst('Linjeavstand', { linjeavstand: v })}
              />
            )}
            <div class="felt">
              <span>Justering</span>
              <Segment
                etikett="Justering"
                valg={[
                  { id: 'venstre', navn: 'Venstrejustert', ikon: 'tekst-venstre' },
                  { id: 'midt', navn: 'Midtstilt', ikon: 'tekst-midt' },
                  { id: 'hoyre', navn: 'Høyrejustert', ikon: 'tekst-hoyre' },
                ]}
                verdi={tekst.justering}
                endre={(j) => endreTekst('Justering', { justering: j })}
              />
            </div>
            {g && g.mangler.length > 0 && (
              <p class="merknad">
                Fonten har ikke {g.mangler.map((c) => `«${c}»`).join(', ')}. Velg en annen font.
              </p>
            )}
          </>
        )}
        {o.kilde.type === 'form' && o.kilde.form === 'rektangel' && (
          <TallFelt
            etikett="Hjørneradius"
            verdi={o.kilde.hjorneradius}
            min={0}
            maks={Math.min(o.kilde.bredde, o.kilde.hoyde) / 2}
            steg={0.5}
            endre={(v) =>
              endre('Hjørneradius', (x) => ({
                ...x,
                kilde: { ...x.kilde, hjorneradius: v } as typeof x.kilde,
              }))
            }
          />
        )}
        {o.kilde.type === 'form' && o.kilde.form === 'polygon' && (
          <TallFelt
            etikett="Antall sider"
            enhet=""
            verdi={o.kilde.sider}
            min={3}
            maks={64}
            steg={1}
            desimaler={0}
            endre={(v) =>
              endre('Antall sider', (x) => ({
                ...x,
                kilde: { ...x.kilde, sider: Math.round(v) } as typeof x.kilde,
              }))
            }
          />
        )}
        {o.kilde.type === 'form' && o.kilde.form === 'hull' && <Hullvalg benk={benk} o={o} endre={endre} />}
        {!(o.kilde.type === 'form' && o.kilde.form === 'hull') && (
          <Forankring benk={benk} o={o} endre={endre} />
        )}
        {o.kilde.type === 'svg' && o.kilde.strek && <Strekseksjon benk={benk} o={o} />}
        {o.kilde.type === 'svg' && !o.kilde.strek && (
          <>
            <p class="merknad">
              {o.kilde.dekorId ? `Dekor: ${o.kilde.filnavn}.` : `Importert fra «${o.kilde.filnavn}».`}
            </p>
            <div class="felt">
              <span>Hull i vektoren</span>
              <Segment
                etikett="Hull i vektoren"
                valg={[
                  { id: 'behold', navn: 'Behold hull' },
                  { id: 'fyll', navn: 'Fyll igjen' },
                ]}
                verdi={o.kilde.hull ?? 'behold'}
                endre={(v) =>
                  endre(v === 'fyll' ? 'Fyll hull i vektor' : 'Behold hull i vektor', (x) => ({
                    ...x,
                    kilde: { ...(x.kilde as SvgKilde), hull: v },
                  }))
                }
              />
            </div>
            <div class="knapperad">
              <button
                type="button"
                class="kontroll-knapp"
                title="Rediger punkter og kurver (dobbeltklikk på vektoren)"
                onClick={() => startKurveredigering(benk, o.id)}
              >
                Rediger kurver
              </button>
            </div>
            {(() => {
              const aapne = antallAapne(hentBaner(o) ?? []);
              return aapne ? (
                <>
                  <p class="merknad advarsel-tekst">
                    {aapne} {aapne === 1 ? 'bane er' : 'baner er'} ikke sluttet.
                  </p>
                  <button
                    type="button"
                    class="kontroll-knapp"
                    onClick={() => {
                      if (startKurveredigering(benk, o.id)) settKurve(benk, { repVis: true });
                    }}
                  >
                    Reparer åpne baner …
                  </button>
                </>
              ) : null;
            })()}
            <p class="merknad">
              «Behold hull» lar åpningene i vektoren stå åpne. «Fyll igjen» gir bare silhuetten. Vil du skjære
              vektoren ut av et lag, velg «Kutter» under Rolle.
            </p>
          </>
        )}
      </Panel>

      <Panel tittel="Plassering og størrelse">
        <div class="feltpar">
          <TallFelt
            etikett="Posisjon X"
            kortEtikett="X"
            verdi={o.transform.x}
            steg={1}
            endre={(v, k) =>
              endre(
                'Flytt',
                (x) => ({ ...x, transform: { ...x.transform, x: v } }),
                k === 'pil' ? 'pos' : undefined,
              )
            }
          />
          <TallFelt
            etikett="Posisjon Y"
            kortEtikett="Y"
            verdi={o.transform.y}
            steg={1}
            endre={(v, k) =>
              endre(
                'Flytt',
                (x) => ({ ...x, transform: { ...x.transform, y: v } }),
                k === 'pil' ? 'pos' : undefined,
              )
            }
          />
          <TallFelt
            etikett="Bredde"
            kortEtikett="B"
            verdi={str.bredde}
            min={0.2}
            steg={1}
            endre={(v, k) => settStr(v, null, k)}
          />
          <TallFelt
            etikett="Høyde"
            kortEtikett="H"
            verdi={str.hoyde}
            min={0.2}
            steg={1}
            endre={(v, k) => settStr(null, v, k)}
          />
        </div>
        <TallFelt
          etikett="Rotasjon"
          enhet="°"
          verdi={o.transform.rotasjon}
          min={-360}
          maks={360}
          steg={15}
          endre={(v, k) =>
            endre(
              'Roter',
              (x) => ({ ...x, transform: { ...x.transform, rotasjon: v } }),
              k === 'pil' ? 'rot' : undefined,
            )
          }
        />
        {(Math.abs(o.transform.skalaX - o.transform.skalaY) > 1e-6 || lokalB <= 0 || lokalH <= 0) &&
          o.kilde.type !== 'form' && (
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                endre('Tilbakestill skala', (x) => ({
                  ...x,
                  transform: { ...x.transform, skalaX: 1, skalaY: 1 },
                }))
              }
            >
              Tilbakestill skala
            </button>
          )}
        <label class="avkryssing">
          <input type="checkbox" checked={laas} onChange={() => settLaas(!laas)} /> Behold proporsjoner
        </label>
      </Panel>

      {o.kilde.type === 'tekst' && !lagForObjekt?.tekstlag && (
        <p class="merknad panel-merknad">
          Denne teksten ligger sammen med former (fra før tekstlagene). Flytt den til et tekstlag med valget
          «Lag» i linjen øverst for å gi den omriss.
        </p>
      )}
      {!(o.kilde.type === 'form' && o.kilde.form === 'hull') &&
        o.operasjon === 'legg-til' &&
        lagForObjekt && (
          <Panel tittel="Farge">
            {
              <div class="felt">
                <span id="signgen-objektfarge-etikett">Farge</span>
                <span class="materialvalg">
                  <Fargevelger
                    benk={benk}
                    verdi={objektFarge(lagForObjekt, o)}
                    endre={(m) => settObjektFarge(benk, o.id, m)}
                    etikett="Farge på objektet"
                    medNavn
                    klasse="materialvelger"
                  />
                  {o.materialId ? (
                    <button
                      type="button"
                      class="kontroll-knapp med-ikon"
                      onClick={() => endre('Følg lagets farge', (x) => ({ ...x, materialId: undefined }))}
                    >
                      <Ikon id="color-follow-layer" storrelse={16} />
                      Følg laget
                    </button>
                  ) : (
                    <span class="dempet fargetype">følger laget</span>
                  )}
                </span>
              </div>
            }
          </Panel>
        )}

      {(tekst || o.kilde.type === 'svg') && (
        <Panel tittel="Til CSV">
          {o.kilde.type === 'svg' && (
            <label class="felt" for="signgen-felt">
              <span>Batchfelt (dekor)</span>
              <input
                id="signgen-felt"
                type="text"
                placeholder="f.eks. dekor"
                value={o.kilde.felt ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9æøå_-]/g, '');
                  endre('Batchfelt', (x) => ({
                    ...x,
                    kilde: { ...(x.kilde as SvgKilde), felt: v || undefined },
                  }));
                }}
              />
            </label>
          )}
          {o.kilde.type === 'svg' && o.kilde.felt && (
            <p class="merknad">
              I CSV-filen skriver du navnet på dekoret i kolonnen «{o.kilde.felt}», for eksempel «Hest». Tom
              celle eller «ingen» lar skiltet være uten dekor.
            </p>
          )}
          {tekst && (
            <label class="felt" for="signgen-felt">
              <span>Batchfelt</span>
              <input
                id="signgen-felt"
                type="text"
                placeholder="f.eks. navn"
                value={tekst.felt ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9æøå_-]/g, '');
                  endre('Batchfelt', (x) => ({
                    ...x,
                    kilde: { ...(x.kilde as TekstKilde), felt: v || undefined },
                  }));
                }}
              />
            </label>
          )}
        </Panel>
      )}
    </>
  );
}

function FlereObjekter({ benk, antall }: { benk: Arbeidsbenk; antall: number }) {
  const t = brukBenk(benk);
  const tekster = valgte(benk).filter((o) => o.kilde.type === 'tekst');
  const kanGruppere =
    tekster.length >= 2 &&
    tekster.some((o) => finnLag(t.dok, o.lagId)?.tekstlag) &&
    new Set(tekster.map((o) => o.lagId)).size > 1;
  const grupper = () => {
    let lag: string | null = null;
    benk.endre({
      navn: 'Grupper tekst',
      anvend: (d) => {
        const r = grupperTekst(
          d,
          tekster.map((o) => o.id),
        );
        lag = r.lagId;
        return r.dok;
      },
    });
    if (lag) {
      benk.velg({ lag });
      benk.melde(
        `${tekster.length} tekster er gruppert i «${finnLag(benk.dok, lag)?.navn}» og deler omrissene der.`,
      );
    }
  };
  return (
    <Panel tittel={`${antall} objekter valgt`}>
      {kanGruppere && (
        <div class="knapperad">
          <button type="button" class="kontroll-knapp" onClick={grupper}>
            Grupper tekst
          </button>
          <p class="merknad">Grupperte tekster ligger i samme tekstlag og får felles omriss.</p>
        </div>
      )}
      <div class="knapperad">
        <button type="button" class="kontroll-knapp" onClick={() => dupliserValgte(benk)}>
          Dupliser
        </button>
        <button type="button" class="kontroll-knapp farlig" onClick={() => slettValgte(benk)}>
          Slett
        </button>
      </div>
    </Panel>
  );
}

// ---------- layer ----------

function LagInspektor({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const t = brukBenk(benk);
  const iPaneler = brukPanelKontekst();
  const auto = parametre(t.dok).autoZ;
  const endre = (navn: string, endring: Partial<Lag>, slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterLag(d, lag.id, endring) });
  const andre = t.dok.lag.filter((l) => l.id !== lag.id);
  const settPavirkninger = (p: LagPavirkning[]) => endre('Endre påvirkning', { pavirkninger: p });

  return (
    <>
      <Panel tittel={`Lag: ${lag.navn}`}>
        <label class="felt" for="signgen-lagnavn">
          <span>Navn</span>
          <input
            id="signgen-lagnavn"
            type="text"
            value={lag.navn}
            onChange={(e) =>
              endre('Gi laget nytt navn', { navn: (e.target as HTMLInputElement).value.trim() || lag.navn })
            }
          />
        </label>
        {lag.tekstlag && (
          <div class="felt">
            <span>Teksten</span>
            <Segment
              etikett="Hvordan teksten vises"
              valg={[
                { id: 'normal', navn: 'Står opp' },
                { id: 'kutt', navn: 'Skåret ut' },
              ]}
              verdi={lag.tekstvisning ?? 'normal'}
              endre={(v) =>
                endre(v === 'kutt' ? 'Skjær ut teksten' : 'La teksten stå opp', { tekstvisning: v })
              }
            />
          </div>
        )}
        {lag.tekstlag && lag.tekstvisning === 'kutt' && (
          <p class="merknad">Teksten skjæres ut av omrissene, så det som ligger under, synes gjennom.</p>
        )}
        <Materialvelger
          benk={benk}
          id="signgen-lagfarge"
          verdi={lag.materialId}
          endre={(m) => endre('Bytt farge', { materialId: m })}
        />
        <TallFelt
          etikett={lag.tekstlag ? 'Teksthøyde' : 'Høyde (tykkelse)'}
          verdi={lag.hoyde}
          min={0.2}
          maks={100}
          steg={0.2}
          endre={(v, k) => endre('Lagets høyde', { hoyde: v }, k === 'pil' ? 'hoyde' : undefined)}
        />
        <TallFelt
          etikett="Starter på Z"
          verdi={lag.zBunn}
          min={0}
          maks={t.dok.plate.hoyde}
          steg={0.2}
          deaktivert={auto}
          endre={(v) => endre('Lagets Z', { zBunn: v })}
        />
        {auto && t.dok.lag[0]?.id !== lag.id && (
          <>
            <label class="avkryssing">
              <input
                type="checkbox"
                checked={!!lag.sammeNivaa}
                onChange={() =>
                  endre(lag.sammeNivaa ? 'Stable laget oppå' : 'Legg laget på samme nivå', {
                    sammeNivaa: !lag.sammeNivaa,
                  })
                }
              />{' '}
              Samme nivå som laget under
            </label>
            <p class="merknad">
              {lag.sammeNivaa
                ? 'Laget starter på samme Z som laget under, så delene kan ligge side om side i hver sin farge.'
                : 'Laget stables oppå laget under. Kryss av for å legge delene side om side i hver sin farge.'}
            </p>
          </>
        )}
        {auto && (
          <p class="merknad">
            Z følger lagrekkefølgen. Slå av «Stable lagene automatisk» i Prosjektinnstillinger for å sette Z
            selv.
          </p>
        )}
      </Panel>

      <Panel tittel="Sideprofil">
        {iPaneler ? (
          <>
            <p class="merknad">
              Veggen: {PROFILER.find((x) => x.id === lag.profil.type)?.navn.toLowerCase()}. Formen og
              tverrsnittet av laget redigerer du i Profil-panelet.
            </p>
            <button type="button" class="kontroll-knapp" onClick={() => benk.kommando('panel:profil')}>
              Åpne Profil-panelet
            </button>
          </>
        ) : (
          <Profilseksjon benk={benk} lag={lag} />
        )}
      </Panel>

      {lag.tekstlag && <OmrissInspektor benk={benk} lag={lag} />}

      {(!lag.tekstlag || lag.kontur.avstand !== 0 || lag.kontur.kunRing) && (
        <Panel tittel="Kontur">
          <TallFelt
            etikett="Forskyv omrisset"
            verdi={lag.kontur.avstand}
            min={-20}
            maks={40}
            steg={0.5}
            endre={(v, k) =>
              endre('Kontur', { kontur: { ...lag.kontur, avstand: v } }, k === 'pil' ? 'kontur' : undefined)
            }
          />
          <div class="felt">
            <span>Hjørner</span>
            <Segment
              etikett="Hjørner"
              valg={[
                { id: 'rund', navn: 'Runde' },
                { id: 'skarp', navn: 'Skarpe' },
                { id: 'faset', navn: 'Fasede' },
              ]}
              verdi={lag.kontur.hjorne}
              endre={(h) => endre('Konturhjørner', { kontur: { ...lag.kontur, hjorne: h } })}
            />
          </div>
          <label class="avkryssing">
            <input
              type="checkbox"
              checked={lag.kontur.kunRing}
              onChange={() =>
                endre('Kontur som ring', { kontur: { ...lag.kontur, kunRing: !lag.kontur.kunRing } })
              }
            />{' '}
            Bare en ring (omriss)
          </label>
          {lag.kontur.kunRing && (
            <TallFelt
              etikett="Ringbredde"
              verdi={lag.kontur.ringBredde}
              min={MIN_OMRISSBREDDE}
              maks={20}
              steg={0.2}
              endre={(v) => endre('Ringbredde', { kontur: { ...lag.kontur, ringBredde: v } })}
            />
          )}
        </Panel>
      )}

      <Panel
        tittel="Påvirkning fra andre lag"
        handling={
          andre.length > 0 && (
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                settPavirkninger([
                  ...lag.pavirkninger,
                  { kildeLagId: andre.at(-1)!.id, handling: 'kutt', avstand: 0.4 },
                ])
              }
            >
              + Legg til
            </button>
          )
        }
      >
        {lag.pavirkninger.length === 0 && (
          <p class="tom-melding">
            Omrisset til et annet lag kan legge til eller skjære ut fra dette laget, med en avstand.
          </p>
        )}
        {lag.pavirkninger.map((p, i) => {
          const oppdater = (e: Partial<LagPavirkning>) =>
            settPavirkninger(lag.pavirkninger.map((x, j) => (j === i ? { ...x, ...e } : x)));
          return (
            <div class="pavirkning" key={i}>
              <label class="felt" for={`pav-${i}`}>
                <span>Fra lag</span>
                <select
                  id={`pav-${i}`}
                  value={p.kildeLagId}
                  onChange={(e) => oppdater({ kildeLagId: (e.target as HTMLSelectElement).value })}
                >
                  {andre.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.navn}
                    </option>
                  ))}
                </select>
              </label>
              <div class="felt">
                <span>Virkning</span>
                <Segment
                  etikett="Virkning"
                  valg={[
                    { id: 'kutt', navn: 'Skjærer ut' },
                    { id: 'legg-til', navn: 'Legger til' },
                  ]}
                  verdi={p.handling}
                  endre={(h) => oppdater({ handling: h })}
                />
              </div>
              <TallFelt
                etikett="Avstand"
                verdi={p.avstand}
                min={-20}
                maks={40}
                steg={0.1}
                endre={(v) => oppdater({ avstand: v })}
              />
              <button
                type="button"
                class="kontroll-knapp farlig"
                onClick={() => settPavirkninger(lag.pavirkninger.filter((_, j) => j !== i))}
              >
                Fjern
              </button>
            </div>
          );
        })}
      </Panel>
    </>
  );
}

// ---------- outlines of a text layer ----------

function OmrissBlokk({ benk, lag, o, i }: { benk: Arbeidsbenk; lag: Lag; o: Omriss; i: number }) {
  const st = brukSigntilstand(benk);
  const antall = lag.omriss?.length ?? 0;
  const endre = (navn: string, endring: Partial<Omriss>, slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterOmriss(d, lag.id, o.id, endring) });
  const id = (x: string) => `omriss-${o.id}-${x}`;
  return (
    <div
      class={`omrissblokk${st.omriss === o.id ? ' aktiv' : ''}`}
      onFocusCapture={() => signtilstand(benk).sett({ omriss: o.id })}
    >
      <label class="felt" for={id('navn')}>
        <span>Navn</span>
        <input
          id={id('navn')}
          type="text"
          value={o.navn}
          onChange={(e) =>
            endre('Gi omrisset nytt navn', { navn: (e.target as HTMLInputElement).value.trim() || o.navn })
          }
        />
      </label>
      <div class="felt">
        <span>Type</span>
        <Segment
          etikett={`Type for ${o.navn}`}
          valg={[
            { id: 'fyll', navn: 'Fyll' },
            { id: 'omriss', navn: 'Omriss' },
          ]}
          verdi={o.type}
          endre={(v) => endre(v === 'fyll' ? 'Fyll omrisset' : 'Gjør til omriss', { type: v })}
        />
      </div>
      <TallFelt
        etikett={o.type === 'fyll' ? 'Bredde' : 'Strekbredde'}
        verdi={o.bredde}
        min={MIN_OMRISSBREDDE}
        maks={40}
        steg={0.5}
        endre={(v, k) => endre('Omrissbredde', { bredde: v }, k === 'pil' ? `bredde-${o.id}` : undefined)}
      />
      <TallFelt
        etikett="Avstand innenfra"
        verdi={o.avstand}
        min={0}
        maks={20}
        steg={0.2}
        endre={(v, k) => endre('Omrissavstand', { avstand: v }, k === 'pil' ? `avstand-${o.id}` : undefined)}
      />
      <TallFelt
        etikett="Høyde"
        verdi={o.hoyde}
        min={0.2}
        maks={50}
        steg={0.2}
        endre={(v, k) => endre('Omrisshøyde', { hoyde: v }, k === 'pil' ? `hoyde-${o.id}` : undefined)}
      />
      <Materialvelger
        benk={benk}
        id={id('farge')}
        verdi={o.materialId}
        endre={(m) => endre('Bytt farge', { materialId: m })}
      />
      <div class="felt">
        <span>Hjørner</span>
        <Segment
          etikett={`Hjørner for ${o.navn}`}
          valg={[
            { id: 'rund', navn: 'Rund' },
            { id: 'skarp', navn: 'Skarp' },
            { id: 'faset', navn: 'Fas' },
          ]}
          verdi={o.hjorne}
          endre={(h) => endre('Omrisshjørner', { hjorne: h })}
        />
      </div>
      <div class="knapperad">
        <button
          type="button"
          class="kontroll-knapp"
          disabled={i === 0}
          onClick={() =>
            benk.endre({ navn: 'Flytt omriss innover', anvend: (d) => flyttOmriss(d, lag.id, o.id, -1) })
          }
        >
          Innover
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          disabled={i >= antall - 1}
          onClick={() =>
            benk.endre({ navn: 'Flytt omriss utover', anvend: (d) => flyttOmriss(d, lag.id, o.id, 1) })
          }
        >
          Utover
        </button>
        <button
          type="button"
          class="kontroll-knapp farlig"
          onClick={() => {
            benk.endre({ navn: 'Slett omriss', anvend: (d) => slettOmriss(d, lag.id, o.id) });
            benk.melde(`«${o.navn}» er slettet. Angre med Ctrl+Z.`);
          }}
        >
          Slett
        </button>
      </div>
    </div>
  );
}

/**
 * Outlines around the text (Sivert, 2026-10-05): any number, each «fyll»
 * or «omriss», with its own width, gap, height and colour. They never
 * cover the text, and the text's height does not change theirs.
 */
function OmrissInspektor({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const st = brukSigntilstand(benk);
  const omriss = lag.omriss ?? [];
  // an outline chosen in the layers panel is the only one shown, and the only one changed
  const valgt = omriss.find((o) => o.id === st.omriss);
  return (
    <Panel
      tittel={valgt ? `Omriss: ${valgt.navn}` : 'Omriss rundt teksten'}
      handling={
        <button
          type="button"
          class="kontroll-knapp"
          disabled={lag.last}
          onClick={() => nyttOmrissI(benk, lag)}
        >
          + Legg til
        </button>
      }
    >
      {omriss.length === 0 && (
        <p class="tom-melding">
          Et omriss følger teksten med teksten i midten. Det dekker aldri selve teksten og har sin egen høyde
          og farge.
        </p>
      )}
      {omriss.map((o, i) =>
        valgt && valgt.id !== o.id ? null : <OmrissBlokk key={o.id} benk={benk} lag={lag} o={o} i={i} />,
      )}
      {valgt && omriss.length > 1 && (
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => signtilstand(benk).sett({ omriss: null })}
        >
          Vis alle omrissene
        </button>
      )}
      {omriss.length > 0 && (
        <p class="merknad">
          Innerst først. Omrissene starter på samme høyde som teksten. Grupperte tekster deler omrissene.
          {valgt ? ' Endringene gjelder bare omrisset du har valgt i lagpanelet.' : ''}
        </p>
      )}
    </Panel>
  );
}

export function SigngenInspektor({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const valgte = t.utvalg.objekter.map((id) => t.dok.objekter[id]).filter((o): o is Objekt => !!o);
  const lag = t.utvalg.lag ? finnLag(t.dok, t.utvalg.lag) : undefined;
  if (valgte.length === 1) {
    return (
      <>
        {st.kurve && st.kurve.objektId === valgte[0]!.id && <Kurvepanel benk={benk} />}
        {st.verktoy === 'penn' && <Pennpanel benk={benk} />}
        <EttObjekt benk={benk} o={valgte[0]!} key={valgte[0]!.id} />
      </>
    );
  }
  if (valgte.length > 1) return <FlereObjekter benk={benk} antall={valgte.length} />;
  return (
    <>
      {st.verktoy === 'penn' && <Pennpanel benk={benk} />}
      {lag && <LagInspektor benk={benk} lag={lag} key={lag.id} />}
      {!lag && (
        <Panel tittel="Egenskaper">
          <p class="tom-melding">
            Velg et objekt eller et lag for å se egenskapene. Byggeplate, farger og printlaghøyde ligger i
            Prosjektinnstillinger øverst i lagpanelet.
          </p>
        </Panel>
      )}
    </>
  );
}
