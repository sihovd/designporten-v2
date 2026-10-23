/**
 * The properties panel (handoff: «Høyre egenskapspanel viser parametere for
 * aktivt objekt/ledd/Feature»). With nothing selected it shows the figure,
 * the tolerances and the checks; with a part or a joint selected, its
 * values. Every value can be typed, so nothing depends on dragging.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { alleMaterialer, finnMateriale, visningsnavn } from '../../core/materialer';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import type { CfResultat, Funn } from './bygg';
import { grunnformer } from './grunnformer';
import { les, settDel, settKuppel, settLedd, settToleranse, slettDel, speilpartner } from './handlinger';
import { finnProfil, MEKANISMER, SIKKERHET_NAVN, toleranser } from './ledd';
import { GRENSER, valider, type Del, type Kuppel, type Ledd, type Mekanisme } from './parametre';
import { etterkommere, finnDel, leddFra, leddTil } from './plassering';
import { tilstand } from './tilstand';
import type { V3 } from './vektor';

const AKSER = ['X', 'Y', 'Z'] as const;
const NIVA: Record<Funn['niva'], string> = { feil: 'Feil', advarsel: 'Merknad', info: 'Info' };

export function CfEgenskaper({ benk }: { benk: Arbeidsbenk }) {
  const t = tilstand(benk);
  const p = brukUtdrag(benk, (s) => les(s.dok));
  const modell = brukUtdrag(benk, (s) => s.modell) as CfResultat | null;
  const foreldet = brukUtdrag(benk, (s) => s.modellForeldet || s.bygger);
  const v = valider(p);
  const valgt = t.valgt.value;

  if (!v.ok)
    return (
      <Panel tittel="Prosjektet kan ikke leses">
        <ul class="cf-funn">
          {v.grunner.map((g) => (
            <li key={g} class="feil">
              {g}
            </li>
          ))}
        </ul>
      </Panel>
    );

  const del = valgt?.type === 'del' ? finnDel(p, valgt.id) : undefined;
  const ledd = valgt?.type === 'ledd' ? p.ledd.find((l) => l.id === valgt.id) : undefined;
  const funn = (modell?.funn ?? []).filter((f) =>
    del ? f.delId === del.id : ledd ? f.leddId === ledd.id : true,
  );

  return (
    <div class="cf-egenskaper">
      {del ? (
        <DelPanel benk={benk} del={del} />
      ) : ledd ? (
        <LeddPanel benk={benk} ledd={ledd} modell={modell} />
      ) : (
        <Oversikt benk={benk} />
      )}
      <Panel tittel={del || ledd ? 'Kontroll for valget' : 'Kontroll'}>
        {foreldet && <p class="cf-hjelp">Kontrollerer den siste endringen …</p>}
        {!p.deler.length ? (
          <p class="cf-hjelp">Ingenting å kontrollere ennå.</p>
        ) : (
          <ul class="cf-funn">
            {funn.map((f, i) => (
              <li key={`${f.regel}-${i}`} class={f.niva}>
                <strong>
                  <span class="visuelt-skjult">{NIVA[f.niva]}: </span>
                  {f.tittel}
                </strong>
                <span>{f.tekst}</span>
                <span class="cf-regel">{f.regel}</span>
              </li>
            ))}
            {!funn.length && !foreldet && <li class="info">Ingen funn for dette valget.</li>}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Oversikt({ benk }: { benk: Arbeidsbenk }) {
  const t = tilstand(benk);
  const p = brukUtdrag(benk, (s) => les(s.dok));
  const profil = finnProfil(p.profil.id, p.profil.versjon);
  const tol = profil && toleranser(p, profil);
  return (
    <>
      <Panel tittel="Figur">
        {!p.deler.length ? (
          <p class="cf-hjelp">Ingen deler ennå. Velg «Hode» i menyen nederst.</p>
        ) : (
          <ul class="cf-liste">
            {p.deler.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => (t.valgt.value = { type: 'del', id: d.id })}>
                  <span
                    class="cf-farge"
                    style={{ background: finnMateriale(d.farge).hex }}
                    aria-hidden="true"
                  />
                  {d.navn}
                </button>
              </li>
            ))}
            {p.ledd.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => (t.valgt.value = { type: 'ledd', id: l.id })}>
                  <span class="cf-leddprikk" aria-hidden="true" />
                  Ledd: {finnDel(p, l.forelder.del)?.navn} – {finnDel(p, l.barn.del)?.navn}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {profil && tol && (
        <Panel tittel="Toleranser">
          <p class="cf-hjelp">
            Utskriftsklaringen er luften mellom flater i leddet som skal bevege seg. Den er adskilt fra
            kuppelen.
          </p>
          {(['klaring', 'spillerom'] as const).map((k) => (
            <div key={k} class="cf-toleranse">
              <TallFelt
                etikett={profil.maal[k].navn}
                verdi={tol[k]}
                min={GRENSER[k].min}
                maks={GRENSER[k].maks}
                steg={0.05}
                desimaler={2}
                endre={(v) => settToleranse(benk, k, v)}
              />
              <span class="cf-sikkerhet">
                {tol.egne[k] ? 'Din verdi' : SIKKERHET_NAVN[profil.maal[k].sikkerhet]}
                {tol.egne[k] && (
                  <button
                    type="button"
                    class="cf-lenkeknapp"
                    onClick={() => settToleranse(benk, k, undefined)}
                  >
                    Tilbakestill
                  </button>
                )}
              </span>
            </div>
          ))}
          <details class="cf-profil">
            <summary>
              {profil.navn} {profil.versjon}: ikke testet
            </summary>
            <p class="cf-hjelp">{profil.merknad}</p>
            <dl>
              {Object.values(profil.maal).map((m) => (
                <div key={m.navn}>
                  <dt>{m.navn}</dt>
                  <dd>
                    <span class="mono">
                      {String(m.verdi).replace('.', ',')} {m.enhet}
                    </span>{' '}
                    · {SIKKERHET_NAVN[m.sikkerhet]}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </Panel>
      )}
    </>
  );
}

function V3Felt({
  etikett,
  verdi,
  enhet,
  grense,
  steg = 1,
  endre,
}: {
  etikett: string;
  verdi: V3;
  enhet: string;
  grense: { min: number; maks: number };
  steg?: number;
  endre: (v: V3) => void;
}) {
  return (
    <fieldset class="cf-v3">
      <legend>{etikett}</legend>
      {AKSER.map((a, i) => (
        <TallFelt
          key={a}
          etikett={`${etikett} ${a}`}
          kortEtikett={a}
          verdi={verdi[i]!}
          enhet={enhet}
          min={grense.min}
          maks={grense.maks}
          steg={steg}
          endre={(v) => endre(verdi.map((x, j) => (j === i ? v : x)) as V3)}
        />
      ))}
    </fieldset>
  );
}

function DelPanel({ benk, del }: { benk: Arbeidsbenk; del: Del }) {
  const p = brukUtdrag(benk, (s) => les(s.dok));
  const t = tilstand(benk);
  const g = grunnformer[del.type];
  const erRot = !leddTil(p, del.id);
  const under = etterkommere(p, del.id).length;
  const ledd = [...(leddTil(p, del.id) ? [leddTil(p, del.id)!] : []), ...leddFra(p, del.id)];
  const makker = speilpartner(p, del.id);
  return (
    <Panel tittel={del.navn}>
      <p class="cf-hjelp">
        {g.navn}
        {erRot
          ? ', figurens utgangspunkt. Barna følger når den flyttes.'
          : '. Plassert av leddet den henger i.'}
        {makker && ` Symmetri: endringer gjøres også på ${finnDel(p, makker)?.navn.toLowerCase()}.`}
      </p>
      {g.varianter.length > 1 && (
        <Segment<string>
          etikett="Form"
          valg={g.varianter.map((v) => ({ id: v.id, navn: v.navn }))}
          verdi={del.variant ?? g.varianter[0]!.id}
          endre={(v) => settDel(benk, del.id, 'Byttet form', { variant: v })}
        />
      )}
      <label class="cf-tekstfelt">
        <span>Navn</span>
        <input
          type="text"
          value={del.navn}
          maxLength={60}
          onChange={(e) => {
            const navn = (e.currentTarget as HTMLInputElement).value.trim();
            if (navn) settDel(benk, del.id, 'Endret navn', { navn });
          }}
        />
      </label>
      <TallFelt
        etikett="Lengde"
        verdi={del.lengde}
        min={g.lengde.min}
        maks={g.lengde.maks}
        endre={(v) => settDel(benk, del.id, 'Endret lengde', { lengde: v }, 'lengde')}
      />
      <TallFelt
        etikett="Tykkelse"
        verdi={del.tykkelse}
        min={g.tykkelse.min}
        maks={g.tykkelse.maks}
        endre={(v) => settDel(benk, del.id, 'Endret tykkelse', { tykkelse: v }, 'tykkelse')}
      />
      <label class="cf-tekstfelt">
        <span>Farge</span>
        <select
          value={del.farge}
          onChange={(e) =>
            settDel(benk, del.id, 'Endret farge', { farge: (e.currentTarget as HTMLSelectElement).value })
          }
        >
          {alleMaterialer().map((m) => (
            <option key={m.id} value={m.id}>
              {visningsnavn(m)} ({m.type})
            </option>
          ))}
        </select>
      </label>
      {erRot && (
        <>
          <V3Felt
            etikett="Posisjon"
            enhet="mm"
            verdi={del.posisjon ?? [0, 0, 0]}
            grense={GRENSER.posisjon}
            endre={(v) =>
              settDel(benk, del.id, `Flyttet ${del.navn.toLowerCase()}`, { posisjon: v }, 'posisjon')
            }
          />
          <V3Felt
            etikett="Rotasjon"
            enhet="°"
            verdi={del.rotasjon ?? [0, 0, 0]}
            grense={GRENSER.rotasjon}
            endre={(v) =>
              settDel(benk, del.id, `Roterte ${del.navn.toLowerCase()}`, { rotasjon: v }, 'rotasjon')
            }
          />
        </>
      )}
      {ledd.length > 0 && (
        <div class="cf-knapperad">
          {ledd.map((l) => (
            <button key={l.id} type="button" onClick={() => (t.valgt.value = { type: 'ledd', id: l.id })}>
              Velg ledd til {finnDel(p, l.forelder.del === del.id ? l.barn.del : l.forelder.del)?.navn}
            </button>
          ))}
        </div>
      )}
      <button type="button" class="cf-slett" onClick={() => slettDel(benk, del.id)}>
        Slett {del.navn.toLowerCase()}
        {under ? ` og ${under} ${under === 1 ? 'del' : 'deler'} under` : ''}
        {makker ? ', også på den andre siden' : ''}
      </button>
    </Panel>
  );
}

const KUPPELFELT: { k: keyof Kuppel; navn: string; enhet: string; steg: number; desimaler: number }[] = [
  { k: 'diameter', navn: 'Diameter', enhet: 'mm', steg: 0.5, desimaler: 1 },
  { k: 'dybde', navn: 'Dybde', enhet: 'mm', steg: 0.25, desimaler: 2 },
  { k: 'helning', navn: 'Vinkel', enhet: '°', steg: 1, desimaler: 0 },
  { k: 'retning', navn: 'Orientering', enhet: '°', steg: 5, desimaler: 0 },
  { k: 'tykkelseSenter', navn: 'Tykkelse i sentrum', enhet: 'mm', steg: 0.1, desimaler: 2 },
  { k: 'tykkelseKant', navn: 'Tykkelse i kanten', enhet: 'mm', steg: 0.1, desimaler: 2 },
];

function LeddPanel({ benk, ledd, modell }: { benk: Arbeidsbenk; ledd: Ledd; modell: CfResultat | null }) {
  const p = brukUtdrag(benk, (s) => les(s.dok));
  const t = tilstand(benk);
  const f = finnDel(p, ledd.forelder.del),
    b = finnDel(p, ledd.barn.del);
  const info = modell?.ledd.find((l) => l.id === ledd.id);
  const mek = MEKANISMER.find((m) => m.id === ledd.mekanisme)!;
  const makker = speilpartner(p, ledd.barn.del);
  return (
    <>
      <Panel tittel={`Ledd: ${f?.navn ?? ''} – ${b?.navn ?? ''}`}>
        <Segment<Mekanisme>
          etikett="Mekanisme"
          valg={MEKANISMER.map((m) => ({ id: m.id, navn: m.navn }))}
          verdi={ledd.mekanisme}
          endre={(v) => settLedd(benk, ledd.id, 'Byttet mekanisme', { mekanisme: v })}
        />
        <p class="cf-hjelp">
          {mek.beskrivelse} Mekanismen er under test og ikke bestemt.
          {makker && ` Symmetri: endringer speiles til leddet på ${finnDel(p, makker)?.navn.toLowerCase()}.`}
        </p>
        <TallFelt
          etikett="Mekanismens størrelse"
          verdi={ledd.storrelse ?? 1}
          enhet="×"
          min={GRENSER.storrelse.min}
          maks={GRENSER.storrelse.maks}
          steg={0.05}
          desimaler={2}
          endre={(v) =>
            settLedd(benk, ledd.id, 'Endret mekanismens størrelse', { storrelse: v }, 'storrelse')
          }
        />
        <TallFelt
          etikett="Avstand"
          verdi={ledd.avstand}
          min={GRENSER.avstand.min}
          maks={GRENSER.avstand.maks}
          steg={0.5}
          endre={(v) => settLedd(benk, ledd.id, 'Endret avstand', { avstand: v }, 'avstand')}
        />
        <V3Felt
          etikett="Forskyvning"
          enhet="mm"
          verdi={ledd.forskyvning}
          grense={GRENSER.forskyvning}
          steg={0.5}
          endre={(v) => settLedd(benk, ledd.id, 'Flyttet leddet', { forskyvning: v }, 'forskyvning')}
        />
        <V3Felt
          etikett="Orientering"
          enhet="°"
          verdi={ledd.rotasjon}
          grense={GRENSER.rotasjon}
          endre={(v) => settLedd(benk, ledd.id, 'Roterte leddet', { rotasjon: v }, 'rotasjon')}
        />
        {info && (
          <p class="cf-hjelp">
            Sving om leddets akse:{' '}
            <span class="mono">
              {info.sving.minus}° / {info.sving.pluss}°
            </span>{' '}
            (kontrollert til ±{info.sving.maal}°). Fangst:{' '}
            <span class="mono">{info.fangst.toFixed(2).replace('.', ',')} mm</span>.
          </p>
        )}
      </Panel>
      <Panel tittel="Kuppel">
        <p class="cf-hjelp">
          Et negativt volum midt i leddet som skjæres fra begge delene. Tykkelsen gjelder selve utskjæringen.
          Kuppelen er uavhengig av leddets utskriftsklaring.
        </p>
        <label class="cf-avkrysning">
          <input
            type="checkbox"
            checked={t.visKuppel.value}
            onChange={(e) => (t.visKuppel.value = (e.currentTarget as HTMLInputElement).checked)}
          />
          Vis kuppelen i 3D
        </label>
        {KUPPELFELT.map((k) => {
          const g = GRENSER.kuppel[k.k];
          const maks = k.k === 'dybde' ? Math.min(g.maks, ledd.kuppel.diameter / 2) : g.maks;
          return (
            <TallFelt
              key={k.k}
              etikett={k.navn}
              verdi={ledd.kuppel[k.k]}
              enhet={k.enhet}
              min={g.min}
              maks={maks}
              steg={k.steg}
              desimaler={k.desimaler}
              endre={(v) =>
                settKuppel(
                  benk,
                  ledd.id,
                  `Endret kuppelens ${k.navn.toLowerCase()}`,
                  { [k.k]: v },
                  `kuppel-${k.k}`,
                )
              }
            />
          );
        })}
      </Panel>
    </>
  );
}
