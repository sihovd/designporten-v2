/** Signgen plug-in: 3D-printed signs and nameplates, built layer by layer. */
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { mal } from '../../shell/mal';
import { meta } from './meta';
import { nyttSigngenDokument } from './dokument';
import { byggSigngen } from './modell';
import { SigngenLerret } from './SigngenLerret';
import { SigngenVerktoy, VERKTOY } from './Verktoy';
import { Lagpanel } from './Lagpanel';
import { SigngenInspektor } from './Inspektor';
import { signtilstand } from './tilstand';
import { dupliserValgte, flyttValgte, slettValgte, velgAlle } from './handlinger';

const plugin: GeneratorPlugin = {
  ...meta,
  visninger: ['2d', '3d'],
  nyttDokument: nyttSigngenDokument,
  byggModell: byggSigngen,
  ui: {
    Lerret2d: SigngenLerret,
    Verktoy: SigngenVerktoy,
    Venstrepanel: Lagpanel,
    Inspektor: SigngenInspektor,
  },
  hurtigtaster(e, benk) {
    const mod = e.ctrlKey || e.metaKey;
    const tast = e.key.toLowerCase();
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
    ['V T R E P H M', 'Velg, Tekst, Rektangel, Ellipse, Polygon, Hull, Mål'],
    ['Shift + klikk, dra rundt', 'Velg flere'],
    ['Ctrl/Cmd + A', 'Velg alt i laget'],
    ['Piltaster', 'Flytt 1 mm (Shift: 10 mm)'],
    ['Ctrl/Cmd + D', 'Dupliser'],
    ['Delete', 'Slett'],
    ['Shift mens du drar', 'Lås retning / fri skalering'],
    ['Alt mens du drar', 'Uten snapping'],
    ['Dobbeltklikk på tekst', 'Rediger teksten'],
    ['Esc', 'Tilbake til Velg / fjern utvalg'],
  ],
  bestilling(dok, modell) {
    const m = mal(modell.deler);
    const farger = [...new Set(modell.deler.map((d) => finnMateriale(d.materialId).navn))];
    return {
      produktId: 'skaperverksted-signgen',
      navn: `Skilt fra Signgen: ${dok.navn}`,
      valg: {
        Mål: m ? `${tall(m.bredde)} × ${tall(m.dybde)} × ${tall(m.hoyde)} mm` : 'ukjent',
        Lag: String(dok.lag.filter((l) => l.synlig).length),
        Farger: farger.join(', '),
      },
    };
  },
};

export default plugin;
