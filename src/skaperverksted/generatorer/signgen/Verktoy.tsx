/** Signgen tool rail. Text labels with a letter shortcut; no invented icon art (D-3). */
import { useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { brukSigntilstand, signtilstand, type VerktoyId } from './tilstand';
import { leggTil } from './handlinger';
import { importerSvg, SvgFeil } from './svgimport';

export const VERKTOY: { id: VerktoyId; navn: string; tast: string; tegn: string; hjelp: string }[] = [
  { id: 'velg', navn: 'Velg', tast: 'V', tegn: 'V', hjelp: 'Velg, flytt, skaler og roter' },
  { id: 'tekst', navn: 'Tekst', tast: 'T', tegn: 'T', hjelp: 'Klikk på lerretet for å skrive' },
  { id: 'rektangel', navn: 'Rektangel', tast: 'R', tegn: 'R', hjelp: 'Dra for å tegne et rektangel' },
  { id: 'ellipse', navn: 'Ellipse', tast: 'E', tegn: 'E', hjelp: 'Dra for å tegne en ellipse' },
  { id: 'polygon', navn: 'Polygon', tast: 'P', tegn: 'P', hjelp: 'Dra for å tegne en mangekant' },
  {
    id: 'hull',
    navn: 'Hull',
    tast: 'H',
    tegn: 'H',
    hjelp: 'Klikk for å lage et opphengshull gjennom skiltet',
  },
  { id: 'mal', navn: 'Mål', tast: 'M', tegn: 'M', hjelp: 'Dra for å måle avstander' },
  { id: 'panorer', navn: 'Panorer', tast: 'Space', tegn: '↔', hjelp: 'Dra for å flytte visningen' },
];

export async function importerSvgFil(benk: Arbeidsbenk, fil: File): Promise<void> {
  if (fil.size > 5 * 1024 * 1024) {
    benk.melde('SVG-filen er større enn 5 MB.');
    return;
  }
  try {
    const r = importerSvg(await fil.text(), fil.name);
    // fit large drawings to the plate's usable size
    const maks = Math.min(benk.dok.plate.bredde, benk.dok.plate.dybde) * 0.8;
    const s = Math.min(1, maks / Math.max(r.bredde, r.hoyde));
    const o = leggTil(benk, r.kilde, { skalaX: s, skalaY: s });
    if (o) {
      const deler = [`«${fil.name}» er importert`];
      if (s < 1) deler.push(`og skalert til ${Math.round(s * 100)} % for å passe på platen`);
      if (r.hoppetOver.length) deler.push(`Hoppet over: ${r.hoppetOver.join(', ')}`);
      benk.melde(`${deler.join('. ')}.`);
    }
  } catch (e) {
    benk.melde(e instanceof SvgFeil ? e.message : 'SVG-filen kunne ikke leses.');
  }
}

export function SigngenVerktoy({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const t = brukBenk(benk);
  const fil = useRef<HTMLInputElement>(null);
  const i2d = t.innstillinger.visning === '2d';
  return (
    <>
      {VERKTOY.map((v) => (
        <button
          key={v.id}
          type="button"
          class="verktoy"
          aria-pressed={i2d && st.verktoy === v.id}
          title={`${v.hjelp} (${v.tast})`}
          onClick={() => {
            if (!i2d) benk.settInnstillinger({ visning: '2d' });
            signtilstand(benk).sett({ verktoy: v.id, maling: null });
          }}
        >
          <span class="verktoy-tegn" aria-hidden="true">
            {v.tegn}
          </span>
          {v.navn}
        </button>
      ))}
      <span class="skinne-skille" aria-hidden="true" />
      <button type="button" class="verktoy" title="Importer en SVG-fil" onClick={() => fil.current?.click()}>
        <span class="verktoy-tegn" aria-hidden="true">
          +
        </span>
        SVG
      </button>
      <input
        ref={fil}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) void importerSvgFil(benk, f);
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <span class="skinne-skille" aria-hidden="true" />
      <button
        type="button"
        class="verktoy"
        aria-pressed={t.innstillinger.snap}
        title="Snapping av eller på (hold Alt for å slå av midlertidig)"
        onClick={() => benk.settInnstillinger({ snap: !t.innstillinger.snap })}
      >
        <span class="verktoy-tegn" aria-hidden="true">
          ⌖
        </span>
        Snap
      </button>
      <button
        type="button"
        class="verktoy"
        aria-pressed={t.innstillinger.rutenett}
        title="Rutenett av eller på"
        onClick={() => benk.settInnstillinger({ rutenett: !t.innstillinger.rutenett })}
      >
        <span class="verktoy-tegn" aria-hidden="true">
          #
        </span>
        Rutenett
      </button>
    </>
  );
}
