/**
 * 3MF writer (3MF Core Specification 1.3). One mesh object per part with
 * its material (colour) from a <basematerials> group, grouped under one
 * assembly object so slicers keep the parts aligned as one multi-part
 * model. Units: millimetre.
 */
import { zipSync, strToU8 } from 'fflate';
import type { ModellDel } from '../geometri/mesh';
import { finnMateriale } from '../core/materialer';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Shortest decimal that round-trips a float32 well enough for print (µm). */
const tall = (x: number) => {
  const r = Math.round(x * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};

export interface TremfValg {
  tittel: string;
  /** Free-form metadata (designer, description). */
  meta?: Record<string, string>;
}

/** One build item: parts kept together as one multi-part object. */
export interface TremfSamling {
  navn: string;
  deler: ModellDel[];
}

function modellXml(samlinger: TremfSamling[], valg: TremfValg): string {
  const alle = samlinger.flatMap((s) => s.deler);
  const matIds = [...new Set(alle.map((d) => d.materialId))];
  const ut: string[] = [];
  ut.push('<?xml version="1.0" encoding="UTF-8"?>');
  ut.push(
    '<model unit="millimeter" xml:lang="nb-NO" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
  );
  ut.push(`<metadata name="Title">${esc(valg.tittel)}</metadata>`);
  ut.push('<metadata name="Application">Designporten Skaperverksted</metadata>');
  ut.push(`<metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>`);
  for (const [k, v] of Object.entries(valg.meta ?? {})) {
    ut.push(`<metadata name="${esc(k)}">${esc(v)}</metadata>`);
  }
  ut.push('<resources>');
  ut.push('<basematerials id="1">');
  for (const id of matIds) {
    const m = finnMateriale(id);
    ut.push(`<base name="${esc(`${m.navn} (${m.type})`)}" displaycolor="${m.hex.toUpperCase()}FF" />`);
  }
  ut.push('</basematerials>');
  let nesteId = 2;
  const bygg: number[] = [];
  for (const samling of samlinger) {
    const objektIder: number[] = [];
    for (const d of samling.deler) {
      const id = nesteId++;
      objektIder.push(id);
      const pindex = matIds.indexOf(d.materialId);
      ut.push(`<object id="${id}" name="${esc(d.navn)}" type="model" pid="1" pindex="${pindex}">`);
      ut.push('<mesh><vertices>');
      const p = d.mesh.posisjoner;
      const punkter: string[] = [];
      for (let v = 0; v < p.length; v += 3) {
        punkter.push(`<vertex x="${tall(p[v]!)}" y="${tall(p[v + 1]!)}" z="${tall(p[v + 2]!)}" />`);
      }
      ut.push(punkter.join(''));
      ut.push('</vertices><triangles>');
      const ix = d.mesh.indekser;
      const tris: string[] = [];
      for (let t = 0; t < ix.length; t += 3) {
        tris.push(`<triangle v1="${ix[t]}" v2="${ix[t + 1]}" v3="${ix[t + 2]}" />`);
      }
      ut.push(tris.join(''));
      ut.push('</triangles></mesh></object>');
    }
    const id = nesteId++;
    bygg.push(id);
    ut.push(`<object id="${id}" name="${esc(samling.navn)}" type="model"><components>`);
    for (const o of objektIder) ut.push(`<component objectid="${o}" />`);
    ut.push('</components></object>');
  }
  ut.push('</resources>');
  ut.push(`<build>${bygg.map((id) => `<item objectid="${id}" />`).join('')}</build>`);
  ut.push('</model>');
  return ut.join('\n');
}

const INNHOLDSTYPER = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

const RELASJONER = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

export function tilTremf(deler: ModellDel[], valg: TremfValg): Uint8Array {
  return tilTremfSamlinger([{ navn: valg.tittel, deler }], valg);
}

/** Several separate objects on one plate (e.g. a batch plate). */
export function tilTremfSamlinger(samlinger: TremfSamling[], valg: TremfValg): Uint8Array {
  const medInnhold = samlinger
    .map((s) => ({ ...s, deler: s.deler.filter((d) => d.mesh.indekser.length > 0) }))
    .filter((s) => s.deler.length > 0);
  return zipSync(
    {
      '[Content_Types].xml': strToU8(INNHOLDSTYPER),
      '_rels/.rels': strToU8(RELASJONER),
      '3D/3dmodel.model': strToU8(modellXml(medInnhold, valg)),
    },
    { level: 6 },
  );
}

export const STL_TYPE = 'model/stl';
export const TREMF_TYPE = 'model/3mf';

/** Safe file name from a project name. */
export function filnavn(navn: string, endelse: 'stl' | '3mf'): string {
  const base =
    navn
      .normalize('NFKD')
      .replace(/æ/gi, 'ae')
      .replace(/ø/gi, 'o')
      .replace(/å/gi, 'a')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'skaperverksted';
  return `${base}.${endelse}`;
}
