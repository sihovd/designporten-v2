/**
 * BuildForge 0.2 saved figures as six fixed segments with a base model
 * each. The modular builder has no fixed structure, so a saved figure is
 * converted when it is read: the body becomes the Main Body, every segment
 * a part from the library with the same shapes and joints, connected the
 * same way, the right side mirrored. The user's shapes are kept exactly.
 * Nothing is stored until the user changes the project.
 */
import { finnKroppsmal, grunnKomponent } from './kroppsbibliotek';
import type { BuildforgeParametre, Forbindelse, Form, Modulkropp } from './parametre';

type Segment = 'hode' | 'kropp' | 'armer' | 'bein' | 'hender' | 'fotter';

export interface FigurProsjekt {
  skjema: number;
  familie: 'figur';
  profil: { id: string; versjon: string };
  mal: string;
  farger: Record<Segment, string>;
  grunnmodeller: Record<Segment, string>;
  former: (Omit<Form, 'kropp'> & { kropp: Segment })[];
}

/** Library part for each 0.2 base model. */
const kart: Record<Segment, Record<string, string>> = {
  kropp: { rund: 'kropp-rund', kloss: 'kropp-kloss', paere: 'kropp-paere' },
  hode: { rund: 'hode-rund', kantet: 'hode-kantet', hoy: 'hode-hoy' },
  armer: { tynne: 'arm-tynn', kraftige: 'arm-kraftig' },
  hender: { votter: 'hand-vott', kloer: 'hand-klo' },
  bein: { korte: 'bein-kort', lange: 'bein-langt' },
  fotter: { stovler: 'fot-stovel', runde: 'fot-rund' },
};

/** The ten parts of a 0.2 figure: [id, segment, name, right side]. */
const deler: [string, Segment, string, boolean][] = [
  ['kropp', 'kropp', 'Kropp', false],
  ['hode', 'hode', 'Hode', false],
  ['arm-venstre', 'armer', 'Arm (venstre)', false],
  ['arm-hoyre', 'armer', 'Arm (høyre)', true],
  ['hand-venstre', 'hender', 'Hånd (venstre)', false],
  ['hand-hoyre', 'hender', 'Hånd (høyre)', true],
  ['bein-venstre', 'bein', 'Bein (venstre)', false],
  ['bein-hoyre', 'bein', 'Bein (høyre)', true],
  ['fot-venstre', 'fotter', 'Fot (venstre)', false],
  ['fot-hoyre', 'fotter', 'Fot (høyre)', true],
];

/** [parent part, parent connector, child part, child connector]. */
const ledd: [string, string, string, string][] = [
  ['kropp', 'hals', 'hode', 'hals'],
  ['kropp', 'skulder-v', 'arm-venstre', 'skulder'],
  ['kropp', 'skulder-h', 'arm-hoyre', 'skulder'],
  ['kropp', 'hofte-v', 'bein-venstre', 'feste'],
  ['kropp', 'hofte-h', 'bein-hoyre', 'feste'],
  ['arm-venstre', 'handledd', 'hand-venstre', 'feste'],
  ['arm-hoyre', 'handledd', 'hand-hoyre', 'feste'],
  ['bein-venstre', 'ankel', 'fot-venstre', 'feste'],
  ['bein-hoyre', 'ankel', 'fot-hoyre', 'feste'],
];

export function fraFigur(f: FigurProsjekt): BuildforgeParametre | null {
  const kropper: Modulkropp[] = [];
  for (const [id, seg, navn, hoyre] of deler) {
    const mal = finnKroppsmal(kart[seg][f.grunnmodeller[seg]]);
    if (!mal) return null;
    kropper.push({
      id,
      navn,
      kategori: mal.kategori,
      komponent: { id: mal.id, versjon: mal.versjon },
      farge: f.farger[seg],
      speilet: hoyre,
      posisjon: [0, 0, 0],
      rotasjon: [0, 0, 0],
      koblinger: mal.koblinger.map((x) => ({ ...structuredClone(x), familie: 'svivel' as const })),
    });
  }
  const forbindelser: Forbindelse[] = ledd.map(([a, ka, b, kb]) => ({
    id: `c-${b}`,
    a: { kropp: a, kobling: ka },
    b: { kropp: b, kobling: kb },
    vri: 0,
  }));
  const former: Form[] = [];
  for (const [id, seg, , hoyre] of deler)
    for (const x of f.former) {
      if (x.kropp !== seg) continue;
      const malId = kart[seg][f.grunnmodeller[seg]]!;
      const komponent = x.komponent?.id.startsWith('grunn-') ? grunnKomponent(malId) : x.komponent;
      former.push({ ...structuredClone(x), id: hoyre ? `${x.id}-h` : x.id, kropp: id, komponent });
    }
  return {
    skjema: f.skjema,
    familie: 'modul',
    profil: f.profil,
    mal: f.mal,
    farger: {},
    rot: 'kropp',
    kropper,
    forbindelser,
    former,
  };
}
