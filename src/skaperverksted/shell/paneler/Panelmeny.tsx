/** «Paneler» in the workshop bar: pick a workspace, save your own, show or hide panels. */
import { useRef, useState } from 'preact/hooks';
import type { PanelDef } from '../../core/generator';
import { Ikon, type IkonId } from '../ikoner';
import { useLukkMeny } from '../lukk-meny';
import { EGENDEFINERT, egetId, type PanelHandling, type PanelLager, type RomKontekst } from './lager';
import { apnePanel, erApen, lukkPanel, type Plassering } from './modell';

export function Panelmeny({
  defs,
  lager,
  kontekst,
  send,
  standardPlass,
}: {
  defs: PanelDef[];
  lager: PanelLager;
  kontekst: RomKontekst;
  send: (h: PanelHandling) => void;
  standardPlass: (id: string) => Plassering;
}) {
  const [navn, settNavn] = useState('');
  const rot = useRef<HTMLDetailsElement>(null);
  useLukkMeny(rot);
  const erStandard = kontekst.rom.some((r) => r.id === lager.rom);
  const lagreEget = () => {
    const n = navn.trim();
    if (!n) return;
    if (kontekst.rom.some((r) => r.navn.toLowerCase() === n.toLowerCase())) return;
    send({ t: 'lagre', navn: n });
    settNavn('');
  };
  const rom = (id: string, tekst: string, slett?: string) => (
    <div class="romrad" key={id}>
      <button type="button" aria-pressed={lager.rom === id} onClick={() => send({ t: 'rom', id })}>
        {tekst}
      </button>
      {slett && (
        <button
          type="button"
          class="romslett"
          aria-label={`Slett arbeidsrommet ${slett}`}
          onClick={() => send({ t: 'slett', navn: slett })}
        >
          <Ikon id="panel-close" storrelse={14} />
        </button>
      )}
    </div>
  );
  return (
    <details class="filmeny panelmeny-linje" ref={rot}>
      <summary aria-label="Paneler">
        <Ikon id="paneler" storrelse={16} />
        <span>Paneler</span>
      </summary>
      <div class="meny" role="group" aria-label="Paneler og arbeidsrom">
        <p class="meny-overskrift">Arbeidsrom</p>
        {kontekst.rom.map((r) => rom(r.id, r.navn))}
        {rom(EGENDEFINERT, 'Egendefinert')}
        {lager.egne.map((e) => rom(egetId(e.navn), e.navn, e.navn))}
        <form
          class="lagre-rom"
          onSubmit={(e) => {
            e.preventDefault();
            lagreEget();
          }}
        >
          <input
            type="text"
            value={navn}
            maxLength={40}
            placeholder="Navn på arbeidsrommet"
            aria-label="Lagre dette oppsettet som eget arbeidsrom"
            onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="sekundar" disabled={!navn.trim()}>
            Lagre
          </button>
        </form>
        {erStandard && (
          <button type="button" onClick={() => send({ t: 'tilbakestill' })}>
            Tilbakestill dette arbeidsrommet
          </button>
        )}
        {!erStandard && (
          <button type="button" onClick={() => send({ t: 'tilbakestill' })}>
            Tilbake til {kontekst.rom[0]?.navn ?? 'standard'}
          </button>
        )}
        <p class="meny-overskrift">Vis paneler</p>
        {defs.map((d) => {
          const apen = erApen(lager.oppsett, d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={apen}
              onClick={() =>
                send({
                  t: 'endre',
                  f: (o) => (apen ? lukkPanel(o, d.id) : apnePanel(o, d.id, standardPlass(d.id))),
                })
              }
            >
              <span class="avkryssing" aria-hidden="true">
                {apen ? '✓' : ''}
              </span>
              {d.ikon && <Ikon id={d.ikon as IkonId} storrelse={14} />}
              {d.navn}
            </button>
          );
        })}
      </div>
    </details>
  );
}
