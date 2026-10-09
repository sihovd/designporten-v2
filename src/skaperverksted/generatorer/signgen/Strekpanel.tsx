/**
 * Paint strokes: the choices in the context bar while the tool is active (what the
 * next stroke is drawn with), and the section in the inspector for a stroke
 * that is on the sign (width, smoothing, taper and the width points).
 */
import { useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Objekt } from '../../core/dokument';
import {
  MAKS_BREDDE,
  MAKS_BREDDEFAKTOR,
  MIN_BREDDE,
  PROFILER,
  PROFILNAVN,
  breddefaktor,
  ryddBreddepunkter,
  strekLengde,
  type Breddepunkt,
  type ProfilId,
  type Strek,
} from '../../geometri/strek';
import { Segment, TallFelt } from '../../shell/kontroller';
import { clampBredde, endreStrek, gjorStrekTilVektor } from './paint';
import { brukSigntilstand, signtilstand } from './tilstand';

const PROFILVALG = (Object.keys(PROFILER) as ProfilId[]).map((id) => ({ id, navn: PROFILNAVN[id] }));

/** Which ready-made profile the points match (the same positions and widths), or «egen». */
function profilFor(punkter: Breddepunkt[]): ProfilId | 'egen' {
  for (const id of Object.keys(PROFILER) as ProfilId[]) {
    const p = PROFILER[id];
    if (p.length === punkter.length && p.every((x, i) => x.t === punkter[i]!.t && x.v === punkter[i]!.v))
      return id;
  }
  return 'egen';
}

/** The choices of the Paint tool, shown in the context bar while it is active. */
export function Paintvalgbar({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const lager = signtilstand(benk);
  const v = st.paint;
  const sett = (endring: Partial<typeof v>) => lager.sett({ paint: { ...v, ...endring } });
  return (
    <div class="kontekst-gruppe paintbar" role="group" aria-label="Paint-valg">
      <TallFelt
        etikett="Bredde på strøket"
        kortEtikett="B"
        verdi={v.bredde}
        min={MIN_BREDDE}
        maks={MAKS_BREDDE}
        steg={0.5}
        endre={(x) => sett({ bredde: clampBredde(x) })}
      />
      <Segment
        etikett="Breddeprofil"
        valg={PROFILVALG}
        verdi={v.profil}
        endre={(id) => sett({ profil: id })}
      />
      <TallFelt
        etikett="Smooth"
        kortEtikett="Smooth"
        enhet="%"
        desimaler={0}
        verdi={Math.round(v.glatt * 100)}
        min={0}
        maks={100}
        steg={5}
        endre={(x) => sett({ glatt: x / 100 })}
      />
    </div>
  );
}

const GB = 240;
const GH = 96;
const MARG = 12;

/** The width profile: the curve with a handle on every width point, and the same as number fields below. */
function Breddeprofil({
  strek,
  endre,
}: {
  strek: Strek;
  endre: (navn: string, fn: (s: Strek) => Strek, slaSammen?: string) => void;
}) {
  const punkter = strek.breddepunkter;
  const toppV = Math.max(2, ...punkter.map((p) => p.v)) * 1.1;
  const x = (t: number) => MARG + t * (GB - 2 * MARG);
  const y = (v: number) => GH - MARG - (v / toppV) * (GH - 2 * MARG);
  const kurve: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    kurve.push(`${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(breddefaktor(punkter, t)).toFixed(1)}`);
  }
  const svg = useRef<SVGSVGElement>(null);
  const dra = (indeks: number, e: PointerEvent) => {
    const el = svg.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const flytt = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * GB;
      const py = ((ev.clientY - r.top) / r.height) * GH;
      const t = Math.min(1, Math.max(0, (px - MARG) / (GB - 2 * MARG)));
      const v = Math.min(MAKS_BREDDEFAKTOR, Math.max(0, ((GH - MARG - py) / (GH - 2 * MARG)) * toppV));
      endre(
        'Flytt breddepunkt',
        (s) => ({
          ...s,
          breddepunkter: s.breddepunkter.map((p, i) =>
            i === indeks ? { t: indeks === 0 || indeks === s.breddepunkter.length - 1 ? p.t : t, v } : p,
          ),
        }),
        `breddepunkt-${indeks}`,
      );
    };
    const slutt = () => {
      window.removeEventListener('pointermove', flytt);
      window.removeEventListener('pointerup', slutt);
    };
    window.addEventListener('pointermove', flytt);
    window.addEventListener('pointerup', slutt);
  };
  return (
    <>
      <svg
        ref={svg}
        class="breddegraf"
        viewBox={`0 0 ${GB} ${GH}`}
        role="img"
        aria-label={`Breddeprofil langs streken: ${punkter.map((p) => `${Math.round(p.t * 100)} % av lengden er ${Math.round(p.v * 100)} % bredde`).join(', ')}`}
      >
        <line class="breddegraf-akse" x1={MARG} x2={GB - MARG} y1={y(1)} y2={y(1)} />
        <path class="breddegraf-kurve" d={kurve.join('')} />
        {punkter.map((p, i) => (
          <circle
            key={i}
            class="breddegraf-punkt"
            cx={x(p.t)}
            cy={y(p.v)}
            r={5}
            onPointerDown={(e) => dra(i, e)}
          />
        ))}
      </svg>
      <ol class="breddepunkter" aria-label="Breddepunkter">
        {punkter.map((p, i) => {
          const ende = i === 0 || i === punkter.length - 1;
          return (
            <li key={i}>
              <TallFelt
                etikett={`Breddepunkt ${i + 1}, posisjon`}
                kortEtikett="Posisjon"
                enhet="%"
                desimaler={0}
                verdi={Math.round(p.t * 100)}
                min={0}
                maks={100}
                steg={5}
                deaktivert={ende}
                endre={(v, k) =>
                  endre(
                    'Flytt breddepunkt',
                    (s) => ({
                      ...s,
                      breddepunkter: s.breddepunkter.map((q, j) => (j === i ? { ...q, t: v / 100 } : q)),
                    }),
                    k === 'pil' ? `breddepunkt-pos-${i}` : undefined,
                  )
                }
              />
              <TallFelt
                etikett={`Breddepunkt ${i + 1}, bredde`}
                kortEtikett="Bredde"
                enhet="%"
                desimaler={0}
                verdi={Math.round(p.v * 100)}
                min={0}
                maks={MAKS_BREDDEFAKTOR * 100}
                steg={10}
                endre={(v, k) =>
                  endre(
                    'Endre breddepunkt',
                    (s) => ({
                      ...s,
                      breddepunkter: s.breddepunkter.map((q, j) => (j === i ? { ...q, v: v / 100 } : q)),
                    }),
                    k === 'pil' ? `breddepunkt-bredde-${i}` : undefined,
                  )
                }
              />
              <button
                type="button"
                class="minibryter"
                disabled={ende}
                title="Fjern breddepunktet"
                onClick={() =>
                  endre('Fjern breddepunkt', (s) => ({
                    ...s,
                    breddepunkter: s.breddepunkter.filter((_, j) => j !== i),
                  }))
                }
              >
                Fjern<span class="visuelt-skjult"> breddepunkt {i + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div class="knapperad">
        <button
          type="button"
          class="kontroll-knapp"
          disabled={punkter.length >= 8}
          onClick={() =>
            endre('Nytt breddepunkt', (s) => {
              const p = ryddBreddepunkter(s.breddepunkter);
              // in the middle of the widest gap
              let beste = 0;
              for (let i = 1; i < p.length; i++)
                if (p[i]!.t - p[i - 1]!.t > p[beste + 1]!.t - p[beste]!.t) beste = i - 1;
              const t = (p[beste]!.t + p[beste + 1]!.t) / 2;
              return { ...s, breddepunkter: ryddBreddepunkter([...p, { t, v: breddefaktor(p, t) }]) };
            })
          }
        >
          + Breddepunkt
        </button>
      </div>
    </>
  );
}

/** The inspector section for a Paint stroke on the sign. */
export function Strekseksjon({ benk, o }: { benk: Arbeidsbenk; o: Objekt }) {
  if (o.kilde.type !== 'svg' || !o.kilde.strek) return null;
  const strek = o.kilde.strek;
  const endre = (navn: string, fn: (s: Strek) => Strek, slaSammen?: string) =>
    endreStrek(benk, o.id, navn, fn, slaSammen);
  return (
    <>
      <p class="merknad">
        Malt strøk, {strekLengde(strek).toFixed(0)} mm langt. Bredden kan endres så lenge det er et strøk.
      </p>
      <TallFelt
        etikett="Bredde på strøket"
        verdi={strek.bredde}
        min={MIN_BREDDE}
        maks={MAKS_BREDDE}
        steg={0.5}
        endre={(v, k) =>
          endre(
            'Strekbredde',
            (s) => ({ ...s, bredde: clampBredde(v) }),
            k === 'pil' ? 'strekbredde' : undefined,
          )
        }
      />
      <div class="felt stablet">
        <span>Breddeprofil</span>
        <Segment<ProfilId | 'egen'>
          etikett="Breddeprofil"
          valg={[
            ...PROFILVALG,
            ...(profilFor(strek.breddepunkter) === 'egen' ? [{ id: 'egen' as const, navn: 'Egen' }] : []),
          ]}
          verdi={profilFor(strek.breddepunkter)}
          endre={(id) => {
            if (id === 'egen') return;
            endre('Breddeprofil', (s) => ({ ...s, breddepunkter: PROFILER[id].map((p) => ({ ...p })) }));
          }}
        />
      </div>
      <Breddeprofil strek={strek} endre={endre} />
      <TallFelt
        etikett="Smooth"
        enhet="%"
        desimaler={0}
        verdi={Math.round(strek.glatt * 100)}
        min={0}
        maks={100}
        steg={5}
        endre={(v, k) =>
          endre('Smooth', (s) => ({ ...s, glatt: v / 100 }), k === 'pil' ? 'strek-smooth' : undefined)
        }
      />
      <TallFelt
        etikett="Tupp i starten"
        enhet="%"
        desimaler={0}
        verdi={Math.round(strek.tuppStart * 100)}
        min={0}
        maks={100}
        steg={5}
        endre={(v, k) =>
          endre(
            'Tupp start',
            (s) => ({ ...s, tuppStart: v / 100 }),
            k === 'pil' ? 'strek-tupp-start' : undefined,
          )
        }
      />
      <TallFelt
        etikett="Tupp i enden"
        enhet="%"
        desimaler={0}
        verdi={Math.round(strek.tuppSlutt * 100)}
        min={0}
        maks={100}
        steg={5}
        endre={(v, k) =>
          endre(
            'Tupp slutt',
            (s) => ({ ...s, tuppSlutt: v / 100 }),
            k === 'pil' ? 'strek-tupp-slutt' : undefined,
          )
        }
      />
      <p class="dempet" role="status">
        Senterlinjen har {strek.punkter.length} punkter. Dra de firkantede punktene, eller bruk ikonene i
        kontekstlinjen.
      </p>
      <div class="knapperad">
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => gjorStrekTilVektor(benk, o.id)}
          title="Gjør streken om til en vanlig vektor du kan redigere punkt for punkt"
        >
          Gjør om til vektor
        </button>
      </div>
    </>
  );
}
