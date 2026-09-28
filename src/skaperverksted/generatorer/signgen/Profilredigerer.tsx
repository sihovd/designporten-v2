/**
 * Side profile editor (spec: "Side profile and Bézier editing"). A graph
 * with the profile width (outside → inside, mm) across and the layer
 * height (bottom Z → top Z, mm) up. Anchors and Bézier handles can be
 * dragged; the selected point is also editable numerically. The drawing
 * is functional technical geometry (D-3).
 */
import { useRef, useState } from 'preact/hooks';
import type { Profil, ProfilPunkt } from '../../core/profil';
import { samplerProfil } from '../../core/profil';
import { klem } from '../../core/enheter';
import { TallFelt } from '../../shell/kontroller';

const B = 260,
  H = 190,
  M = 28;

type Grep = { punkt: number; del: 'anker' | 'ut' | 'inn' };

export function Profilredigerer({
  profil,
  hoyde,
  farge,
  endre,
  ferdig,
}: {
  profil: Profil;
  hoyde: number;
  farge: string;
  /** `slaSammen` groups a drag into one undo step. */
  endre: (p: Profil, slaSammen?: string) => void;
  ferdig: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [valgt, settValgt] = useState(0);
  const [grep, settGrep] = useState<Grep | null>(null);
  const pk = profil.punkter;
  const tilX = (u: number) => M + u * (B - 2 * M);
  const tilY = (t: number) => H - M - t * (H - 2 * M);
  const fraSkjerm = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * B;
    const y = ((e.clientY - r.top) / r.height) * H;
    return { u: (x - M) / (B - 2 * M), t: (H - M - y) / (H - 2 * M) };
  };

  const sett = (i: number, del: Grep['del'], u: number, t: number, slaSammen?: string) => {
    const punkter = pk.map((p) => ({ ...p })) as ProfilPunkt[];
    const p = punkter[i]!;
    if (del === 'anker') {
      const du = klem(u, 0, 1) - p.u;
      const tMin = i === 0 ? 0 : i === pk.length - 1 ? 1 : pk[i - 1]!.t;
      const tMaks = i === 0 ? 0 : i === pk.length - 1 ? 1 : pk[i + 1]!.t;
      const nyT = klem(t, tMin, tMaks);
      const dt = nyT - p.t;
      p.u += du;
      p.t = nyT;
      if (p.ut) p.ut = { u: klem(p.ut.u + du, 0, 1), t: klem(p.ut.t + dt, 0, 1) };
      if (p.inn) p.inn = { u: klem(p.inn.u + du, 0, 1), t: klem(p.inn.t + dt, 0, 1) };
    } else {
      p[del] = { u: klem(u, 0, 1), t: klem(t, 0, 1) };
    }
    endre({ ...profil, type: 'egendefinert', punkter }, slaSammen);
  };

  const prover = samplerProfil(profil, 24);
  const bredde = Math.max(profil.bredde, 1e-6);
  const kurve = prover.map((s) => `${tilX(s.inset / bredde)},${tilY(s.t)}`).join(' ');
  const fyll = `${kurve} ${tilX(1)},${tilY(1)} ${tilX(1)},${tilY(0)}`;
  const p = pk[valgt] ?? pk[0]!;

  const leggTilPunkt = () => {
    const i = Math.min(valgt, pk.length - 2);
    const a = pk[i]!,
      b = pk[i + 1]!;
    const ny: ProfilPunkt = { u: (a.u + b.u) / 2, t: (a.t + b.t) / 2 };
    const punkter = [...pk.slice(0, i + 1), ny, ...pk.slice(i + 1)];
    endre({ ...profil, type: 'egendefinert', punkter });
    settValgt(i + 1);
  };
  const fjernPunkt = () => {
    if (valgt === 0 || valgt === pk.length - 1) return;
    endre({ ...profil, type: 'egendefinert', punkter: pk.filter((_, i) => i !== valgt) });
    settValgt(valgt - 1);
  };
  const vekslGlatt = () => {
    const punkter = pk.map((x) => ({ ...x }));
    const q = punkter[valgt]!;
    if (q.ut || q.inn) {
      delete q.ut;
      delete q.inn;
    } else {
      const forrige = punkter[valgt - 1];
      const neste = punkter[valgt + 1];
      if (neste) q.ut = { u: q.u + (neste.u - q.u) / 3, t: q.t + (neste.t - q.t) / 3 };
      if (forrige) q.inn = { u: q.u + (forrige.u - q.u) / 3, t: q.t + (forrige.t - q.t) / 3 };
    }
    endre({ ...profil, type: 'egendefinert', punkter });
  };

  return (
    <div class="profilredigerer">
      <svg
        ref={svg}
        viewBox={`0 0 ${B} ${H}`}
        class="profilgraf"
        role="img"
        aria-label={`Profilkurve, ${pk.length} punkter. Bruk feltene under for å endre punktene med tastatur.`}
        onPointerMove={(e) => {
          if (!grep) return;
          const q = fraSkjerm(e);
          sett(grep.punkt, grep.del, q.u, q.t, 'profil-dra');
        }}
        onPointerUp={() => {
          if (grep) ferdig();
          settGrep(null);
        }}
        onPointerCancel={() => settGrep(null)}
      >
        {/* axes and 25 % grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v} class="profil-rutenett">
            <line x1={tilX(v)} y1={tilY(0)} x2={tilX(v)} y2={tilY(1)} />
            <line x1={tilX(0)} y1={tilY(v)} x2={tilX(1)} y2={tilY(v)} />
          </g>
        ))}
        <polygon points={fyll} fill={farge} opacity={0.85} />
        <polyline points={kurve} class="profil-kurve" />
        <text x={tilX(0)} y={H - 8} class="profil-akse">
          ute
        </text>
        <text x={tilX(1)} y={H - 8} class="profil-akse" text-anchor="end">
          inne, {profil.bredde.toLocaleString('nb-NO')} mm
        </text>
        <text x={6} y={tilY(1) + 4} class="profil-akse">
          {hoyde.toLocaleString('nb-NO')}
        </text>
        <text x={6} y={tilY(0) + 4} class="profil-akse">
          0
        </text>
        {pk.map((q, i) => (
          <g key={i}>
            {(['inn', 'ut'] as const).map((del) => {
              const h = q[del];
              if (!h) return null;
              return (
                <g key={del}>
                  <line x1={tilX(q.u)} y1={tilY(q.t)} x2={tilX(h.u)} y2={tilY(h.t)} class="profil-hank" />
                  <rect
                    x={tilX(h.u) - 4}
                    y={tilY(h.t) - 4}
                    width={8}
                    height={8}
                    class="profil-handtak"
                    onPointerDown={(e) => {
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      settValgt(i);
                      settGrep({ punkt: i, del });
                    }}
                  />
                </g>
              );
            })}
            <circle
              cx={tilX(q.u)}
              cy={tilY(q.t)}
              r={i === valgt ? 7 : 5.5}
              class={`profil-anker${i === valgt ? ' valgt' : ''}`}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                settValgt(i);
                settGrep({ punkt: i, del: 'anker' });
              }}
            />
          </g>
        ))}
      </svg>
      <div class="feltpar">
        <TallFelt
          etikett={`Punkt ${valgt + 1}, innover`}
          kortEtikett="↔"
          verdi={p.u * profil.bredde}
          min={0}
          maks={profil.bredde}
          steg={0.1}
          desimaler={2}
          endre={(v) => sett(valgt, 'anker', v / bredde, p.t)}
        />
        <TallFelt
          etikett={`Punkt ${valgt + 1}, høyde`}
          kortEtikett="↕"
          verdi={p.t * hoyde}
          min={0}
          maks={hoyde}
          steg={0.1}
          desimaler={2}
          deaktivert={valgt === 0 || valgt === pk.length - 1}
          endre={(v) => sett(valgt, 'anker', p.u, v / Math.max(hoyde, 1e-6))}
        />
      </div>
      <div class="knapperad">
        <label class="visuelt-skjult" for="profil-punkt">
          Valgt punkt
        </label>
        <select
          id="profil-punkt"
          value={valgt}
          onChange={(e) => settValgt(Number((e.target as HTMLSelectElement).value))}
        >
          {pk.map((_, i) => (
            <option key={i} value={i}>
              Punkt {i + 1}
            </option>
          ))}
        </select>
        <button type="button" class="kontroll-knapp" onClick={leggTilPunkt}>
          Legg til punkt
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          onClick={fjernPunkt}
          disabled={valgt === 0 || valgt === pk.length - 1}
        >
          Fjern punkt
        </button>
        <button type="button" class="kontroll-knapp" onClick={vekslGlatt}>
          {p.ut || p.inn ? 'Gjør til hjørne' : 'Gjør glatt'}
        </button>
      </div>
    </div>
  );
}
