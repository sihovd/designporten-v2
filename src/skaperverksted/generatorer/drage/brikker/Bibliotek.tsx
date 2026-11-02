/**
 * The brick library in the bottom tray: Hoder, Kropp and Hale, each brick
 * with a thumbnail rendered from the brick itself. Choosing a brick starts
 * placing it: the free points it fits light up on the model and are listed
 * here as buttons too (the list is an equal way to connect when a point is
 * hidden behind the model). «Legg løst på platen» adds it without a
 * connection. While «Bytt» is active, the chosen brick replaces the
 * selected one instead.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { brukUtdrag } from '../../../shell/bruk-benk';
import { cssFarge } from '../../../shell/tema';
import { lesParametre, type DrageParametre } from '../parametre';
import { forbindelseVed, leggTil, navnPa, passendePunkt, punktnavn } from './graf';
import { brikkerFra, endreBrikker } from './handlinger';
import { definisjoner, kategorier, type Brikkeprosjekt, type Ende, type Kategori } from './modell';
import { brikkeminiatyr } from './miniatyr';
import { brukEditor } from './tilstand';
import '../drage.css';

function Miniatyr({ definisjon, farger }: { definisjon: string; farger: DrageParametre }) {
  const [url, settUrl] = useState<string | null | undefined>(undefined);
  const ref = useRef<HTMLSpanElement>(null);
  const nokkel = `${definisjon}|${JSON.stringify(farger.farger)}|${farger.monster}`;
  useEffect(() => {
    let aktiv = true;
    settUrl(undefined);
    const bakgrunn = ref.current ? cssFarge(ref.current, '--grafitt-2', '#2a282e') : '#2a282e';
    void brikkeminiatyr(definisjon, farger, bakgrunn).then((u) => {
      if (aktiv) settUrl(u);
    });
    return () => {
      aktiv = false;
    };
  }, [nokkel]);
  return (
    <span class="drage-miniatyr" ref={ref} aria-hidden="true">
      {url ? (
        <img src={url} alt="" width={160} height={112} />
      ) : url === undefined ? (
        <span class="drage-laster" />
      ) : null}
    </span>
  );
}

/** Free points on the model where a library brick fits. */
export function muligePunkter(p: Brikkeprosjekt, definisjon: string): Ende[] {
  const ut: Ende[] = [];
  for (const i of p.instanser) {
    for (const punkt of ['bak', 'foran']) {
      const e = { instans: i.id, punkt };
      if (forbindelseVed(p, e)) continue;
      if (passendePunkt(p, definisjon, e)) ut.push(e);
    }
  }
  return ut;
}

export function BrikkeBibliotek({ benk }: { benk: Arbeidsbenk }) {
  const raa = brukUtdrag(benk, (t) => t.dok.parametre);
  const p = brikkerFra(raa).prosjekt;
  const farger = lesParametre(raa);
  const [e, lager] = brukEditor(benk, p);
  const [aktiv, settAktiv] = useState<Kategori>('kropp');
  const faneRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const liste = definisjoner.filter((d) => d.kategori === aktiv);

  const velg = (id: string) => {
    if (e.bytter) {
      lager.sett({ bytteTil: id });
      return;
    }
    // An empty dragon starts with one brick: put it on the plate at once.
    if (!p.instanser.length) {
      const r = endreBrikker(benk, (q) => leggTil(q, id, { x: 0, y: 0, vinkel: 0 }));
      if (r.ok) lager.sett({ valgt: r.ny ?? null });
      return;
    }
    lager.sett({ plasserer: e.plasserer === id ? null : id, kilde: null, kandidat: null });
  };

  const velgFane = (i: number) => {
    const n = kategorier.length;
    const k = kategorier[(i + n) % n]!;
    settAktiv(k.id);
    faneRefs.current[(i + n) % n]?.focus();
  };

  const punkter = e.plasserer ? muligePunkter(p, e.plasserer) : [];

  return (
    <div class="drage-delvelger">
      <div class="drage-faner" role="tablist" aria-label="Brikkebibliotek">
        {kategorier.map((k, i) => (
          <button
            key={k.id}
            ref={(el) => {
              faneRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`df-fane-${k.id}`}
            aria-selected={k.id === aktiv}
            aria-controls="df-brikker"
            tabIndex={k.id === aktiv ? 0 : -1}
            onClick={() => settAktiv(k.id)}
            onKeyDown={(ev) => {
              if (ev.key === 'ArrowRight') velgFane(i + 1);
              else if (ev.key === 'ArrowLeft') velgFane(i - 1);
              else return;
              ev.preventDefault();
            }}
          >
            {k.navn}
          </button>
        ))}
      </div>
      {e.bytter && (
        <p class="df-tray-tekst" role="status">
          Velg brikken som skal erstatte {navnPa(p, e.bytter).toLowerCase()}.{' '}
          <button type="button" class="kontroll-knapp" onClick={() => lager.avbryt()}>
            Avbryt bytte
          </button>
        </p>
      )}
      <div class="drage-varianter" id="df-brikker" role="tabpanel" aria-labelledby={`df-fane-${aktiv}`}>
        {liste.map((d) => (
          <button
            key={d.id}
            type="button"
            class="drage-variant"
            aria-pressed={e.plasserer === d.id || e.bytteTil === d.id}
            aria-describedby={`df-b-${d.id}`}
            onClick={() => velg(d.id)}
          >
            <Miniatyr definisjon={d.id} farger={farger} />
            <span class="drage-variant-navn">{d.navn}</span>
            <span class="drage-variant-tekst" id={`df-b-${d.id}`}>
              {d.beskrivelse}
            </span>
          </button>
        ))}
      </div>
      {e.plasserer && !e.kandidat && (
        <div class="df-plassering" role="group" aria-label="Hvor skal brikken?">
          <span class="df-tray-tekst">
            {punkter.length
              ? 'Koble til et ledig punkt:'
              : 'Ingen ledige punkter passer denne brikken. Legg den løst på platen.'}
          </span>
          {punkter.map((m) => (
            <button
              key={`${m.instans}/${m.punkt}`}
              type="button"
              class="kontroll-knapp df-punktknapp"
              onClick={() =>
                lager.sett({
                  kandidat: {
                    type: 'ny',
                    definisjon: e.plasserer!,
                    punkt: passendePunkt(p, e.plasserer!, m)!,
                    mal: m,
                  },
                })
              }
            >
              {punktnavn(p, m)}
            </button>
          ))}
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              const r = endreBrikker(benk, (q) => leggTil(q, e.plasserer!));
              if (r.ok) lager.sett({ plasserer: null, valgt: r.ny ?? null });
            }}
          >
            Legg løst på platen
          </button>
          <button type="button" class="kontroll-knapp" onClick={() => lager.avbryt()}>
            Avbryt
          </button>
        </div>
      )}
    </div>
  );
}
