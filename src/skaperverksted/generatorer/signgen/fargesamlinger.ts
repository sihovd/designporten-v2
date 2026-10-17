/**
 * Ready-made colour collections (Sivert, 2026-10-16): about a hundred sets of colours that go well
 * together, and a way to make your own from a colour picker. A collection is a list of colours; when it
 * is used, each colour becomes a filament (one that has the colour already is reused), so the sign can
 * be printed in them and the user can later point each to the real spool.
 *
 * The first colour is meant for the text and the second for the base, as in the colour profiles, so
 * the pair is checked to be readable (`kontrast`). The rest are accents. The colours are chosen for
 * display on screen; real filaments differ, and nothing here is a stock list.
 */
import { alleMaterialer, registrerMateriale, type Materiale } from '../../core/materialer';
import { lagreEgetFilament } from './filamenter';
import { lagreEgenProfil } from './fargeprofiler';

export interface Fargesamling {
  id: string;
  navn: string;
  gruppe: string;
  /** Hex colours: text, base, then accents. */
  farger: string[];
}

export const SAMLINGSGRUPPER = [
  'Nordisk',
  'Skog og natur',
  'Hav og kyst',
  'Varme farger',
  'Pastell',
  'Kraftige',
  'Mørk og elegant',
  'Jord og tre',
  'En farge, flere toner',
  'Lek og retro',
] as const;

type Gruppe = (typeof SAMLINGSGRUPPER)[number];

const data: [Gruppe, string, string[]][] = [
  ['Nordisk', 'Fjordtåke', ['#f4f6f8', '#2f4858', '#86a5b8', '#d9a441']],
  ['Nordisk', 'Vinterlys', ['#ffffff', '#3d5a73', '#a9c5d8', '#e8b04b']],
  ['Nordisk', 'Bergblå', ['#eef2f5', '#1f3a52', '#5f8fb0', '#c9d6df']],
  ['Nordisk', 'Lavvo', ['#f2efe9', '#44403c', '#a8a29e', '#d97706']],
  ['Nordisk', 'Rosa fjell', ['#fdf2f0', '#4a3a42', '#c98b8b', '#8aa1a6']],
  ['Nordisk', 'Nordlys', ['#e8fff5', '#10263a', '#2ee59d', '#7b61ff']],
  ['Nordisk', 'Snø og gran', ['#f8fafc', '#1e3d34', '#5f8f7a', '#b8c4bd']],
  ['Nordisk', 'Stavkirke', ['#f3e9dc', '#3b2a22', '#8c5a3c', '#b7a57a']],
  ['Nordisk', 'Havgråte', ['#f0f4f4', '#3a4a4f', '#7d9aa0', '#c5d3d3']],
  ['Nordisk', 'Lysnatt', ['#fff8e6', '#2b3a55', '#f2b134', '#7d8fb3']],

  ['Skog og natur', 'Granskog', ['#f1f5ee', '#23422f', '#6a994e', '#bc6c25']],
  ['Skog og natur', 'Bjørkeskog', ['#fdfcf7', '#4b4a3f', '#a7c957', '#6a994e']],
  ['Skog og natur', 'Mose', ['#f4f7ec', '#33401f', '#8aa14b', '#c5d58a']],
  ['Skog og natur', 'Lyng', ['#f6eef6', '#3f2c4a', '#a26aa6', '#7a9e7e']],
  ['Skog og natur', 'Tørt gress', ['#2b2a1e', '#d8c88d', '#8a7a3b', '#5f6b3a']],
  ['Skog og natur', 'Blomstereng', ['#fffdf2', '#2d5a3d', '#f2cc4a', '#e07a8c']],
  ['Skog og natur', 'Bær', ['#fff4f4', '#40202e', '#c2394b', '#6b8e4e']],
  ['Skog og natur', 'Fjellvann', ['#effafa', '#12464f', '#3cb1b8', '#e9c46a']],
  ['Skog og natur', 'Sopp', ['#fff3e6', '#4a2c1a', '#d98e3f', '#8a9a5b']],
  ['Skog og natur', 'Høstløv', ['#fff1dc', '#5a2e1b', '#d9822b', '#8f3d1d']],

  ['Hav og kyst', 'Sjøsprøyt', ['#f0fbff', '#12425f', '#37a9d6', '#f4a259']],
  ['Hav og kyst', 'Fyrlykt', ['#ffffff', '#1d2f4f', '#e63946', '#a8dadc']],
  ['Hav og kyst', 'Brygge', ['#fdf6e9', '#27465c', '#d1495b', '#edae49']],
  ['Hav og kyst', 'Tang', ['#ecf5ef', '#1b3b36', '#4f9d8f', '#a3b18a']],
  ['Hav og kyst', 'Skjell', ['#fff5f0', '#6b4c4c', '#f3b6a6', '#9ec1cf']],
  ['Hav og kyst', 'Dypet', ['#e5f6ff', '#06243d', '#1f78b4', '#52d1dc']],
  ['Hav og kyst', 'Rorbu', ['#fff0e6', '#7a1f1f', '#d9534f', '#2f5d8a']],
  ['Hav og kyst', 'Fiskekutter', ['#f7f7f2', '#264653', '#e9c46a', '#2a9d8f']],
  ['Hav og kyst', 'Sandstrand', ['#2f3e46', '#f1e3c8', '#52796f', '#cfa66b']],
  ['Hav og kyst', 'Måkeflukt', ['#ffffff', '#475569', '#94a3b8', '#38bdf8']],

  ['Varme farger', 'Solnedgang', ['#fff8f0', '#5a1e3c', '#ff7a45', '#ffc857']],
  ['Varme farger', 'Glør', ['#fff3e0', '#3b1010', '#e8590c', '#ffa94d']],
  ['Varme farger', 'Aprikos', ['#fff7ee', '#7a3e2b', '#f4a261', '#e76f51']],
  ['Varme farger', 'Varm sommer', ['#fffbea', '#8a2a17', '#f6c445', '#ef7b45']],
  ['Varme farger', 'Kanel', ['#fff6ea', '#54301c', '#c07a3c', '#e8c39e']],
  ['Varme farger', 'Chili', ['#fff4ee', '#4c1414', '#d62828', '#f77f00']],
  ['Varme farger', 'Honning', ['#2e2410', '#f4c542', '#a67c00', '#6b4e00']],
  ['Varme farger', 'Rødt lys', ['#fff0f0', '#6a0f2b', '#ee4266', '#f6a5b8']],
  ['Varme farger', 'Ember', ['#ffe9d6', '#2a1410', '#ff6b35', '#f7c59f']],
  ['Varme farger', 'Gylden time', ['#fffaf0', '#6b3f1d', '#f2a900', '#d46a6a']],

  ['Pastell', 'Sukkerspinn', ['#5a4a5e', '#fde2f3', '#b8c0ff', '#bde0fe']],
  ['Pastell', 'Mynte og fersken', ['#3d4a45', '#d8f3dc', '#ffcdb2', '#b5e48c']],
  ['Pastell', 'Lavendeldrøm', ['#4a3f6b', '#e9e3ff', '#c8b6ff', '#bde0fe']],
  ['Pastell', 'Smørblomst', ['#5b4a1a', '#fff3b0', '#cdeac0', '#ffcad4']],
  ['Pastell', 'Babyblå', ['#2f4a63', '#d6ecff', '#ffd6e0', '#e2f0cb']],
  ['Pastell', 'Iskrem', ['#5a3d4b', '#ffe5ec', '#b8f2e6', '#aed9e0']],
  ['Pastell', 'Fersken', ['#6b3f2e', '#ffe8d6', '#ddbea9', '#b7b7a4']],
  ['Pastell', 'Morgendis', ['#45505e', '#e8eef2', '#cdb4db', '#a2d2ff']],
  ['Pastell', 'Vårsol', ['#4a5a2b', '#f1f7d2', '#ffd6a5', '#caffbf']],
  ['Pastell', 'Blomsterbed', ['#593a4f', '#fdeef4', '#ffafcc', '#a2d2ff']],

  ['Kraftige', 'Pop', ['#ffffff', '#2b2d42', '#ef233c', '#ffd60a']],
  ['Kraftige', 'Neonnatt', ['#f8fff4', '#10002b', '#9d4edd', '#00f5d4']],
  ['Kraftige', 'Candy', ['#ffffff', '#7209b7', '#f72585', '#4cc9f0']],
  ['Kraftige', 'Sirkus', ['#ffffff', '#1d3557', '#e63946', '#f1c453']],
  ['Kraftige', 'Tropisk', ['#ffffff', '#0b525b', '#ff6f59', '#ffc145']],
  ['Kraftige', 'Elektrisk', ['#fdfdfd', '#03045e', '#00b4d8', '#ffbe0b']],
  ['Kraftige', 'Spill', ['#ffffff', '#240046', '#ff9e00', '#3a86ff']],
  ['Kraftige', 'Lime', ['#101010', '#c6f432', '#7ac70c', '#2b9348']],
  ['Kraftige', 'Flamingo', ['#ffffff', '#5c0a3b', '#ff5d8f', '#ffb703']],
  ['Kraftige', 'Fem i farger', ['#ffffff', '#222222', '#e63946', '#2a9d8f', '#f4a261']],

  ['Mørk og elegant', 'Midnatt', ['#f5f1e8', '#0d1b2a', '#c9a227', '#778da9']],
  ['Mørk og elegant', 'Kull og gull', ['#e8d5a2', '#17171a', '#b8860b', '#6b6b70']],
  ['Mørk og elegant', 'Smaragd', ['#f0e9d2', '#0b3d2e', '#c9a227', '#5aa17f']],
  ['Mørk og elegant', 'Vinrød', ['#f6e9d7', '#3d0c1c', '#b0405b', '#c9a227']],
  ['Mørk og elegant', 'Obsidian', ['#f1f1f1', '#111111', '#8d99ae', '#ef233c']],
  ['Mørk og elegant', 'Skifer', ['#e9ecef', '#2b2f36', '#6c757d', '#d4a373']],
  ['Mørk og elegant', 'Mørk skog', ['#e6efe4', '#14261c', '#5f8f6a', '#d1a855']],
  ['Mørk og elegant', 'Blekk', ['#eef1ff', '#121936', '#6c7ae0', '#e5b45a']],
  ['Mørk og elegant', 'Espresso', ['#f4e9dc', '#2a1a12', '#8d5524', '#c9a66b']],
  ['Mørk og elegant', 'Platina', ['#ffffff', '#2e3138', '#c0c5ce', '#7fb3d5']],

  ['Jord og tre', 'Eik', ['#fbf3e6', '#4a3426', '#a9794b', '#d8b98d']],
  ['Jord og tre', 'Valnøtt', ['#f7ebdd', '#3a261b', '#85553a', '#c9a37a']],
  ['Jord og tre', 'Leire', ['#fff1e6', '#6b3b2a', '#c97b5a', '#8f9e8b']],
  ['Jord og tre', 'Teglstein', ['#fff3ea', '#6a2c1f', '#b5523b', '#d9b99b']],
  ['Jord og tre', 'Kork', ['#fffaf0', '#5c4a32', '#c8a97e', '#7d8f69']],
  ['Jord og tre', 'Bjørk', ['#2e2a24', '#f1e7d3', '#a58b63', '#6f7d5b']],
  ['Jord og tre', 'Sand og sten', ['#2f2f2c', '#e0d6c2', '#8c8576', '#b5a888']],
  ['Jord og tre', 'Granitt', ['#f5f5f2', '#4a4a48', '#9b9b94', '#c27c4a']],
  ['Jord og tre', 'Rødmalt', ['#fff6ee', '#8c1c13', '#e8b4a0', '#3b3b3b']],
  ['Jord og tre', 'Furu', ['#fff3dc', '#59381f', '#d4a056', '#6b8e4e']],

  ['En farge, flere toner', 'Blå toner', ['#e8f1fb', '#0f2d52', '#2f6bb3', '#8fb8e8']],
  ['En farge, flere toner', 'Grønne toner', ['#eaf6ec', '#123d22', '#2f8a4d', '#8fd1a2']],
  ['En farge, flere toner', 'Røde toner', ['#fdecec', '#5a0f14', '#c0392b', '#f1948a']],
  ['En farge, flere toner', 'Lilla toner', ['#f3ecfb', '#2e1550', '#7a3fc4', '#c7a4ee']],
  ['En farge, flere toner', 'Oransje toner', ['#fff1e4', '#5a2808', '#e8710a', '#f7b47a']],
  ['En farge, flere toner', 'Turkise toner', ['#e6faf8', '#0b3d3a', '#17a398', '#82dcd2']],
  ['En farge, flere toner', 'Rosa toner', ['#fff0f6', '#531033', '#d6336c', '#f7a8c8']],
  ['En farge, flere toner', 'Gule toner', ['#2c2500', '#ffe066', '#d4a000', '#8a6d00']],
  ['En farge, flere toner', 'Grå toner', ['#f8f9fa', '#343a40', '#868e96', '#ced4da']],
  ['En farge, flere toner', 'Brune toner', ['#f8efe6', '#3b2314', '#8b5a2b', '#d2b48c']],

  ['Lek og retro', 'Retro 70', ['#fff4dc', '#4b2a1b', '#d96c06', '#6a994e']],
  ['Lek og retro', 'Arkade', ['#fdfdfd', '#0b0c2a', '#ff2e63', '#08d9d6']],
  ['Lek og retro', 'Pizza', ['#fff6e5', '#7a1c1c', '#e63946', '#6a994e']],
  ['Lek og retro', 'Dino', ['#f4ffe8', '#1f4d2b', '#7bc043', '#f4a259']],
  ['Lek og retro', 'Romfart', ['#f1f5ff', '#0a0f2c', '#7b8cff', '#ff7a59']],
  ['Lek og retro', 'Karneval', ['#ffffff', '#3d0066', '#ff006e', '#ffbe0b']],
  ['Lek og retro', 'Skolebuss', ['#1a1a1a', '#ffc300', '#3d3d3d', '#d62828']],
  ['Lek og retro', 'Kakao', ['#fff1e0', '#4a2a1a', '#e0a96d', '#f28482']],
  ['Lek og retro', 'Fyrverkeri', ['#fff8e1', '#0e1a40', '#ff595e', '#ffca3a']],
  ['Lek og retro', 'Sjokolademynte', ['#f0fff4', '#3e2723', '#7fcdbb', '#8d6e63']],
  ['Lek og retro', 'Gresskar', ['#fff3e0', '#2b1b17', '#f77f00', '#6b8f3a']],
  ['Lek og retro', 'Isbjørn', ['#ffffff', '#516b84', '#b8d4e8', '#f0b27a']],
];

const ascii = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const SAMLINGER: Fargesamling[] = data.map(([gruppe, navn, farger]) => ({
  id: `samling-${ascii(navn)}`,
  navn,
  gruppe,
  farger,
}));

// ---------- colours ----------

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Relative luminance (WCAG). */
function lysstyrke(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1 to 21. */
export function kontrast(a: string, b: string): number {
  const [hoy, lav] = [lysstyrke(a), lysstyrke(b)].sort((x, y) => y - x) as [number, number];
  return (hoy + 0.05) / (lav + 0.05);
}

/** A plain Norwegian name for a colour, for a tooltip: «Mørk blå», «Lys grå». */
export function fargenavn(hex: string): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const maks = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (maks + min) / 2;
  const d = maks - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (maks === r) h = ((g - b) / d) % 6;
    else if (maks === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  let navn: string;
  if (s < 0.12) navn = l < 0.15 ? 'svart' : l > 0.92 ? 'hvit' : 'grå';
  else if (h < 15 || h >= 345) navn = 'rød';
  else if (h < 40) navn = l < 0.4 ? 'brun' : 'oransje';
  else if (h < 65) navn = 'gul';
  else if (h < 160) navn = 'grønn';
  else if (h < 200) navn = 'turkis';
  else if (h < 255) navn = 'blå';
  else if (h < 290) navn = 'lilla';
  else navn = 'rosa';
  const tone = navn === 'svart' || navn === 'hvit' ? '' : l < 0.3 ? 'Mørk ' : l > 0.72 ? 'Lys ' : '';
  const ut = `${tone}${navn}`;
  return ut.charAt(0).toUpperCase() + ut.slice(1);
}

const HEX = /^#[0-9a-f]{6}$/i;
export const erHex = (v: string) => HEX.test(v);

/**
 * The filament id for a colour: one the user or the catalogue has with exactly this colour, or a new
 * own filament made for it. The new one is known in this session at once and carried by the project
 * (own filaments are); `lagreSamlingFarger` keeps it in the browser too.
 */
export function filamentForFarge(hex: string): string {
  const h = hex.toLowerCase();
  const fins = alleMaterialer().find((m) => m.hex.toLowerCase() === h);
  if (fins) return fins.id;
  const m: Materiale = {
    id: `farge-${h.slice(1)}`,
    navn: fargenavn(h),
    type: 'PLA',
    hex: h,
    bekreftet: false,
    egen: true,
  };
  registrerMateriale(m);
  return m.id;
}

/** The filaments for a collection's colours, one per colour (a colour twice is used once). */
export function filamenterForSamling(farger: readonly string[]): string[] {
  return [...new Set(farger.filter(erHex).map(filamentForFarge))];
}

/** Keep the new filaments of these ids in the browser, so they are there in the next project too. */
export function lagreSamlingFarger(ider: readonly string[]): void {
  for (const id of ider) {
    const m = alleMaterialer().find((x) => x.id === id);
    if (m?.egen && id.startsWith('farge-')) lagreEgetFilament({ id, navn: m.navn, type: m.type, hex: m.hex });
  }
}

export const MIN_SAMLINGSFARGER = 2;
export const MAKS_SAMLINGSFARGER = 8;

/** Make your own collection from picked colours: its filaments, and a profile with the name in «Mine profiler». */
export function lagEgenSamling(
  navn: string,
  farger: readonly string[],
): { ider: string[]; lagret: boolean } | null {
  const rene = farger.filter(erHex);
  if (!navn.trim() || rene.length < MIN_SAMLINGSFARGER || rene.length > MAKS_SAMLINGSFARGER) return null;
  const ider = filamenterForSamling(rene);
  lagreSamlingFarger(ider);
  return { ider, lagret: !!lagreEgenProfil(navn, ider) };
}
