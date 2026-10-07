/**
 * The shared Skaperverksted workspace (spec: skaperverksted.md, "Workspace").
 * Workshop bar, tool rail, canvas (2D or 3D), floating left panel,
 * inspector, status bar; bottom sheets below 1024 px. Generators plug in
 * through GeneratorPlugin.ui.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Arbeidsbenk } from '../core/arbeidsbenk';
import type { GeneratorPlugin } from '../core/generator';
import { fraJson, tilJson, DokumentFeil } from '../core/dokument';
import { autolagre, hentAutolagret, lastNed, slettAutolagret } from '../core/lagring';
import { lastGenerator } from '../generatorer';
import { forhandslast3d, Visning3d } from '../render3d/Lat3d';
import { filnavn } from '../eksport/tremf';
import { brukBenk } from './bruk-benk';
import { Eksportdialog } from './Eksportdialog';
import { Hjelp } from './Hjelp';
import { Statuslinje } from './Statuslinje';
import { Ark } from './Ark';
import { Ikon } from './ikoner';
import { Panelflate } from './paneler/Panelflate';
import { PanelKontekst } from './paneler/kontekst';
import { apnePanel, finnGruppe, loft, settAktiv, slaaSammen } from './paneler/modell';
import { Panelmeny } from './paneler/Panelmeny';
import { brukPaneler } from './paneler/bruk-paneler';
import { logomerke } from '../../lib/ressurser';

export function Verksted({ generatorId }: { generatorId: string }) {
  const [plugin, settPlugin] = useState<GeneratorPlugin | null | undefined>(undefined);
  useEffect(() => {
    let aktiv = true;
    lastGenerator(generatorId)
      .then((p) => aktiv && settPlugin(p))
      .catch(() => aktiv && settPlugin(null));
    return () => {
      aktiv = false;
    };
  }, [generatorId]);

  if (plugin === undefined) {
    return (
      <p class="verksted-laster" role="status">
        Åpner verkstedet …
      </p>
    );
  }
  if (plugin === null) {
    return (
      <div class="verksted-laster" role="alert">
        <p>Verktøyet kunne ikke lastes. Prøv å laste siden på nytt.</p>
        <a href="/skaperverksted/">Tilbake til Skaperverksted</a>
      </div>
    );
  }
  return <Arbeidsflate plugin={plugin} />;
}

function brukBred(): boolean {
  const q = '(min-width: 1024px)';
  const [bred, settBred] = useState(() => typeof matchMedia === 'undefined' || matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => settBred(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return bred;
}

function erSkrivefelt(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function Arbeidsflate({ plugin }: { plugin: GeneratorPlugin }) {
  const gjenopprettet = useRef(false);
  const benk = useMemo(() => {
    const lagret = hentAutolagret(plugin.id);
    gjenopprettet.current = !!lagret;
    return new Arbeidsbenk(plugin, lagret ?? plugin.nyttDokument());
  }, [plugin]);
  useEffect(() => () => benk.avslutt(), [benk]);

  const t = brukBenk(benk);
  const bred = brukBred();
  const [eksport, settEksport] = useState(false);
  const [hjelp, settHjelp] = useState(false);
  // the floating panel would cover most of a small laptop canvas, so it starts closed there
  const [panelApent, settPanelApent] = useState(
    () => typeof matchMedia === 'undefined' || matchMedia('(min-width: 1280px)').matches,
  );
  const filvelger = useRef<HTMLInputElement>(null);
  const ui = plugin.ui;
  // generators with dockable panels get the panel system on wide screens; the rest keep the fixed layout
  const smalDesktop = useMemo(
    () => typeof matchMedia !== 'undefined' && !matchMedia('(min-width: 1280px)').matches,
    [],
  );
  const paneler = brukPaneler(plugin.id, ui, smalDesktop);
  const harPaneler = bred && !!ui.Paneler?.length;

  // generators can ask for the left panel (for example «Legg til del» in a menu)
  useEffect(() => {
    const vis = () => {
      settPanelApent(true);
      requestAnimationFrame(() => benk.kommando('tegn'));
    };
    benk.kommandoer.set('vis-venstrepanel', vis);
    return () => {
      if (benk.kommandoer.get('vis-venstrepanel') === vis) benk.kommandoer.delete('vis-venstrepanel');
    };
  }, [benk]);

  // «panel:<id>» opens (or brings forward) a panel, for example from a tool or a button in the inspector
  const apneForPanel = useRef<(id: string) => void>(() => {});
  apneForPanel.current = (id) =>
    paneler.send({
      t: 'endre',
      f: (o) => {
        const g = finnGruppe(o, id);
        if (g) return loft(settAktiv(o, g.id, id), g.id);
        const o2 = apnePanel(o, id, paneler.standardPlass(id));
        const nabo = ui.Paneler?.find((p) => p.id === id)?.fane;
        const m = nabo ? finnGruppe(o2, nabo) : undefined;
        const ny = finnGruppe(o2, id);
        return m && ny && m.id !== ny.id ? slaaSammen(o2, ny.id, m.id) : o2;
      },
    });
  useEffect(() => {
    if (!harPaneler) return;
    const navn = (ui.Paneler ?? []).map((p) => `panel:${p.id}`);
    navn.forEach((n) => benk.kommandoer.set(n, () => apneForPanel.current(n.slice(6))));
    return () => navn.forEach((n) => benk.kommandoer.delete(n));
  }, [benk, harPaneler, ui]);

  useEffect(() => {
    if (gjenopprettet.current) benk.melde('Prosjektet ditt fra forrige gang er hentet fram.');
    forhandslast3d();
  }, [benk]);

  // autosave (debounced)
  useEffect(() => {
    const id = setTimeout(() => autolagre(t.dok), 600);
    return () => clearTimeout(id);
  }, [t.dok]);

  const nyttProsjekt = () => {
    if (!confirm('Starte et nytt prosjekt? Det du har nå, blir borte hvis du ikke har lagret det som fil.'))
      return;
    slettAutolagret(plugin.id);
    benk.lastInn(plugin.nyttDokument());
    benk.settUtsnitt({ zoom: 1, senterX: 0, senterY: 0 });
    benk.kommando('tilpass');
    benk.melde('Nytt prosjekt.');
  };
  const lagreFil = () => {
    lastNed(
      tilJson(benk.dok),
      filnavn(benk.dok.navn, 'stl').replace(/\.stl$/, '.skaperverksted.json'),
      'application/json',
    );
    benk.melde('Prosjektet er lastet ned som fil.');
  };
  const apneFil = async (fil: File) => {
    try {
      const dok = fraJson(await fil.text());
      if (dok.generator !== plugin.id) {
        benk.melde(`Filen er laget i et annet verktøy (${dok.generator}).`);
        return;
      }
      benk.lastInn(dok);
      benk.kommando('tilpass');
      benk.melde(`Åpnet «${dok.navn}».`);
    } catch (e) {
      benk.melde(e instanceof DokumentFeil ? e.message : 'Filen kunne ikke åpnes.');
    }
  };

  // shortcuts
  useEffect(() => {
    const tast = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        lagreFil();
        return;
      }
      if (erSkrivefelt(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) benk.gjorOm();
        else benk.angre();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        benk.gjorOm();
        return;
      }
      if (!mod && e.key === '?') {
        settHjelp(true);
        return;
      }
      if (!mod && !e.altKey) {
        const vis: Record<string, string> = {
          '0': 'tilpass',
          '1': 'zoom-100',
          '+': 'zoom-inn',
          '=': 'zoom-inn',
          '-': 'zoom-ut',
        };
        const k = vis[e.key];
        if (k && benk.kommando(k)) {
          e.preventDefault();
          return;
        }
      }
      if (plugin.hurtigtaster?.(e, benk)) e.preventDefault();
    };
    window.addEventListener('keydown', tast);
    return () => window.removeEventListener('keydown', tast);
  }, [benk, plugin]);

  const visning = t.innstillinger.visning;
  const har2d = plugin.visninger.includes('2d') && !!ui.Lerret2d;
  const har3d = plugin.visninger.includes('3d');
  const Lerret2d = ui.Lerret2d;

  const venstre = ui.Venstrepanel ? <ui.Venstrepanel benk={benk} /> : null;
  const hoyre = <ui.Inspektor benk={benk} />;
  const lerretForst = !!plugin.lerretForst;
  const lerretInnhold = (
    <>
      {plugin.utviklingsgeometri && (
        <p class="utviklingsmerke" role="note">
          {plugin.utviklingsgeometri}
        </p>
      )}
      {visning === '2d' && Lerret2d ? <Lerret2d benk={benk} /> : <Visning3d benk={benk} />}
    </>
  );
  const inspektorApen = t.innstillinger.inspektor;

  return (
    <div
      class={`verksted${bred ? ' bred' : ' smal'}${lerretForst ? ' lerret-forst' : ''}${harPaneler ? ' med-paneler' : ''}`}
    >
      <header class="verkstedlinje">
        <a class="hjem" href="/" aria-label="Designporten, til forsiden">
          <img src={logomerke.src} alt="" width={logomerke.bredde} height={logomerke.hoyde} />
        </a>
        <a class="tilbake" href="/skaperverksted/" aria-label="Tilbake til Skaperverksted">
          <span aria-hidden="true">←</span>
          <span class="tilbake-tekst">Skaperverksted</span>
        </a>
        <div class="verktoynavn">
          <strong>{plugin.navn}</strong>
          <label class="prosjektnavn">
            <span class="visuelt-skjult">Prosjektnavn</span>
            <input
              type="text"
              value={t.dok.navn}
              maxLength={80}
              onChange={(e) => {
                const navn = (e.target as HTMLInputElement).value.trim() || 'Uten navn';
                benk.endre({
                  navn: 'Endre prosjektnavn',
                  anvend: (d) => (d.navn === navn ? d : { ...d, navn }),
                });
              }}
            />
          </label>
        </div>
        <div class="linjegruppe" role="group" aria-label="Historikk">
          <button
            type="button"
            class="ikonknapp"
            onClick={() => benk.angre()}
            disabled={!benk.historikk.kanAngre}
            title={
              benk.historikk.nesteAngre ? `Angre: ${benk.historikk.nesteAngre} (Ctrl+Z)` : 'Angre (Ctrl+Z)'
            }
          >
            <span aria-hidden="true" class="kort">
              <Ikon id="undo" storrelse={18} />
            </span>
            <span class="lang">Angre</span>
            <span class="visuelt-skjult kortetikett">Angre</span>
          </button>
          <button
            type="button"
            class="ikonknapp"
            onClick={() => benk.gjorOm()}
            disabled={!benk.historikk.kanGjoreOm}
            title="Gjør om (Ctrl+Shift+Z)"
          >
            <span aria-hidden="true" class="kort">
              <Ikon id="redo" storrelse={18} />
            </span>
            <span class="lang">Gjør om</span>
            <span class="visuelt-skjult kortetikett">Gjør om</span>
          </button>
        </div>
        <details class="filmeny">
          <summary>Fil</summary>
          <div class="meny" role="menu">
            <button type="button" role="menuitem" onClick={nyttProsjekt}>
              Nytt prosjekt
            </button>
            <button type="button" role="menuitem" onClick={() => filvelger.current?.click()}>
              Åpne prosjektfil …
            </button>
            <button type="button" role="menuitem" onClick={lagreFil}>
              Lagre som fil <kbd>Ctrl+S</kbd>
            </button>
            <p class="meny-merknad">Prosjektet lagres også automatisk i denne nettleseren.</p>
          </div>
        </details>
        <input
          ref={filvelger}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) void apneFil(f);
            (e.target as HTMLInputElement).value = '';
          }}
        />
        {har2d && har3d && (
          <div class="visningsvalg" role="radiogroup" aria-label="Visning">
            {(['2d', '3d'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visning === v}
                onClick={() => benk.settInnstillinger({ visning: v })}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {lerretForst && bred && (
          <button
            type="button"
            class="ikonknapp"
            aria-pressed={inspektorApen}
            aria-controls="verksted-inspektor"
            onClick={() => {
              benk.settInnstillinger({ inspektor: !inspektorApen });
              requestAnimationFrame(() => benk.kommando('tegn'));
            }}
          >
            Egenskaper
          </button>
        )}
        {harPaneler && (
          <Panelmeny
            defs={ui.Paneler!}
            lager={paneler.lager}
            kontekst={paneler.kontekst}
            send={paneler.send}
            standardPlass={paneler.standardPlass}
          />
        )}
        <button type="button" class="ikonknapp" onClick={() => settHjelp(true)} title="Hurtigtaster (?)">
          ?<span class="visuelt-skjult"> Hjelp og hurtigtaster</span>
        </button>
        <button type="button" class="primar" onClick={() => settEksport(true)}>
          {plugin.bestilling ? (
            <>
              Eksporter<span class="lang"> / Bestill</span>
            </>
          ) : (
            'Eksporter'
          )}
        </button>
      </header>

      {ui.Verktoy && (
        <nav class="verktoyskinne" aria-label="Verktøy">
          <ui.Verktoy benk={benk} />
        </nav>
      )}

      <main class="arbeidsomrade" id="innhold">
        <h1 class="visuelt-skjult">
          {plugin.navn}: {t.dok.navn}
        </h1>
        {harPaneler ? (
          <PanelKontekst.Provider value={true}>
            <Panelflate benk={benk} defs={ui.Paneler!} lager={paneler.lager} send={paneler.send}>
              {lerretInnhold}
            </Panelflate>
          </PanelKontekst.Provider>
        ) : (
          <>
            {lerretInnhold}
            {bred && venstre && (
              <section
                class={`flytpanel venstre${panelApent ? '' : ' lukket'}`}
                aria-label={plugin.venstrepanelNavn ?? 'Lag og deler'}
              >
                <button
                  type="button"
                  class="panelbryter"
                  aria-expanded={panelApent}
                  onClick={() => {
                    settPanelApent(!panelApent);
                    requestAnimationFrame(() => benk.kommando('tegn'));
                  }}
                >
                  {panelApent ? 'Skjul panel' : 'Vis panel'}
                </button>
                {panelApent && venstre}
              </section>
            )}
            {bred && lerretForst && inspektorApen && (
              <aside id="verksted-inspektor" class="flytpanel hoyre" aria-label="Egenskaper">
                <button
                  type="button"
                  class="panelbryter"
                  onClick={() => {
                    benk.settInnstillinger({ inspektor: false });
                    requestAnimationFrame(() => benk.kommando('tegn'));
                  }}
                >
                  Lukk egenskaper
                </button>
                <div class="flytpanel-innhold">{hoyre}</div>
              </aside>
            )}
          </>
        )}
      </main>

      {bred && !lerretForst && !harPaneler ? (
        <aside class="inspektor" aria-label="Egenskaper">
          {hoyre}
        </aside>
      ) : bred ? null : (
        <>
          <nav class="arkvelger" aria-label="Paneler">
            {venstre && (
              <button
                type="button"
                aria-pressed={t.innstillinger.ark === 'lag'}
                onClick={() =>
                  benk.settInnstillinger({ ark: t.innstillinger.ark === 'lag' ? 'ingen' : 'lag' })
                }
              >
                {plugin.venstrepanelNavn ?? 'Lag'}
              </button>
            )}
            <button
              type="button"
              aria-pressed={t.innstillinger.ark === 'egenskaper'}
              onClick={() =>
                benk.settInnstillinger({ ark: t.innstillinger.ark === 'egenskaper' ? 'ingen' : 'egenskaper' })
              }
            >
              Egenskaper
            </button>
          </nav>
          {t.innstillinger.ark === 'lag' && venstre && (
            <Ark
              tittel={plugin.venstrepanelNavn ?? 'Lag'}
              lukk={() => benk.settInnstillinger({ ark: 'ingen' })}
            >
              {venstre}
            </Ark>
          )}
          {t.innstillinger.ark === 'egenskaper' && (
            <Ark tittel="Egenskaper" lukk={() => benk.settInnstillinger({ ark: 'ingen' })}>
              {hoyre}
            </Ark>
          )}
        </>
      )}

      {ui.Bunnbrett && (
        <section class="bunnbrett" aria-label="Varianter">
          <ui.Bunnbrett benk={benk} />
        </section>
      )}
      <Statuslinje benk={benk} />
      <p class="visuelt-skjult" aria-live="polite" role="status">
        {t.melding ?? ''}
      </p>

      {eksport && <Eksportdialog benk={benk} lukk={() => settEksport(false)} />}
      {hjelp && <Hjelp plugin={plugin} lukk={() => settHjelp(false)} />}
    </div>
  );
}
