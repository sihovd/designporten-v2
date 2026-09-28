/**
 * Bottom tray: pick a part category, then a variant. Each variant card
 * shows a thumbnail rendered from the generator itself. Tabs and cards
 * follow the WAI-ARIA tabs and radio group patterns (arrow keys move,
 * Home/End jump).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { cssFarge } from '../../shell/tema';
import { endreDrage } from './handlinger';
import { miniatyr, tomKo, type Utsnitt } from './miniatyr';
import { katalog, lesParametre, type DrageParametre, type Variant } from './parametre';
import './drage.css';

type Kategori = 'kropp' | 'hode' | 'horn' | 'pigger' | 'hale' | 'vinger' | 'monster' | 'oyne';

interface Fane {
  id: Kategori;
  navn: string;
  utsnitt: Utsnitt;
  liste: readonly Variant<string>[];
  hent: (p: DrageParametre) => string;
  sett: (p: DrageParametre, v: string) => DrageParametre;
}

const faner: Fane[] = [
  {
    id: 'kropp',
    navn: 'Kropp',
    utsnitt: 'hel',
    liste: katalog.kropp,
    hent: (p) => p.kropp,
    sett: (p, v) => ({ ...p, kropp: v as DrageParametre['kropp'] }),
  },
  {
    id: 'hode',
    navn: 'Hode',
    utsnitt: 'hode',
    liste: katalog.hode,
    hent: (p) => p.hode,
    sett: (p, v) => ({ ...p, hode: v as DrageParametre['hode'] }),
  },
  {
    id: 'horn',
    navn: 'Horn',
    utsnitt: 'hode',
    liste: katalog.horn,
    hent: (p) => p.horn,
    sett: (p, v) => ({ ...p, horn: v as DrageParametre['horn'] }),
  },
  {
    id: 'pigger',
    navn: 'Pigger',
    utsnitt: 'hel',
    liste: katalog.pigger,
    hent: (p) => p.pigger,
    sett: (p, v) => ({ ...p, pigger: v as DrageParametre['pigger'] }),
  },
  {
    id: 'hale',
    navn: 'Hale',
    utsnitt: 'hale',
    liste: katalog.hale,
    hent: (p) => p.hale,
    sett: (p, v) => ({ ...p, hale: v as DrageParametre['hale'] }),
  },
  {
    id: 'vinger',
    navn: 'Vinger',
    utsnitt: 'hel',
    liste: katalog.vinger,
    hent: (p) => p.vinger,
    sett: (p, v) => ({ ...p, vinger: v as DrageParametre['vinger'] }),
  },
  {
    id: 'monster',
    navn: 'Mønster',
    utsnitt: 'hel',
    liste: katalog.monster,
    hent: (p) => p.monster,
    sett: (p, v) => ({ ...p, monster: v as DrageParametre['monster'] }),
  },
  {
    id: 'oyne',
    navn: 'Øyne',
    utsnitt: 'hode',
    liste: katalog.oyne,
    hent: (p) => p.detaljer.oyne,
    sett: (p, v) => ({ ...p, detaljer: { ...p.detaljer, oyne: v as DrageParametre['detaljer']['oyne'] } }),
  },
];

function Miniatyr({ p, fane, variant }: { p: DrageParametre; fane: Fane; variant: string }) {
  const [url, settUrl] = useState<string | null | undefined>(undefined);
  const ref = useRef<HTMLSpanElement>(null);
  const nokkel = JSON.stringify(fane.sett(p, variant));
  useEffect(() => {
    let aktiv = true;
    settUrl(undefined);
    const bakgrunn = ref.current ? cssFarge(ref.current, '--grafitt-2', '#2a282e') : '#2a282e';
    void miniatyr(fane.sett(p, variant), fane.utsnitt, bakgrunn).then((u) => {
      if (aktiv) settUrl(u);
    });
    return () => {
      aktiv = false;
    };
    // the key captures every input
  }, [nokkel, fane.utsnitt]);
  return (
    <span class="drage-miniatyr" ref={ref} aria-hidden="true">
      {url ? (
        <img src={url} alt="" width={176} height={120} />
      ) : url === undefined ? (
        <span class="drage-laster" />
      ) : null}
    </span>
  );
}

export function DrageDelvelger({ benk }: { benk: Arbeidsbenk }) {
  const raa = brukUtdrag(benk, (t) => t.dok.parametre);
  const p = lesParametre(raa);
  const [aktiv, settAktiv] = useState<Kategori>('kropp');
  const fane = faner.find((f) => f.id === aktiv)!;
  const faneRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const kortRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const valgt = fane.hent(p);

  useEffect(() => () => tomKo(), []);
  const byttFane = (id: Kategori) => {
    if (id === aktiv) return;
    // Thumbnails queued for the old tab are no longer on screen.
    tomKo();
    settAktiv(id);
  };

  const velgFane = (i: number) => {
    const f = faner[(i + faner.length) % faner.length]!;
    byttFane(f.id);
    faneRefs.current[(i + faner.length) % faner.length]?.focus();
  };

  const velgVariant = (id: string) => {
    if (id === valgt) return;
    const navn = fane.liste.find((v) => v.id === id)?.navn ?? id;
    endreDrage(benk, `${fane.navn}: ${navn}`, (q) => fane.sett(q, id));
    benk.melde(`${fane.navn}: ${navn}`);
  };

  const flyttKort = (fra: number, retning: number | 'forst' | 'sist') => {
    const n = fane.liste.length;
    const i = retning === 'forst' ? 0 : retning === 'sist' ? n - 1 : (fra + retning + n) % n;
    const v = fane.liste[i]!;
    velgVariant(v.id);
    kortRefs.current[i]?.focus();
  };

  return (
    <div class="drage-delvelger">
      <div class="drage-faner" role="tablist" aria-label="Deler">
        {faner.map((f, i) => (
          <button
            key={f.id}
            ref={(el) => {
              faneRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`drage-fane-${f.id}`}
            aria-selected={f.id === aktiv}
            aria-controls="drage-varianter"
            tabIndex={f.id === aktiv ? 0 : -1}
            onClick={() => byttFane(f.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') velgFane(i + 1);
              else if (e.key === 'ArrowLeft') velgFane(i - 1);
              else if (e.key === 'Home') velgFane(0);
              else if (e.key === 'End') velgFane(faner.length - 1);
              else return;
              e.preventDefault();
            }}
          >
            {f.navn}
          </button>
        ))}
      </div>
      <div
        class="drage-varianter"
        id="drage-varianter"
        role="radiogroup"
        aria-labelledby={`drage-fane-${aktiv}`}
      >
        {fane.liste.map((v, i) => (
          <button
            key={v.id}
            ref={(el) => {
              kortRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            class="drage-variant"
            aria-checked={v.id === valgt}
            tabIndex={v.id === valgt ? 0 : -1}
            aria-describedby={`drage-v-${aktiv}-${v.id}`}
            onClick={() => velgVariant(v.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') flyttKort(i, 1);
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') flyttKort(i, -1);
              else if (e.key === 'Home') flyttKort(i, 'forst');
              else if (e.key === 'End') flyttKort(i, 'sist');
              else return;
              e.preventDefault();
            }}
          >
            <Miniatyr p={p} fane={fane} variant={v.id} />
            <span class="drage-variant-navn">{v.navn}</span>
            <span class="drage-variant-tekst" id={`drage-v-${aktiv}-${v.id}`}>
              {v.beskrivelse}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
