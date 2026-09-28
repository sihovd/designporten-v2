/** Articulated dragon plug-in: part pickers, inspector and live 3D. */
import type { GeneratorPlugin } from '../../core/generator';
import { DrageDelvelger } from './Delvelger';
import { DrageInspektor } from './Inspektor';
import { drageKjerne } from './kjerne';
import { DrageVrikk } from './Vrikk';

const plugin: GeneratorPlugin = {
  ...drageKjerne,
  // details such as eyes and horns are sunk into the body
  delerOverlapper: true,
  ui: {
    Inspektor: DrageInspektor,
    Bunnbrett: DrageDelvelger,
    Overlegg3d: DrageVrikk,
  },
  hurtigtastListe: [
    ['Tab, så piltaster', 'Bla i delene og variantene nederst'],
    ['Ctrl/Cmd + Z', 'Angre siste bytte'],
  ],
};

export default plugin;
