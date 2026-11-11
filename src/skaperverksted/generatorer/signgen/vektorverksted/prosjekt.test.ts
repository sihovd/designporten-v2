import { erProsjektfil, prosjektFraFil, prosjektTilFil, type Prosjekt } from './prosjekt';

const png = (n: number) => new Blob([new Uint8Array(n).map((_, i) => i % 251)], { type: 'image/png' });

describe('prosjektfil', () => {
  it('leser tilbake det som ble lagret', async () => {
    const p: Prosjekt = {
      versjon: 1,
      navn: 'Logo + skilt',
      lagret: 1_700_000_000_000,
      bilde: png(100_000),
      maske: png(10),
      beskytt: null,
      tilstand: { farger: 3, lagMeta: { '#ff0000': { navn: 'Rødt' } } },
    };
    const fil = new File([await prosjektTilFil(p)], 'Logo + skilt.vectorim');
    expect(erProsjektfil(fil)).toBe(true);
    const ut = await prosjektFraFil(fil);
    expect(ut.navn).toBe('Logo + skilt');
    expect(ut.lagret).toBe(p.lagret);
    expect(ut.tilstand).toEqual(p.tilstand);
    expect(ut.beskytt).toBeNull();
    expect(new Uint8Array(await ut.bilde.arrayBuffer())).toEqual(new Uint8Array(await p.bilde.arrayBuffer()));
    expect(ut.maske?.size).toBe(10);
  });

  it('avviser filer som ikke er prosjekter', async () => {
    await expect(prosjektFraFil(new File(['hei'], 'a.vectorim'))).rejects.toThrow(
      /ikke et Vectorim-prosjekt/,
    );
    const feilBilde = JSON.stringify({ format: 'vectorim', versjon: 1, bilde: 'data:text/html;base64,PGI+' });
    await expect(prosjektFraFil(new File([feilBilde], 'b.vectorim'))).rejects.toThrow();
    expect(erProsjektfil(new File([''], 'bilde.png'))).toBe(false);
  });
});
