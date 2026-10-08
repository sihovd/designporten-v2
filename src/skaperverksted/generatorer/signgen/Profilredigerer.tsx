/**
 * Cross-section editor for one layer: the layer's thickness up, the inset
 * from its outline across (mm). The wall rises from an anchor on the bottom
 * edge to an anchor on the top edge; those two only move sideways along
 * their edge. Points can be added on the wall (the button, or a double-click
 * on the curve) and then move freely sideways and up and down between their
 * neighbours; the wall always rises, it never turns back down. A hand-made
 * curve also shows Bézier handles on the wall. Below the graph the layer under it is drawn as a
 * read-only strip, so you see where this layer rests on something.
 * The drawing is functional technical geometry (D-3).
 */
import { useRef, useState } from 'preact/hooks';
import type { Profil, ProfilPunkt } from '../../core/profil';
import {
  ankere,
  flyttAnker,
  medBredde,
  mellomPunkter,
  narmestePaaKurve,
  samplerProfil,
  settInnPunkt,
} from '../../core/profil';
import { klem } from '../../core/enheter';
import { TallFelt } from '../../shell/kontroller';
import type { Stotte } from './modell';

const B = 260,
  H = 214,
  M = 28,
  /** Room under the graph for the strip showing what the layer rests on. */
  STRIPE = 26;
const TOPP = 10;
const BUNN = H - M - STRIPE;

type Grep = { punkt: number; del: 'anker' | 'ut' | 'inn'; akse: number };

export function Profilredigerer({
  profil,
  hoyde,
  farge,
  stotte,
  endre,
  ferdig,
}: {
  profil: Profil;
  hoyde: number;
  farge: string;
  /** What the layer rests on; null while it is unknown. */
  stotte: Stotte | null;
  /** `slaSammen` groups a drag into one undo step. */
  endre: (p: Profil, slaSammen?: string) => void;
  ferdig: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [valgt, settValgt] = useState(0);
  const [grep, settGrep] = useState<Grep | null>(null);
  const pk = profil.punkter;
  const egen = profil.type === 'egendefinert';
  const a = ankere(profil);
  const trengt = stotte?.trengtInset ?? 0;
  // the horizontal range is fixed during a drag, so the graph does not rescale under the pointer
  const naaAkse = Math.max(3, Math.ceil(Math.max(profil.bredde, a.bunn, a.topp, trengt)));
  const akse = grep?.akse ?? naaAkse;
  const tilX = (mm: number) => M + (mm / akse) * (B - 2 * M);
  const tilY = (t: number) => BUNN - t * (BUNN - TOPP);
  const fraSkjerm = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * B;
    const y = ((e.clientY - r.top) / r.height) * H;
    return { mm: ((x - M) / (B - 2 * M)) * akse, t: (BUNN - y) / (BUNN - TOPP) };
  };

  const flytt = (g: Grep, mm: number, t: number, slaSammen?: string) => {
    const i = g.punkt;
    mm = klem(mm, 0, g.akse);
    const kant = i === 0 ? 'bunn' : i === pk.length - 1 ? 'topp' : null;
    if (g.del === 'anker' && kant) {
      // edge anchors only slide along their edge
      endre(flyttAnker(profil, kant, mm), slaSammen);
      return;
    }
    // a point dragged past the profile's width widens it (the other points keep their place in mm)
    const prof = mm > profil.bredde ? medBredde(profil, mm) : profil;
    const punkter = prof.punkter.map((p) => ({ ...p })) as ProfilPunkt[];
    const p = punkter[i]!;
    const bredde = Math.max(prof.bredde, 1e-6);
    if (g.del === 'anker') {
      // an older in-between anchor moves freely, but never past its neighbours in height
      const du = klem(mm / bredde, 0, 1) - p.u;
      const nyT = klem(t, pk[i - 1]!.t, pk[i + 1]!.t);
      const dt = nyT - p.t;
      p.u += du;
      p.t = nyT;
      if (p.ut) p.ut = { u: klem(p.ut.u + du, 0, 1), t: klem(p.ut.t + dt, 0, 1) };
      if (p.inn) p.inn = { u: klem(p.inn.u + du, 0, 1), t: klem(p.inn.t + dt, 0, 1) };
    } else {
      p[g.del] = { u: klem(mm / bredde, 0, 1), t: klem(t, 0, 1) };
    }
    endre({ ...prof, type: 'egendefinert', punkter }, slaSammen);
  };

  /** Add a point on segment `segment` at position `s`, and select it. */
  const leggTilPunkt = (segment: number, s: number) => {
    endre(settInnPunkt(profil, segment, s));
    settValgt(segment + 1);
  };
  const leggTilVedValgt = () => {
    // in the middle of the wall after the selected point (before it, when the top is selected)
    leggTilPunkt(valgt >= pk.length - 1 ? pk.length - 2 : valgt, 0.5);
  };
  const dobbeltklikk = (e: MouseEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const q = fraSkjerm(e as unknown as PointerEvent);
    const pxX = (r.width / B) * ((B - 2 * M) / akse);
    const pxY = (r.height / H) * (BUNN - TOPP);
    const n = narmestePaaKurve(profil, q.mm, q.t, { x: pxX, y: pxY });
    if (n && n.avstand < 14) leggTilPunkt(n.segment, n.s);
  };
  const prover = samplerProfil(profil, 24);
  const kurve = prover.map((s) => `${tilX(s.inset)},${tilY(s.t)}`).join(' ');
  const fyll = `${kurve} ${tilX(akse)},${tilY(1)} ${tilX(akse)},${tilY(0)}`;
  const p = pk[Math.min(valgt, pk.length - 1)] ?? pk[0]!;
  const bredde = Math.max(profil.bredde, 1e-6);
  const mellom = mellomPunkter(profil);
  const erKant = valgt === 0 || valgt === pk.length - 1;

  const fjernPunkt = () => {
    if (erKant) return;
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

  const start = (e: PointerEvent, punkt: number, del: Grep['del']) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    settValgt(punkt);
    settGrep({ punkt, del, akse: naaAkse });
  };

  // what the layer rests on, drawn under the bottom edge (read-only)
  const stotteX = stotte && stotte.trengtInset !== null ? tilX(Math.min(trengt, akse)) : null;
  const stotteTekst =
    !stotte || stotte.niva === 'plate'
      ? 'byggeplaten'
      : stotte.niva === 'ingen'
        ? 'ingenting under'
        : 'laget under';
  const henger = stotte && (stotte.niva === 'delvis' || stotte.niva === 'ingen');
  const stripeY = tilY(0) + 5;

  return (
    <div class="profilredigerer">
      <svg
        ref={svg}
        viewBox={`0 0 ${B} ${H}`}
        class="profilgraf"
        role="img"
        aria-label={`Tverrsnitt av laget, ${pk.length} punkter. Bruk feltene under for å endre punktene med tastatur.`}
        onPointerMove={(e) => {
          if (!grep) return;
          const q = fraSkjerm(e);
          flytt(grep, q.mm, q.t, 'profil-dra');
        }}
        onPointerUp={() => {
          if (grep) ferdig();
          settGrep(null);
        }}
        onPointerCancel={() => settGrep(null)}
        onDblClick={dobbeltklikk}
      >
        <defs>
          <pattern
            id="profil-skravur"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" class="profil-skravur" />
          </pattern>
        </defs>
        {/* grid: every mm, and 25 % of the height */}
        {Array.from({ length: Math.floor(akse) + 1 }, (_, v) => (
          <line
            key={`x${v}`}
            class="profil-rutenett-linje"
            x1={tilX(v)}
            y1={tilY(1)}
            x2={tilX(v)}
            y2={tilY(0)}
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <line
            key={`y${v}`}
            class="profil-rutenett-linje"
            x1={tilX(0)}
            y1={tilY(v)}
            x2={tilX(akse)}
            y2={tilY(v)}
          />
        ))}
        <polygon points={fyll} fill={farge} opacity={0.85} />
        <polyline points={kurve} class="profil-kurve" />
        {/* the two edges the anchors live on */}
        <line x1={tilX(0)} y1={tilY(0)} x2={tilX(akse)} y2={tilY(0)} class="profil-kant" />
        <line x1={tilX(0)} y1={tilY(1)} x2={tilX(akse)} y2={tilY(1)} class="profil-kant" />

        {/* support from the layer below */}
        <g class="profil-stotte" aria-hidden="true">
          {stotte?.niva === 'plate' || !stotte ? (
            <rect
              x={tilX(0)}
              y={stripeY}
              width={tilX(akse) - tilX(0)}
              height={STRIPE - 8}
              class="profil-under"
            />
          ) : stotteX !== null ? (
            <>
              <rect
                x={stotteX}
                y={stripeY}
                width={Math.max(0, tilX(akse) - stotteX)}
                height={STRIPE - 8}
                class="profil-under"
              />
              {stotteX > tilX(0) && (
                <rect
                  x={tilX(0)}
                  y={stripeY}
                  width={stotteX - tilX(0)}
                  height={STRIPE - 8}
                  fill="url(#profil-skravur)"
                  class="profil-henger"
                />
              )}
              {stotteX > tilX(0) && (
                <line
                  x1={stotteX}
                  y1={tilY(1)}
                  x2={stotteX}
                  y2={stripeY + STRIPE - 8}
                  class="profil-stottekant"
                />
              )}
            </>
          ) : (
            <rect
              x={tilX(0)}
              y={stripeY}
              width={tilX(akse) - tilX(0)}
              height={STRIPE - 8}
              fill="url(#profil-skravur)"
              class="profil-henger"
            />
          )}
          <text x={tilX(akse) - 3} y={stripeY + 11} class="profil-akse" text-anchor="end">
            {stotteTekst}
          </text>
        </g>
        <text x={tilX(0)} y={H - 4} class="profil-akse">
          ute
        </text>
        <text x={tilX(akse)} y={H - 4} class="profil-akse" text-anchor="end">
          innover, {akse.toLocaleString('nb-NO')} mm
        </text>
        <text x={6} y={tilY(1) + 3} class="profil-akse">
          {hoyde.toLocaleString('nb-NO')}
        </text>
        <text x={6} y={tilY(0) + 3} class="profil-akse">
          0
        </text>

        {egen &&
          pk.map((q, i) =>
            (['inn', 'ut'] as const).map((del) => {
              const h = q[del];
              if (!h) return null;
              return (
                <g key={`${i}${del}`}>
                  <line
                    x1={tilX(q.u * profil.bredde)}
                    y1={tilY(q.t)}
                    x2={tilX(h.u * profil.bredde)}
                    y2={tilY(h.t)}
                    class="profil-hank"
                  />
                  <rect
                    x={tilX(h.u * profil.bredde) - 4}
                    y={tilY(h.t) - 4}
                    width={8}
                    height={8}
                    class="profil-handtak"
                    onPointerDown={(e) => start(e, i, del)}
                  />
                </g>
              );
            }),
          )}
        {pk.map((q, i) => {
          const kant = i === 0 || i === pk.length - 1;
          const x = tilX(q.u * profil.bredde);
          const y = tilY(q.t);
          return kant ? (
            <rect
              key={i}
              x={x - (i === valgt ? 6 : 5)}
              y={y - (i === valgt ? 6 : 5)}
              width={i === valgt ? 12 : 10}
              height={i === valgt ? 12 : 10}
              class={`profil-anker kant${i === valgt ? ' valgt' : ''}`}
              onPointerDown={(e) => start(e, i, 'anker')}
            />
          ) : (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === valgt ? 7 : 5.5}
              class={`profil-anker${i === valgt ? ' valgt' : ''}`}
              onPointerDown={(e) => start(e, i, 'anker')}
            />
          );
        })}
      </svg>

      {henger && (
        <p class="merknad profil-advarsel" role="status">
          {stotte!.niva === 'ingen'
            ? 'Det er ingenting under laget. Det trenger støttemateriale eller et lag under.'
            : stotte!.trengtInset === null
              ? `Bare deler av bunnen hviler på laget under. Rundt ${Math.round(stotte!.uforstottMm2)} mm² henger i lufta, og en dypere bunnkant løser det ikke.`
              : a.bunn < stotte!.trengtInset - 0.01
                ? `Bunnen henger ${(stotte!.trengtInset - a.bunn).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} mm utenfor laget under. Start veggen minst ${stotte!.trengtInset.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} mm inn.`
                : 'Hele bunnen hviler på laget under.'}
        </p>
      )}

      <>
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
                {i === 0 ? 'Bunn' : i === pk.length - 1 ? 'Topp' : `Mellompunkt ${i}`}
              </option>
            ))}
          </select>
          <button type="button" class="kontroll-knapp" onClick={leggTilVedValgt}>
            Legg til punkt
          </button>
          {egen && (
            <button type="button" class="kontroll-knapp" onClick={vekslGlatt}>
              {p.ut || p.inn ? 'Gjør til hjørne' : 'Gjør glatt'}
            </button>
          )}
          {!erKant && (
            <button type="button" class="kontroll-knapp" onClick={fjernPunkt}>
              Fjern punkt
            </button>
          )}
        </div>
        {!erKant && (
          <div class="feltpar">
            <TallFelt
              etikett="Mellompunkt, innover"
              kortEtikett="↔"
              verdi={p.u * bredde}
              min={0}
              maks={30}
              steg={0.1}
              desimaler={2}
              endre={(v) => flytt({ punkt: valgt, del: 'anker', akse: naaAkse }, v, p.t)}
            />
            <TallFelt
              etikett="Mellompunkt, høyde"
              kortEtikett="↕"
              verdi={p.t * hoyde}
              min={0}
              maks={hoyde}
              steg={0.1}
              desimaler={2}
              endre={(v) =>
                flytt({ punkt: valgt, del: 'anker', akse: naaAkse }, p.u * bredde, v / Math.max(hoyde, 1e-6))
              }
            />
          </div>
        )}
        <p class="merknad">
          {mellom > 0
            ? `${mellom === 1 ? 'Et punkt' : `${mellom} punkter`} på veggen. Dra dem sideveis og opp og ned; veggen går alltid oppover, aldri tilbake ned. `
            : 'Dobbeltklikk på kurven, eller trykk «Legg til punkt», for å få et punkt som kan dras både sideveis og opp og ned. '}
          Bunn og topp flyttes bare sideveis.
        </p>
      </>
    </div>
  );
}
