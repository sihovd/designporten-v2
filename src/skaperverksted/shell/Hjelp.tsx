import type { GeneratorPlugin } from '../core/generator';
import { Dialog } from './Dialog';
import { Hjelpesok } from './Hjelpesok';

const FELLES: [string, string][] = [
  ['Ctrl/Cmd + Z', 'Angre'],
  ['Ctrl/Cmd + Shift + Z', 'Gjør om'],
  ['Ctrl/Cmd + S', 'Lagre prosjektet som fil'],
  ['0', 'Tilpass visningen'],
  ['1', '100 % (1 mm på skjermen er omtrent 1 mm)'],
  ['+ / −', 'Zoom inn / ut'],
  ['Mellomrom + dra, midtknapp', 'Panorer'],
  ['Hjul, to fingre', 'Zoom'],
  ['?', 'Denne oversikten'],
];

export function Hjelp({ plugin, lukk }: { plugin: GeneratorPlugin; lukk: () => void }) {
  const liste = [...FELLES, ...(plugin.hurtigtastListe ?? [])];
  return (
    <Dialog tittel="Hjelp og hurtigtaster" lukk={lukk}>
      {plugin.hjelpeemner && <Hjelpesok emner={plugin.hjelpeemner} klasse="i-dialog" />}
      <dl class="hurtigtaster">
        {liste.map(([k, b]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{b}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
