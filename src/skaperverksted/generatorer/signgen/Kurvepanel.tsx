/**
 * Panels for editing the curves of a vector and for the pen tool: what is
 * selected, delete, point type, close, colour per shape, repair of paths
 * that are not closed, and saving in the gallery.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnMateriale } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { oppdaterKilde, palett } from './dokument';
import {
  avsluttKurveredigering,
  fargeValgtForm,
  forhandsvisReparasjon,
  kurveObjekt,
  kurveTall,
  lagreKurverIGalleri,
  lukkValgteBaner,
  reparerAapne,
  settKurve,
  settValgteNodetype,
  slettValgtePunkter,
  slettValgteBaner,
  slettValgtSegment,
  valgteBaner,
} from './kurver';
import { fullforPenn, pennPagar } from './Pennverktoy';
import { brukSigntilstand, signtilstand } from './tilstand';

function Knapp({
  navn,
  hjelp,
  deaktivert,
  klikk,
}: {
  navn: string;
  hjelp?: string;
  deaktivert?: boolean;
  klikk: () => void;
}) {
  return (
    <button type="button" class="kontroll-knapp" title={hjelp} disabled={deaktivert} onClick={klikk}>
      {navn}
    </button>
  );
}

export function Kurvepanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  brukSigntilstand(benk);
  const c = kurveObjekt(benk);
  if (!c) return null;
  const tallene = kurveTall(c);
  const valgt = valgteBaner(c.k);
  const harPunkter = c.k.noder.length > 0;
  const harForm = valgt.length > 0;
  const rep = tallene.aapne ? forhandsvisReparasjon(c) : null;
  const kilde = c.o.kilde.type === 'svg' ? c.o.kilde : null;
  const hva = harPunkter
    ? c.k.noder.length === 1
      ? '1 punkt valgt'
      : `${c.k.noder.length} punkter valgt`
    : c.k.segment
      ? 'En kurve valgt'
      : harForm
        ? valgt.length === 1
          ? '1 bane valgt'
          : `${valgt.length} baner valgt`
        : 'Ingenting valgt';
  return (
    <Panel
      tittel="Rediger kurver"
      handling={
        <button type="button" class="kontroll-knapp" onClick={() => avsluttKurveredigering(benk)}>
          Ferdig
        </button>
      }
    >
      <p class="merknad">
        «{c.o.navn}»: {tallene.baner} {tallene.baner === 1 ? 'bane' : 'baner'}, {tallene.punkter} punkter.{' '}
        <strong>{hva}.</strong>
      </p>
      <p class="merknad">
        Klikk et punkt eller en kurve og dra. Dobbeltklikk en kurve for å legge til et punkt, dobbeltklikk et
        punkt for å bytte mellom hjørne og jevn. Klikk inni en form for å velge den.
      </p>

      <div class="knapperad" role="group" aria-label="Punkter">
        <Knapp
          navn="Hjørnepunkt"
          deaktivert={!harPunkter}
          hjelp="Håndtakene beveger seg hver for seg"
          klikk={() => settValgteNodetype(benk, false)}
        />
        <Knapp
          navn="Jevnt punkt"
          deaktivert={!harPunkter}
          hjelp="Håndtakene ligger på linje, så kurven ikke knekker"
          klikk={() => settValgteNodetype(benk, true)}
        />
        <Knapp
          navn="Legg til punkt med penn"
          hjelp="Tegn en ny bane i denne vektoren (B)"
          klikk={() => signtilstand(benk).sett({ verktoy: 'penn' })}
        />
      </div>

      <div class="knapperad" role="group" aria-label="Slett">
        <Knapp navn="Slett punkt" deaktivert={!harPunkter} klikk={() => slettValgtePunkter(benk)} />
        <Knapp navn="Slett kurve" deaktivert={!c.k.segment} klikk={() => slettValgtSegment(benk)} />
        <Knapp
          navn="Slett bane"
          deaktivert={!harForm && !c.k.segment && !harPunkter}
          hjelp="Tar bort hele banen, men lar hullene stå"
          klikk={() => slettValgteBaner(benk, false)}
        />
        <Knapp
          navn="Slett form"
          deaktivert={!harForm && !c.k.segment && !harPunkter}
          hjelp="Tar bort banen og hullene inni den (Delete)"
          klikk={() => slettValgteBaner(benk, true)}
        />
        <Knapp
          navn="Lukk bane"
          deaktivert={!tallene.aapne}
          hjelp="Lukker de valgte åpne banene, eller alle åpne hvis ingen er valgt"
          klikk={() => lukkValgteBaner(benk)}
        />
      </div>

      <div class="felt stablet">
        <span>Farge på valgt form</span>
        <div class="knapperad" role="group" aria-label="Farge på valgt form">
          {palett(t.dok).map((id) => (
            <button
              key={id}
              type="button"
              class="kontroll-knapp fargeknapp"
              disabled={!harForm}
              title={`Farg formen ${finnMateriale(id).navn.toLowerCase()}`}
              aria-label={`Farg formen ${finnMateriale(id).navn.toLowerCase()}`}
              onClick={() => fargeValgtForm(benk, id)}
            >
              <span class="fargeprove" style={{ background: finnMateriale(id).hex }} aria-hidden="true" />
              {finnMateriale(id).navn}
            </button>
          ))}
        </div>
        <p class="merknad">
          Formen flyttes til et eget lag på samme nivå, så den printes i den fargen ved siden av resten.
        </p>
      </div>

      {kilde && (
        <div class="felt">
          <span>Baner inni hverandre</span>
          <Segment
            etikett="Baner inni hverandre"
            valg={[
              { id: 'evenodd', navn: 'Hull' },
              { id: 'nonzero', navn: 'Samlet flate' },
            ]}
            verdi={kilde.fyllregel ?? 'nonzero'}
            endre={(v) =>
              benk.endre({
                navn: v === 'evenodd' ? 'Baner inni hverandre blir hull' : 'Baner inni hverandre fylles',
                anvend: (d) => oppdaterKilde(d, c.o.id, { fyllregel: v }),
              })
            }
          />
        </div>
      )}

      <div class="repareringsboks">
        <h3 class="underoverskrift">Reparer åpne baner</h3>
        {tallene.aapne ? (
          <p class="merknad advarsel-tekst">
            {tallene.aapne} {tallene.aapne === 1 ? 'bane er' : 'baner er'} ikke sluttet (stiplet oransje).
          </p>
        ) : (
          <p class="merknad">Alle banene er lukket.</p>
        )}
        <TallFelt
          etikett="Største avstand som kobles"
          verdi={c.k.repToleranse}
          min={0.01}
          maks={20}
          steg={0.1}
          desimaler={2}
          deaktivert={!tallene.aapne}
          endre={(v) => settKurve(benk, { repToleranse: v })}
        />
        <label class="avkryssing">
          <input
            type="checkbox"
            checked={c.k.repTving}
            disabled={!tallene.aapne}
            onChange={() => settKurve(benk, { repTving: !c.k.repTving })}
          />{' '}
          Lukk resten med rett linje
        </label>
        <label class="avkryssing">
          <input
            type="checkbox"
            checked={c.k.repVis}
            disabled={!tallene.aapne}
            onChange={() => settKurve(benk, { repVis: !c.k.repVis })}
          />{' '}
          Vis hva som blir koblet (grønt)
        </label>
        {rep && (
          <p class="merknad" aria-live="polite">
            {rep.koblet + rep.lukket + rep.tvunget + rep.fjernet === 0
              ? 'Ingenting å reparere med disse innstillingene.'
              : [
                  rep.koblet ? `${rep.koblet} kobles` : '',
                  rep.lukket ? `${rep.lukket} lukkes` : '',
                  rep.tvunget ? `${rep.tvunget} lukkes med rett linje` : '',
                  rep.fjernet ? `${rep.fjernet} løse streker fjernes` : '',
                ]
                  .filter(Boolean)
                  .join(', ') + '.'}
          </p>
        )}
        <Knapp navn="Reparer" deaktivert={!tallene.aapne} klikk={() => reparerAapne(benk)} />
      </div>

      <Knapp
        navn="Lagre i galleriet"
        hjelp="Legger vektoren under «Dine egne» i dekorgalleriet"
        klikk={() => lagreKurverIGalleri(benk)}
      />
    </Panel>
  );
}

/** Help and actions while the pen tool is active. */
export function Pennpanel({ benk }: { benk: Arbeidsbenk }) {
  brukSigntilstand(benk);
  const u = signtilstand(benk).t.penn;
  const antall = u?.bane?.noder.length ?? 0;
  return (
    <Panel tittel="Penn">
      <p class="merknad" aria-live="polite">
        {pennPagar(benk)
          ? `${antall} ${antall === 1 ? 'punkt' : 'punkter'}. Klikk for neste punkt. Klikk det første punktet for å lukke, eller trykk Enter for å la banen stå åpen.`
          : 'Klikk for et hjørnepunkt. Klikk og dra for en jevn kurve. Med Alt trekker du bare ut det neste håndtaket.'}
      </p>
      <div class="knapperad">
        <Knapp
          navn="Lukk bane"
          deaktivert={antall < 3}
          klikk={() => fullforPenn(benk, true)}
          hjelp="Binder siste punkt til det første"
        />
        <Knapp
          navn="Fullfør åpen bane"
          deaktivert={antall < 3}
          klikk={() => fullforPenn(benk, false)}
          hjelp="Enter"
        />
        <Knapp
          navn="Ferdig"
          klikk={() => {
            if (pennPagar(benk)) fullforPenn(benk, false);
            signtilstand(benk).sett({ verktoy: 'velg', penn: null });
          }}
        />
      </div>
      <p class="merknad">
        Banen legges i en vektor som kan redigeres videre: dobbeltklikk på den. Baner tegnet inni hverandre
        blir hull.
      </p>
    </Panel>
  );
}
