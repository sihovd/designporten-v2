/**
 * The side profile of one layer: the wall's shape, where it starts on the
 * bottom edge and ends on the top edge, and the cross-section editor.
 * Lives in the Profil panel; the inspector uses it directly where there are
 * no panels (small screens).
 */
import { useMemo } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Lag } from '../../core/dokument';
import { materialtyper, finnMateriale } from '../../core/materialer';
import {
  ankere,
  byggProfil,
  flyttAnker,
  harSpor,
  profilOverheng,
  samplerProfil,
  type ProfilType,
} from '../../core/profil';
import { brukBenk } from '../../shell/bruk-benk';
import { TallFelt } from '../../shell/kontroller';
import { oppdaterLag } from './dokument';
import { lagStotte } from './modell';
import { Profilredigerer } from './Profilredigerer';

export const PROFILER: { id: ProfilType; navn: string }[] = [
  { id: 'rett', navn: 'Rett' },
  { id: 'konveks', navn: 'Bue ut' },
  { id: 'konkav', navn: 'Bue inn' },
  { id: 's-kurve', navn: 'S-kurve' },
  { id: 'trapp', navn: 'Trapp' },
  { id: 'avrundet', navn: 'Avrundet kant' },
  { id: 'fas', navn: 'Knekk (fas)' },
  { id: 'egendefinert', navn: 'Egendefinert kurve' },
];

/** The wall seen from the side, drawn from the real preset: outer edge to the left, up is up. */
function miniKurve(type: ProfilType): string {
  const p = type === 'egendefinert' ? byggProfil('s-kurve', 0, 1.5, 3) : byggProfil(type, 0, 1.5, 3);
  return samplerProfil(p, 10)
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'}${(5 + (pt.inset / 1.5) * 13).toFixed(2)} ${(20 - pt.t * 16).toFixed(2)}`,
    )
    .join(' ');
}

function Profilvalg({ verdi, endre }: { verdi: ProfilType; endre: (t: ProfilType) => void }) {
  return (
    <div class="felt stablet">
      <span id="signgen-profil-etikett">Veggen</span>
      <div class="veggvalg" role="radiogroup" aria-labelledby="signgen-profil-etikett">
        {PROFILER.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === verdi}
            aria-label={p.navn}
            title={p.navn}
            onClick={() => endre(p.id)}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
              <path class="veggvalg-gulv" d="M3 20h18" />
              <path
                class={p.id === 'egendefinert' ? 'veggvalg-kurve stiplet' : 'veggvalg-kurve'}
                d={miniKurve(p.id)}
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Profilseksjon({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const t = brukBenk(benk);
  const endre = (navn: string, profil: Lag['profil'], slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterLag(d, lag.id, { profil }) });
  const profil = lag.profil;
  const a = ankere(profil);
  const stotte = useMemo(() => lagStotte(t.dok, lag.id), [t.dok, lag.id]);
  const maks = materialtyper[finnMateriale(lag.materialId).type].maksOverheng;
  const overheng = profilOverheng(profil, lag.hoyde);
  const spor = harSpor(profil);

  const byttType = (type: ProfilType) => {
    if (type === 'egendefinert') {
      endre('Egendefinert profil', {
        ...profil,
        type,
        bredde: profil.bredde || 1.5,
        punkter: profil.bredde ? profil.punkter : byggProfil('s-kurve', 0, 1.5).punkter,
      });
      return;
    }
    const topp = a.bunn === 0 && a.topp === 0 ? 1.5 : a.topp;
    endre('Bytt profil', byggProfil(type, a.bunn, topp, profil.trinn || 3));
  };

  return (
    <>
      <Profilvalg verdi={profil.type} endre={byttType} />
      <div class="feltpar">
        <TallFelt
          etikett="Bunnkant, innover"
          kortEtikett="Bunn"
          verdi={a.bunn}
          min={0}
          maks={30}
          steg={0.1}
          endre={(v, k) =>
            endre('Profil: bunnkant', flyttAnker(profil, 'bunn', v), k === 'pil' ? 'profil-bunn' : undefined)
          }
        />
        <TallFelt
          etikett="Toppkant, innover"
          kortEtikett="Topp"
          verdi={a.topp}
          min={0}
          maks={30}
          steg={0.1}
          endre={(v, k) =>
            endre('Profil: toppkant', flyttAnker(profil, 'topp', v), k === 'pil' ? 'profil-topp' : undefined)
          }
        />
      </div>
      {profil.type === 'trapp' && (
        <TallFelt
          etikett="Trinn"
          enhet=""
          verdi={profil.trinn}
          min={2}
          maks={12}
          desimaler={0}
          endre={(v) => endre('Antall trinn', byggProfil('trapp', a.bunn, a.topp, Math.round(v)))}
        />
      )}
      <Profilredigerer
        profil={profil}
        hoyde={lag.hoyde}
        farge={finnMateriale(lag.materialId).hex}
        stotte={stotte}
        endre={(p, s) => endre('Endre profil', p, s)}
        ferdig={() => benk.historikk.avsluttSammenslaing()}
      />
      {overheng > maks + 0.5 && (
        <p class="merknad profil-advarsel" role="status">
          Veggen heller utover med {Math.round(overheng)}°. Over {maks}° kan den henge ned uten
          støttemateriale.
        </p>
      )}
      {spor && (
        <p class="merknad profil-advarsel" role="status">
          Veggen går ned igjen og lager et spor i toppen. Et lag som ligger oppå, kan henge over sporet uten
          støtte. Det sjekkes ikke, så se over profilen selv.
        </p>
      )}
    </>
  );
}
