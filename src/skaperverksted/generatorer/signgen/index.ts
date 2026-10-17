/** Signgen plug-in: 3D-printed signs and nameplates, built layer by layer. */
import type { GeneratorPlugin } from '../../core/generator';
import { fargekode, finnMateriale } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { mal } from '../../shell/mal';
import { meta } from './meta';
import { Filvalg } from './Maldialog';
import { Innstillingsvalg } from './Prosjektinnstillinger';
import { fargeplasser, lesInnSigngen, nyttSigngenDokument } from './dokument';
import { byggSigngen, forelopigMal } from './modell';
import { endreUtkastSider, SigngenLerret } from './SigngenLerret';
import { SigngenVerktoy, VERKTOY } from './Verktoy';
import { Lagpanel } from './Lagpanel';
import { Kontekstlinje } from './Kontekstlinje';
import { HJELPEEMNER } from './hjelpeemner';
import { SigngenInspektor } from './Inspektor';
import { ARBEIDSROM, PANELER } from './paneler';
import { signtilstand } from './tilstand';
import { apneCsv } from './csvhandlinger';
import { DELINGSMERKNAD, delSkilt } from './deling';
import { kontoMulig } from '@/lib/konto/api';
import { SigngenBunnbrett } from './Bunnbrett';
import { dupliserValgte, flyttValgte, slettValgte, velgAlle } from './handlinger';
import { avsluttKurveredigering, dyttValgte, settKurve, slettKurveValg } from './kurver';
import { fjernStrekpunkt, valgtStrekpunkt } from './strekpunkter';
import { angrePennpunkt, fullforPenn, pennPagar } from './Pennverktoy';
import { flyttHjelpelinjeTil, hjelpelinjerAv, slettHjelpelinjeI } from './hjelpelinjer';

const plugin: GeneratorPlugin = {
  ...meta,
  visninger: ['2d', '3d'],
  flate: 'lys',
  nyttDokument: nyttSigngenDokument,
  lesInn: lesInnSigngen,
  byggModell: byggSigngen,
  forelopigMal,
  ui: {
    Lerret2d: SigngenLerret,
    Verktoy: SigngenVerktoy,
    Venstrepanel: Lagpanel,
    Inspektor: SigngenInspektor,
    Paneler: PANELER,
    Arbeidsrom: ARBEIDSROM,
    Filvalg: Filvalg,
    Innstillingsvalg: Innstillingsvalg,
    Bunnbrett: SigngenBunnbrett,
    Kontekstlinje: Kontekstlinje,
  },
  gjestelagring: { maksDager: 30 },
  hjelpeemner: HJELPEEMNER,
  bunnbrettNavn: 'Nederst i editoren',
  hurtigtaster(e, benk) {
    const mod = e.ctrlKey || e.metaKey;
    const tast = e.key.toLowerCase();
    const lager = signtilstand(benk);
    if (lager.t.utkastForm?.form === 'polygon' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      endreUtkastSider(benk, e.key === 'ArrowUp' ? 1 : -1);
      return true;
    }
    if (lager.t.verktoy === 'penn') {
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (pennPagar(benk)) fullforPenn(benk, false);
        else lager.sett({ verktoy: 'velg', penn: null });
        return true;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && angrePennpunkt(benk)) return true;
    } else if (lager.t.kurve && lager.t.verktoy === 'velg') {
      const k = lager.t.kurve;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!slettKurveValg(benk)) benk.melde('Velg et punkt, en kurve eller en form å slette først.');
        return true;
      }
      if (e.key === 'Enter') {
        avsluttKurveredigering(benk);
        return true;
      }
      if (e.key === 'Escape') {
        if (k.noder.length || k.baner.length || k.segment)
          settKurve(benk, { noder: [], baner: [], segment: null });
        else avsluttKurveredigering(benk);
        return true;
      }
      const retning: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      const r = retning[e.key];
      if (r) {
        const s = e.shiftKey ? 1 : 0.1;
        if (dyttValgte(benk, r[0] * s, r[1] * s)) return true;
      }
    }
    // a centre-line point of a Paint stroke chosen on the canvas takes Delete
    const sp = valgtStrekpunkt(benk);
    if (
      sp &&
      (e.key === 'Delete' || e.key === 'Backspace') &&
      benk.tilstand.utvalg.objekter.includes(sp.id)
    ) {
      fjernStrekpunkt(benk, sp.id, sp.indeks);
      return true;
    }
    // a guide line chosen on the canvas or in the Justér panel takes the keys while no object is
    const guide = lager.t.valgtGuide
      ? hjelpelinjerAv(benk.dok).find((g) => g.id === lager.t.valgtGuide)
      : undefined;
    if (guide && !benk.tilstand.utvalg.objekter.length) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!guide.last) {
          slettHjelpelinjeI(benk, guide.id);
          lager.sett({ valgtGuide: null });
          benk.melde('Hjelpelinjen er slettet.');
        }
        return true;
      }
      const pil: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
      const retning = e.key.startsWith('Arrow') ? pil[e.key] : undefined;
      const lodd = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (retning !== undefined && lodd === (guide.akse === 'x')) {
        if (!guide.last)
          flyttHjelpelinjeTil(benk, guide.id, guide.verdi + retning * (e.shiftKey ? 10 : 1), 'guide-pil');
        return true;
      }
      if (e.key === 'Escape') {
        lager.sett({ valgtGuide: null });
        return true;
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      slettValgte(benk);
      return true;
    }
    if (mod && tast === 'd') {
      dupliserValgte(benk);
      return true;
    }
    if (mod && tast === 'a') {
      velgAlle(benk);
      return true;
    }
    if (e.key === 'Escape') {
      const st = signtilstand(benk);
      if (st.t.verktoy !== 'velg' || st.t.maling) st.sett({ verktoy: 'velg', maling: null });
      else benk.velg({ objekter: [] });
      return true;
    }
    const piler: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const pil = piler[e.key];
    if (pil && benk.tilstand.utvalg.objekter.length) {
      const s = e.shiftKey ? 10 : 1;
      flyttValgte(benk, pil[0] * s, pil[1] * s);
      return true;
    }
    if (!mod && !e.altKey) {
      const v = VERKTOY.find((x) => x.tast.toLowerCase() === tast && x.tast.length === 1);
      if (v) {
        if (benk.tilstand.innstillinger.visning !== '2d') benk.settInnstillinger({ visning: '2d' });
        signtilstand(benk).sett({ verktoy: v.id, maling: null });
        return true;
      }
    }
    return false;
  },
  hurtigtastListe: [
    ['V T R E P B F H M', 'Velg, Tekst, Rektangel, Ellipse, Polygon, Penn, Paint, Hull, Mål'],
    ['Mangekant: musehjul, ↑ ↓ mens du drar', 'Flere eller færre sider (3 sider = trekant)'],
    ['Shift + klikk, dra rundt', 'Velg flere'],
    ['Ctrl/Cmd + A', 'Velg alt i laget'],
    ['Piltaster', 'Flytt 1 mm (Shift: 10 mm)'],
    ['Ctrl/Cmd + D', 'Dupliser'],
    ['Delete', 'Slett'],
    ['Shift mens du drar', 'Lås retningen til 45° / fri skalering'],
    ['Alt mens du drar', 'Uten snapping'],
    ['Dobbeltklikk på tekst', 'Rediger teksten'],
    ['Dobbeltklikk på en SVG', 'Rediger punkter og kurver'],
    ['Penn: klikk / dra', 'Hjørnepunkt / jevn kurve (Alt: bare neste håndtak)'],
    ['Penn: hold Space mens du setter punktet', 'Flytt punktet i stedet for å dra ut håndtak'],
    ['Penn: Shift', 'Neste segment (eller håndtaket) låses til 45°'],
    ['Paint: dra', 'Mal et strøk; bredde, breddepunkter, Smooth og tupp endres etterpå'],
    ['Penn: Enter, dobbeltklikk', 'Fullfør åpen bane (klikk første punkt lukker)'],
    ['Alt + klikk på strekens linje', 'Nytt punkt på senterlinjen (Delete fjerner det valgte punktet)'],
    ['Punkter: Delete, piler', 'Slett punkt, kurve eller form · flytt 0,1 mm (Shift: 1 mm)'],
    ['Dobbeltklikk på kurve / punkt', 'Legg til punkt / bytt mellom hjørne og jevn'],
    ['Dra ut fra linjalen', 'Ny hjelpelinje (dra tilbake på linjalen for å fjerne den)'],
    ['Valgt hjelpelinje: piler, Delete', 'Flytt 1 mm (Shift: 10 mm) · slett'],
    ['Esc', 'Tilbake til Velg / fjern utvalg'],
  ],
  eksport(_dok, _modell, benk) {
    if (!benk) return {};
    return {
      ...(kontoMulig ? { merknad: DELINGSMERKNAD, etterEksport: () => void delSkilt(benk) } : {}),
      handlinger: [
        {
          navn: 'Eksporter via CSV',
          hjelp: 'Lag ett skilt per rad i en CSV-fil, med forhåndsvisning av byggeplatene',
          kjor: () => apneCsv(benk),
        },
      ],
    };
  },
  bestilling(dok, modell) {
    const m = mal(modell.deler);
    const farger = [...new Set(modell.deler.map((d) => fargekode(finnMateriale(d.materialId))))];
    return {
      produktId: 'skaperverksted-signgen',
      navn: `Skilt fra Sign Forge: ${dok.navn}`,
      valg: {
        Mål: m ? `${tall(m.bredde)} × ${tall(m.dybde)} × ${tall(m.hoyde)} mm` : 'ukjent',
        Lag: String(dok.lag.filter((l) => l.synlig).length),
        Deler: String(fargeplasser(dok).length),
        Farger: farger.join(', '),
      },
    };
  },
};

export default plugin;
