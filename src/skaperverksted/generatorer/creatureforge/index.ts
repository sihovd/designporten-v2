/** Creature Forge plug-in: the properties panel and the 3D overlay (which holds the bottom body menu). */
import type { GeneratorPlugin } from '../../core/generator';
import { CfEgenskaper } from './Egenskaper';
import { slettDel } from './handlinger';
import { creatureKjerne } from './kjerne';
import { CfOverlegg } from './Overlegg';
import { tilstand } from './tilstand';

const plugin: GeneratorPlugin = {
  ...creatureKjerne,
  ui: {
    Inspektor: CfEgenskaper,
    Overlegg3d: CfOverlegg,
  },
  // a light, calm canvas (handoff: «Lyst, rolig»), unless the user has picked a background in Innstillinger
  tilpass3d(scene) {
    if (scene.lerret.closest('.verksted')?.classList.contains('egen-bakgrunn')) return;
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const cx = c.getContext('2d');
    if (!cx) return;
    const g = cx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#f7f8fb');
    g.addColorStop(0.62, '#eceff5');
    g.addColorStop(1, '#e1e6ef');
    cx.fillStyle = g;
    cx.fillRect(0, 0, c.width, c.height);
    const forrige = scene.scene.background;
    const tex = new scene.three.CanvasTexture(c);
    tex.colorSpace = scene.three.SRGBColorSpace;
    scene.scene.background = tex;
    scene.tegn();
    return () => {
      tex.dispose();
      scene.scene.background = forrige;
    };
  },
  hurtigtaster(e, benk) {
    const t = tilstand(benk);
    if (e.key === 'Escape' && (t.valgt.value || t.dra.value)) {
      t.valgt.value = null;
      t.dra.value = null;
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && t.valgt.value?.type === 'del') {
      slettDel(benk, t.valgt.value.id);
      return true;
    }
    return false;
  },
  hurtigtastListe: [
    ['Esc', 'Fjern valget'],
    ['Delete', 'Slett valgt del og det som henger i den'],
    ['Ctrl/Cmd + Z', 'Angre'],
  ],
  hjelpeemner: [
    {
      sporsmal: 'Hvordan fester jeg en kroppsdel?',
      svar: 'Dra den fra menyen nederst til et markert punkt i visningen, eller klikk den og velg punktet i listen. Den fester seg bare på punkter som passer, med et ledd.',
      ord: 'feste snappunkt dra overkropp',
    },
    {
      sporsmal: 'Hvordan endrer jeg et ledd?',
      svar: 'Klikk den lille ringen der delene møtes. I Egenskaper endrer du avstand, forskyvning, orientering og kuppelen.',
      ord: 'ledd kuppel avstand',
    },
    {
      sporsmal: 'Hva er kuppelen?',
      svar: 'Et negativt volum midt i leddet som skjæres fra begge delene, så de kan bevege seg. Diameter, dybde, vinkel, orientering og tykkelse i sentrum og kanten justeres hver for seg.',
      ord: 'kuppel dome boolean',
    },
    {
      sporsmal: 'Hvordan printes figuren?',
      svar: 'Liggende på ryggen med alle ledd i null. «Printvisning» viser det, og eksporten er alltid i den posisjonen. Leddene er ikke testprintet ennå.',
      ord: 'print eksport stl 3mf',
    },
  ],
};

export default plugin;
