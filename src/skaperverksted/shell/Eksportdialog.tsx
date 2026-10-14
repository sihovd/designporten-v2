import { nettsti } from '@/lib/nettsti';
/**
 * Review step before export or order (spec: "Export / order"): the 3D
 * model, dimensions, parts and colours, printability notes, then file
 * downloads (D-4: real STL/3MF, no invented limits) and «Bestill», which
 * adds an order request line to the cart. No price is shown or invented.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../core/arbeidsbenk';
import { fargekode, finnMateriale } from '../core/materialer';
import { Ikon } from './ikoner';
import { nyId } from '../core/dokument';
import { lagreDesign, lastNed } from '../core/lagring';
import { sjekkManifold } from '../geometri/mesh';
import { tilStl } from '../eksport/stl';
import { filnavn, tilTremf, STL_TYPE, TREMF_TYPE } from '../eksport/tremf';
import { leggTil } from '../../lib/handel/kurv';
import { tall } from '../core/enheter';
import { Visning3d } from '../render3d/Lat3d';
import { brukBenk } from './bruk-benk';
import { useLukkMeny } from './lukk-meny';
import { Dialog } from './Dialog';
import { mal } from './mal';
import { Plateforhandsvisning } from './Plateforhandsvisning';

interface Nedlasting {
  navn: string;
  etikett: string;
  hjelp: string;
  ikon: 'export-three-mf' | 'generate-stl' | 'export';
  kjor: () => void;
}

/** «Last ned» with the file types in a small menu; each type says in a few words what it holds. */
function Nedlastingsmeny({ valg }: { valg: Nedlasting[] }) {
  const rot = useRef<HTMLDetailsElement>(null);
  useLukkMeny(rot);
  if (!valg.length) return null;
  return (
    <details class="nedlasting" ref={rot}>
      <summary class="sekundar med-ikon">
        <Ikon id="export" storrelse={18} />
        Last ned
        <span aria-hidden="true">▾</span>
      </summary>
      <div class="meny" role="menu">
        {valg.map((v) => (
          <button
            key={v.navn}
            type="button"
            role="menuitem"
            class="med-ikon"
            aria-label={v.etikett}
            title={v.hjelp}
            onClick={() => {
              rot.current?.removeAttribute('open');
              v.kjor();
            }}
          >
            <Ikon id={v.ikon} storrelse={16} />
            <span>{v.navn}</span>
            <span class="dempet nedlasting-hjelp">{v.hjelp}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

export function Eksportdialog({ benk, lukk }: { benk: Arbeidsbenk; lukk: () => void }) {
  const t = brukBenk(benk);
  const [bestilt, settBestilt] = useState(false);
  const [visning, settVisning] = useState<'plate' | '3d'>('plate');
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
      tilTremf(deler, {
        tittel: t.dok.navn,
        meta: { Designer: 'Skaperverksted, Designporten' },
        plate: t.dok.plate,
      }),
      filnavn(t.dok.navn, '3mf'),
      TREMF_TYPE,
    );
    benk.melde('3MF-filen er lastet ned.');
  };
  const regler = modell && plugin.eksport ? plugin.eksport(t.dok, modell, benk) : {};
  const stl = () => {
    lastNed(tilStl(deler, t.dok.navn), filnavn(t.dok.navn, 'stl'), STL_TYPE);
    benk.melde('STL-filen er lastet ned.');
  };
  const stlDel = (del: (typeof deler)[number]) => {
    lastNed(
      tilStl([del], `${t.dok.navn} ${del.navn}`),
      filnavn(`${t.dok.navn}-${del.navn}`, 'stl'),
      STL_TYPE,
    );
    benk.melde(`STL-filen for ${del.navn.toLowerCase()} er lastet ned.`);
  };
  const vedlegg = () => {
    const v = regler.vedlegg;
    if (!v) return;
    lastNed(v.innhold, v.filnavn, v.type);
    benk.melde(`${v.navn} er lastet ned.`);
  };
  const bestill = () => {
    if (!modell || !plugin.bestilling || !m) return;
    const b = plugin.bestilling(t.dok, modell);
    const designId = nyId('design');
    const sammendrag = [
      `Mål: ${tall(m.bredde)} × ${tall(m.dybde)} × ${tall(m.hoyde)} mm`,
      `Deler: ${deler.map((d) => `${d.navn} (${fargekode(finnMateriale(d.materialId))})`).join(', ')}`,
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
        <div class="eksport-visning">
          <div class="segment eksport-faner" role="radiogroup" aria-label="Forhåndsvisning">
            <button
              type="button"
              role="radio"
              aria-checked={visning === 'plate'}
              onClick={() => settVisning('plate')}
            >
              Byggeplaten
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={visning === '3d'}
              onClick={() => settVisning('3d')}
            >
              3D
            </button>
          </div>
          {visning === 'plate' ? (
            modell && deler.length > 0 ? (
              <Plateforhandsvisning deler={deler} plate={t.dok.plate} />
            ) : (
              <p class="dempet eksport-venter" role="status">
                {modell ? 'Ingen deler å vise.' : 'Bygger modellen …'}
              </p>
            )
          ) : (
            <div class="eksport-3d">
              <Visning3d benk={benk} kompakt etikett="Modellen som eksporteres" />
            </div>
          )}
          {modell && m && (
            <div class="eksport-knapper" role="group" aria-label="Eksporter eller bestill">
              {(!regler.sperret || regler.vedlegg) && (
                <Nedlastingsmeny
                  valg={[
                    ...(regler.sperret
                      ? []
                      : [
                          {
                            navn: '3MF',
                            etikett: 'Last ned 3MF',
                            hjelp: 'Geometri med fargeinformasjon',
                            ikon: 'export-three-mf',
                            kjor: tremf,
                          } satisfies Nedlasting,
                        ]),
                    ...(regler.sperret
                      ? []
                      : regler.stlPerDel
                        ? deler.map((d): Nedlasting => ({
                            navn: `STL: ${d.navn}`,
                            etikett: `Last ned STL: ${d.navn}`,
                            hjelp: 'Geometri uten fargeinformasjon',
                            ikon: 'generate-stl',
                            kjor: () => stlDel(d),
                          }))
                        : [
                            {
                              navn: 'STL',
                              etikett: 'Last ned STL',
                              hjelp: 'Geometri uten fargeinformasjon',
                              ikon: 'generate-stl',
                              kjor: stl,
                            } satisfies Nedlasting,
                          ]),
                    ...(regler.vedlegg
                      ? [
                          {
                            navn: regler.vedlegg.navn,
                            etikett: `Last ned ${regler.vedlegg.navn.charAt(0).toLowerCase() + regler.vedlegg.navn.slice(1)}`,
                            hjelp: 'Rapport fra modellen som eksporteres',
                            ikon: 'export',
                            kjor: vedlegg,
                          } satisfies Nedlasting,
                        ]
                      : []),
                  ]}
                />
              )}
              {regler.handlinger?.map((h) => (
                <button
                  key={h.navn}
                  type="button"
                  class="sekundar med-ikon"
                  title={h.hjelp}
                  onClick={() => {
                    lukk();
                    h.kjor();
                  }}
                >
                  <Ikon id="csv" storrelse={18} />
                  {h.navn}
                </button>
              ))}
              {plugin.bestilling && !bestilt && (
                <button type="button" class="primar med-ikon" onClick={bestill}>
                  <Ikon id="store" storrelse={18} />
                  Legg i handlekurven
                </button>
              )}
            </div>
          )}
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
                      {d.navn}: <span class="mono">{fargekode(mat)}</span>{' '}
                      <span class="dempet">({mat.type})</span>
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
              {regler.merknad && <p class="merknad">{regler.merknad}</p>}
              {regler.sperret && (
                <p class="advarsel" role="status">
                  {regler.sperret}
                </p>
              )}
              {plugin.bestilling && !bestilt && (
                <p class="dempet">
                  Å legge designet i handlekurven sender ikke noe ennå: du sender en forespørsel, og vi svarer
                  med pris og leveringstid før noe blir laget.
                </p>
              )}
              {bestilt && (
                <p role="status">
                  Lagt i handlekurven. <a href={nettsti('/handlekurv/')}>Gå til handlekurven</a> for å sende
                  forespørselen.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
