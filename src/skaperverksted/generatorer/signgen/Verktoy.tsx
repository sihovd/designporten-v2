/** Signgen tool rail. Text labels with a letter shortcut; no invented icon art (D-3). */
import { useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { brukSigntilstand, signtilstand, type VerktoyId } from './tilstand';
import { importerSvgSom } from './handlinger';
import { startErValgt } from './dokument';
import { Fargeprofilvindu } from './Fargeprofilvindu';
import { Dekorgalleri } from './Dekorgalleri';
import { Delvelger } from './Delvelger';
import { Batchdialog } from './Batch';

export const VERKTOY: { id: VerktoyId; navn: string; tast: string; tegn: string; hjelp: string }[] = [
  { id: 'velg', navn: 'Velg', tast: 'V', tegn: 'V', hjelp: 'Velg, flytt, skaler og roter' },
  { id: 'tekst', navn: 'Tekst', tast: 'T', tegn: 'T', hjelp: 'Klikk på lerretet for å skrive' },
  { id: 'rektangel', navn: 'Rektangel', tast: 'R', tegn: 'R', hjelp: 'Dra for å tegne et rektangel' },
  { id: 'ellipse', navn: 'Ellipse', tast: 'E', tegn: 'E', hjelp: 'Dra for å tegne en ellipse' },
  { id: 'polygon', navn: 'Polygon', tast: 'P', tegn: 'P', hjelp: 'Dra for å tegne en mangekant' },
  {
    id: 'penn',
    navn: 'Penn',
    tast: 'B',
    tegn: 'B',
    hjelp: 'Tegn en kurve: klikk for hjørne, dra for jevn kurve, klikk første punkt for å lukke',
  },
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

/** The tool rail's SVG button: a decoration in a layer of its own. */
export function importerSvgFil(benk: Arbeidsbenk, fil: File): Promise<void> {
  return importerSvgSom(benk, fil, 'pynt');
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
      <button
        type="button"
        class="verktoy"
        title="Legg til en SVG som pynt. Har den flere deler, velger du hvilke du vil ha og farger dem. Ramme: + Nytt lag i lagpanelet"
        onClick={() => fil.current?.click()}
      >
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
      <button
        type="button"
        class="verktoy"
        title="Legg til et dekor fra galleriet, eller din egen vektor"
        onClick={() => signtilstand(benk).sett({ dekor: true })}
      >
        <span class="verktoy-tegn" aria-hidden="true">
          D
        </span>
        Dekor
      </button>
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
      {(!startErValgt(t.dok) || st.fargeprofil) && <Fargeprofilvindu benk={benk} />}
      {st.dekor && <Dekorgalleri benk={benk} />}
      {st.svgdeler && <Delvelger benk={benk} oppgave={st.svgdeler} />}
      {st.batch && <Batchdialog benk={benk} lukk={() => signtilstand(benk).sett({ batch: false })} />}
    </>
  );
}
