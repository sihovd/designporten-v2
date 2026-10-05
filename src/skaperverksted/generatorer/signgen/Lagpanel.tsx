/**
 * Layers panel (spec: "Layers panel"): the physical construction list,
 * top of the stack first, with Z ranges, heights, colours, visibility and
 * lock, the objects in each layer, and a stack diagram (an exploded side
 * view drawn as technical geometry, D-3).
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { objekterILag, type Lag, type Objekt, type Underlag } from '../../core/dokument';
import { finnMateriale, materialer } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { regionBoks } from '../../geometri/polygon';
import { brukBenk } from '../../shell/bruk-benk';
import {
  dupliserLag,
  fargeplasser,
  flyttLag,
  flyttUnderlag,
  leggTilLag,
  leggTilUnderlag,
  nyttLag,
  nyttUnderlag,
  oppdaterLag,
  oppdaterObjekter,
  oppdaterUnderlag,
  slettLag,
  slettUnderlag,
} from './dokument';
import { lagRegion } from './modell';
import { aktivtUnderlag } from './handlinger';
import { brukSigntilstand, signtilstand } from './tilstand';

function Stabeldiagram({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const lag = t.dok.lag.filter((l) => l.synlig);
  if (!lag.length) return null;
  const topp = Math.max(...lag.map((l) => l.zBunn + l.hoyde), 0.1);
  const bredder = lag.map((l) => {
    const r = lagRegion(t.dok, l.id);
    if (!r || !r.length) return { l, min: 0, maks: 0 };
    const b = regionBoks(r);
    return { l, min: b.minX, maks: b.maksX };
  });
  const minX = Math.min(...bredder.map((b) => b.min), 0);
  const maksX = Math.max(...bredder.map((b) => b.maks), 1);
  const W = 240,
    H = Math.max(70, Math.min(150, 26 * lag.length + 30));
  const gap = 5; // exploded view
  const hoydeTotal = H - 18 - gap * (lag.length - 1);
  const sy = hoydeTotal / topp;
  const sx = (W - 60) / Math.max(1, maksX - minX);
  return (
    <figure class="stabel">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lagene sett fra siden, fra bunn til topp">
        {bredder.map(({ l, min, maks }, i) => {
          const y = H - 8 - (l.zBunn + l.hoyde) * sy - i * gap;
          const h = Math.max(2, l.hoyde * sy);
          const valgt = t.utvalg.lag === l.id;
          return (
            <g key={l.id}>
              <rect
                x={4 + (min - minX) * sx}
                y={y}
                width={Math.max(2, (maks - min) * sx)}
                height={h}
                fill={finnMateriale(l.materialId).hex}
                stroke={valgt ? 'var(--dp-lilla)' : 'var(--linje-sterk)'}
                stroke-width={valgt ? 2 : 1}
              />
              <text x={W - 52} y={y + h / 2 + 3} class="stabel-z">
                {tall(l.zBunn)}–{tall(l.zBunn + l.hoyde)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption class="visuelt-skjult">
        {lag.map((l) => `${l.navn}: ${tall(l.zBunn)} til ${tall(l.zBunn + l.hoyde)} mm`).join('. ')}
      </figcaption>
    </figure>
  );
}

/** Swatch for a text layer with several colours: one band per colour. */
function fargeprove(lag: Lag): string | undefined {
  const g = lag.underlag;
  if (!g || g.length < 2) return undefined;
  const steg = 100 / g.length;
  const bander = g.map((u, i) => {
    const hex = finnMateriale(u.materialId).hex;
    return `${hex} ${i * steg}% ${(i + 1) * steg}%`;
  });
  return `linear-gradient(90deg, ${bander.join(', ')})`;
}

function Objektliste({
  benk,
  lag,
  objekter,
  tom = 'Ingen objekter. Bruk verktøyene for å legge til.',
}: {
  benk: Arbeidsbenk;
  lag: Lag;
  objekter: Objekt[];
  tom?: string;
}) {
  const t = brukBenk(benk);
  return (
    <ul class="objektliste" role="list">
      {objekter.length === 0 && <li class="tom-melding">{tom}</li>}
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
                if (o.underlagId) signtilstand(benk).sett({ underlag: o.underlagId });
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
  );
}

/**
 * The text layer's colour groups (Sivert, 2026-10-05): all text sits in one
 * layer at one height; each group gives its objects a colour.
 */
function Fargegrupper({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const t = brukBenk(benk);
  brukSigntilstand(benk);
  const grupper = lag.underlag ?? [];
  const aktiv = t.utvalg.lag === lag.id ? aktivtUnderlag(benk, lag) : undefined;
  const indeks = aktiv ? grupper.findIndex((u) => u.id === aktiv.id) : -1;
  const objekter = objekterILag(t.dok, lag.id);
  const endre = (navn: string, u: Underlag, endring: Partial<Underlag>) =>
    benk.endre({ navn, anvend: (d) => oppdaterUnderlag(d, lag.id, u.id, endring) });

  const ny = () => {
    const brukte = new Set(fargeplasser(t.dok).map((p) => p.materialId));
    const mat = materialer.find((m) => !brukte.has(m.id)) ?? materialer[0]!;
    const u = nyttUnderlag(`Farge ${grupper.length + 1}`, mat.id);
    benk.endre({ navn: 'Ny farge i tekstlaget', anvend: (d) => leggTilUnderlag(d, lag.id, u, aktiv?.id) });
    signtilstand(benk).sett({ underlag: u.id });
    benk.velg({ lag: lag.id, objekter: [] });
    benk.melde(`${u.navn} (${mat.navn}) er lagt til i tekstlaget. Ny tekst havner der.`);
  };

  return (
    <div class="fargegrupper">
      <ol class="gruppeliste" role="list" aria-label={`Farger i ${lag.navn}, øverst først`}>
        {[...grupper].reverse().map((u) => {
          const mat = finnMateriale(u.materialId);
          const erAktiv = aktiv?.id === u.id;
          return (
            <li key={u.id} class={`grupperad${erAktiv ? ' aktiv' : ''}${u.synlig ? '' : ' skjult'}`}>
              <div class="lagrad-hode">
                <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
                <button
                  type="button"
                  class="lag-navn"
                  aria-current={erAktiv ? 'true' : undefined}
                  onClick={() => {
                    signtilstand(benk).sett({ underlag: u.id });
                    benk.velg({ lag: lag.id, objekter: [] });
                  }}
                >
                  <span class="lag-tittel">{u.navn}</span>
                  <span class="mono lag-z">{mat.navn}</span>
                </button>
                <button
                  type="button"
                  class="minibryter synlighet"
                  aria-pressed={u.synlig}
                  title={u.synlig ? 'Skjul fargen' : 'Vis fargen'}
                  onClick={() => endre(u.synlig ? 'Skjul farge' : 'Vis farge', u, { synlig: !u.synlig })}
                >
                  Synlig
                  <span class="visuelt-skjult"> {u.navn}</span>
                </button>
                <button
                  type="button"
                  class="minibryter las"
                  aria-pressed={u.last}
                  title={u.last ? 'Lås opp fargen' : 'Lås fargen'}
                  onClick={() => endre(u.last ? 'Lås opp farge' : 'Lås farge', u, { last: !u.last })}
                >
                  Låst
                  <span class="visuelt-skjult"> {u.navn}</span>
                </button>
              </div>
              <Objektliste
                benk={benk}
                lag={lag}
                objekter={objekter.filter((o) => o.underlagId === u.id)}
                tom="Tom. Velg fargen, så havner ny tekst her."
              />
            </li>
          );
        })}
      </ol>
      <div class="lagknapper" role="group" aria-label="Farger i tekstlaget">
        <button type="button" class="kontroll-knapp" onClick={ny}>
          + Ny farge
        </button>
        {aktiv && grupper.length > 1 && (
          <>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={indeks >= grupper.length - 1}
              onClick={() =>
                benk.endre({ navn: 'Flytt farge opp', anvend: (d) => flyttUnderlag(d, lag.id, aktiv.id, 1) })
              }
            >
              Flytt opp
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={indeks <= 0}
              onClick={() =>
                benk.endre({ navn: 'Flytt farge ned', anvend: (d) => flyttUnderlag(d, lag.id, aktiv.id, -1) })
              }
            >
              Flytt ned
            </button>
            <button
              type="button"
              class="kontroll-knapp farlig"
              onClick={() => {
                benk.endre({ navn: 'Slett farge', anvend: (d) => slettUnderlag(d, lag.id, aktiv.id) });
                benk.melde(`Fargen «${aktiv.navn}» og teksten i den er slettet. Angre med Ctrl+Z.`);
              }}
            >
              Slett farge
            </button>
          </>
        )}
      </div>
    </div>
  );
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
        <span class="fargeprove" style={{ background: fargeprove(lag) ?? mat.hex }} aria-hidden="true" />
        <button
          type="button"
          class="lag-navn"
          aria-current={aktiv ? 'true' : undefined}
          onClick={() => benk.velg({ lag: lag.id, objekter: [] })}
        >
          <span class="lag-tittel">
            {lag.navn}
            {lag.tekstlag && <span class="merke lag-merke">Tekstlag</span>}
          </span>
          <span class="mono lag-z">
            {tall(lag.zBunn)}–{tall(lag.zBunn + lag.hoyde)} mm ·{' '}
            {lag.underlag && lag.underlag.length > 1 ? `${lag.underlag.length} farger` : mat.navn}
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
      {apen && !lag.tekstlag && <Objektliste benk={benk} lag={lag} objekter={objekter} />}
      {apen && lag.tekstlag && <Fargegrupper benk={benk} lag={lag} />}
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
              disabled={!!t.dok.lag[indeks]?.tekstlag}
              title={t.dok.lag[indeks]?.tekstlag ? 'Skiltet har bare ett tekstlag' : undefined}
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
      <div class="panel">
        <h2 class="panel-tittel">
          <span>Stabel sett fra siden</span>
        </h2>
        <Stabeldiagram benk={benk} />
      </div>
    </div>
  );
}
