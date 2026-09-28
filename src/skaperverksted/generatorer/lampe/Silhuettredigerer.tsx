/**
 * Silhouette editor: the lamp seen from the side, true to scale, with the
 * Bézier anchors and handles on its right-hand outline. Anchors and handles
 * can be dragged; the selected anchor is also editable numerically. The
 * drawing is functional technical geometry (D-3).
 */
import { useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { tall } from '../../core/enheter';
import { TallFelt } from '../../shell/kontroller';
import type { Form } from './form';
import {
  ankerRadius,
  endreLampe,
  fjernAnker,
  flyttAnker,
  flyttHandtak,
  grunnRadius,
  leggTilAnker,
  vekslGlatt,
} from './handlinger';
import { GRENSER, type LampeParametre } from './parametre';

const B = 260,
  H = 240,
  M = 22;

type Grep = { i: number; del: 'anker' | 'ut' | 'inn' };

export function Silhuettredigerer({
  benk,
  p,
  form,
  farge,
}: {
  benk: Arbeidsbenk;
  p: LampeParametre;
  form: Form;
  farge: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [valgt, settValgt] = useState(1);
  const [grep, settGrep] = useState<Grep | null>(null);
  const pk = p.silhuett;
  const v = Math.min(valgt, pk.length - 1);

  // True-scale mapping: radius across (axis in the middle), height up.
  let maksR = 0;
  const prover: { r: number; z: number }[] = [];
  for (let k = 0; k <= 64; k++) {
    const t = k / 64;
    const r = form.radius(t);
    maksR = Math.max(maksR, r);
    prover.push({ r, z: t * p.hoyde });
  }
  for (const a of pk) {
    for (const h of [a.ut, a.inn]) if (h) maksR = Math.max(maksR, grunnRadius(p, h.t) + h.u);
  }
  const skala = Math.min((B / 2 - M) / Math.max(maksR, 1), (H - 2 * M) / p.hoyde);
  const tilX = (r: number) => B / 2 + r * skala;
  const tilY = (z: number) => H - M - z * skala;
  const fraSkjerm = (e: PointerEvent) => {
    const b = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * B;
    const y = ((e.clientY - b.top) / b.height) * H;
    return { r: (x - B / 2) / skala, z: (H - M - y) / skala };
  };

  const hoyre = prover.map((s) => `${tilX(s.r).toFixed(1)},${tilY(s.z).toFixed(1)}`);
  const venstre = [...prover].reverse().map((s) => `${tilX(-s.r).toFixed(1)},${tilY(s.z).toFixed(1)}`);

  const flytt = (g: Grep, r: number, z: number, slaSammen?: string) => {
    if (g.del === 'anker') {
      endreLampe(benk, 'Form silhuetten', (x) => flyttAnker(x, g.i, r, z), slaSammen);
    } else {
      const del = g.del;
      endreLampe(benk, 'Form silhuetten', (x) => flyttHandtak(x, g.i, del, r, z), slaSammen);
    }
  };

  const a = pk[v]!;
  const ende = v === 0 || v === pk.length - 1;

  return (
    <div class="profilredigerer">
      <svg
        ref={svg}
        viewBox={`0 0 ${B} ${H}`}
        class="profilgraf"
        role="img"
        aria-label={`Silhuetten sett fra siden, ${pk.length} punkter. Bruk feltene under for å endre punktene med tastatur.`}
        onPointerMove={(e) => {
          if (!grep) return;
          const q = fraSkjerm(e);
          flytt(grep, Math.abs(q.r), q.z, `lampe-silhuett-${grep.i}-${grep.del}`);
        }}
        onPointerUp={() => {
          if (grep) benk.historikk.avsluttSammenslaing();
          settGrep(null);
        }}
        onPointerCancel={() => settGrep(null)}
      >
        <line x1={tilX(0)} y1={tilY(0) + 6} x2={tilX(0)} y2={tilY(p.hoyde) - 6} class="lampe-akse" />
        <line x1={tilX(-maksR)} y1={tilY(0)} x2={tilX(maksR)} y2={tilY(0)} class="profil-rutenett-linje" />
        <polygon points={`${hoyre.join(' ')} ${venstre.join(' ')}`} fill={farge} opacity={0.85} />
        <polyline points={hoyre.join(' ')} class="profil-kurve" />
        <text x={4} y={tilY(p.hoyde) + 4} class="profil-akse">
          {tall(p.hoyde, 0)}
        </text>
        <text x={4} y={tilY(0) + 4} class="profil-akse">
          0
        </text>
        <text x={B - 4} y={H - 6} class="profil-akse" text-anchor="end">
          mm
        </text>
        {pk.map((q, i) => {
          const r = ankerRadius(p, i);
          return (
            <g key={i}>
              {(['inn', 'ut'] as const).map((del) => {
                const h = q[del];
                if (!h) return null;
                const hr = grunnRadius(p, h.t) + h.u;
                return (
                  <g key={del}>
                    <line
                      x1={tilX(r)}
                      y1={tilY(q.t * p.hoyde)}
                      x2={tilX(hr)}
                      y2={tilY(h.t * p.hoyde)}
                      class="profil-hank"
                    />
                    <rect
                      x={tilX(hr) - 4}
                      y={tilY(h.t * p.hoyde) - 4}
                      width={8}
                      height={8}
                      class="profil-handtak"
                      onPointerDown={(e) => {
                        svg.current?.setPointerCapture(e.pointerId);
                        settValgt(i);
                        settGrep({ i, del });
                      }}
                    />
                  </g>
                );
              })}
              <circle
                cx={tilX(r)}
                cy={tilY(q.t * p.hoyde)}
                r={i === v ? 7 : 5.5}
                class={`profil-anker${i === v ? ' valgt' : ''}`}
                onPointerDown={(e) => {
                  svg.current?.setPointerCapture(e.pointerId);
                  settValgt(i);
                  settGrep({ i, del: 'anker' });
                }}
              />
            </g>
          );
        })}
      </svg>
      <div class="feltpar">
        <TallFelt
          etikett={`Punkt ${v + 1}, diameter`}
          kortEtikett="Ø"
          verdi={ankerRadius(p, v) * 2}
          min={GRENSER.diameter.min}
          maks={GRENSER.diameter.maks}
          desimaler={1}
          endre={(d, kilde) =>
            flytt(
              { i: v, del: 'anker' },
              d / 2,
              a.t * p.hoyde,
              kilde === 'pil' ? `lampe-punkt-d-${v}` : undefined,
            )
          }
        />
        <TallFelt
          etikett={`Punkt ${v + 1}, høyde over bunnen`}
          kortEtikett="↕"
          verdi={a.t * p.hoyde}
          min={0}
          maks={p.hoyde}
          desimaler={1}
          deaktivert={ende}
          endre={(z, kilde) =>
            flytt(
              { i: v, del: 'anker' },
              ankerRadius(p, v),
              z,
              kilde === 'pil' ? `lampe-punkt-z-${v}` : undefined,
            )
          }
        />
      </div>
      <div class="knapperad">
        <label class="visuelt-skjult" for="lampe-punkt">
          Valgt punkt
        </label>
        <select
          id="lampe-punkt"
          value={v}
          onChange={(e) => settValgt(Number((e.target as HTMLSelectElement).value))}
        >
          {pk.map((_, i) => (
            <option key={i} value={i}>
              {i === 0 ? 'Bunn' : i === pk.length - 1 ? 'Topp' : `Punkt ${i + 1}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => {
            const { endring, indeks } = leggTilAnker(p, v);
            endreLampe(benk, 'Legg til silhuettpunkt', () => endring);
            settValgt(indeks);
          }}
        >
          Legg til punkt
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          disabled={ende}
          onClick={() => {
            endreLampe(benk, 'Fjern silhuettpunkt', (x) => fjernAnker(x, v));
            settValgt(Math.max(0, v - 1));
          }}
        >
          Fjern punkt
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() =>
            endreLampe(benk, a.ut || a.inn ? 'Gjør til hjørne' : 'Gjør glatt', (x) => vekslGlatt(x, v))
          }
        >
          {a.ut || a.inn ? 'Gjør til hjørne' : 'Gjør glatt'}
        </button>
      </div>
    </div>
  );
}
