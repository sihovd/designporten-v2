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
import { ankere, byggProfil, flyttAnker, harSpor, profilOverheng, type ProfilType } from '../../core/profil';
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
      <label class="felt" for="signgen-profil">
        <span>Veggen</span>
        <select
          id="signgen-profil"
          value={profil.type}
          onChange={(e) => byttType((e.target as HTMLSelectElement).value as ProfilType)}
        >
          {PROFILER.map((p) => (
            <option key={p.id} value={p.id}>
              {p.navn}
            </option>
          ))}
        </select>
      </label>
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
      <p class="merknad">
        Profilen blir ekte geometri: 3D-visningen og filen viser det som blir printet, lag for lag. Bunn og
        topp flyttes sideveis. Punkter du legger til på veggen kan dras både sideveis og opp og ned, også slik
        at veggen går ned igjen (et spor i toppen).
      </p>
    </>
  );
}
