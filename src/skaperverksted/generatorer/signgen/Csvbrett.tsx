/**
 * The bottom tray of the CSV workflow. While the master is designed it shows
 * the steps and a slim, sideways-scrolling strip of resources (fonts, the
 * colour profile, vectors) that takes little height (Sivert, 2026-10-06,
 * §26). While a generated sign is open for editing it shows what that sign
 * does differently from the master and how to put it away.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { TekstKilde } from '../../core/dokument';
import { fargekode, finnMateriale, visningsnavn } from '../../core/materialer';
import { finnFont } from '../../geometri/tekst';
import { brukBenk } from '../../shell/bruk-benk';
import { palett } from './dokument';
import { hentEgneDekor } from './dekor';
import { grunnskilt, lesArbeid, lesInstans, rentDokument } from './csvflyt';
import { avsluttInstans, lukkCsv } from './csvhandlinger';
import { Stegnavigasjon, Stegrad } from './Csvfelles';
import { apneFargeprofil } from './Fargevelger';
import { importerSvgSom } from './handlinger';
import { lastFonter } from './modell';
import { finnOverstyringer, lesVerdi, overstyringsetikett, visVerdi } from './overstyring';
import { brukSigntilstand, signtilstand } from './tilstand';

/** Fonts, colours and vectors a CSV sign can use, in one thin row that scrolls sideways. */
function Ressursstripe({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const fil = useRef<HTMLInputElement>(null);
  const brukteFonter = useMemo(
    () => [
      ...new Set(
        Object.values(t.dok.objekter).flatMap((o) =>
          o.kilde.type === 'tekst' ? [(o.kilde as TekstKilde).fontId] : [],
        ),
      ),
    ],
    [t.dok.objekter],
  );
  const farger = palett(t.dok);
  const egne = hentEgneDekor();
  const st = brukSigntilstand(benk);
  return (
    <div class="csv-ressurser" role="group" aria-label="Ressurser for CSV-skiltene" tabIndex={0}>
      <div class="csv-gruppe" role="group" aria-label="Fonter">
        <span class="csv-gruppenavn">Fonter</span>
        {brukteFonter.map((id) => (
          <span class="csv-chip" key={id} title="Font brukt på masteren">
            {finnFont(id).navn}
          </span>
        ))}
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => signtilstand(benk).sett({ fontvindu: true })}
        >
          + Font
        </button>
      </div>
      <div class="csv-gruppe" role="group" aria-label="Farger i fargeprofilen">
        <span class="csv-gruppenavn">Farger</span>
        {farger.map((id) => {
          const m = finnMateriale(id);
          return (
            <span class="csv-chip" key={id} title={`${visningsnavn(m)}, ${m.type}`}>
              <span class="fargeprove" style={{ background: m.hex }} aria-hidden="true" />
              <span class="mono">{fargekode(m)}</span>
            </span>
          );
        })}
        <button type="button" class="kontroll-knapp" onClick={() => apneFargeprofil(benk)}>
          Rediger farger
        </button>
      </div>
      <div class="csv-gruppe" role="group" aria-label="Vektorer">
        <span class="csv-gruppenavn">SVG</span>
        {egne.slice(0, 8).map((d) => (
          <span class="csv-chip" key={d.id} title="Dine egne vektorer">
            {d.navn}
          </span>
        ))}
        <button type="button" class="kontroll-knapp" onClick={() => fil.current?.click()}>
          + SVG
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          aria-pressed={st.dekor}
          onClick={() => signtilstand(benk).sett({ dekor: true })}
        >
          Dekorgalleri
        </button>
        <input
          ref={fil}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            (e.target as HTMLInputElement).value = '';
            if (f) void importerSvgSom(benk, f, 'pynt');
          }}
        />
      </div>
    </div>
  );
}

/** Banner while a generated sign is open: what it does differently, and the way out. */
function Instansfelt({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const inst = lesInstans(t.dok)!;
  const [grunn, settGrunn] = useState<ReturnType<typeof grunnskilt>>(undefined);
  const [advar, settAdvar] = useState<string[] | null>(null);
  useEffect(() => {
    let aktiv = true;
    const a = lesArbeid(inst.master);
    if (!a) return;
    void lastFonter(inst.master).then(() => aktiv && settGrunn(grunnskilt(inst.master, a, inst.rad)));
    return () => {
      aktiv = false;
    };
  }, [inst.master, inst.rad]);
  const avvik = useMemo(
    () => (grunn ? finnOverstyringer(rentDokument(grunn.dok), rentDokument(t.dok)) : null),
    [grunn, t.dok],
  );
  const liste = Object.values(avvik?.overstyringer ?? {});
  const ferdig = async (bekreftet: boolean) => {
    if (avvik?.utenfor.length && !bekreftet) {
      settAdvar(avvik.utenfor);
      return;
    }
    settAdvar(null);
    await avsluttInstans(benk, true);
  };
  return (
    <div class="csv-instans" role="region" aria-label="Du redigerer et generert skilt">
      <div class="csv-instans-hode">
        <strong>Du redigerer skilt {inst.rad + 1}</strong>
        <span class="dempet">
          Endringene gjelder bare dette skiltet og lagres som egne verdier. Alt annet følger masteren.
        </span>
        <span class="csv-merke" role="status">
          {liste.length === 0 ? 'Ingen egne verdier ennå' : `${liste.length} egne verdier`}
        </span>
        <span class="csv-instans-knapper">
          <button type="button" class="primar" onClick={() => void ferdig(false)}>
            Ferdig
          </button>
          <button type="button" class="kontroll-knapp" onClick={() => void avsluttInstans(benk, false)}>
            Forkast
          </button>
        </span>
      </div>
      {liste.length > 0 && grunn && (
        <details class="csv-instans-liste">
          <summary>Se egne verdier</summary>
          <ul class="csv-egne">
            {liste.map((o) => (
              <li key={`${o.mal}:${o.id}:${o.egenskap}`} class="overstyrt">
                <span class="csv-egne-navn">{overstyringsetikett(t.dok, o)}</span>
                <span class="csv-egne-verdi">
                  Master: {visVerdi(o, lesVerdi(grunn.dok, o.mal, o.id, o.egenskap))} · Her:{' '}
                  <strong>{visVerdi(o, o.verdi)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {advar && (
        <div class="csv-bekreft" role="alert">
          <p>Dette kan ikke lagres som egne verdier på ett skilt, og går tapt:</p>
          <ul>
            {advar.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div class="knapperad">
            <button type="button" class="primar" onClick={() => void ferdig(true)}>
              Lagre det som kan lagres
            </button>
            <button type="button" class="kontroll-knapp" onClick={() => settAdvar(null)}>
              Fortsett å redigere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Csvbrett({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  if (lesInstans(t.dok)) return <Instansfelt benk={benk} />;
  if (st.csv !== 'master') return null;
  return (
    <div class="csv-brett" role="region" aria-label="Fra CSV: design masteren">
      <div class="csv-brettlinje">
        <strong class="csv-brett-tittel">Fra CSV</strong>
        <Stegrad benk={benk} aktiv="master" />
        <span class="csv-brett-merke">Du designer masteren</span>
        <Stegnavigasjon benk={benk} aktiv="master" />
        <button type="button" class="kontroll-knapp" onClick={() => lukkCsv(benk)}>
          Lukk<span class="visuelt-skjult"> CSV-visningen</span>
        </button>
      </div>
      <Ressursstripe benk={benk} />
    </div>
  );
}
