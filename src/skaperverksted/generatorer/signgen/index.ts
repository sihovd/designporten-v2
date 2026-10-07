/** Signgen plug-in: 3D-printed signs and nameplates, built layer by layer. */
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { mal } from '../../shell/mal';
import { meta } from './meta';
import { fargeplasser, nyttSigngenDokument, ordneTekstlag } from './dokument';
import { byggSigngen } from './modell';
import { SigngenLerret } from './SigngenLerret';
import { SigngenVerktoy, VERKTOY } from './Verktoy';
import { Lagpanel } from './Lagpanel';
import { SigngenInspektor } from './Inspektor';
import { ARBEIDSROM, PANELER } from './paneler';
import { signtilstand } from './tilstand';
import { dupliserValgte, flyttValgte, slettValgte, velgAlle } from './handlinger';
import { avsluttKurveredigering, dyttValgte, settKurve, slettKurveValg } from './kurver';
import { angrePennpunkt, fullforPenn, pennPagar } from './Pennverktoy';

const plugin: GeneratorPlugin = {
  ...meta,
  visninger: ['2d', '3d'],
  nyttDokument: nyttSigngenDokument,
  lesInn: ordneTekstlag,
  byggModell: byggSigngen,
  ui: {
    Lerret2d: SigngenLerret,
    Verktoy: SigngenVerktoy,
    Venstrepanel: Lagpanel,
    Inspektor: SigngenInspektor,
    Paneler: PANELER,
    Arbeidsrom: ARBEIDSROM,
  },
  hurtigtaster(e, benk) {
    const mod = e.ctrlKey || e.metaKey;
    const tast = e.key.toLowerCase();
    const lager = signtilstand(benk);
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
    ['V T R E P B H M', 'Velg, Tekst, Rektangel, Ellipse, Polygon, Penn, Hull, Mål'],
    ['Shift + klikk, dra rundt', 'Velg flere'],
    ['Ctrl/Cmd + A', 'Velg alt i laget'],
    ['Piltaster', 'Flytt 1 mm (Shift: 10 mm)'],
    ['Ctrl/Cmd + D', 'Dupliser'],
    ['Delete', 'Slett'],
    ['Shift mens du drar', 'Lås retning / fri skalering'],
    ['Alt mens du drar', 'Uten snapping'],
    ['Dobbeltklikk på tekst', 'Rediger teksten'],
    ['Dobbeltklikk på en SVG', 'Rediger punkter og kurver'],
    ['Penn: klikk / dra', 'Hjørnepunkt / jevn kurve (Alt: bare neste håndtak)'],
    ['Penn: Enter, dobbeltklikk', 'Fullfør åpen bane (klikk første punkt lukker)'],
    ['Punkter: Delete, piler', 'Slett punkt, kurve eller form · flytt 0,1 mm (Shift: 1 mm)'],
    ['Dobbeltklikk på kurve / punkt', 'Legg til punkt / bytt mellom hjørne og jevn'],
    ['Esc', 'Tilbake til Velg / fjern utvalg'],
  ],
  eksport(_dok, _modell, benk) {
    if (!benk) return {};
    return {
      handlinger: [
        {
          navn: 'Eksporter via CSV',
          hjelp: 'Lag ett skilt per rad i en CSV-fil, med forhåndsvisning av byggeplatene',
          kjor: () => signtilstand(benk).sett({ batch: true }),
        },
      ],
    };
  },
  bestilling(dok, modell) {
    const m = mal(modell.deler);
    const farger = [...new Set(modell.deler.map((d) => finnMateriale(d.materialId).navn))];
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
