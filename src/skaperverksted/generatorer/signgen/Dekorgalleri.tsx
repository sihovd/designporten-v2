/**
 * The decoration gallery (Sivert, 2026-10-05): ready-made vector elements
 * to put on a sign, and your own vectors, kept in this browser. A decoration
 * goes into the selected text layer, where it shares the text's outlines,
 * or into a layer of its own. Holes in a vector stay holes.
 */
import { useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { Segment } from '../../shell/kontroller';
import {
  dekorValg,
  DEKOR_KREDIT,
  hentEgneDekor,
  lagreEgetDekor,
  slettEgetDekor,
  type DekorValg,
} from './dekor';
import { leggTilDekor, tekstlagForDekor, type Dekorplass } from './handlinger';
import { importerSvg, SvgFeil } from './svgimport';
import { signtilstand } from './tilstand';

function Miniatyr({ v }: { v: DekorValg }) {
  const f = v.forhandsvisning;
  return (
    <svg class="dekor-miniatyr" viewBox={f.viewBox} aria-hidden="true" focusable="false">
      <path d={f.d} fill="currentColor" fill-rule="nonzero" transform={f.flipp ? 'scale(1,-1)' : undefined} />
    </svg>
  );
}

export function Dekorgalleri({ benk }: { benk: Arbeidsbenk }) {
  const [egne, settEgne] = useState(() => hentEgneDekor());
  const tekstlag = tekstlagForDekor(benk);
  const [plass, settPlass] = useState<Dekorplass>(tekstlag ? 'gruppe' : 'eget');
  const [melding, settMelding] = useState<string | null>(null);
  const fil = useRef<HTMLInputElement>(null);
  const valg = dekorValg(egne);
  const innebygde = valg.filter((v) => !v.egen);
  const mine = valg.filter((v) => v.egen);

  const lukk = () => signtilstand(benk).sett({ dekor: false });
  const sett = (v: DekorValg) => {
    leggTilDekor(benk, v.navn, v.lag(), plass === 'gruppe' && tekstlag ? 'gruppe' : 'eget');
    lukk();
  };
  const leggTilEgen = async (f: File) => {
    settMelding(null);
    if (f.size > 2 * 1024 * 1024) {
      settMelding('SVG-filen er større enn 2 MB. Forenkle vektoren og prøv igjen.');
      return;
    }
    try {
      const r = importerSvg(await f.text(), f.name);
      const navn = f.name.replace(/\.svg$/i, '');
      const lagret = lagreEgetDekor(navn, r);
      if (!lagret) {
        settMelding(
          'Nettleseren fikk ikke lagret vektoren (for mye data). Den legges på skiltet uten å bli i galleriet.',
        );
        leggTilDekor(benk, navn, r, plass === 'gruppe' && tekstlag ? 'gruppe' : 'eget');
        lukk();
        return;
      }
      settEgne(hentEgneDekor());
      const hull = r.kilde.stier.some((s) => (s.match(/M/g)?.length ?? 0) > 1);
      settMelding(
        `«${navn}» er lagt i galleriet.${hull ? ' Hull i vektoren er beholdt.' : ''}${
          r.hoppetOver.length ? ` Hoppet over: ${r.hoppetOver.join(', ')}.` : ''
        }`,
      );
      benk.melde(`«${navn}» er lagt i galleriet.`);
    } catch (e) {
      settMelding(e instanceof SvgFeil ? e.message : 'SVG-filen kunne ikke leses.');
    }
  };

  return (
    <Dialog tittel="Dekor" lukk={lukk} klasse="dekorgalleri">
      <div class="dekor-innhold">
        <p class="dempet">
          Velg et dekor for å legge det på skiltet. Hull i dekoret beholdes som hull. Du kan også legge til
          din egen vektor (SVG).
        </p>
        <div class="felt">
          <span>Legges</span>
          <Segment
            etikett="Hvor dekoret legges"
            valg={[
              { id: 'gruppe', navn: tekstlag ? `I tekstlaget «${tekstlag.navn}»` : 'I tekstlaget' },
              { id: 'eget', navn: 'I eget lag' },
            ]}
            verdi={plass === 'gruppe' && tekstlag ? 'gruppe' : 'eget'}
            endre={(v) =>
              v === 'gruppe' && !tekstlag ? settMelding('Velg et tekstlag først.') : settPlass(v)
            }
          />
        </div>
        <p class="merknad">
          {plass === 'gruppe' && tekstlag
            ? 'Dekoret grupperes med teksten og får samme omriss. Du kan dra det ut til et eget lag i lagpanelet.'
            : 'Dekoret får et eget lag med egen farge og høyde. Du kan dra det inn i et tekstlag for å dele omriss.'}
        </p>
        <ul class="dekor-rutenett" role="list" aria-label="Ferdige dekor">
          {innebygde.map((v) => (
            <li key={v.id}>
              <button type="button" class="dekor-valg" onClick={() => sett(v)}>
                <Miniatyr v={v} />
                <span>{v.navn}</span>
              </button>
            </li>
          ))}
        </ul>
        <h3>Dine egne</h3>
        {mine.length === 0 && (
          <p class="dempet">
            Ingen ennå. Legg til en SVG med knappen under; den blir lagret i denne nettleseren.
          </p>
        )}
        {mine.length > 0 && (
          <ul class="dekor-rutenett" role="list" aria-label="Dine egne dekor">
            {mine.map((v) => (
              <li key={v.id}>
                <button type="button" class="dekor-valg" onClick={() => sett(v)}>
                  <Miniatyr v={v} />
                  <span>{v.navn}</span>
                </button>
                <button
                  type="button"
                  class="kontroll-knapp farlig"
                  onClick={() => {
                    slettEgetDekor(v.id);
                    settEgne(hentEgneDekor());
                  }}
                >
                  Fjern
                  <span class="visuelt-skjult"> {v.navn} fra galleriet</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div class="knapperad">
          <button type="button" class="sekundar" onClick={() => fil.current?.click()}>
            Legg til egen vektor (SVG)
          </button>
        </div>
        <input
          ref={fil}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) void leggTilEgen(f);
            (e.target as HTMLInputElement).value = '';
          }}
        />
        {melding && (
          <p class="merknad" role="status">
            {melding}
          </p>
        )}
        <p class="merknad">
          Vektorer med hull (for eksempel åpningene i en sommerfugl) beholder hullene. Under «Hull i vektoren»
          på dekoret kan du i stedet fylle dem igjen, så bare omrisset blir igjen. Med dekoret som batchfelt
          kan en kolonne i CSV-filen bytte dekor fra skilt til skilt, med navnet på dekoret i cellen.
        </p>
        <p class="dempet">{DEKOR_KREDIT}</p>
      </div>
    </Dialog>
  );
}
