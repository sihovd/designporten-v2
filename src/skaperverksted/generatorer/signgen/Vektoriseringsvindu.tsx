/**
 * «Bilde til vektor» (Sivert, 2026-11-08): pick a PNG, JPG or WebP, see it
 * traced next to the original while adjusting colours, smoothness, specks
 * and the threshold, then put it on the sign. The traced SVG goes through
 * the ordinary SVG import, so a result with several parts opens the part
 * picker, where the user keeps, colours or saves them. Everything runs in
 * the browser; the image is not uploaded.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { Segment } from '../../shell/kontroller';
import { behandleSvg } from './handlinger';
import { lesSvgDeler, SvgFeil } from './svgimport';
import { signtilstand } from './tilstand';
import type { Piksler, Vektorresultat, Vektorvalg } from './vektoriser';

/** The tracer is loaded the first time the window opens, not with the editor. */
const lastVektoriser = () => import('./vektoriser');

const MAKS_MB = 15;
const BILDETYPER = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

interface Lastet {
  navn: string;
  url: string;
  piksler: Piksler;
  skala: number;
  bredde: number;
  hoyde: number;
}

/** A file read into pixels at the size it is traced at. */
async function lesBilde(fil: File): Promise<Lastet> {
  const { sporskala } = await lastVektoriser();
  const url = URL.createObjectURL(fil);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Bildet kunne ikke leses. Bruk PNG, JPG eller WebP.');
  }
  const skala = sporskala(img.naturalWidth, img.naturalHeight);
  const b = Math.max(1, Math.round(img.naturalWidth * skala));
  const h = Math.max(1, Math.round(img.naturalHeight * skala));
  const lerret = document.createElement('canvas');
  lerret.width = b;
  lerret.height = h;
  const ctx = lerret.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, b, h);
  return {
    navn: fil.name.replace(/\.[a-z0-9]+$/i, '') || 'Bilde',
    url,
    piksler: ctx.getImageData(0, 0, b, h),
    skala,
    bredde: img.naturalWidth,
    hoyde: img.naturalHeight,
  };
}

type Fargevalg = '1' | '2' | '3' | '4' | '6';

export function Vektoriseringsvindu({ benk }: { benk: Arbeidsbenk }) {
  const [bilde, settBilde] = useState<Lastet | null>(null);
  const [valg, settValg] = useState<Vektorvalg | null>(null);
  const [resultat, settResultat] = useState<Vektorresultat | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [jobber, settJobber] = useState(false);
  const [over, settOver] = useState(false);
  const fil = useRef<HTMLInputElement>(null);
  const lukk = () => signtilstand(benk).sett({ vektoriser: false });

  useEffect(() => {
    void lastVektoriser().then((m) => settValg((v) => v ?? { ...m.STANDARD_VEKTORVALG }));
  }, []);
  useEffect(() => () => bilde && URL.revokeObjectURL(bilde.url), [bilde]);

  // trace again shortly after the last change, so sliders stay responsive
  useEffect(() => {
    if (!bilde || !valg) return;
    let avbrutt = false;
    settJobber(true);
    const t = window.setTimeout(() => {
      void lastVektoriser().then(({ vektoriser, VektorFeil }) => {
        if (avbrutt) return;
        try {
          settResultat(vektoriser(bilde.piksler, valg, bilde.skala));
          settFeil(null);
        } catch (e) {
          settResultat(null);
          settFeil(e instanceof VektorFeil ? e.message : 'Bildet kunne ikke vektoriseres.');
        } finally {
          settJobber(false);
        }
      });
    }, 220);
    return () => {
      avbrutt = true;
      clearTimeout(t);
    };
  }, [bilde, valg]);

  const forhand = useMemo(
    () => (resultat ? URL.createObjectURL(new Blob([resultat.svg], { type: 'image/svg+xml' })) : null),
    [resultat],
  );
  useEffect(() => () => forhand && URL.revokeObjectURL(forhand), [forhand]);

  const velgFil = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/') || f.type === 'image/svg+xml') {
      settFeil(
        f.type === 'image/svg+xml'
          ? 'Dette er allerede en SVG. Bruk SVG-knappen i verktøylinjen.'
          : 'Velg et bilde (PNG, JPG eller WebP).',
      );
      return;
    }
    if (f.size > MAKS_MB * 1024 * 1024) {
      settFeil(`Bildet er større enn ${MAKS_MB} MB.`);
      return;
    }
    settFeil(null);
    settJobber(true);
    try {
      settBilde(await lesBilde(f));
    } catch (e) {
      settJobber(false);
      settFeil(e instanceof Error ? e.message : 'Bildet kunne ikke leses.');
    }
  };

  const endre = (d: Partial<Vektorvalg>) => settValg((v) => (v ? { ...v, ...d } : v));

  const leggPa = () => {
    if (!resultat || !bilde) return;
    try {
      const deler = lesSvgDeler(resultat.svg, `${bilde.navn}.svg`);
      lukk();
      behandleSvg(benk, deler, 'pynt', 'skilt');
    } catch (e) {
      settFeil(e instanceof SvgFeil ? e.message : 'Vektoren kunne ikke legges på skiltet.');
    }
  };

  const antallDeler = resultat?.lag.reduce((s, l) => s + l.deler, 0) ?? 0;
  const status = !bilde
    ? null
    : jobber
      ? 'Vektoriserer …'
      : resultat
        ? `${antallDeler} ${antallDeler === 1 ? 'del' : 'deler'} i ${resultat.lag.length} ${
            resultat.lag.length === 1 ? 'farge' : 'farger'
          }`
        : null;
  const en = valg?.farger === 1;

  return (
    <Dialog tittel="Bilde til vektor" lukk={lukk} klasse="vektorvindu">
      <div class="vektorvindu-innhold">
        <div
          class="vektor-slipp"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            settOver(true);
          }}
          onDragLeave={() => settOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            settOver(false);
            void velgFil(e.dataTransfer?.files?.[0]);
          }}
        >
          {bilde ? (
            <div class="vektor-sammenlign">
              <figure>
                <img src={bilde.url} alt={`Originalen, ${bilde.navn}`} />
                <figcaption class="dempet">
                  Original · {bilde.bredde} × {bilde.hoyde} px
                </figcaption>
              </figure>
              <figure aria-busy={jobber}>
                {forhand ? (
                  <img src={forhand} alt="Vektorisert forhåndsvisning" />
                ) : (
                  <div class="vektor-tom" />
                )}
                <figcaption class="dempet" role="status" aria-live="polite">
                  {status ?? ' '}
                </figcaption>
              </figure>
            </div>
          ) : (
            <p class="dempet">
              Dra et bilde hit, eller velg et. Logoer og tegninger med tydelige kanter blir best.
            </p>
          )}
          <button type="button" class="sekundar" onClick={() => fil.current?.click()}>
            {bilde ? 'Velg et annet bilde' : 'Velg bilde'}
          </button>
          <input
            ref={fil}
            type="file"
            accept={BILDETYPER}
            hidden
            onChange={(e) => {
              const inp = e.target as HTMLInputElement;
              void velgFil(inp.files?.[0]);
              inp.value = '';
            }}
          />
        </div>

        {valg && bilde && (
          <div class="vektor-valg">
            <div class="felt">
              <span>Farger</span>
              <Segment<Fargevalg>
                etikett="Antall farger"
                valg={[
                  { id: '1', navn: '1' },
                  { id: '2', navn: '2' },
                  { id: '3', navn: '3' },
                  { id: '4', navn: '4' },
                  { id: '6', navn: '6' },
                ]}
                verdi={String(valg.farger) as Fargevalg}
                endre={(v) => endre({ farger: Number(v) })}
              />
            </div>
            <label class="felt">
              <span>Glatthet</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={valg.glatthet}
                aria-valuetext={`${Math.round(valg.glatthet * 100)} %`}
                onInput={(e) => endre({ glatthet: Number((e.target as HTMLInputElement).value) })}
              />
            </label>
            <label class="felt">
              <span>Fjern flekker</span>
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={valg.flekker}
                aria-valuetext={`under ${valg.flekker} piksler`}
                onInput={(e) => endre({ flekker: Number((e.target as HTMLInputElement).value) })}
              />
            </label>
            {en && (
              <>
                <div class="felt">
                  <span>Terskel</span>
                  <div class="vektor-terskel">
                    <label class="avkryssing">
                      <input
                        type="checkbox"
                        checked={valg.terskel === null}
                        onChange={(e) =>
                          endre({
                            terskel: (e.target as HTMLInputElement).checked
                              ? null
                              : Math.round(resultat?.terskel ?? 128),
                          })
                        }
                      />
                      Automatisk
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={254}
                      step={1}
                      aria-label="Terskel for lyshet"
                      disabled={valg.terskel === null}
                      value={Math.round(valg.terskel ?? resultat?.terskel ?? 128)}
                      onInput={(e) => endre({ terskel: Number((e.target as HTMLInputElement).value) })}
                    />
                  </div>
                </div>
                <label class="felt">
                  <span>Inverter</span>
                  <input
                    type="checkbox"
                    checked={valg.inverter}
                    onChange={(e) => endre({ inverter: (e.target as HTMLInputElement).checked })}
                  />
                </label>
              </>
            )}
            {!en && (
              <label class="felt">
                <span>Fjern bakgrunn</span>
                <input
                  type="checkbox"
                  checked={valg.fjernBakgrunn}
                  onChange={(e) => endre({ fjernBakgrunn: (e.target as HTMLInputElement).checked })}
                />
              </label>
            )}
          </div>
        )}

        {feil && (
          <p class="merknad advarsel-tekst" role="alert">
            {feil}
          </p>
        )}
        <p class="dempet">
          Bildet behandles i nettleseren og lastes ikke opp. Har vektoren flere deler, velger du etterpå
          hvilke du vil ha og hvilke farger de får.
        </p>
      </div>
      <div class="knapperad vektor-handlinger">
        <button type="button" class="primar" disabled={!resultat || jobber} onClick={leggPa}>
          Legg på skiltet
        </button>
        <button type="button" class="sekundar" onClick={lukk}>
          Avbryt
        </button>
      </div>
    </Dialog>
  );
}
