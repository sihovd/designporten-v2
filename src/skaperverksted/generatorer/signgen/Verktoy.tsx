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
import { brukSigntilstand, signtilstand, type Snapmal, type VerktoyId } from './tilstand';
import { importerSvgSom } from './handlinger';
import { startErValgt } from './dokument';
import { Fargeprofilvindu } from './Fargeprofilvindu';
import { Fontvindu } from './Fontvindu';
import { Startside } from './Startside';
import { LagreSomMal, Malbibliotek } from './Maldialog';
import { Dekorgalleri } from './Dekorgalleri';
import { Delvelger } from './Delvelger';
import { Csvflyt } from './Csvflyt';

export const VERKTOY: {
  id: VerktoyId;
  navn: string;
  tast: string;
  ikon: IkonId;
  hjelp: string;
}[] = [
  { id: 'velg', navn: 'Velg', tast: 'V', ikon: 'select', hjelp: 'Velg, flytt, skaler og roter' },
  { id: 'tekst', navn: 'Tekst', tast: 'T', ikon: 'text', hjelp: 'Klikk på lerretet for å skrive' },
  { id: 'rektangel', navn: 'Rektangel', tast: 'R', ikon: 'rectangle', hjelp: 'Dra for å tegne et rektangel' },
  { id: 'ellipse', navn: 'Ellipse', tast: 'E', ikon: 'ellipse', hjelp: 'Dra for å tegne en ellipse' },
  {
    id: 'polygon',
    navn: 'Polygon',
    tast: 'P',
    ikon: 'polygon',
    hjelp: 'Dra for å tegne en mangekant. Musehjulet endrer antall sider mens du drar',
  },
  {
    id: 'trekant',
    navn: 'Trekant',
    tast: '',
    ikon: 'triangle',
    hjelp: 'Dra for å tegne en trekant. Musehjulet gir flere sider mens du drar',
  },
  {
    id: 'penn',
    navn: 'Penn',
    tast: 'B',
    ikon: 'pen',
    hjelp:
      'Tegn en kurve: klikk for hjørne, dra for jevn kurve, klikk første punkt for å lukke. Hold Space mens du setter et punkt for å flytte det, Shift låser til 45°',
  },
  {
    id: 'paint',
    navn: 'Paint',
    tast: 'F',
    ikon: 'paint',
    hjelp:
      'Mal et strøk frihånd. Bredden, breddepunkter, Smooth og tupp kan endres etterpå. Strøket blir en vektor',
  },
  {
    id: 'hull',
    navn: 'Hull',
    tast: 'H',
    ikon: 'hole',
    hjelp: 'Klikk for å lage et opphengshull gjennom skiltet',
  },
  { id: 'mal', navn: 'Mål', tast: 'M', ikon: 'ruler', hjelp: 'Dra for å måle avstander' },
  { id: 'panorer', navn: 'Panorer', tast: 'Space', ikon: 'pan', hjelp: 'Dra for å flytte visningen' },
];

const FORMER: VerktoyId[] = ['rektangel', 'ellipse', 'trekant', 'polygon'];
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
      {enkle(['penn', 'paint', 'hull', 'mal', 'panorer'])}
      <span class="skinne-skille" aria-hidden="true" />
      {hjelpeknapp(
        'SVG',
        'Legg til en SVG som pynt. Har den flere deler, velger du hvilke du vil ha og farger dem. Ramme: + Nytt lag i lagpanelet',
        'svg-import',
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
      {hjelpeknapp('Dekor', 'Legg til et dekor fra galleriet, eller din egen vektor', 'decor-gallery', () =>
        signtilstand(benk).sett({ dekor: true }),
      )}
      <span class="skinne-skille" aria-hidden="true" />
      <Snapverktoy benk={benk} />
      {hjelpeknapp(
        'Rutenett',
        'Rutenett av eller på',
        'grid',
        () => benk.settInnstillinger({ rutenett: !t.innstillinger.rutenett }),
        t.innstillinger.rutenett,
      )}
      {hjelpeknapp(
        'Hjelpelinjer',
        'Vis eller skjul hjelpelinjer. Dra ut fra linjalen for å lage en ny, dra den tilbake for å fjerne den',
        'guides',
        () => benk.settInnstillinger({ hjelpelinjer: !t.innstillinger.hjelpelinjer }),
        t.innstillinger.hjelpelinjer,
      )}
      {!startErValgt(t.dok) && st.startsteg === 'valg' && !st.malvindu && (
        <Startside benk={benk} maksDager={30} />
      )}
      {((!startErValgt(t.dok) && st.startsteg === 'farger') || st.fargeprofil) && (
        <Fargeprofilvindu benk={benk} />
      )}
      {st.malvindu === 'bibliotek' && <Malbibliotek benk={benk} />}
      {st.malvindu === 'lagre' && <LagreSomMal benk={benk} />}
      {st.fontvindu && <Fontvindu benk={benk} />}
      {st.dekor && <Dekorgalleri benk={benk} />}
      {st.svgdeler && <Delvelger benk={benk} oppgave={st.svgdeler} />}
      <Csvflyt benk={benk} />
    </>
  );
}

/** Menu state shared by tool buttons with a list behind them: right-click, long press or the Down arrow opens it. */
function brukVerktoymeny() {
  const [meny, settMeny] = useState<{ x: number; y: number } | null>(null);
  const knapp = useRef<HTMLButtonElement>(null);
  const holdt = useRef<number>(0);
  const langt = useRef(false);
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
  const knappHendelser = {
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      apne();
    },
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      langt.current = false;
      clearTimeout(holdt.current);
      holdt.current = window.setTimeout(() => {
        langt.current = true;
        apne();
      }, 500);
    },
    onPointerUp: () => clearTimeout(holdt.current),
    onPointerLeave: () => clearTimeout(holdt.current),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        apne();
      }
    },
  };
  /** True once for the click that ends a long press (it must not also act). */
  const slukLangtrykk = () => {
    if (!langt.current) return false;
    langt.current = false;
    return true;
  };
  return { meny, settMeny, knapp, apne, knappHendelser, slukLangtrykk };
}

/** The Snap tool: click switches snapping on or off; the list picks what it snaps to. */
function Snapverktoy({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const m = brukVerktoymeny();
  const valg: { id: keyof Snapmal; navn: string }[] = [
    { id: 'rutenett', navn: 'Rutenett' },
    { id: 'hjelpelinjer', navn: 'Hjelpelinjer' },
    { id: 'objekter', navn: 'Kanter og hjørner' },
    { id: 'sentre', navn: 'Midtpunkter' },
  ];
  return (
    <>
      <Tips
        navn="Snap"
        hjelp="Snapping av eller på (hold Alt for å slå av midlertidig). Høyreklikk eller hold inne for å velge hva det snapper til"
      >
        {(p) => (
          <button
            type="button"
            class="verktoy"
            ref={m.knapp}
            aria-label="Snap"
            aria-haspopup="menu"
            aria-expanded={!!m.meny}
            aria-pressed={t.innstillinger.snap}
            onClick={() => {
              if (m.slukLangtrykk()) return;
              benk.settInnstillinger({ snap: !t.innstillinger.snap });
            }}
            {...m.knappHendelser}
            {...p}
          >
            <Ikon id="snap" />
            <span class="verktoy-flere" aria-hidden="true" />
            <span class="verktoy-etikett">Snap</span>
          </button>
        )}
      </Tips>
      {m.meny && (
        <div
          class="verktoymeny"
          role="menu"
          aria-label="Snap til"
          style={{ left: `${m.meny.x}px`, top: `${m.meny.y}px` }}
          ref={(el) => el?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus()}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const alle = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
            const i = alle.indexOf(document.activeElement as HTMLElement);
            alle[(i + d + alle.length) % alle.length]?.focus();
          }}
        >
          {valg.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={st.snapmal[v.id]}
              onClick={() =>
                signtilstand(benk).sett({ snapmal: { ...st.snapmal, [v.id]: !st.snapmal[v.id] } })
              }
            >
              <span class="menyhake" aria-hidden="true">
                {st.snapmal[v.id] ? '✓' : ''}
              </span>
              {v.navn}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * «Former»: one tool for rectangle, ellipse, triangle and polygon. A click picks the
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
  const { meny, settMeny, knapp, apne, knappHendelser, slukLangtrykk } = brukVerktoymeny();
  useEffect(() => {
    if (aktiv && FORMER.includes(aktiv)) settSist(aktiv);
  }, [aktiv]);
  const erAktiv = !!aktiv && FORMER.includes(aktiv);
  void benk;
  return (
    <>
      <Tips
        navn="Former"
        hjelp="Rektangel, ellipse, trekant og polygon. Klikk igjen, høyreklikk eller hold inne for å velge form. Musehjulet endrer antall sider mens du tegner en mangekant"
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
              if (slukLangtrykk()) return;
              if (erAktiv) {
                if (meny) settMeny(null);
                else apne();
              } else {
                velg(sist);
              }
            }}
            {...knappHendelser}
            {...p}
          >
            <Ikon id="shapes" />
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
                {f.tast && <kbd>{f.tast}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
