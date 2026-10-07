/**
 * 3MF writer (3MF Core Specification 1.3). One mesh object per part with
 * its material (colour) from a <basematerials> group, grouped under one
 * assembly object so slicers keep the parts aligned as one multi-part
 * model. Units: millimetre.
 *
 * Slicers place a 3MF by its build transform, with the plate's corner as
 * origin, while the Skaperverksted works around the plate's centre. Each
 * build item is therefore moved by half the plate, so the model lands
 * where it sits in the editor. For Bambu Studio and OrcaSlicer, which do
 * not read <basematerials> as filaments, Metadata/model_settings.config
 * assigns every part a filament slot (one per colour, in order of first
 * use), so the parts keep their colours apart (Sivert, 2026-10-05).
 */
import { zipSync, strToU8 } from 'fflate';
import type { ModellDel } from '../geometri/mesh';
import { finnMateriale, standardPrinter } from '../core/materialer';

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
  /** Build plate the model was designed on (centred on the origin). Default: the standard printer. */
  plate?: { bredde: number; dybde: number };
  /**
   * Filament slots in this order (material ids), then any others in order of
   * first use. Production plates with the same filament combination use the
   * same slots, so the printer's filament setup stays put between plates.
   */
  filamentrekkefolge?: string[];
}

/** Filament slot per material: one per colour, in the given order, then in order of first use (1-based). */
export function filamentplasser(deler: ModellDel[], rekkefolge: readonly string[] = []): string[] {
  const brukt = new Set(deler.map((d) => d.materialId));
  return [...new Set([...rekkefolge.filter((id) => brukt.has(id)), ...brukt])];
}

function plateforskyvning(valg: TremfValg): [number, number] {
  const p = valg.plate ?? { bredde: standardPrinter.plateBredde, dybde: standardPrinter.plateDybde };
  return [p.bredde / 2, p.dybde / 2];
}

/** One build item: parts kept together as one multi-part object. */
export interface TremfSamling {
  navn: string;
  deler: ModellDel[];
}

function modellXml(samlinger: TremfSamling[], valg: TremfValg): string {
  const alle = samlinger.flatMap((s) => s.deler);
  const matIds = filamentplasser(alle, valg.filamentrekkefolge);
  const [tx, ty] = plateforskyvning(valg);
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
  const flytt = `1 0 0 0 1 0 0 0 1 ${tall(tx)} ${tall(ty)} 0`;
  ut.push(`<build>${bygg.map((id) => `<item objectid="${id}" transform="${flytt}" />`).join('')}</build>`);
  ut.push('</model>');
  return ut.join('\n');
}

const INNHOLDSTYPER = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
<Default Extension="config" ContentType="application/xml" />
</Types>`;

/**
 * Bambu Studio / OrcaSlicer part settings: object ids and part ids are the
 * 3MF ids of the assembly objects and their component objects.
 */
function modellinnstillinger(samlinger: TremfSamling[], rekkefolge?: string[]): string {
  const alle = samlinger.flatMap((s) => s.deler);
  const plass = filamentplasser(alle, rekkefolge);
  const ut: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  let nesteId = 2;
  const objekter: number[] = [];
  for (const samling of samlinger) {
    const deler = samling.deler.map((d) => ({ d, id: nesteId++ }));
    const id = nesteId++;
    objekter.push(id);
    ut.push(`  <object id="${id}">`);
    ut.push(`    <metadata key="name" value="${esc(samling.navn)}"/>`);
    ut.push(`    <metadata key="extruder" value="${plass.indexOf(samling.deler[0]!.materialId) + 1}"/>`);
    for (const { d, id: delId } of deler) {
      ut.push(`    <part id="${delId}" subtype="normal_part">`);
      ut.push(`      <metadata key="name" value="${esc(d.navn)}"/>`);
      ut.push('      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>');
      ut.push(`      <metadata key="extruder" value="${plass.indexOf(d.materialId) + 1}"/>`);
      ut.push('    </part>');
    }
    ut.push('  </object>');
  }
  ut.push('  <plate>');
  ut.push('    <metadata key="plater_id" value="1"/>');
  for (const id of objekter) {
    ut.push('    <model_instance>');
    ut.push(`      <metadata key="object_id" value="${id}"/>`);
    ut.push('      <metadata key="instance_id" value="0"/>');
    ut.push('    </model_instance>');
  }
  ut.push('  </plate>');
  ut.push('</config>');
  return ut.join('\n');
}

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
      'Metadata/model_settings.config': strToU8(modellinnstillinger(medInnhold, valg.filamentrekkefolge)),
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
