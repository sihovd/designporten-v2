/**
 * The SVG part picker (Sivert, 2026-10-05): an imported SVG with several
 * parts, for example a sheet of icons, is shown with every part. Parts the
 * user does not want are masked away, the rest can get a filament colour
 * each, and the result goes on the sign, into the gallery as the user's own
 * vector, or out as an SVG file. The drawing takes clicks and a dragged
 * frame; the list under it does the same with a keyboard.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { lastNed } from '../../core/lagring';
import { fargekode, finnMateriale } from '../../core/materialer';
import type { Region } from '../../geometri/polygon';
import { Dialog } from '../../shell/Dialog';
import { Segment } from '../../shell/kontroller';
import { lagreEgetFlerfarget } from './dekor';
import { nesteFarge, palett } from './dokument';
import { leggTilFlerfarget, tekstlagForDekor, type Dekorplass } from './handlinger';
import { byggFlerfarget, fordelFarger, svgFil, type Flerfarget } from './svgdeler';
import { signtilstand, type SvgOppgave } from './tilstand';

const MAKS_I_LISTEN = 60;

const tall = (v: number) => String(Math.round(v * 1000) / 1000);
const mm = (v: number) => (Math.round(v * 10) / 10).toLocaleString('nb-NO');

/** A region as path data with y turned down, for the drawing. */
function stiAv(region: Region): string {
  return region
    .flatMap((f) => [f.ytre, ...f.hull])
    .map((r) => `M${r.map((p) => `${tall(p.x)} ${tall(-p.y)}`).join('L')}Z`)
    .join('');
}

interface Ramme {
  a: { x: number; y: number };
  b: { x: number; y: number };
  utvid: boolean;
}

export function Delvelger({ benk, oppgave }: { benk: Arbeidsbenk; oppgave: SvgOppgave }) {
  const { deler, rolle, opphav } = oppgave;
  const eneFarge = rolle === 'ramme';
  const filnavn = deler.filnavn.replace(/\.svg$/i, '');
  const paletten = useMemo(
    () =>
      (palett(benk.dok).length ? palett(benk.dok) : [nesteFarge(benk.dok)]).map((id) => {
        const m = finnMateriale(id);
        return { id, navn: fargekode(m), hex: m.hex };
      }),
    [],
  );
  const standard = useMemo(() => {
    const f = fordelFarger(
      deler.deler.map((d) => d.fyll),
      paletten,
    );
    return Object.fromEntries(deler.deler.map((d, i) => [d.id, f[i] ?? paletten[0]?.id ?? '']));
  }, [deler]);
  // a part's colour is a filament id; null masks it away
  const [farge, settFarge] = useState<Record<number, string | null>>(() => ({ ...standard }));
  const [valgt, settValgt] = useState<ReadonlySet<number>>(new Set());
  const [navn, settNavn] = useState(filnavn);
  const [melding, settMelding] = useState<string | null>(null);
  const [ramme, settRamme] = useState<Ramme | null>(null);
  const tegning = useRef<SVGSVGElement>(null);
  const tekstlag = tekstlagForDekor(benk);
  const [plass, settPlass] = useState<Dekorplass>(tekstlag ? 'gruppe' : 'eget');

  const med = (id: number) => farge[id] ?? null;
  // for a frame only «with» or «without» counts, so every kept part gets the same colour
  const effFarge = (id: number) => (eneFarge ? (med(id) ? (paletten[0]?.id ?? 'x') : null) : med(id));
  const bilde = useMemo(
    () => byggFlerfarget(filnavn, deler.deler, effFarge, deler.filnavn),
    [farge, deler, eneFarge],
  );
  const antallMed = deler.deler.filter((d) => med(d.id)).length;
  const fargerBrukt = bilde?.grupper.length ?? 0;

  const stier = useMemo(() => deler.deler.map((d) => ({ id: d.id, sti: stiAv(d.region) })), [deler]);
  const pad = Math.max(deler.boks.maksX - deler.boks.minX, deler.boks.maksY - deler.boks.minY) * 0.03;
  const viewBox = `${tall(deler.boks.minX - pad)} ${tall(-deler.boks.maksY - pad)} ${tall(
    deler.boks.maksX - deler.boks.minX + 2 * pad,
  )} ${tall(deler.boks.maksY - deler.boks.minY + 2 * pad)}`;

  const lukk = (tilbake = true) =>
    signtilstand(benk).sett({ svgdeler: null, ...(tilbake && opphav === 'galleri' ? { dekor: true } : {}) });

  // ---- choosing ----
  const sett = (ider: Iterable<number>, f: string | null) =>
    settFarge((forrige) => {
      const ny = { ...forrige };
      for (const id of ider) ny[id] = f;
      return ny;
    });
  const gjenopprett = (ider: Iterable<number>) =>
    settFarge((forrige) => {
      const ny = { ...forrige };
      for (const id of ider) if (!ny[id]) ny[id] = standard[id] ?? paletten[0]?.id ?? null;
      return ny;
    });
  const veksle = (id: number) =>
    settValgt((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alleIder = deler.deler.map((d) => d.id);

  const tilMm = (e: PointerEvent) => {
    const svg = tegning.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: q.x, y: -q.y };
  };
  const trykkNed = (e: PointerEvent) => {
    const del = (e.target as Element).closest('[data-del]')?.getAttribute('data-del');
    const utvid = e.shiftKey || e.ctrlKey || e.metaKey;
    if (del !== null && del !== undefined) {
      const id = Number(del);
      if (utvid) veksle(id);
      else settValgt(new Set([id]));
      return;
    }
    tegning.current!.setPointerCapture(e.pointerId);
    const p = tilMm(e);
    settRamme({ a: p, b: p, utvid });
  };
  const flytt = (e: PointerEvent) => {
    if (ramme) settRamme({ ...ramme, b: tilMm(e) });
  };
  const slipp = () => {
    if (!ramme) return;
    const minX = Math.min(ramme.a.x, ramme.b.x),
      maksX = Math.max(ramme.a.x, ramme.b.x);
    const minY = Math.min(ramme.a.y, ramme.b.y),
      maksY = Math.max(ramme.a.y, ramme.b.y);
    const stor = maksX - minX > pad / 3 || maksY - minY > pad / 3;
    if (!stor) {
      if (!ramme.utvid) settValgt(new Set());
    } else {
      // a part is chosen when it lies wholly inside the frame
      const inni = deler.deler
        .filter(
          (d) => d.boks.minX >= minX && d.boks.maksX <= maksX && d.boks.minY >= minY && d.boks.maksY <= maksY,
        )
        .map((d) => d.id);
      settValgt((s) => new Set(ramme.utvid ? [...s, ...inni] : inni));
    }
    settRamme(null);
  };

  // ---- results ----
  const gi = (): Flerfarget | null => {
    if (!bilde) {
      settMelding('Ta med minst én del først.');
      return null;
    }
    return { ...bilde, navn: navn.trim() || filnavn };
  };
  const ekstra = deler.hoppetOver.length ? `Hoppet over: ${deler.hoppetOver.join(', ')}` : undefined;
  const leggPaSkiltet = () => {
    const ff = gi();
    if (!ff) return;
    leggTilFlerfarget(benk, ff, rolle, plass === 'gruppe' && tekstlag ? 'gruppe' : 'eget', ekstra);
    lukk(false);
  };
  const lagre = () => {
    const ff = gi();
    if (!ff) return;
    const lagret = lagreEgetFlerfarget(ff.navn, ff);
    if (!lagret) {
      settMelding('Nettleseren fikk ikke lagret vektoren (for mye data). Forenkle den og prøv igjen.');
      return;
    }
    const tekst = `«${ff.navn}» er lagret i galleriet under «Dine egne».`;
    settMelding(tekst);
    benk.melde(tekst);
  };
  const lastNedSvg = () => {
    const ff = gi();
    if (!ff) return;
    lastNed(
      svgFil(ff, (f) => (eneFarge ? '#000000' : finnMateriale(f).hex)),
      `${ff.navn}.svg`,
      'image/svg+xml',
    );
  };

  const fargeValg = eneFarge
    ? [{ id: paletten[0]?.id ?? 'x', navn: 'Med' }]
    : paletten.map((p) => ({ id: p.id, navn: p.navn }));
  const heleListen = deler.deler.length <= MAKS_I_LISTEN;
  const rammeBoks = ramme && {
    x: Math.min(ramme.a.x, ramme.b.x),
    y: -Math.max(ramme.a.y, ramme.b.y),
    b: Math.abs(ramme.a.x - ramme.b.x),
    h: Math.abs(ramme.a.y - ramme.b.y),
  };

  return (
    <Dialog tittel="Velg deler av SVG-en" lukk={() => lukk()} klasse="svgdeler">
      <div class="svgdeler-innhold">
        <p class="dempet">
          «{deler.filnavn}» har {deler.deler.length} deler. Klikk på en del, eller dra en ramme rundt flere,
          for å velge dem. Deler du ikke vil ha, tar du bort.
          {eneFarge ? ' Resten blir rammen.' : ' Resten kan få hver sin farge.'}
        </p>
        {deler.merknad && <p class="merknad">{deler.merknad}</p>}

        <div class="svgdeler-venstre">
          <div class="svgdeler-forhandsvisning">
            <svg
              ref={tegning}
              viewBox={viewBox}
              role="img"
              aria-label={`Delene i SVG-en. ${antallMed} av ${deler.deler.length} er med. Bruk listen under for å velge med tastatur.`}
              onPointerDown={trykkNed}
              onPointerMove={flytt}
              onPointerUp={slipp}
              onPointerCancel={() => settRamme(null)}
            >
              <rect
                x={deler.boks.minX - pad}
                y={-deler.boks.maksY - pad}
                width={deler.boks.maksX - deler.boks.minX + 2 * pad}
                height={deler.boks.maksY - deler.boks.minY + 2 * pad}
                fill="transparent"
              />
              {stier.map((s) => {
                const f = med(s.id);
                const hex = f && !eneFarge ? finnMateriale(f).hex : f ? 'var(--fg)' : undefined;
                return (
                  <path
                    key={s.id}
                    data-del={s.id}
                    d={s.sti}
                    fill-rule="evenodd"
                    class={`svgdeler-del${f ? '' : ' bort'}${valgt.has(s.id) ? ' valgt' : ''}`}
                    style={hex ? { fill: hex } : undefined}
                  />
                );
              })}
              {rammeBoks && (
                <rect
                  class="svgdeler-ramme"
                  x={rammeBoks.x}
                  y={rammeBoks.y}
                  width={rammeBoks.b}
                  height={rammeBoks.h}
                />
              )}
            </svg>
          </div>

          <div class="knapperad">
            <button type="button" class="kontroll-knapp" onClick={() => settValgt(new Set(alleIder))}>
              Velg alle
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={!valgt.size}
              onClick={() => settValgt(new Set())}
            >
              Velg ingen
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={!valgt.size}
              onClick={() => {
                sett(
                  alleIder.filter((id) => !valgt.has(id)),
                  null,
                );
                gjenopprett(valgt);
              }}
            >
              Behold bare de valgte
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={!valgt.size}
              onClick={() => sett(valgt, null)}
            >
              Ta bort de valgte
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={antallMed === deler.deler.length}
              onClick={() => gjenopprett(alleIder)}
            >
              Ta med alle igjen
            </button>
          </div>
        </div>

        <div class="svgdeler-hoyre">
          {!eneFarge && (
            <div class="svgdeler-farger" role="group" aria-label="Farge på de valgte delene">
              <span class="dempet">Farge på de valgte:</span>
              {paletten.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  class="svgdeler-farge"
                  style={{ background: p.hex }}
                  disabled={!valgt.size}
                  title={p.navn}
                  onClick={() => sett(valgt, p.id)}
                >
                  <span class="visuelt-skjult">Gi de valgte delene fargen {p.navn}</span>
                </button>
              ))}
            </div>
          )}

          {heleListen ? (
            <ul class="svgdeler-liste" role="list" aria-label="Delene i SVG-en">
              {deler.deler.map((d) => (
                <li key={d.id}>
                  <label class="avkryssing">
                    <input type="checkbox" checked={valgt.has(d.id)} onChange={() => veksle(d.id)} /> {d.navn}{' '}
                    <span class="dempet">
                      {mm(d.boks.maksX - d.boks.minX)} × {mm(d.boks.maksY - d.boks.minY)} mm
                    </span>
                  </label>
                  <select
                    aria-label={`${eneFarge ? 'Med eller ikke' : 'Farge på'} ${d.navn}`}
                    value={eneFarge ? (med(d.id) ? fargeValg[0]!.id : '') : (med(d.id) ?? '')}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      sett([d.id], v || null);
                    }}
                  >
                    <option value="">Ikke med</option>
                    {fargeValg.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.navn}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <p class="merknad">
              Det er mange deler, så de vises bare i tegningen. Velg med klikk eller en ramme.
            </p>
          )}

          <p role="status">
            {antallMed} av {deler.deler.length} deler er med
            {eneFarge || !fargerBrukt
              ? '.'
              : fargerBrukt === 1
                ? ', i én farge.'
                : `, i ${fargerBrukt} farger.`}
            {!eneFarge &&
              fargerBrukt > 1 &&
              ' Hver farge blir et eget lag på samme nivå, så delene ligger side om side.'}
          </p>

          <label class="felt" for="svgdeler-navn">
            <span>Navn</span>
            <input
              id="svgdeler-navn"
              type="text"
              value={navn}
              onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
            />
          </label>
          {!eneFarge && tekstlag && (
            <div class="felt">
              <span>Legges</span>
              <Segment
                etikett="Hvor delene legges"
                valg={[
                  { id: 'gruppe', navn: `I tekstlaget «${tekstlag.navn}»` },
                  { id: 'eget', navn: 'I eget lag' },
                ]}
                verdi={plass}
                endre={settPlass}
              />
            </div>
          )}

          {melding && (
            <p class="merknad" role="status">
              {melding}
            </p>
          )}
          <p class="dempet">
            Lagres i denne nettleseren, ikke på en server. Et dekor med flere farger beholder fargene i
            galleriet og i et tekstlag; i en CSV-fil får det én farge.
          </p>
        </div>
        <div class="knapperad svgdeler-handlinger">
          <button
            type="button"
            class={opphav === 'galleri' ? 'sekundar' : 'primar'}
            disabled={!bilde}
            onClick={leggPaSkiltet}
          >
            {eneFarge ? 'Bruk som ramme' : 'Legg på skiltet'}
          </button>
          <button
            type="button"
            class={opphav === 'galleri' ? 'primar' : 'sekundar'}
            disabled={!bilde}
            onClick={lagre}
          >
            Lagre i galleriet
          </button>
          <button type="button" class="sekundar" disabled={!bilde} onClick={lastNedSvg}>
            Last ned SVG
          </button>
        </div>
      </div>
    </Dialog>
  );
}
