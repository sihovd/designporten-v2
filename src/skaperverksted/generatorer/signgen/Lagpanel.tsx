/**
 * Layers panel (spec: "Layers panel"): the physical construction list,
 * top of the stack first, with Z ranges, heights, colours, visibility and
 * lock, the objects in each layer, and a stack diagram (an exploded side
 * view drawn as technical geometry, D-3).
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { objekterILag, type Lag } from '../../core/dokument';
import { finnMateriale, materialer } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { regionBoks } from '../../geometri/polygon';
import { brukBenk } from '../../shell/bruk-benk';
import {
  dupliserLag,
  flyttLag,
  leggTilLag,
  nyttLag,
  oppdaterLag,
  oppdaterObjekter,
  slettLag,
} from './dokument';
import { lagRegion } from './modell';

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
          <span class="visuelt-skjult">{apen ? 'Skjul objekter i' : 'Vis objekter i'} </span>
          <span aria-hidden="true">{apen ? '▾' : '▸'}</span>
        </button>
        <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
        <button
          type="button"
          class="lag-navn"
          aria-current={aktiv ? 'true' : undefined}
          onClick={() => benk.velg({ lag: lag.id, objekter: [] })}
        >
          <span class="lag-tittel">{lag.navn}</span>
          <span class="mono lag-z">
            {tall(lag.zBunn)}–{tall(lag.zBunn + lag.hoyde)} mm · {mat.navn}
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
            <li class="tom-melding">Ingen objekter. Bruk verktøyene for å legge til.</li>
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
    </li>
  );
}

export function Lagpanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [apne, settApne] = useState<Set<string>>(() => new Set(t.dok.lag.map((l) => l.id)));
  const aktiv = t.utvalg.lag;
  const indeks = t.dok.lag.findIndex((l) => l.id === aktiv);

  const nytt = () => {
    const brukte = new Set(t.dok.lag.map((l) => l.materialId));
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
      <div class="panel">
        <h2 class="panel-tittel">
          <span>Stabel sett fra siden</span>
        </h2>
        <Stabeldiagram benk={benk} />
      </div>
    </div>
  );
}
