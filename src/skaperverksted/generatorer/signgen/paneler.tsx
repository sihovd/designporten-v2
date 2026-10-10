/**
 * Dockable panels for Sign Forge and the workspaces they are arranged in.
 * The history is a timeline along the bottom (Tidslinje.tsx) and the production controls are in the
 * export dialog, so neither is a panel any more.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { PanelDef } from '../../core/generator';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel } from '../../shell/kontroller';
import type { Romspek } from '../../shell/paneler/modell';
import { Lagpanel } from './Lagpanel';
import { SigngenInspektor } from './Inspektor';
import { Profilseksjon } from './Profilseksjon';
import { Hjelpelinjepanel, Transformpanel } from './justerpaneler';
import { Fargepanel } from './Fargepanel';
import { Snappanel } from './Snappanel';
import { finnLag } from '../../core/dokument';

/** The side profile of the selected layer: wall shape, bottom and top edge, and the cross-section. */
export function Profilpanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const lag = t.utvalg.lag ? finnLag(t.dok, t.utvalg.lag) : undefined;
  if (!lag) return <p class="dempet panel-tom">Velg et lag for å se og redigere profilen.</p>;
  return (
    <Panel tittel={`Profil: ${lag.navn}`}>
      <Profilseksjon benk={benk} lag={lag} key={lag.id} />
    </Panel>
  );
}

export const PANELER: PanelDef[] = [
  { id: 'lag', navn: 'Lag', ikon: 'layers', Innhold: Lagpanel, flytB: 320, flytH: 520 },
  {
    id: 'egenskaper',
    navn: 'Egenskaper',
    ikon: 'properties',
    Innhold: SigngenInspektor,
    flytB: 320,
    flytH: 560,
  },
  { id: 'profil', navn: 'Profil', Innhold: Profilpanel, flytB: 320, flytH: 520, fane: 'egenskaper' },
  { id: 'transform', navn: 'Transform', ikon: 'transform', Innhold: Transformpanel, flytB: 300, flytH: 360 },
  {
    id: 'hjelpelinjer',
    navn: 'Hjelpelinjer',
    ikon: 'guides',
    Innhold: Hjelpelinjepanel,
    flytB: 300,
    flytH: 400,
  },
  {
    id: 'snapoppsett',
    navn: 'Snap og avstand',
    ikon: 'snap',
    Innhold: Snappanel,
    flytB: 320,
    flytH: 520,
  },
  {
    id: 'fargeprofil',
    navn: 'Fargeprofil',
    ikon: 'palette',
    Innhold: Fargepanel,
    flytB: 340,
    flytH: 560,
    fane: 'egenskaper',
  },
];

/** Arrangements of the panels. Only the arrangement differs: «Egendefinert» is whatever you made yourself. */
export const ARBEIDSROM: Romspek[] = [
  {
    id: 'enkel',
    navn: 'Enkel',
    dokkB: { venstre: 280, hoyre: 304 },
    grupper: [
      { paneler: ['lag'], side: 'venstre' },
      { paneler: ['egenskaper'], side: 'hoyre' },
    ],
    smal: [{ paneler: ['egenskaper', 'lag'], side: 'hoyre' }],
  },
  {
    id: 'design',
    navn: 'Design',
    dokkB: { venstre: 280, hoyre: 304 },
    grupper: [
      { paneler: ['lag'], side: 'venstre', vekt: 3 },
      { paneler: ['egenskaper', 'profil'], side: 'hoyre', vekt: 3 },
      { paneler: ['transform', 'hjelpelinjer', 'snapoppsett', 'fargeprofil'], side: 'hoyre', vekt: 2 },
    ],
    smal: [
      {
        paneler: ['egenskaper', 'profil', 'transform', 'hjelpelinjer', 'snapoppsett', 'fargeprofil'],
        side: 'hoyre',
        vekt: 3,
      },
      { paneler: ['lag'], side: 'hoyre', vekt: 2 },
    ],
  },
];
