/**
 * Properties in brick mode: what is happening right now (a previewed
 * connection, a point waiting for a partner, a swap with its
 * consequences), the model tree, the selected brick with its points,
 * quick actions and local values, the group's place on the plate, and the
 * colours. Every change is one undo step.
 */
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { finnMateriale } from '../../../core/materialer';
import { mm, tall } from '../../../core/enheter';
import { brukUtdrag } from '../../../shell/bruk-benk';
import { Felt, Panel, TallFelt } from '../../../shell/kontroller';
import { endreDrage } from '../handlinger';
import { Fargevelger } from '../Inspektor';
import { katalog, lesParametre, soner } from '../parametre';
import {
  andreEnde,
  bytt,
  byttKonsekvens,
  dupliser,
  finnInstans,
  flyttGruppe,
  forbindelseVed,
  foreldre,
  giNavn,
  gren,
  gruppeFor,
  kanKoble,
  kobleFra,
  navnPa,
  punktnavn,
  settVerdier,
  slett,
} from './graf';
import { brikkerFra, byttModus, endreBrikker } from './handlinger';
import {
  BREDDE_MAKS,
  BREDDE_MIN,
  finnDefinisjon,
  HENGSEL_M,
  type Brikkeprosjekt,
  type Ende,
  type Lokaleverdier,
} from './modell';
import { bekreftKandidat, kandidatTekst } from './Overlegg';
import { brukEditor, forhandsvis, type Editorlager } from './tilstand';
import '../drage.css';

/** The groups as trees: root first, children indented. */
function tre(p: Brikkeprosjekt): { gruppe: string; rader: { id: string; dybde: number; rot: boolean }[] }[] {
  const F = foreldre(p);
  const barn = new Map<string, string[]>();
  for (const i of p.instanser) {
    const f = F.get(i.id);
    if (f) barn.set(f.forelder, [...(barn.get(f.forelder) ?? []), i.id]);
  }
  return p.grupper.map((g) => {
    const rader: { id: string; dybde: number; rot: boolean }[] = [];
    const besok = (id: string, dybde: number) => {
      rader.push({ id, dybde, rot: dybde === 0 });
      for (const b of barn.get(id) ?? []) besok(b, dybde + 1);
    };
    besok(g.rot, 0);
    return { gruppe: g.id, rader };
  });
}

function Modelltre({ p, valgt, lager }: { p: Brikkeprosjekt; valgt: string | null; lager: Editorlager }) {
  const grupper = tre(p);
  if (!grupper.length)
    return <p class="merknad">Ingen brikker ennå. Velg en brikke i biblioteket nederst.</p>;
  return (
    <div class="df-tre">
      {grupper.map((g, n) => (
        <div key={g.gruppe} class="df-tregruppe">
          <h3 class="df-tretittel">
            {n === 0 ? 'Hovedgruppe' : `Løs gruppe ${n}`}
            <span class="merknad">
              {' '}
              · {g.rader.length} brikke{g.rader.length === 1 ? '' : 'r'}
            </span>
          </h3>
          <ul role="list">
            {g.rader.map((r) => (
              <li key={r.id} style={{ paddingLeft: `${Math.min(r.dybde, 8) * 12}px` }}>
                <button
                  type="button"
                  class="df-trerad"
                  aria-pressed={valgt === r.id}
                  onClick={() => lager.sett({ valgt: valgt === r.id ? null : r.id })}
                >
                  {r.rot && <span aria-hidden="true">★ </span>}
                  {navnPa(p, r.id)}
                  {r.rot && <span class="visuelt-skjult"> (gruppens rot)</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Punkter({
  benk,
  p,
  id,
  lager,
}: {
  benk: Arbeidsbenk;
  p: Brikkeprosjekt;
  id: string;
  lager: Editorlager;
}) {
  const i = finnInstans(p, id)!;
  const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
  if (!def) return null;
  return (
    <ul class="df-punktliste" role="list">
      {def.punkter.map((k) => {
        const e: Ende = { instans: id, punkt: k.id };
        const f = forbindelseVed(p, e);
        return (
          <li key={k.id}>
            <span>
              <strong>{k.navn}</strong>
              <span class="merknad">
                {' '}
                {f ? `koblet til ${punktnavn(p, andreEnde(f, id)).toLowerCase()}` : 'ledig'}
              </span>
            </span>
            {f ? (
              <button
                type="button"
                class="kontroll-knapp"
                onClick={() => endreBrikker(benk, (q) => kobleFra(q, f.id))}
              >
                Koble fra
              </button>
            ) : (
              <button
                type="button"
                class="kontroll-knapp"
                onClick={() => lager.sett({ kilde: e, kandidat: null, plasserer: null })}
              >
                Koble til …
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Lokalt({ benk, p, id }: { benk: Arbeidsbenk; p: Brikkeprosjekt; id: string }) {
  const i = finnInstans(p, id)!;
  const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
  if (!def) return null;
  const sett = (v: Lokaleverdier, slaSammen?: string) =>
    endreBrikker(benk, (q) => settVerdier(q, id, v), slaSammen);
  const bredde = Math.round((i.verdier.bredde ?? 1) * 100);
  return (
    <>
      <p class="merknad">Gjelder bare denne brikken. Leddet og klaringen endres ikke.</p>
      <TallFelt
        etikett="Bredde"
        verdi={bredde}
        enhet="%"
        min={BREDDE_MIN * 100}
        maks={BREDDE_MAKS * 100}
        steg={5}
        desimaler={0}
        endre={(v, kilde) => sett({ bredde: v / 100 }, kilde === 'pil' ? `df-bredde-${id}` : undefined)}
      />
      <Felt etikett="Pigger">
        <select
          value={i.verdier.pigger ?? 'spisse'}
          aria-label="Pigger"
          onChange={(ev) =>
            sett({ pigger: (ev.target as HTMLSelectElement).value as Lokaleverdier['pigger'] })
          }
        >
          {katalog.pigger.map((v) => (
            <option key={v.id} value={v.id}>
              {v.navn}
            </option>
          ))}
        </select>
      </Felt>
      {def.kategori === 'hode' && (
        <>
          <Felt etikett="Horn">
            <select
              value={i.verdier.horn ?? 'sma'}
              aria-label="Horn"
              onChange={(ev) =>
                sett({ horn: (ev.target as HTMLSelectElement).value as Lokaleverdier['horn'] })
              }
            >
              {katalog.horn.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.navn}
                </option>
              ))}
            </select>
          </Felt>
          <Felt etikett="Øyne">
            <select
              value={i.verdier.oyne ?? 'store'}
              aria-label="Øyne"
              onChange={(ev) =>
                sett({ oyne: (ev.target as HTMLSelectElement).value as Lokaleverdier['oyne'] })
              }
            >
              {katalog.oyne.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.navn}
                </option>
              ))}
            </select>
          </Felt>
        </>
      )}
    </>
  );
}

function Plassering({ benk, p, id }: { benk: Arbeidsbenk; p: Brikkeprosjekt; id: string }) {
  const g = gruppeFor(p, id);
  if (!g) return null;
  const pl = g.plassering;
  const flytt = (ny: Partial<typeof pl>, slaSammen?: string) =>
    endreBrikker(benk, (q) => flyttGruppe(q, g.id, { ...pl, ...ny }), slaSammen);
  return (
    <>
      <div class="feltpar">
        <TallFelt
          etikett="X"
          verdi={pl.x}
          min={-200}
          maks={200}
          steg={1}
          endre={(v, k) => flytt({ x: v }, k === 'pil' ? `df-x-${g.id}` : undefined)}
        />
        <TallFelt
          etikett="Y"
          verdi={pl.y}
          min={-200}
          maks={200}
          steg={1}
          endre={(v, k) => flytt({ y: v }, k === 'pil' ? `df-y-${g.id}` : undefined)}
        />
      </div>
      <TallFelt
        etikett="Retning"
        verdi={pl.vinkel}
        enhet="°"
        min={-180}
        maks={180}
        steg={5}
        desimaler={0}
        endre={(v, k) => flytt({ vinkel: v }, k === 'pil' ? `df-v-${g.id}` : undefined)}
      />
      <div class="knapperad">
        <button type="button" class="kontroll-knapp" onClick={() => flytt({ vinkel: pl.vinkel + 15 })}>
          Snu 15° mot venstre
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => flytt({ vinkel: pl.vinkel - 15 })}>
          Snu 15° mot høyre
        </button>
      </div>
      <p class="merknad">Flytter og snur hele gruppen. Koblingene følger med.</p>
    </>
  );
}

export function BrikkeInspektor({ benk }: { benk: Arbeidsbenk }) {
  const raa = brukUtdrag(benk, (t) => t.dok.parametre);
  const modell = brukUtdrag(benk, (t) => t.modell);
  const { prosjekt: p } = brikkerFra(raa);
  const farger = lesParametre(raa);
  const [e, lager] = brukEditor(benk, p);
  const valgt = e.valgt ? finnInstans(p, e.valgt) : undefined;
  const def = valgt && finnDefinisjon(valgt.definisjon.id, valgt.definisjon.versjon);
  const forhand = e.kandidat ? forhandsvis(p, e.kandidat) : null;
  const bak = valgt ? gren(p, valgt.id).length : 0;

  const malForKilde = e.kilde
    ? p.instanser.flatMap((i) =>
        ['foran', 'bak'].map((punkt) => ({ instans: i.id, punkt })).filter((m) => !kanKoble(p, e.kilde!, m)),
      )
    : [];

  return (
    <>
      {e.kandidat && forhand && (
        <Panel tittel="Forhåndsvisning">
          <p role="status">{forhand.ok ? kandidatTekst(p, e.kandidat) : forhand.grunn}</p>
          <div class="knapperad">
            {forhand.ok && (
              <button
                type="button"
                class="kontroll-knapp df-hoved"
                onClick={() => bekreftKandidat(benk, lager, e.kandidat!)}
              >
                Koble
              </button>
            )}
            <button type="button" class="kontroll-knapp" onClick={() => lager.sett({ kandidat: null })}>
              Avbryt
            </button>
          </div>
        </Panel>
      )}

      {e.kilde && !e.kandidat && (
        <Panel tittel="Koble til">
          <p class="merknad">
            {punktnavn(p, e.kilde)} kan kobles til
            {malForKilde.length ? ':' : ' ingen ledige punkter i andre grupper.'}
          </p>
          <div class="knapperad">
            {malForKilde.map((m) => (
              <button
                key={`${m.instans}/${m.punkt}`}
                type="button"
                class="kontroll-knapp df-punktknapp"
                onClick={() => lager.sett({ kandidat: { type: 'koble', flytt: e.kilde!, mal: m } })}
              >
                {punktnavn(p, m)}
              </button>
            ))}
            <button type="button" class="kontroll-knapp" onClick={() => lager.avbryt()}>
              Avbryt
            </button>
          </div>
        </Panel>
      )}

      {e.bytter && e.bytteTil && (
        <Panel tittel="Bytt brikke">
          {(() => {
            const k = byttKonsekvens(p, e.bytter, e.bytteTil);
            const ny = finnDefinisjon(e.bytteTil);
            return (
              <>
                <p>
                  {navnPa(p, e.bytter)} byttes med {ny?.navn.toLowerCase()}.
                </p>
                {k.beholdt.length > 0 && (
                  <p class="merknad">
                    Beholdes: {k.beholdt.map((f) => punktnavn(p, andreEnde(f, e.bytter!))).join('; ')}.
                  </p>
                )}
                {k.tapt.length > 0 && (
                  <ul class="merknader">
                    {k.tapt.map(({ f, grunn }) => (
                      <li key={f.id} class="advarsel">
                        Kobles fra {punktnavn(p, andreEnde(f, e.bytter!)).toLowerCase()}: {grunn} Det som
                        henger der blir liggende som en løs gruppe.
                      </li>
                    ))}
                  </ul>
                )}
                <div class="knapperad">
                  <button
                    type="button"
                    class="kontroll-knapp df-hoved"
                    onClick={() => {
                      const r = endreBrikker(benk, (q) => bytt(q, e.bytter!, e.bytteTil!));
                      if (r.ok) lager.sett({ bytter: null, bytteTil: null });
                    }}
                  >
                    Bytt
                  </button>
                  <button type="button" class="kontroll-knapp" onClick={() => lager.avbryt()}>
                    Avbryt
                  </button>
                </div>
              </>
            );
          })()}
        </Panel>
      )}

      <Panel tittel="Modell">
        <Modelltre p={p} valgt={e.valgt} lager={lager} />
      </Panel>

      {valgt && def && (
        <Panel tittel={navnPa(p, valgt.id)}>
          <p class="merknad">
            {def.navn} · versjon {def.versjon} · utviklingsgeometri
          </p>
          <label class="felt">
            <span>Navn</span>
            <input
              type="text"
              value={valgt.navn ?? ''}
              placeholder={navnPa(
                {
                  ...p,
                  instanser: p.instanser.map((x) => (x.id === valgt.id ? { ...x, navn: undefined } : x)),
                },
                valgt.id,
              )}
              maxLength={60}
              onChange={(ev) =>
                endreBrikker(benk, (q) => giNavn(q, valgt.id, (ev.target as HTMLInputElement).value))
              }
            />
          </label>
          <h3 class="df-undertittel">Koblingspunkter</h3>
          <Punkter benk={benk} p={p} id={valgt.id} lager={lager} />
          <h3 class="df-undertittel">Handlinger</h3>
          <div class="knapperad">
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                lager.sett({ bytter: valgt.id, bytteTil: null, plasserer: null, kilde: null, kandidat: null })
              }
            >
              Bytt …
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() => {
                const r = endreBrikker(benk, (q) => dupliser(q, valgt.id));
                if (r.ok) lager.sett({ valgt: r.ny ?? null });
              }}
            >
              Dupliser
            </button>
            <button
              type="button"
              class="kontroll-knapp farlig"
              onClick={() => {
                const r = endreBrikker(benk, (q) => slett(q, valgt.id, 'behold'));
                if (r.ok) lager.sett({ valgt: null });
              }}
            >
              Slett brikken
            </button>
            {bak > 0 && (
              <button
                type="button"
                class="kontroll-knapp farlig"
                onClick={() => {
                  const r = endreBrikker(benk, (q) => slett(q, valgt.id, 'gren'));
                  if (r.ok) lager.sett({ valgt: null });
                }}
              >
                Slett med {bak} brikke{bak === 1 ? '' : 'r'} bak
              </button>
            )}
          </div>
          <p class="merknad">
            «Slett brikken» lar det som hang på den ligge igjen som løse grupper. Alt kan angres.
          </p>
          <h3 class="df-undertittel">Kun denne brikken</h3>
          <Lokalt benk={benk} p={p} id={valgt.id} />
          <h3 class="df-undertittel">Plassering på platen</h3>
          <Plassering benk={benk} p={p} id={valgt.id} />
        </Panel>
      )}

      {valgt && !def && (
        <Panel tittel={navnPa(p, valgt.id)}>
          <p class="merknad">
            Definisjonen {valgt.definisjon.id} v{valgt.definisjon.versjon} er ukjent for denne versjonen.
            Brikken er beholdt, men kan ikke bygges eller redigeres.
          </p>
        </Panel>
      )}

      <Panel tittel="Farger">
        {soner
          .filter((s) => s.id !== 'vinger')
          .map((s) => (
            <Fargevelger
              key={s.id}
              sone={s.id}
              navn={s.navn}
              verdi={farger.farger[s.id]}
              endre={(id) =>
                endreDrage(benk, `${s.navn}: ${finnMateriale(id).navn}`, (q) => ({
                  ...q,
                  farger: { ...q.farger, [s.id]: id },
                }))
              }
            />
          ))}
        <p class="merknad">Farger og skriverprofil er foreløpige og ikke bekreftet av Designporten.</p>
      </Panel>

      <Panel tittel="Brikkebygger">
        <dl class="drage-fakta">
          <div>
            <dt>Brikker</dt>
            <dd class="mono">{p.instanser.length}</dd>
          </div>
          <div>
            <dt>Koblinger</dt>
            <dd class="mono">{p.forbindelser.length}</dd>
          </div>
          <div>
            <dt>Grupper</dt>
            <dd class="mono">{p.grupper.length}</dd>
          </div>
          <div>
            <dt>Ledd</dt>
            <dd class="mono">
              {HENGSEL_M.navn}, klaring {mm(HENGSEL_M.mal.klaring, 2)}, ±
              {tall((HENGSEL_M.mal.bevegelse * 180) / Math.PI, 0)}°
            </dd>
          </div>
          {modell && (
            <div>
              <dt>Kontroll</dt>
              <dd>
                {modell.advarsler.filter((a) => a.niva === 'feil').length
                  ? `${modell.advarsler.filter((a) => a.niva === 'feil').length} feil, se merknadene`
                  : 'Ingen geometrifeil funnet'}
              </dd>
            </div>
          )}
        </dl>
        <p class="merknad">
          Leddet er en prøveprofil: samme hengsel som den ferdige dragen, men ikke fysisk testet som
          brikkeledd. Dragen printes liggende, med leddene ferdig montert.
        </p>
        <button type="button" class="kontroll-knapp" onClick={() => byttModus(benk, 'klassisk')}>
          Tilbake til ferdig drage
        </button>
        <p class="merknad">Brikkene blir husket i prosjektet hvis du går tilbake.</p>
      </Panel>
    </>
  );
}
