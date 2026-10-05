import { unzipSync, strFromU8 } from 'fflate';
import { tilStl, lesStl } from './stl';
import { tilTremf, filnavn } from './tremf';
import { ekstruder } from '../geometri/ekstruder';
import { regionFraRinger } from '../geometri/polygon';
import { rektangel, ellipse } from '../geometri/former';
import { sjekkManifold, volum, type ModellDel } from '../geometri/mesh';
import { rettProfil, forhandsvalg } from '../core/profil';

function deler(): ModellDel[] {
  const base = ekstruder(regionFraRinger([rektangel(60, 20, 3)]), 0, 2, rettProfil()).mesh;
  const topp = ekstruder(regionFraRinger([ellipse(10, 10)]), 2, 1.5, forhandsvalg('avrundet', 1)).mesh;
  return [
    { id: 'a', navn: 'Bunnplate', materialId: 'pla-grafitt', mesh: base },
    { id: 'b', navn: 'Tekst', materialId: 'pla-lilla', mesh: topp },
  ];
}

/** Minimal 3MF reader for tests: every <object> with a mesh. */
function lesTremf(zip: Uint8Array) {
  const filer = unzipSync(zip);
  const xml = strFromU8(filer['3D/3dmodel.model']!);
  const objekter = [
    ...xml.matchAll(/<object id="(\d+)"[^>]*?(?:pindex="(\d+)")?>\s*<mesh>([\s\S]*?)<\/mesh>/g),
  ].map((m) => {
    const v = [...m[3]!.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].flatMap((x) => [
      +x[1]!,
      +x[2]!,
      +x[3]!,
    ]);
    const t = [...m[3]!.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].flatMap((x) => [
      +x[1]!,
      +x[2]!,
      +x[3]!,
    ]);
    return {
      id: m[1],
      pindex: m[2],
      mesh: { posisjoner: new Float32Array(v), indekser: new Uint32Array(t) },
    };
  });
  return { filer, xml, objekter };
}

describe('STL', () => {
  it('writes a valid binary STL that reads back closed with the same volume', () => {
    const d = deler();
    const stl = tilStl(d);
    const tri = d.reduce((n, x) => n + x.mesh.indekser.length / 3, 0);
    expect(stl.byteLength).toBe(84 + tri * 50);
    const m = lesStl(stl);
    expect(sjekkManifold(m).lukket).toBe(true);
    const v = d.reduce((s, x) => s + volum(x.mesh), 0);
    expect(volum(m)).toBeCloseTo(v, 1);
  });
});

describe('3MF', () => {
  it('writes the package parts, materials and one object per part', () => {
    const { filer, xml, objekter } = lesTremf(tilTremf(deler(), { tittel: 'Skilt <test> & co' }));
    expect(Object.keys(filer).sort()).toEqual([
      '3D/3dmodel.model',
      'Metadata/model_settings.config',
      '[Content_Types].xml',
      '_rels/.rels',
    ]);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('Skilt &lt;test&gt; &amp; co');
    expect(xml.match(/<base /g)).toHaveLength(2);
    expect(xml).toContain('displaycolor="#883DFFFF"');
    expect(objekter).toHaveLength(2);
    expect(objekter.map((o) => o.pindex)).toEqual(['0', '1']);
    expect(xml).toMatch(/<components>\s*<component objectid="2" \/>/);
    for (const o of objekter) {
      expect(sjekkManifold(o.mesh).lukket).toBe(true);
      expect(volum(o.mesh)).toBeGreaterThan(0);
    }
  });

  it('places the model on the plate as in the editor and gives each colour a filament slot', () => {
    const d = [...deler(), { ...deler()[0]!, id: 'c', navn: 'Ramme' }];
    const { filer, xml } = lesTremf(tilTremf(d, { tittel: 'x', plate: { bredde: 200, dybde: 180 } }));
    // the editor is centred on the plate; slicers count from the plate's corner
    expect(xml).toContain('<item objectid="5" transform="1 0 0 0 1 0 0 0 1 100 90 0" />');
    const cfg = strFromU8(filer['Metadata/model_settings.config']!);
    expect(cfg).toContain('<object id="5">');
    const plasser = [...cfg.matchAll(/<part id="(\d+)"[\s\S]*?key="extruder" value="(\d+)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    // two parts in graphite share slot 1, the purple text gets slot 2
    expect(plasser).toEqual([
      ['2', '1'],
      ['3', '2'],
      ['4', '1'],
    ]);
    expect(strFromU8(filer['[Content_Types].xml']!)).toContain('Extension="config"');
  });

  it('skips empty parts and makes safe file names', () => {
    const d = deler();
    d.push({
      id: 'c',
      navn: 'Tom',
      materialId: 'pla-cyan',
      mesh: { posisjoner: new Float32Array(), indekser: new Uint32Array() },
    });
    expect(lesTremf(tilTremf(d, { tittel: 'x' })).objekter).toHaveLength(2);
    expect(filnavn('Blåbær-skilt for Øystein!', '3mf')).toBe('blabaer-skilt-for-oystein.3mf');
    expect(filnavn('   ', 'stl')).toBe('skaperverksted.stl');
  });
});
