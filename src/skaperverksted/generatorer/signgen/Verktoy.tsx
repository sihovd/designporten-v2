/**
 * Signgen tool rail: a slim column of icon buttons. Names, descriptions and
 * shortcuts appear as a hint after hovering (see Tips); the accessible name
 * is always on the button. Icons come from the swappable registry
 * (shell/ikoner.tsx). Small screens show a label under each icon.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Ikon, type IkonId } from '../../shell/ikoner';
import { Tips } from '../../shell/Tips';
import { brukSigntilstand, signtilstand, type VerktoyId } from './tilstand';
import { importerSvgSom } from './handlinger';
import { startErValgt } from './dokument';
import { Fargeprofilvindu } from './Fargeprofilvindu';
import { Dekorgalleri } from './Dekorgalleri';
import { Delvelger } from './Delvelger';
import { Batchdialog } from './Batch';

export const VERKTOY: {
  id: VerktoyId;
  navn: string;
  tast: string;
  ikon: IkonId;
  hjelp: string;
}[] = [
  { id: 'velg', navn: 'Velg', tast: 'V', ikon: 'velg', hjelp: 'Velg, flytt, skaler og roter' },
  { id: 'tekst', navn: 'Tekst', tast: 'T', ikon: 'tekst', hjelp: 'Klikk på lerretet for å skrive' },
  { id: 'rektangel', navn: 'Rektangel', tast: 'R', ikon: 'rektangel', hjelp: 'Dra for å tegne et rektangel' },
  { id: 'ellipse', navn: 'Ellipse', tast: 'E', ikon: 'ellipse', hjelp: 'Dra for å tegne en ellipse' },
  { id: 'polygon', navn: 'Polygon', tast: 'P', ikon: 'polygon', hjelp: 'Dra for å tegne en mangekant' },
  {
    id: 'penn',
    navn: 'Penn',
    tast: 'B',
    ikon: 'penn',
    hjelp: 'Tegn en kurve: klikk for hjørne, dra for jevn kurve, klikk første punkt for å lukke',
  },
  {
    id: 'hull',
    navn: 'Hull',
    tast: 'H',
    ikon: 'hull',
    hjelp: 'Klikk for å lage et opphengshull gjennom skiltet',
  },
  { id: 'mal', navn: 'Mål', tast: 'M', ikon: 'mal', hjelp: 'Dra for å måle avstander' },
  { id: 'panorer', navn: 'Panorer', tast: 'Space', ikon: 'panorer', hjelp: 'Dra for å flytte visningen' },
];

const FORMER: VerktoyId[] = ['rektangel', 'ellipse', 'polygon'];
const verktoyInfo = (id: VerktoyId) => VERKTOY.find((v) => v.id === id)!;

/** The tool rail's SVG button: a decoration in a layer of its own. */
export function importerSvgFil(benk: Arbeidsbenk, fil: File): Promise<void> {
  return importerSvgSom(benk, fil, 'pynt');
}

export function SigngenVerktoy({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const t = brukBenk(benk);
  const fil = useRef<HTMLInputElement>(null);
  const i2d = t.innstillinger.visning === '2d';
  const velg = (id: VerktoyId) => {
    if (!i2d) benk.settInnstillinger({ visning: '2d' });
    signtilstand(benk).sett({ verktoy: id, maling: null });
  };
  const enkle = (ider: VerktoyId[]) =>
    ider.map((id) => {
      const v = verktoyInfo(id);
      return (
        <Tips key={id} navn={v.navn} hjelp={v.hjelp} tast={v.tast}>
          {(p) => (
            <button
              type="button"
              class="verktoy"
              aria-label={v.navn}
              aria-pressed={i2d && st.verktoy === id}
              onClick={() => velg(id)}
              {...p}
            >
              <Ikon id={v.ikon} />
              <span class="verktoy-etikett">{v.navn}</span>
            </button>
          )}
        </Tips>
      );
    });
  const hjelpeknapp = (
    navn: string,
    hjelp: string,
    ikon: IkonId,
    gjor: () => void,
    trykket?: boolean,
    tast?: string,
  ) => (
    <Tips navn={navn} hjelp={hjelp} tast={tast}>
      {(p) => (
        <button type="button" class="verktoy" aria-label={navn} aria-pressed={trykket} onClick={gjor} {...p}>
          <Ikon id={ikon} />
          <span class="verktoy-etikett">{navn}</span>
        </button>
      )}
    </Tips>
  );
  return (
    <>
      {enkle(['velg', 'tekst'])}
      <Formverktoy benk={benk} aktiv={i2d ? st.verktoy : null} velg={velg} />
      {enkle(['penn', 'hull', 'mal', 'panorer'])}
      <span class="skinne-skille" aria-hidden="true" />
      {hjelpeknapp(
        'SVG',
        'Legg til en SVG som pynt. Har den flere deler, velger du hvilke du vil ha og farger dem. Ramme: + Nytt lag i lagpanelet',
        'svg',
        () => fil.current?.click(),
      )}
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
      {hjelpeknapp('Dekor', 'Legg til et dekor fra galleriet, eller din egen vektor', 'dekor', () =>
        signtilstand(benk).sett({ dekor: true }),
      )}
      <span class="skinne-skille" aria-hidden="true" />
      {hjelpeknapp(
        'Snap',
        'Snapping av eller på (hold Alt for å slå av midlertidig)',
        'snap',
        () => benk.settInnstillinger({ snap: !t.innstillinger.snap }),
        t.innstillinger.snap,
      )}
      {hjelpeknapp(
        'Rutenett',
        'Rutenett av eller på',
        'rutenett',
        () => benk.settInnstillinger({ rutenett: !t.innstillinger.rutenett }),
        t.innstillinger.rutenett,
      )}
      {(!startErValgt(t.dok) || st.fargeprofil) && <Fargeprofilvindu benk={benk} />}
      {st.dekor && <Dekorgalleri benk={benk} />}
      {st.svgdeler && <Delvelger benk={benk} oppgave={st.svgdeler} />}
      {st.batch && <Batchdialog benk={benk} lukk={() => signtilstand(benk).sett({ batch: false })} />}
    </>
  );
}

/**
 * «Former»: one tool for rectangle, ellipse and polygon. A click picks the
 * last used shape; a click on the active tool, a right-click, a long press or
 * the Down arrow opens the list. R, E and P still pick a shape directly.
 */
function Formverktoy({
  benk,
  aktiv,
  velg,
}: {
  benk: Arbeidsbenk;
  aktiv: VerktoyId | null;
  velg: (id: VerktoyId) => void;
}) {
  const [sist, settSist] = useState<VerktoyId>('rektangel');
  const [meny, settMeny] = useState<{ x: number; y: number } | null>(null);
  const knapp = useRef<HTMLButtonElement>(null);
  const holdt = useRef<number>(0);
  const langt = useRef(false);
  useEffect(() => {
    if (aktiv && FORMER.includes(aktiv)) settSist(aktiv);
  }, [aktiv]);
  useEffect(() => {
    if (!meny) return;
    const utenfor = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.verktoymeny')) settMeny(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      settMeny(null);
      knapp.current?.focus();
    };
    window.addEventListener('pointerdown', utenfor);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', utenfor);
      window.removeEventListener('keydown', esc, true);
    };
  }, [meny]);
  const apne = () => {
    const r = knapp.current?.getBoundingClientRect();
    if (r) settMeny({ x: r.right + 6, y: r.top });
  };
  const v = verktoyInfo(sist);
  const erAktiv = !!aktiv && FORMER.includes(aktiv);
  void benk;
  return (
    <>
      <Tips
        navn="Former"
        hjelp="Rektangel, ellipse og polygon. Klikk igjen, høyreklikk eller hold inne for å velge form"
        tast="R E P"
      >
        {(p) => (
          <button
            type="button"
            class="verktoy"
            ref={knapp}
            aria-label="Former"
            aria-haspopup="menu"
            aria-expanded={!!meny}
            aria-pressed={erAktiv}
            onClick={() => {
              if (langt.current) {
                langt.current = false;
                return;
              }
              if (erAktiv) {
                if (meny) settMeny(null);
                else apne();
              } else {
                velg(sist);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              apne();
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              langt.current = false;
              clearTimeout(holdt.current);
              holdt.current = window.setTimeout(() => {
                langt.current = true;
                apne();
              }, 500);
            }}
            onPointerUp={() => clearTimeout(holdt.current)}
            onPointerLeave={() => clearTimeout(holdt.current)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                apne();
              }
            }}
            {...p}
          >
            <Ikon id={v.ikon} />
            <span class="verktoy-flere" aria-hidden="true" />
            <span class="verktoy-etikett">Former</span>
          </button>
        )}
      </Tips>
      {meny && (
        <div
          class="verktoymeny"
          role="menu"
          aria-label="Former"
          style={{ left: `${meny.x}px`, top: `${meny.y}px` }}
          ref={(el) => el?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const alle = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
            const i = alle.indexOf(document.activeElement as HTMLElement);
            alle[(i + d + alle.length) % alle.length]?.focus();
          }}
        >
          {FORMER.map((id) => {
            const f = verktoyInfo(id);
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={sist === id}
                onClick={() => {
                  settMeny(null);
                  velg(id);
                }}
              >
                <Ikon id={f.ikon} storrelse={18} />
                {f.navn}
                <kbd>{f.tast}</kbd>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
