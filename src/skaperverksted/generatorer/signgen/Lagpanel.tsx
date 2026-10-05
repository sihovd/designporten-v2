/**
 * Layers panel (spec: "Layers panel"): the physical construction list,
 * top of the stack first, with Z ranges, heights, colours, visibility and
 * lock, and the objects in each layer. A text layer also lists its
 * outlines, each its own row (Sivert, 2026-10-05). The stack diagram was
 * removed on Sivert's request the same day.
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { objekterILag, type Lag, type Omriss } from '../../core/dokument';
import { finnMateriale, materialer } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { brukBenk } from '../../shell/bruk-benk';
import {
  dupliserLag,
  fargeplasser,
  leggTilOmriss,
  nyttOmriss,
  oppdaterOmriss,
  flyttLag,
  leggTilLag,
  nyttLag,
  oppdaterLag,
  oppdaterObjekter,
  slettLag,
} from './dokument';
import { signtilstand, brukSigntilstand } from './tilstand';

/** One outline of a text layer: a row of its own in the layers panel. */
function Omrissrad({ benk, lag, o }: { benk: Arbeidsbenk; lag: Lag; o: Omriss }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const mat = finnMateriale(o.materialId);
  const aktiv = t.utvalg.lag === lag.id && st.omriss === o.id;
  const endre = (navn: string, endring: Partial<Omriss>) =>
    benk.endre({ navn, anvend: (d) => oppdaterOmriss(d, lag.id, o.id, endring) });
  return (
    <li class={`omrissrad${aktiv ? ' aktiv' : ''}${o.synlig ? '' : ' skjult'}`}>
      <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
      <button
        type="button"
        class="lag-navn"
        aria-current={aktiv ? 'true' : undefined}
        onClick={() => {
          signtilstand(benk).sett({ omriss: o.id });
          benk.velg({ lag: lag.id, objekter: [] });
        }}
      >
        <span class="lag-tittel">{o.navn}</span>
        <span class="mono lag-z">
          {o.type === 'fyll' ? 'Fyll' : 'Omriss'} {tall(o.bredde)} mm · {tall(o.hoyde)} mm høy · {mat.navn}
        </span>
      </button>
      <button
        type="button"
        class="minibryter synlighet"
        aria-pressed={o.synlig}
        title={o.synlig ? 'Skjul omrisset' : 'Vis omrisset'}
        onClick={() => endre(o.synlig ? 'Skjul omriss' : 'Vis omriss', { synlig: !o.synlig })}
      >
        Synlig
        <span class="visuelt-skjult"> {o.navn}</span>
      </button>
    </li>
  );
}

/** Add an outline outside the text layer's outlines, in a colour not yet used. */
export function nyttOmrissI(benk: Arbeidsbenk, lag: Lag): void {
  const brukte = new Set(fargeplasser(benk.dok).map((p) => p.materialId));
  const mat = materialer.find((m) => !brukte.has(m.id)) ?? materialer[0]!;
  const n = (lag.omriss?.length ?? 0) + 1;
  const o = nyttOmriss(`Omriss ${n}`, mat.id, { hoyde: Math.max(0.6, Math.round(lag.hoyde * 5) / 10) });
  benk.endre({ navn: 'Nytt omriss', anvend: (d) => leggTilOmriss(d, lag.id, o) });
  signtilstand(benk).sett({ omriss: o.id });
  benk.velg({ lag: lag.id, objekter: [] });
  benk.melde(`${o.navn} er lagt til rundt teksten i «${lag.navn}», i ${mat.navn}.`);
}

function Lagrad({
  benk,
  lag,
  apen,
  veksle,
}: {
  benk: Arbeidsbenk;
  lag: Lag;
  apen: boolean;
  veksle: () => void;
}) {
  const t = brukBenk(benk);
  const aktiv = t.utvalg.lag === lag.id;
  const objekter = objekterILag(t.dok, lag.id);
  const mat = finnMateriale(lag.materialId);
  const endreLag = (navn: string, endring: Partial<Lag>) =>
    benk.endre({ navn, anvend: (d) => oppdaterLag(d, lag.id, endring) });
  return (
    <li class={`lagrad${aktiv ? ' aktiv' : ''}${lag.synlig ? '' : ' skjult'}`}>
      <div class="lagrad-hode">
        <button type="button" class="lag-apne" aria-expanded={apen} onClick={veksle}>
          <span class="visuelt-skjult">{apen ? 'Skjul innholdet i' : 'Vis innholdet i'} </span>
          <span aria-hidden="true">{apen ? '▾' : '▸'}</span>
        </button>
        <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
        <button
          type="button"
          class="lag-navn"
          aria-current={aktiv ? 'true' : undefined}
          onClick={() => benk.velg({ lag: lag.id, objekter: [] })}
        >
          <span class="lag-tittel">
            {lag.navn}
            {lag.tekstlag && (
              <span class="merke lag-merke">
                {objekter.length > 1 ? `Gruppe · ${objekter.length}` : 'Tekst'}
              </span>
            )}
          </span>
          <span class="mono lag-z">
            {tall(lag.zBunn)}–{tall(lag.zBunn + lag.hoyde)} mm ·{' '}
            {lag.tekstvisning === 'kutt' ? 'skåret ut' : mat.navn}
          </span>
        </button>
        <button
          type="button"
          class="minibryter synlighet"
          aria-pressed={lag.synlig}
          title={lag.synlig ? 'Skjul laget' : 'Vis laget'}
          onClick={() => endreLag(lag.synlig ? 'Skjul lag' : 'Vis lag', { synlig: !lag.synlig })}
        >
          Synlig
          <span class="visuelt-skjult"> {lag.navn}</span>
        </button>
        <button
          type="button"
          class="minibryter las"
          aria-pressed={lag.last}
          title={lag.last ? 'Lås opp laget' : 'Lås laget'}
          onClick={() => endreLag(lag.last ? 'Lås opp lag' : 'Lås lag', { last: !lag.last })}
        >
          Låst
          <span class="visuelt-skjult"> {lag.navn}</span>
        </button>
      </div>
      {apen && (
        <ul class="objektliste" role="list">
          {objekter.length === 0 && (
            <li class="tom-melding">
              {lag.tekstlag
                ? 'Ingen tekst. Bruk Tekst-verktøyet.'
                : 'Ingen objekter. Bruk verktøyene for å legge til.'}
            </li>
          )}
          {[...objekter].reverse().map((o) => {
            const valgt = t.utvalg.objekter.includes(o.id);
            return (
              <li key={o.id} class={valgt ? 'valgt' : ''}>
                <button
                  type="button"
                  class="objekt-navn"
                  aria-pressed={valgt}
                  onClick={(e) => {
                    const flere = e.shiftKey || e.ctrlKey || e.metaKey;
                    const ny = flere
                      ? valgt
                        ? t.utvalg.objekter.filter((x) => x !== o.id)
                        : [...t.utvalg.objekter, o.id]
                      : [o.id];
                    benk.velg({ objekter: ny, lag: lag.id });
                  }}
                >
                  {o.navn}
                  {o.operasjon === 'trekk-fra' && <span class="mono merke"> kutter</span>}
                </button>
                <button
                  type="button"
                  class="minibryter synlighet"
                  aria-pressed={o.synlig}
                  onClick={() =>
                    benk.endre({
                      navn: o.synlig ? 'Skjul objekt' : 'Vis objekt',
                      anvend: (d) => oppdaterObjekter(d, [o.id], (x) => ({ ...x, synlig: !x.synlig })),
                    })
                  }
                >
                  Synlig
                  <span class="visuelt-skjult"> {o.navn}</span>
                </button>
                <button
                  type="button"
                  class="minibryter las"
                  aria-pressed={o.last}
                  onClick={() =>
                    benk.endre({
                      navn: o.last ? 'Lås opp objekt' : 'Lås objekt',
                      anvend: (d) => oppdaterObjekter(d, [o.id], (x) => ({ ...x, last: !x.last })),
                    })
                  }
                >
                  Låst
                  <span class="visuelt-skjult"> {o.navn}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {apen && lag.tekstlag && (
        <div class="omrissliste">
          {(lag.omriss ?? []).length > 0 && (
            <ol role="list" aria-label={`Omriss rundt ${lag.navn}, innerst først`}>
              {(lag.omriss ?? []).map((o) => (
                <Omrissrad key={o.id} benk={benk} lag={lag} o={o} />
              ))}
            </ol>
          )}
          <button
            type="button"
            class="kontroll-knapp"
            disabled={lag.last}
            onClick={() => nyttOmrissI(benk, lag)}
          >
            + Omriss
          </button>
        </div>
      )}
    </li>
  );
}

export function Lagpanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [apne, settApne] = useState<Set<string>>(() => new Set(t.dok.lag.map((l) => l.id)));
  const aktiv = t.utvalg.lag;
  const indeks = t.dok.lag.findIndex((l) => l.id === aktiv);

  const nytt = () => {
    const brukte = new Set(fargeplasser(t.dok).map((p) => p.materialId));
    const mat = materialer.find((m) => !brukte.has(m.id)) ?? materialer[0]!;
    const lag = nyttLag(`Lag ${t.dok.lag.length + 1}`, mat.id, 1);
    benk.endre({ navn: 'Nytt lag', anvend: (d) => leggTilLag(d, lag, aktiv ?? undefined) });
    benk.velg({ lag: lag.id, objekter: [] });
    settApne(new Set([...apne, lag.id]));
    benk.melde(`${lag.navn} er lagt til over det valgte laget.`);
  };

  return (
    <div class="lagpanel">
      <div class="panel">
        <h2 class="panel-tittel">
          <span>Lag, øverst først</span>
          <button type="button" class="kontroll-knapp" onClick={nytt}>
            + Nytt lag
          </button>
        </h2>
        <ol class="lagliste" role="list">
          {[...t.dok.lag].reverse().map((l) => (
            <Lagrad
              key={l.id}
              benk={benk}
              lag={l}
              apen={apne.has(l.id)}
              veksle={() => {
                const n = new Set(apne);
                if (n.has(l.id)) n.delete(l.id);
                else n.add(l.id);
                settApne(n);
              }}
            />
          ))}
        </ol>
        {aktiv && (
          <div class="lagknapper" role="group" aria-label="Valgt lag">
            <button
              type="button"
              class="kontroll-knapp"
              disabled={indeks >= t.dok.lag.length - 1}
              onClick={() => benk.endre({ navn: 'Flytt lag opp', anvend: (d) => flyttLag(d, aktiv, 1) })}
            >
              Flytt opp
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={indeks <= 0}
              onClick={() => benk.endre({ navn: 'Flytt lag ned', anvend: (d) => flyttLag(d, aktiv, -1) })}
            >
              Flytt ned
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() => {
                let ny = aktiv;
                benk.endre({
                  navn: 'Dupliser lag',
                  anvend: (d) => {
                    const r = dupliserLag(d, aktiv);
                    ny = r.nyId;
                    return r.dok;
                  },
                });
                benk.velg({ lag: ny, objekter: [] });
              }}
            >
              Dupliser
            </button>
            <button
              type="button"
              class="kontroll-knapp farlig"
              disabled={t.dok.lag.length <= 1}
              onClick={() => {
                const navn = t.dok.lag[indeks]?.navn;
                benk.endre({ navn: 'Slett lag', anvend: (d) => slettLag(d, aktiv) });
                benk.melde(`Laget «${navn}» er slettet. Angre med Ctrl+Z.`);
              }}
            >
              Slett
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
