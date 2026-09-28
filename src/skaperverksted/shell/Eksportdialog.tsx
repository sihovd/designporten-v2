/**
 * Review step before export or order (spec: "Export / order"): the 3D
 * model, dimensions, parts and colours, printability notes, then file
 * downloads (D-4: real STL/3MF, no invented limits) and «Bestill», which
 * adds an order request line to the cart. No price is shown or invented.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../core/arbeidsbenk';
import { finnMateriale } from '../core/materialer';
import { nyId } from '../core/dokument';
import { lagreDesign, lastNed } from '../core/lagring';
import { sjekkManifold } from '../geometri/mesh';
import { tilStl } from '../eksport/stl';
import { filnavn, tilTremf, STL_TYPE, TREMF_TYPE } from '../eksport/tremf';
import { leggTil } from '../../lib/handel/kurv';
import { tall } from '../core/enheter';
import { Visning3d } from '../render3d/Lat3d';
import { brukBenk } from './bruk-benk';
import { Dialog } from './Dialog';
import { mal } from './mal';

export function Eksportdialog({ benk, lukk }: { benk: Arbeidsbenk; lukk: () => void }) {
  const t = brukBenk(benk);
  const [bestilt, settBestilt] = useState(false);
  const plugin = benk.generator;

  useEffect(() => {
    void benk.bygg();
  }, [benk]);

  const modell = t.bygger ? null : t.modell;
  const deler = modell?.deler.filter((d) => d.mesh.indekser.length > 0) ?? [];
  const m = modell ? mal(modell.deler) : null;
  const apne = useMemo(() => deler.filter((d) => !sjekkManifold(d.mesh).lukket).map((d) => d.navn), [modell]);
  const materialer = [...new Set(deler.map((d) => d.materialId))].map(finnMateriale);
  const utenforPlate =
    m &&
    (m.min[0] < -t.dok.plate.bredde / 2 ||
      m.maks[0] > t.dok.plate.bredde / 2 ||
      m.min[1] < -t.dok.plate.dybde / 2 ||
      m.maks[1] > t.dok.plate.dybde / 2 ||
      m.maks[2] > t.dok.plate.hoyde);

  const tremf = () => {
    lastNed(
      tilTremf(deler, { tittel: t.dok.navn, meta: { Designer: 'Skaperverksted, Designporten' } }),
      filnavn(t.dok.navn, '3mf'),
      TREMF_TYPE,
    );
    benk.melde('3MF-filen er lastet ned.');
  };
  const stl = () => {
    lastNed(tilStl(deler, t.dok.navn), filnavn(t.dok.navn, 'stl'), STL_TYPE);
    benk.melde('STL-filen er lastet ned.');
  };
  const bestill = () => {
    if (!modell || !plugin.bestilling || !m) return;
    const b = plugin.bestilling(t.dok, modell);
    const designId = nyId('design');
    const sammendrag = [
      `Mål: ${tall(m.bredde)} × ${tall(m.dybde)} × ${tall(m.hoyde)} mm`,
      `Deler: ${deler.map((d) => `${d.navn} (${finnMateriale(d.materialId).navn})`).join(', ')}`,
    ];
    lagreDesign({
      id: designId,
      generator: plugin.id,
      navn: t.dok.navn,
      lagret: new Date().toISOString(),
      sammendrag,
      dokument: t.dok,
    });
    leggTil({ produktId: b.produktId, navn: b.navn, antall: 1, enhetspris: null, valg: b.valg, designId });
    settBestilt(true);
    benk.melde('Designet er lagt i handlekurven som en forespørsel.');
  };

  return (
    <Dialog tittel="Se over før eksport" lukk={lukk} klasse="eksport">
      <div class="eksport-rutenett">
        <div class="eksport-3d">
          <Visning3d benk={benk} kompakt etikett="Modellen som eksporteres" />
        </div>
        <div class="eksport-fakta">
          {!modell && <p role="status">Bygger modellen …</p>}
          {modell && !m && <p>Modellen er tom. Legg til noe på lerretet først.</p>}
          {m && (
            <>
              <dl class="fakta">
                <div>
                  <dt>Mål</dt>
                  <dd class="mono">
                    {tall(m.bredde)} × {tall(m.dybde)} × {tall(m.hoyde)} mm
                  </dd>
                </div>
                <div>
                  <dt>Deler</dt>
                  <dd class="mono">{m.deler}</dd>
                </div>
                <div>
                  <dt>Volum (massivt)</dt>
                  <dd class="mono">
                    {plugin.delerOverlapper ? 'opptil ' : ''}
                    {tall(m.volum / 1000)} cm³
                  </dd>
                </div>
              </dl>
              <h3>Deler og farger</h3>
              <ul class="delliste">
                {deler.map((d) => {
                  const mat = finnMateriale(d.materialId);
                  return (
                    <li key={d.id}>
                      <span class="fargeprove" style={{ background: mat.hex }} aria-hidden="true" />
                      {d.navn}: {mat.navn} <span class="dempet">({mat.type})</span>
                    </li>
                  );
                })}
              </ul>
              {materialer.some((x) => !x.bekreftet) && (
                <p class="merknad">Farger og materialer er foreløpige og ikke bekreftet på lager ennå.</p>
              )}
              {(modell!.advarsler.length > 0 || apne.length > 0 || utenforPlate) && (
                <>
                  <h3>Merknader</h3>
                  <ul class="merknader">
                    {utenforPlate && (
                      <li class="advarsel">
                        Modellen er større enn byggeplaten ({t.dok.plate.bredde} × {t.dok.plate.dybde} ×{' '}
                        {t.dok.plate.hoyde} mm).
                      </li>
                    )}
                    {apne.length > 0 && (
                      <li class="advarsel">
                        Geometrien til {apne.join(', ')} er ikke helt lukket. De fleste slicere reparerer
                        dette, men si fra til oss hvis du ser feil.
                      </li>
                    )}
                    {modell!.advarsler.map((a, i) => (
                      <li key={i} class={a.niva}>
                        {a.tekst}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3>Last ned</h3>
              <p class="dempet">3MF holder fargene som egne deler. STL er én samlet form uten farger.</p>
              <div class="knapperad">
                <button type="button" class="primar" onClick={tremf}>
                  Last ned 3MF
                </button>
                <button type="button" class="sekundar" onClick={stl}>
                  Last ned STL
                </button>
              </div>
              {plugin.bestilling && (
                <>
                  <h3>Bestill utskrift</h3>
                  {bestilt ? (
                    <p role="status">
                      Lagt i handlekurven. <a href="/handlekurv/">Gå til handlekurven</a> for å sende
                      forespørselen.
                    </p>
                  ) : (
                    <>
                      <p class="dempet">
                        Vi skriver ut designet for deg. Du sender en forespørsel, og vi svarer med pris og
                        leveringstid før noe blir laget.
                      </p>
                      <button type="button" class="primar" onClick={bestill}>
                        Legg i handlekurven
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
