/**
 * Dockable panels for Sign Forge and the workspaces they are arranged in.
 * The layers panel and the inspector are the same components as before;
 * history and production are new and only read what the workbench already has.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { PanelDef } from '../../core/generator';
import { tall } from '../../core/enheter';
import { fargekode, finnMateriale } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel } from '../../shell/kontroller';
import { mal } from '../../shell/mal';
import type { Romspek } from '../../shell/paneler/modell';
import { fargeplasser } from './dokument';
import { Lagpanel } from './Lagpanel';
import { SigngenInspektor } from './Inspektor';
import { Profilseksjon } from './Profilseksjon';
import { Justerpanel, Transformpanel } from './justerpaneler';
import { Fargepanel } from './Fargepanel';
import { finnLag } from '../../core/dokument';

/** What was done, newest last. Click a step to go back (or forward) to it. */
export function Historikkpanel({ benk }: { benk: Arbeidsbenk }) {
  brukBenk(benk); // re-render on every change
  const { angre, gjorOm } = benk.historikk.trinn;
  const til = (n: number) => {
    for (let i = 0; i < Math.abs(n); i++) {
      if (n < 0) benk.angre();
      else benk.gjorOm();
    }
  };
  return (
    <div class="historikk">
      {angre.length === 0 && gjorOm.length === 0 ? (
        <p class="dempet historikk-tom">Ingenting er gjort ennå. Endringene dine dukker opp her.</p>
      ) : (
        <ol class="historikkliste" aria-label="Endringer, eldst først">
          <li>
            <button
              type="button"
              class="historikktrinn"
              disabled={angre.length === 0}
              onClick={() => til(-angre.length)}
            >
              Utgangspunkt
            </button>
          </li>
          {angre.map((navn, i) => {
            const naa = i === angre.length - 1;
            return (
              <li key={`a${i}`}>
                <button
                  type="button"
                  class="historikktrinn"
                  aria-current={naa ? 'step' : undefined}
                  onClick={() => til(i + 1 - angre.length)}
                >
                  {navn}
                </button>
              </li>
            );
          })}
          {gjorOm.map((navn, i) => (
            <li key={`g${i}`}>
              <button type="button" class="historikktrinn gjort-om" onClick={() => til(i + 1)}>
                {navn}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

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

/** What goes to the printer: size, parts, filament slots and notes from the model build. */
export function Produksjonspanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const m = t.modell ? mal(t.modell.deler) : null;
  const plasser = fargeplasser(t.dok);
  const merknader = t.modell?.advarsler.filter((a) => a.niva !== 'info') ?? [];
  return (
    <div class="produksjon">
      <dl class="produksjonstall">
        <div>
          <dt>Mål</dt>
          <dd class="mono">{m ? `${tall(m.bredde)} × ${tall(m.dybde)} × ${tall(m.hoyde)} mm` : '–'}</dd>
        </div>
        <div>
          <dt>Deler</dt>
          <dd class="mono">{m ? m.deler : '–'}</dd>
        </div>
        <div>
          <dt>Volum</dt>
          <dd class="mono">{m ? `${tall(m.volum / 1000, 1)} cm³` : '–'}</dd>
        </div>
      </dl>
      <h3 class="underoverskrift">Fargeplasser</h3>
      {plasser.length === 0 ? (
        <p class="dempet">Ingen synlige lag.</p>
      ) : (
        <ol class="plassliste">
          {plasser.map((p, i) => {
            const mat = finnMateriale(p.materialId);
            return (
              <li key={p.id}>
                <span class="mono plassnr">{i + 1}</span>
                <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
                <span class="plassnavn">
                  {p.navn}
                  <span class="dempet mono"> · {fargekode(mat)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {merknader.length > 0 && (
        <>
          <h3 class="underoverskrift">Merknader</h3>
          <ul class="merknader">
            {merknader.map((a, i) => (
              <li key={i} class={a.niva}>
                {a.tekst}
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="dempet produksjonsnotat">Eksport og bestilling finner du under «Eksporter».</p>
    </div>
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
  { id: 'justering', navn: 'Justér', ikon: 'align', Innhold: Justerpanel, flytB: 300, flytH: 480 },
  {
    id: 'fargeprofil',
    navn: 'Fargeprofil',
    ikon: 'palette',
    Innhold: Fargepanel,
    flytB: 340,
    flytH: 560,
    fane: 'egenskaper',
  },
  { id: 'historikk', navn: 'Historikk', ikon: 'history', Innhold: Historikkpanel, flytB: 280, flytH: 340 },
  {
    id: 'produksjon',
    navn: 'Produksjon',
    ikon: 'plate-layout',
    Innhold: Produksjonspanel,
    flytB: 300,
    flytH: 380,
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
      { paneler: ['historikk'], side: 'venstre', vekt: 2 },
      { paneler: ['egenskaper', 'profil'], side: 'hoyre', vekt: 3 },
      { paneler: ['transform', 'justering', 'fargeprofil'], side: 'hoyre', vekt: 2 },
    ],
    smal: [
      { paneler: ['egenskaper', 'profil', 'transform', 'justering', 'fargeprofil'], side: 'hoyre', vekt: 3 },
      { paneler: ['lag', 'historikk'], side: 'hoyre', vekt: 2 },
    ],
  },
  {
    id: 'produksjon',
    navn: 'Produksjon',
    dokkB: { venstre: 280, hoyre: 320 },
    grupper: [
      { paneler: ['lag'], side: 'venstre' },
      { paneler: ['produksjon', 'fargeprofil'], side: 'hoyre', vekt: 2 },
      { paneler: ['egenskaper'], side: 'hoyre', vekt: 3 },
    ],
    smal: [{ paneler: ['produksjon', 'egenskaper', 'lag'], side: 'hoyre' }],
  },
];
