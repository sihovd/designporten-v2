/**
 * The decoration gallery (Sivert, 2026-10-05, made compact like an emoji picker on 2026-10-08): a row of
 * themes on top, a scrolling grid below. Holding the pointer over an element gives two choices: «Sett inn»
 * puts the whole element on the sign, «Velg deler» opens the part picker so only some of its parts are
 * imported. Your own vectors work the same way. A decoration goes into the selected text layer, where it
 * shares the text's outlines, or into a layer of its own. Holes in a vector stay holes.
 */
import { useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnMateriale } from '../../core/materialer';
import { Dialog } from '../../shell/Dialog';
import { Ikon } from '../../shell/ikoner';
import { Segment } from '../../shell/kontroller';
import {
  dekorSvgTekst,
  dekorValg,
  DEKOR_KATEGORIER,
  DEKOR_KREDIT,
  DEKOR_LISENS_URL,
  hentEgneDekor,
  lagreEgetDekor,
  slettEgetDekor,
  type DekorValg,
} from './dekor';
import {
  behandleSvg,
  leggTilDekor,
  leggTilFlerfarget,
  lesSvgFil,
  tekstlagForDekor,
  type Dekorplass,
} from './handlinger';
import { lagreValgteSomDekor } from './dekorlagring';
import { delerTilKilde, lesSvgDeler, SvgFeil } from './svgimport';
import { signtilstand } from './tilstand';

function Miniatyr({ v }: { v: DekorValg }) {
  const f = v.forhandsvisning;
  return (
    <svg class="dekor-miniatyr" viewBox={f.viewBox} aria-hidden="true" focusable="false">
      <path d={f.d} fill="currentColor" fill-rule="nonzero" transform={f.flipp ? 'scale(1,-1)' : undefined} />
    </svg>
  );
}

type Valgt = (typeof DEKOR_KATEGORIER)[number]['id'] | 'egne';

/** The theme last open, so the gallery comes back to it after the part picker has been used. */
let sisteKategori: Valgt = 'symboler';

export function Dekorgalleri({ benk }: { benk: Arbeidsbenk }) {
  const [egne, settEgne] = useState(() => hentEgneDekor());
  const tekstlag = tekstlagForDekor(benk);
  const [plass, settPlass] = useState<Dekorplass>(tekstlag ? 'gruppe' : 'eget');
  const [melding, settMelding] = useState<string | null>(null);
  const [kategori, settKategoriState] = useState<Valgt>(sisteKategori);
  const [sok, settSok] = useState('');
  const fil = useRef<HTMLInputElement>(null);
  const valg = dekorValg(egne);
  const settKategori = (k: Valgt) => {
    sisteKategori = k;
    settKategoriState(k);
    settSok('');
  };

  const ord = sok.trim().toLowerCase();
  const synlige = ord
    ? valg.filter((v) => v.navn.toLowerCase().includes(ord))
    : valg.filter((v) => (kategori === 'egne' ? v.egen : v.kategori === kategori));

  const lukk = () => signtilstand(benk).sett({ dekor: false });
  const sted = () => (plass === 'gruppe' && tekstlag ? 'gruppe' : 'eget');
  const sett = (v: DekorValg) => {
    // a vector saved with several colours keeps them, in a layer per colour
    if (v.flerfarget) leggTilFlerfarget(benk, v.flerfarget(), 'pynt', sted());
    else leggTilDekor(benk, v.navn, v.lag(), sted());
    lukk();
  };
  const velgDeler = (v: DekorValg) => {
    settMelding(null);
    try {
      const deler = lesSvgDeler(
        dekorSvgTekst(v, (id) => finnMateriale(id).hex),
        `${v.navn}.svg`,
      );
      if (deler.deler.length < 2) {
        settMelding(`«${v.navn}» har bare én del. Bruk «Sett inn».`);
        return;
      }
      behandleSvg(benk, deler, 'pynt', 'galleri');
    } catch (e) {
      settMelding(e instanceof SvgFeil ? e.message : 'Delene i dekoret kunne ikke leses.');
    }
  };
  const leggTilEgen = async (f: File) => {
    settMelding(null);
    const deler = await lesSvgFil(benk, f, 2);
    if (!deler) {
      settMelding('SVG-filen kunne ikke leses, eller den er større enn 2 MB.');
      return;
    }
    // several parts: the part picker lets the user keep some, colour them and save them
    sisteKategori = 'egne';
    if (behandleSvg(benk, deler, 'pynt', 'galleri') === 'apnet') return;
    const r = delerTilKilde(deler, f.name);
    if (!r) {
      settMelding('Formene i SVG-en har ingen flate.');
      return;
    }
    const navn = f.name.replace(/\.svg$/i, '');
    const lagret = lagreEgetDekor(navn, r);
    if (!lagret) {
      settMelding(
        'Nettleseren fikk ikke lagret vektoren (for mye data). Den legges på skiltet uten å bli i galleriet.',
      );
      leggTilDekor(benk, navn, r, sted());
      lukk();
      return;
    }
    settEgne(hentEgneDekor());
    settKategori('egne');
    const hull = r.kilde.stier.some((s) => (s.match(/M/g)?.length ?? 0) > 1);
    settMelding(
      `«${navn}» er lagt i galleriet.${hull ? ' Hull i vektoren er beholdt.' : ''}${
        r.hoppetOver.length ? ` Hoppet over: ${r.hoppetOver.join(', ')}.` : ''
      }`,
    );
    benk.melde(`«${navn}» er lagt i galleriet.`);
  };

  return (
    <Dialog tittel="Dekor" lukk={lukk} klasse="dekorgalleri">
      <div class="dekor-innhold">
        <div class="dekor-kategorier" role="group" aria-label="Temaer">
          {DEKOR_KATEGORIER.map((k) => {
            const symbol = valg.find((v) => v.id === k.symbol);
            return (
              <button
                key={k.id}
                type="button"
                class="dekor-kategori"
                aria-pressed={!ord && kategori === k.id}
                aria-label={k.navn}
                title={k.navn}
                onClick={() => settKategori(k.id)}
              >
                {symbol ? <Miniatyr v={symbol} /> : k.navn.slice(0, 1)}
              </button>
            );
          })}
          <button
            type="button"
            class="dekor-kategori"
            aria-pressed={!ord && kategori === 'egne'}
            aria-label={`Dine egne (${egne.length})`}
            title="Dine egne"
            onClick={() => settKategori('egne')}
          >
            <Ikon id="favorites" storrelse={26} />
          </button>
          <input
            type="search"
            class="dekor-sok"
            aria-label="Søk i dekor"
            placeholder="Søk"
            value={sok}
            onInput={(e) => settSok((e.target as HTMLInputElement).value)}
          />
        </div>
        <ul class="dekor-rutenett" role="list" aria-label={ord ? 'Søkeresultat' : 'Dekor'}>
          {synlige.map((v) => (
            <li key={v.id} class="dekor-celle">
              <span class="dekor-flis" title={v.navn}>
                <Miniatyr v={v} />
              </span>
              <span class="dekor-handlinger">
                <button type="button" class="dekor-handling" onClick={() => sett(v)}>
                  Sett inn<span class="visuelt-skjult"> {v.navn}</span>
                </button>
                <button type="button" class="dekor-handling" onClick={() => velgDeler(v)}>
                  Velg deler<span class="visuelt-skjult"> av {v.navn}</span>
                </button>
                {v.egen && (
                  <button
                    type="button"
                    class="dekor-handling farlig"
                    onClick={() => {
                      slettEgetDekor(v.id);
                      settEgne(hentEgneDekor());
                    }}
                  >
                    Fjern<span class="visuelt-skjult"> {v.navn} fra galleriet</span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {synlige.length === 0 && (
          <p class="dempet">
            {ord
              ? 'Ingen dekor passer.'
              : kategori === 'egne'
                ? 'Ingen egne ennå. Legg til en SVG, eller marker vektorer på lerretet og velg «Lagre dekorelement».'
                : 'Ingen dekor her.'}
          </p>
        )}
        <div class="knapperad dekor-bunn">
          <button type="button" class="sekundar" onClick={() => fil.current?.click()}>
            Legg til egen vektor (SVG)
          </button>
          <Segment
            etikett="Hvor dekoret legges"
            valg={[
              { id: 'gruppe', navn: 'I tekstlaget' },
              { id: 'eget', navn: 'I eget lag' },
            ]}
            verdi={sted()}
            endre={(v) =>
              v === 'gruppe' && !tekstlag ? settMelding('Velg et tekstlag først.') : settPlass(v)
            }
          />
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
        <p class="dempet dekor-kreditt">
          {DEKOR_KREDIT}{' '}
          <a href={DEKOR_LISENS_URL} target="_blank" rel="noreferrer">
            Lisens og merknad
          </a>
        </p>
      </div>
    </Dialog>
  );
}

/** Name the selected vectors and keep them in the gallery under «Dine egne». */
export function Dekorlagringsvindu({ benk }: { benk: Arbeidsbenk }) {
  const [navn, settNavn] = useState('Mitt dekor');
  const lukk = () => signtilstand(benk).sett({ lagreDekor: false });
  return (
    <Dialog tittel="Lagre dekorelement" lukk={lukk} klasse="dekorlagring">
      <form
        class="dekor-innhold"
        onSubmit={(e) => {
          e.preventDefault();
          if (lagreValgteSomDekor(benk, navn)) lukk();
        }}
      >
        <label class="felt stablet">
          <span>Navn på dekoret</span>
          <input
            type="text"
            maxLength={40}
            value={navn}
            onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
          />
        </label>
        <p class="merknad">
          Vektorene du har markert, lagres som ett dekor med fargene sine. Det ligger i denne nettleseren
          under «Dine egne» og kan settes inn som helhet eller del for del.
        </p>
        <div class="knapperad">
          <button type="submit" class="primar" disabled={!navn.trim()}>
            Lagre dekor
          </button>
          <button type="button" class="sekundar" onClick={lukk}>
            Avbryt
          </button>
        </div>
      </form>
    </Dialog>
  );
}
