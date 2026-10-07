/**
 * The landing page of Sign Forge (Sivert, 2026-10-06, §21): three large
 * entries instead of an empty editor. «Tomt dokument» goes on to the colour
 * choice, «Fra mal» opens the template library and «Fra CSV» starts a sign
 * to be used as the master of a batch.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { Ikon, type IkonId } from '../../shell/ikoner';
import { palett, settPalett } from './dokument';
import { signtilstand } from './tilstand';

const INNGANGER: { id: 'tomt' | 'mal' | 'csv'; tittel: string; tekst: string; ikon: IkonId }[] = [
  { id: 'tomt', tittel: 'Tomt dokument', tekst: 'Start et nytt skilt fra bunnen.', ikon: 'new' },
  {
    id: 'mal',
    tittel: 'Fra mal',
    tekst: 'Åpne malbiblioteket og start fra en ferdig mal.',
    ikon: 'templates',
  },
  {
    id: 'csv',
    tittel: 'Fra CSV',
    tekst: 'Lag mange skilt fra en liste, for eksempel navneskilt.',
    ikon: 'csv',
  },
];

export function Startside({ benk, maksDager }: { benk: Arbeidsbenk; maksDager?: number }) {
  const velg = (id: 'tomt' | 'mal' | 'csv') => {
    const lager = signtilstand(benk);
    if (id === 'mal') lager.sett({ malvindu: 'bibliotek' });
    else lager.sett({ startsteg: 'farger', startCsv: id === 'csv' });
  };
  // closing the page (Esc) starts an empty sign in the standard colours, so nobody is left without an editor
  const lukk = () => {
    benk.endre({ navn: 'Fargeprofil', anvend: (d) => settPalett(d, palett(d)) });
    signtilstand(benk).sett({ startsteg: 'valg' });
  };
  return (
    <Dialog tittel="Hva vil du lage?" lukk={lukk} klasse="startside">
      <div class="startside-innhold">
        <ul class="startinnganger" role="list">
          {INNGANGER.map((i) => (
            <li key={i.id}>
              <button type="button" class="startinngang" onClick={() => velg(i.id)}>
                <span class="startinngang-ikon" aria-hidden="true">
                  <Ikon id={i.ikon} storrelse={36} />
                </span>
                <span class="startinngang-tittel">{i.tittel}</span>
                <span class="startinngang-tekst">{i.tekst}</span>
              </button>
            </li>
          ))}
        </ul>
        <p class="merknad">
          Uten konto lagres ett skilt i denne nettleseren
          {maksDager ? `, og det slettes hvis du ikke åpner det på ${maksDager} dager` : ''}. Last ned
          prosjektet som fil for å ta vare på det.
        </p>
      </div>
    </Dialog>
  );
}
