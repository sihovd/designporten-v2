import { verkstedressurs } from '@/lib/nettsti';
/**
 * Decoration gallery (Sivert, 2026-10-05): ready-made vector elements to
 * put on a sign. They are icons from Material Design Icons (Pictogrammers),
 * Apache License 2.0, drawn on a 24-unit square with y down; `dekorKilde`
 * turns one into an SvgKilde in millimetres. Holes in the icons are kept as
 * holes. Not invented artwork (D-3): the shapes are the library's own, and
 * the credit below is shown in the gallery.
 */
import type { SvgKilde } from '../../core/dokument';
import { regionBoks, unionAlle } from '../../geometri/polygon';
import { stiTilRinger } from '../../geometri/stidata';
import { flyttBaner, tolkBaner, transformerBaner } from '../../geometri/bane';
import { svgFil, type Fargegruppe, type Flerfarget } from './svgdeler';
import { kildeFraRegion, kildeFraRinger } from './svgkilde';

export interface Dekor {
  id: string;
  navn: string;
  kategori: DekorKategori;
  /** Path data on a 24 × 24 grid, y down. */
  sti: string;
}

/** The gallery's themes. Each is shown by one of its own elements, so no extra artwork is needed. */
export type DekorKategori = 'symboler' | 'natur' | 'dyr' | 'kjoretoy' | 'sport';

export const DEKOR_KATEGORIER: { id: DekorKategori; navn: string; symbol: string }[] = [
  { id: 'symboler', navn: 'Symboler', symbol: 'hjerte' },
  { id: 'natur', navn: 'Natur', symbol: 'blomst' },
  { id: 'dyr', navn: 'Dyr', symbol: 'katt' },
  { id: 'kjoretoy', navn: 'Kjøretøy', symbol: 'traktor' },
  { id: 'sport', navn: 'Sport og spill', symbol: 'fotball' },
];

const KATEGORI_AV: Record<string, DekorKategori> = {
  stjerne: 'symboler',
  hjerte: 'symboler',
  krone: 'symboler',
  lyn: 'symboler',
  anker: 'symboler',
  mane: 'natur',
  sol: 'natur',
  blomst: 'natur',
  gran: 'natur',
  hest: 'dyr',
  enhjorning: 'dyr',
  sommerfugl: 'dyr',
  katt: 'dyr',
  hund: 'dyr',
  fisk: 'dyr',
  hai: 'dyr',
  kanin: 'dyr',
  pote: 'dyr',
  ugle: 'dyr',
  rakett: 'kjoretoy',
  traktor: 'kjoretoy',
  gravemaskin: 'kjoretoy',
  fotball: 'sport',
  spillkontroll: 'sport',
};

export const DEKOR_KREDIT =
  'Ikonene er fra Material Design Icons (Pictogrammers), Apache-lisens 2.0, skalert og speilet til millimeter.';

/** Where the licence text and notice are published (Apache 2.0 asks for both, and for the changes made). */
export const DEKOR_LISENS_URL = verkstedressurs('dekor/NOTICE.txt');

const RA: Omit<Dekor, 'kategori'>[] = [
  {
    id: 'stjerne',
    navn: 'Stjerne',
    sti: 'M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z',
  },
  {
    id: 'hjerte',
    navn: 'Hjerte',
    sti: 'M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z',
  },
  { id: 'mane', navn: 'Måne', sti: 'M2 12A10 10 0 0 0 15 21.54A10 10 0 0 1 15 2.46A10 10 0 0 0 2 12Z' },
  {
    id: 'sol',
    navn: 'Sol',
    sti: 'M3.55 19.09L4.96 20.5L6.76 18.71L5.34 17.29M12 6C8.69 6 6 8.69 6 12S8.69 18 12 18 18 15.31 18 12C18 8.68 15.31 6 12 6M20 13H23V11H20M17.24 18.71L19.04 20.5L20.45 19.09L18.66 17.29M20.45 5L19.04 3.6L17.24 5.39L18.66 6.81M13 1H11V4H13M6.76 5.39L4.96 3.6L3.55 5L5.34 6.81L6.76 5.39M1 13H4V11H1M13 20H11V23H13',
  },
  {
    id: 'blomst',
    navn: 'Blomst',
    sti: 'M3,13A9,9 0 0,0 12,22C12,17 7.97,13 3,13M12,5.5A2.5,2.5 0 0,1 14.5,8A2.5,2.5 0 0,1 12,10.5A2.5,2.5 0 0,1 9.5,8A2.5,2.5 0 0,1 12,5.5M5.6,10.25A2.5,2.5 0 0,0 8.1,12.75C8.63,12.75 9.12,12.58 9.5,12.31C9.5,12.37 9.5,12.43 9.5,12.5A2.5,2.5 0 0,0 12,15A2.5,2.5 0 0,0 14.5,12.5C14.5,12.43 14.5,12.37 14.5,12.31C14.88,12.58 15.37,12.75 15.9,12.75C17.28,12.75 18.4,11.63 18.4,10.25C18.4,9.25 17.81,8.4 16.97,8C17.81,7.6 18.4,6.74 18.4,5.75C18.4,4.37 17.28,3.25 15.9,3.25C15.37,3.25 14.88,3.41 14.5,3.69C14.5,3.63 14.5,3.56 14.5,3.5A2.5,2.5 0 0,0 12,1A2.5,2.5 0 0,0 9.5,3.5C9.5,3.56 9.5,3.63 9.5,3.69C9.12,3.41 8.63,3.25 8.1,3.25A2.5,2.5 0 0,0 5.6,5.75C5.6,6.74 6.19,7.6 7.03,8C6.19,8.4 5.6,9.25 5.6,10.25M12,22A9,9 0 0,0 21,13C16,13 12,17 12,22Z',
  },
  { id: 'gran', navn: 'Gran', sti: 'M10,21V18H3L8,13H5L10,8H7L12,3L17,8H14L19,13H16L21,18H14V21H10Z' },
  {
    id: 'hest',
    navn: 'Hest',
    sti: 'M22 6V9.5L20.5 10L18.96 7.54C18.83 7.33 18.5 7.42 18.5 7.67V11.25C18.5 12.23 18.11 13.11 17.5 13.78V21H15V15C14.92 15 14.84 15 14.75 15C14.54 15 14.33 14.97 14.13 14.94L9.69 14.2L8.57 16.21L9.53 21H7L6 16.25C5.97 15.95 6 15.65 6.16 15.39L7.18 13.58C6.2 13.03 5.53 12 5.5 10.81C5.46 10.96 5.44 11.18 5.47 11.5C5.5 11.94 5.61 12.59 5.54 13.31C5.5 14.03 5.17 14.77 4.75 15.26C4.32 15.75 3.85 16.09 3.35 16.35L2.65 15.65C2.84 15.18 3.03 14.76 3.07 14.37C3.13 14 3.06 13.7 2.95 13.43L2.42 12.3C2.21 11.79 1.95 11.05 2 10.18C2.03 9.33 2.5 8.22 3.39 7.61C4.29 7 5.26 6.92 6.05 7.08C6.55 7.18 7.06 7.42 7.5 7.76C7.87 7.59 8.3 7.5 8.75 7.5H14.5V7C14.5 4.79 16.29 3 18.5 3H22L21.11 4.34C21.65 4.7 22 5.31 22 6Z',
  },
  {
    id: 'enhjorning',
    navn: 'Enhjørning',
    sti: 'M22 5L21.11 6.34C21.65 6.7 22 7.31 22 8V11.5L20.5 12L18.96 9.54C18.83 9.33 18.5 9.42 18.5 9.67V13.25C18.5 14.23 18.11 15.11 17.5 15.78V22H15V17C14.92 17 14.84 17 14.75 17C14.54 17 14.33 16.97 14.13 16.94L9.45 16.16L8.57 18.12L9.54 22H6.96L6.04 18.3C5.97 18.03 6 17.74 6.11 17.5L7 15.5C6.12 14.92 5.53 13.94 5.5 12.81C5.46 12.96 5.44 13.18 5.47 13.5C5.5 13.94 5.61 14.59 5.54 15.31C5.5 16.03 5.18 16.77 4.76 17.26C4.32 17.75 3.85 18.09 3.35 18.35L2.65 17.65C2.84 17.18 3.03 16.76 3.07 16.37C3.13 16 3.06 15.7 2.95 15.43L2.42 14.3C2.21 13.79 1.95 13.05 2 12.18C2.03 11.33 2.5 10.22 3.39 9.61C4.29 9 5.26 8.91 6.05 9.08C6.55 9.18 7.06 9.42 7.5 9.76C7.87 9.59 8.3 9.5 8.75 9.5H14.5V9C14.5 6.79 16.29 5 18.5 5L22 2L21 5H22Z',
  },
  {
    id: 'sommerfugl',
    navn: 'Sommerfugl',
    sti: 'M13 21H11V6L9.03 3.97L10 3L12 5L14 3L15 4L13 6V21M7 6C4.24 6 2 8.24 2 11C2 12.64 2.79 14.09 4 15H4V17C4 19.21 5.79 21 8 21C8.72 21 9.39 20.81 9.97 20.5L10 20.46V7C9.16 6.37 8.13 6 7 6M6.5 12.5L5 11L6.5 9.5L8 11L6.5 12.5M22 11C22 8.24 19.76 6 17 6C15.88 6 14.85 6.37 14 7L14 7V20.46C14.59 20.81 15.27 21 16 21C18.21 21 20 19.21 20 17V15H20C21.21 14.09 22 12.64 22 11M17.5 12.5L16 11L17.5 9.5L19 11L17.5 12.5Z',
  },
  {
    id: 'katt',
    navn: 'Katt',
    sti: 'M12,8L10.67,8.09C9.81,7.07 7.4,4.5 5,4.5C5,4.5 3.03,7.46 4.96,11.41C4.41,12.24 4.07,12.67 4,13.66L2.07,13.95L2.28,14.93L4.04,14.67L4.18,15.38L2.61,16.32L3.08,17.21L4.53,16.32C5.68,18.76 8.59,20 12,20C15.41,20 18.32,18.76 19.47,16.32L20.92,17.21L21.39,16.32L19.82,15.38L19.96,14.67L21.72,14.93L21.93,13.95L20,13.66C19.93,12.67 19.59,12.24 19.04,11.41C20.97,7.46 19,4.5 19,4.5C16.6,4.5 14.19,7.07 13.33,8.09L12,8M9,11A1,1 0 0,1 10,12A1,1 0 0,1 9,13A1,1 0 0,1 8,12A1,1 0 0,1 9,11M15,11A1,1 0 0,1 16,12A1,1 0 0,1 15,13A1,1 0 0,1 14,12A1,1 0 0,1 15,11M11,14H13L12.3,15.39C12.5,16.03 13.06,16.5 13.75,16.5A1.5,1.5 0 0,0 15.25,15H15.75A2,2 0 0,1 13.75,17C13,17 12.35,16.59 12,16V16H12C11.65,16.59 11,17 10.25,17A2,2 0 0,1 8.25,15H8.75A1.5,1.5 0 0,0 10.25,16.5C10.94,16.5 11.5,16.03 11.7,15.39L11,14Z',
  },
  {
    id: 'hund',
    navn: 'Hund',
    sti: 'M18,4C16.29,4 15.25,4.33 14.65,4.61C13.88,4.23 13,4 12,4C11,4 10.12,4.23 9.35,4.61C8.75,4.33 7.71,4 6,4C3,4 1,12 1,14C1,14.83 2.32,15.59 4.14,15.9C4.78,18.14 7.8,19.85 11.5,20V15.72C10.91,15.35 10,14.68 10,14C10,13 12,13 12,13C12,13 14,13 14,14C14,14.68 13.09,15.35 12.5,15.72V20C16.2,19.85 19.22,18.14 19.86,15.9C21.68,15.59 23,14.83 23,14C23,12 21,4 18,4M4.15,13.87C3.65,13.75 3.26,13.61 3,13.5C3.25,10.73 5.2,6.4 6.05,6C6.59,6 7,6.06 7.37,6.11C5.27,8.42 4.44,12.04 4.15,13.87M9,12A1,1 0 0,1 8,11C8,10.46 8.45,10 9,10A1,1 0 0,1 10,11C10,11.56 9.55,12 9,12M15,12A1,1 0 0,1 14,11C14,10.46 14.45,10 15,10A1,1 0 0,1 16,11C16,11.56 15.55,12 15,12M19.85,13.87C19.56,12.04 18.73,8.42 16.63,6.11C17,6.06 17.41,6 17.95,6C18.8,6.4 20.75,10.73 21,13.5C20.75,13.61 20.36,13.75 19.85,13.87Z',
  },
  {
    id: 'fisk',
    navn: 'Fisk',
    sti: 'M12,20L12.76,17C9.5,16.79 6.59,15.4 5.75,13.58C5.66,14.06 5.53,14.5 5.33,14.83C4.67,16 3.33,16 2,16C3.1,16 3.5,14.43 3.5,12.5C3.5,10.57 3.1,9 2,9C3.33,9 4.67,9 5.33,10.17C5.53,10.5 5.66,10.94 5.75,11.42C6.4,10 8.32,8.85 10.66,8.32L9,5C11,5 13,5 14.33,5.67C15.46,6.23 16.11,7.27 16.69,8.38C19.61,9.08 22,10.66 22,12.5C22,14.38 19.5,16 16.5,16.66C15.67,17.76 14.86,18.78 14.17,19.33C13.33,20 12.67,20 12,20M17,11A1,1 0 0,0 16,12A1,1 0 0,0 17,13A1,1 0 0,0 18,12A1,1 0 0,0 17,11Z',
  },
  {
    id: 'hai',
    navn: 'Hai',
    sti: 'M15.56 9.09C14.66 7.18 12.54 6 11 6C11.47 7.4 11.28 8.57 10.95 9.43C8.45 10 6 11 6 11S3 7 1 7L3 13L2 17C4 17 6 14 6 14S11 16 14 16V18C14.65 18 15.91 17.17 16.73 15.77C17.97 15.56 19 15.21 19.87 14.81C19.72 14.63 19.53 14.44 19.28 14.3C18.63 13.91 17.82 13.67 17 13.5C17.82 13.34 18.67 13.22 19.59 13.35C20.05 13.41 20.54 13.54 21 13.86C21.1 13.92 21.17 14 21.24 14.05C22.4 13.26 23 12.44 23 12C23 11.13 19.19 9.5 15.56 9.09M18 12C17.45 12 17 11.55 17 11C17 10.76 17.1 10.55 17.23 10.38C17.84 10.5 18.43 10.67 18.97 10.84C19 10.89 19 10.94 19 11C19 11.55 18.55 12 18 12Z',
  },
  {
    id: 'kanin',
    navn: 'Kanin',
    sti: 'M18.05,21L15.32,16.26C15.32,14.53 14.25,13.42 12.95,13.42C12.05,13.42 11.27,13.92 10.87,14.66C11.2,14.47 11.59,14.37 12,14.37C13.3,14.37 14.36,15.43 14.36,16.73C14.36,18.04 13.31,19.11 12,19.11H15.3V21H6.79C6.55,21 6.3,20.91 6.12,20.72C5.75,20.35 5.75,19.75 6.12,19.38V19.38L6.62,18.88C6.28,18.73 6,18.5 5.72,18.26C5.5,18.76 5,19.11 4.42,19.11C3.64,19.11 3,18.47 3,17.68C3,16.9 3.64,16.26 4.42,16.26L4.89,16.34V14.37C4.89,11.75 7,9.63 9.63,9.63H9.65C11.77,9.64 13.42,10.47 13.42,9.16C13.42,8.23 13.62,7.86 13.96,7.34C13.23,7 12.4,6.79 11.53,6.79C11,6.79 10.58,6.37 10.58,5.84C10.58,5.41 10.86,5.05 11.25,4.93L10.58,4.89C10.06,4.89 9.63,4.47 9.63,3.95C9.63,3.42 10.06,3 10.58,3H11.53C13.63,3 15.47,4.15 16.46,5.85L16.74,5.84C17.45,5.84 18.11,6.07 18.65,6.45L19.1,6.83C21.27,8.78 21,10.1 21,10.11C21,11.39 19.94,12.44 18.65,12.44L18.16,12.39V12.47C18.16,13.58 17.68,14.57 16.93,15.27L20.24,21H18.05M18.16,7.74C17.63,7.74 17.21,8.16 17.21,8.68C17.21,9.21 17.63,9.63 18.16,9.63C18.68,9.63 19.11,9.21 19.11,8.68C19.11,8.16 18.68,7.74 18.16,7.74Z',
  },
  {
    id: 'pote',
    navn: 'Pote',
    sti: 'M8.35,3C9.53,2.83 10.78,4.12 11.14,5.9C11.5,7.67 10.85,9.25 9.67,9.43C8.5,9.61 7.24,8.32 6.87,6.54C6.5,4.77 7.17,3.19 8.35,3M15.5,3C16.69,3.19 17.35,4.77 17,6.54C16.62,8.32 15.37,9.61 14.19,9.43C13,9.25 12.35,7.67 12.72,5.9C13.08,4.12 14.33,2.83 15.5,3M3,7.6C4.14,7.11 5.69,8 6.5,9.55C7.26,11.13 7,12.79 5.87,13.28C4.74,13.77 3.2,12.89 2.41,11.32C1.62,9.75 1.9,8.08 3,7.6M21,7.6C22.1,8.08 22.38,9.75 21.59,11.32C20.8,12.89 19.26,13.77 18.13,13.28C17,12.79 16.74,11.13 17.5,9.55C18.31,8 19.86,7.11 21,7.6M19.33,18.38C19.37,19.32 18.65,20.36 17.79,20.75C16,21.57 13.88,19.87 11.89,19.87C9.9,19.87 7.76,21.64 6,20.75C5,20.26 4.31,18.96 4.44,17.88C4.62,16.39 6.41,15.59 7.47,14.5C8.88,13.09 9.88,10.44 11.89,10.44C13.89,10.44 14.95,13.05 16.3,14.5C17.41,15.72 19.26,16.75 19.33,18.38Z',
  },
  {
    id: 'rakett',
    navn: 'Rakett',
    sti: 'M20 22L16.14 20.45C16.84 18.92 17.34 17.34 17.65 15.73L20 22M7.86 20.45L4 22L6.35 15.73C6.66 17.34 7.16 18.92 7.86 20.45M12 2C12 2 17 4 17 12C17 15.1 16.25 17.75 15.33 19.83C15 20.55 14.29 21 13.5 21H10.5C9.71 21 9 20.55 8.67 19.83C7.76 17.75 7 15.1 7 12C7 4 12 2 12 2M12 12C13.1 12 14 11.1 14 10C14 8.9 13.1 8 12 8C10.9 8 10 8.9 10 10C10 11.1 10.9 12 12 12Z',
  },
  {
    id: 'krone',
    navn: 'Krone',
    sti: 'M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z',
  },
  {
    id: 'anker',
    navn: 'Anker',
    sti: 'M12 2A3 3 0 0 0 9 5A3 3 0 0 0 11 7.83V9H8V11H11V19.92C10.26 19.79 9.5 19.58 8.79 19.27C8.05 18.95 7.4 18.56 6.82 18.09C6.24 17.62 5.78 17.11 5.44 16.55L7 15L3 12V15C3 15.97 3.27 16.88 3.82 17.72C4.37 18.56 5.09 19.31 6 19.95C6.87 20.59 7.84 21.09 8.88 21.45C9.93 21.81 10.97 22 12 22C13.03 22 14.07 21.8 15.12 21.44C16.16 21.08 17.13 20.58 18 19.95C18.92 19.31 19.63 18.57 20.18 17.72C20.73 16.88 21 15.97 21 15V12L17 15L18.56 16.55C18.22 17.11 17.76 17.62 17.18 18.09C16.6 18.56 15.95 18.95 15.21 19.27C14.5 19.58 13.74 19.79 13 19.92V11H16V9H13V7.82A3 3 0 0 0 15 5A3 3 0 0 0 12 2M12 4A1 1 0 0 1 13 5A1 1 0 0 1 12 6A1 1 0 0 1 11 5A1 1 0 0 1 12 4Z',
  },
  { id: 'lyn', navn: 'Lyn', sti: 'M7,2V13H10V22L17,10H13L17,2H7Z' },
  {
    id: 'traktor',
    navn: 'Traktor',
    sti: 'M5,4V11.26C3.2,11.9 2,13.6 2,15.5C2,18 4,20 6.5,20C8.79,20 10.71,18.28 10.97,16H15.17C15.06,16.32 15,16.66 15,17A3,3 0 0,0 18,20A3,3 0 0,0 21,17C21,16.66 20.94,16.32 20.82,16H22V13C22,11.89 21.11,11 20,11H15.04L13.65,4H5M7,6H12L13,11V14H10.74C10.16,12.38 8.71,11.23 7,11.03V6M6.5,13.25A2.25,2.25 0 0,1 8.75,15.5A2.25,2.25 0 0,1 6.5,17.75A2.25,2.25 0 0,1 4.25,15.5A2.25,2.25 0 0,1 6.5,13.25M18,15.5A1.5,1.5 0 0,1 19.5,17A1.5,1.5 0 0,1 18,18.5A1.5,1.5 0 0,1 16.5,17A1.5,1.5 0 0,1 18,15.5Z',
  },
  {
    id: 'gravemaskin',
    navn: 'Gravemaskin',
    sti: 'M18.5 18.5C19.04 18.5 19.5 18.96 19.5 19.5S19.04 20.5 18.5 20.5H6.5C5.96 20.5 5.5 20.04 5.5 19.5S5.96 18.5 6.5 18.5H18.5M18.5 17H6.5C5.13 17 4 18.13 4 19.5S5.13 22 6.5 22H18.5C19.88 22 21 20.88 21 19.5S19.88 17 18.5 17M21 11H18V7H13L10 11V16H22L21 11M11.54 11L13.5 8.5H16V11H11.54M9.76 3.41L4.76 2L2 11.83C1.66 13.11 2.41 14.44 3.7 14.8L4.86 15.12L8.15 12.29L4.27 11.21L6.15 4.46L8.94 5.24C9.5 5.53 10.71 6.34 11.47 7.37L12.5 6H12.94C11.68 4.41 9.85 3.46 9.76 3.41Z',
  },
  {
    id: 'fotball',
    navn: 'Fotball',
    sti: 'M16.93 17.12L16.13 15.76L17.59 11.39L19 10.92L20 11.67C20 11.7 20 11.75 20 11.81C20 11.88 20.03 11.94 20.03 12C20.03 13.97 19.37 15.71 18.06 17.21L16.93 17.12M9.75 15L8.38 10.97L12 8.43L15.62 10.97L14.25 15H9.75M12 20.03C11.12 20.03 10.29 19.89 9.5 19.61L8.81 18.1L9.47 17H14.58L15.19 18.1L14.5 19.61C13.71 19.89 12.88 20.03 12 20.03M5.94 17.21C5.41 16.59 4.95 15.76 4.56 14.75C4.17 13.73 3.97 12.81 3.97 12C3.97 11.94 4 11.88 4 11.81C4 11.75 4 11.7 4 11.67L5 10.92L6.41 11.39L7.87 15.76L7.07 17.12L5.94 17.21M11 5.29V6.69L7 9.46L5.66 9.04L5.24 7.68C5.68 7 6.33 6.32 7.19 5.66S8.87 4.57 9.65 4.35L11 5.29M14.35 4.35C15.13 4.57 15.95 5 16.81 5.66C17.67 6.32 18.32 7 18.76 7.68L18.34 9.04L17 9.47L13 6.7V5.29L14.35 4.35M4.93 4.93C3 6.89 2 9.25 2 12S3 17.11 4.93 19.07 9.25 22 12 22 17.11 21 19.07 19.07 22 14.75 22 12 21 6.89 19.07 4.93 14.75 2 12 2 6.89 3 4.93 4.93Z',
  },
  {
    id: 'spillkontroll',
    navn: 'Spillkontroll',
    sti: 'M7,6H17A6,6 0 0,1 23,12A6,6 0 0,1 17,18C15.22,18 13.63,17.23 12.53,16H11.47C10.37,17.23 8.78,18 7,18A6,6 0 0,1 1,12A6,6 0 0,1 7,6M6,9V11H4V13H6V15H8V13H10V11H8V9H6M15.5,12A1.5,1.5 0 0,0 14,13.5A1.5,1.5 0 0,0 15.5,15A1.5,1.5 0 0,0 17,13.5A1.5,1.5 0 0,0 15.5,12M18.5,9A1.5,1.5 0 0,0 17,10.5A1.5,1.5 0 0,0 18.5,12A1.5,1.5 0 0,0 20,10.5A1.5,1.5 0 0,0 18.5,9Z',
  },
  {
    id: 'ugle',
    navn: 'Ugle',
    sti: 'M12,16C12.56,16.84 13.31,17.53 14.2,18L12,20.2L9.8,18C10.69,17.53 11.45,16.84 12,16M17,11.2A2,2 0 0,0 15,13.2A2,2 0 0,0 17,15.2A2,2 0 0,0 19,13.2C19,12.09 18.1,11.2 17,11.2M7,11.2A2,2 0 0,0 5,13.2A2,2 0 0,0 7,15.2A2,2 0 0,0 9,13.2C9,12.09 8.1,11.2 7,11.2M17,8.7A4,4 0 0,1 21,12.7A4,4 0 0,1 17,16.7A4,4 0 0,1 13,12.7A4,4 0 0,1 17,8.7M7,8.7A4,4 0 0,1 11,12.7A4,4 0 0,1 7,16.7A4,4 0 0,1 3,12.7A4,4 0 0,1 7,8.7M2.24,1C4,4.7 2.73,7.46 1.55,10.2C1.19,11 1,11.83 1,12.7A6,6 0 0,0 7,18.7C7.21,18.69 7.42,18.68 7.63,18.65L10.59,21.61L12,23L13.41,21.61L16.37,18.65C16.58,18.68 16.79,18.69 17,18.7A6,6 0 0,0 23,12.7C23,11.83 22.81,11 22.45,10.2C21.27,7.46 20,4.7 21.76,1C19.12,3.06 15.36,4.69 12,4.7C8.64,4.69 4.88,3.06 2.24,1Z',
  },
];

export const DEKOR: Dekor[] = RA.map((d) => ({ ...d, kategori: KATEGORI_AV[d.id] ?? 'symboler' }));

/** Size of a gallery element's longest side when it is made (mm); the sign scales it. */
const GRUNNSTORRELSE = 24;

export function finnDekor(id: string): Dekor | undefined {
  return DEKOR.find((d) => d.id === id);
}

/** A gallery element as an SVG source: centred, mm, y up. */
export function dekorKilde(d: Dekor): { kilde: SvgKilde; bredde: number; hoyde: number } {
  // 24 grid units are GRUNNSTORRELSE mm; y flips to point up
  const s = GRUNNSTORRELSE / 24;
  const ringer = stiTilRinger(d.sti, 0.02).map((r) => r.map((p) => ({ x: p.x * s, y: -p.y * s })));
  // the icon's own curves are kept, so its points and handles can be edited
  const kurver = {
    baner: transformerBaner(tolkBaner(d.sti), [s, 0, 0, -s, 0, 0]),
    regel: 'nonzero' as const,
  };
  const r = kildeFraRinger(ringer, [], d.navn, { dekorId: d.id }, kurver);
  if (!r) throw new Error(`Dekoret «${d.navn}» har ingen flate.`);
  return r;
}

// ---------- own vectors ----------

export interface EgetDekor {
  id: string;
  navn: string;
  /** All the parts joined, in one colour (what a CSV cell or a text layer gets). */
  kilde: SvgKilde;
  bredde: number;
  hoyde: number;
  /** A vector with parts in several colours keeps them here, one vector per colour. */
  grupper?: Omit<Fargegruppe, 'region'>[];
}

const NOKKEL = 'designporten:signgen:dekor';
/** A browser keeps about 5 MB per site; leave room for the colour profiles. */
const MAKS_TEGN = 2_000_000;

/** Vectors the user added to the gallery, kept in this browser only. */
export function hentEgneDekor(): EgetDekor[] {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(NOKKEL) ?? '[]');
    if (!Array.isArray(r)) return [];
    return r.filter(
      (d): d is EgetDekor =>
        !!d &&
        typeof d.id === 'string' &&
        typeof d.navn === 'string' &&
        d.kilde?.type === 'svg' &&
        Array.isArray(d.kilde.stier) &&
        typeof d.bredde === 'number' &&
        typeof d.hoyde === 'number' &&
        (d.grupper === undefined ||
          (Array.isArray(d.grupper) &&
            d.grupper.every(
              (g: Fargegruppe) =>
                typeof g?.farge === 'string' && g.kilde?.type === 'svg' && Array.isArray(g.kilde.stier),
            ))),
    );
  } catch {
    return [];
  }
}

function skriv(liste: EgetDekor[]): boolean {
  try {
    const tekst = JSON.stringify(liste);
    if (tekst.length > MAKS_TEGN) return false;
    localStorage.setItem(NOKKEL, tekst);
    return true;
  } catch {
    return false;
  }
}

/** Add your own vector to the gallery (replacing one with the same name). Null if the browser would not store it. */
export function lagreEgetDekor(
  navn: string,
  r: { kilde: SvgKilde; bredde: number; hoyde: number },
): EgetDekor | null {
  const id = `egen-${Date.now().toString(36)}`;
  const d: EgetDekor = {
    id,
    navn: navn.trim() || 'Eget dekor',
    kilde: { ...r.kilde, dekorId: id, felt: undefined },
    bredde: r.bredde,
    hoyde: r.hoyde,
  };
  const andre = hentEgneDekor().filter((x) => x.navn.toLowerCase() !== d.navn.toLowerCase());
  return skriv([...andre, d]) ? d : null;
}

/** Add a vector with parts in several colours to the gallery. Null if the browser would not store it. */
export function lagreEgetFlerfarget(navn: string, ff: Flerfarget): EgetDekor | null {
  const alle = unionAlle(ff.grupper.flatMap((g) => (g.region ? [g.region] : [])));
  const grupper = ff.grupper.filter((g) => g.region);
  const regel = grupper[0]?.kilde.fyllregel;
  // the groups' curves, each moved back to where it lies in the picture
  const kurver =
    regel && grupper.every((g) => g.kilde.fyllregel === regel)
      ? {
          regel,
          baner: grupper.flatMap((g) => {
            const b = regionBoks(g.region!);
            return flyttBaner(
              tolkBaner(g.kilde.stier.join('')),
              (b.minX + b.maksX) / 2,
              (b.minY + b.maksY) / 2,
            );
          }),
        }
      : null;
  const samlet = kildeFraRegion(alle, navn, {}, kurver);
  if (!samlet) return null;
  const enkelt = lagreEgetDekor(navn, samlet);
  if (!enkelt || ff.grupper.length < 2) return enkelt;
  const med: EgetDekor = { ...enkelt, grupper: ff.grupper.map(({ region: _r, ...g }) => g) };
  const andre = hentEgneDekor().filter((x) => x.id !== med.id);
  return skriv([...andre, med]) ? med : null;
}

export function slettEgetDekor(id: string): void {
  skriv(hentEgneDekor().filter((d) => d.id !== id));
}

/** One element in the gallery, ready to put on a sign. */
export interface DekorValg {
  id: string;
  navn: string;
  egen: boolean;
  /** The theme of a built-in element; own vectors have none. */
  kategori?: DekorKategori;
  lag: () => { kilde: SvgKilde; bredde: number; hoyde: number };
  /** The parts in their own colours, for a vector saved with several colours. */
  flerfarget?: () => Flerfarget;
  /** For the thumbnail: path data and its view box (own vectors are y up, so they are flipped). */
  forhandsvisning: { d: string; viewBox: string; flipp: boolean };
}

export function dekorValg(egne: EgetDekor[] = hentEgneDekor()): DekorValg[] {
  return [
    ...DEKOR.map((d) => ({
      id: d.id,
      navn: d.navn,
      egen: false,
      kategori: d.kategori,
      lag: () => dekorKilde(d),
      forhandsvisning: { d: d.sti, viewBox: '0 0 24 24', flipp: false },
    })),
    ...egne.map((d) => ({
      id: d.id,
      navn: d.navn,
      egen: true,
      lag: () => ({ kilde: { ...d.kilde, dekorId: d.id }, bredde: d.bredde, hoyde: d.hoyde }),
      flerfarget: d.grupper
        ? () => ({
            navn: d.navn,
            bredde: d.bredde,
            hoyde: d.hoyde,
            grupper: d.grupper!.map((g) => ({ ...g, kilde: { ...g.kilde, dekorId: d.id } })),
          })
        : undefined,
      forhandsvisning: {
        d: d.kilde.stier.join(''),
        viewBox: `${-d.bredde / 2} ${-d.hoyde / 2} ${d.bredde} ${d.hoyde}`,
        flipp: true,
      },
    })),
  ];
}

/**
 * The element as an SVG file, so its parts can be picked in the part picker. Built-in icons are one path
 * on a 24 grid; own vectors keep their colours when they have several.
 */
export function dekorSvgTekst(v: DekorValg, hex: (materialId: string) => string): string {
  const t = (n: number) => String(Math.round(n * 1000) / 1000);
  if (v.flerfarget) return svgFil(v.flerfarget(), hex);
  const f = v.forhandsvisning;
  if (!v.egen)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRUNNSTORRELSE}mm" height="${GRUNNSTORRELSE}mm" viewBox="${f.viewBox}"><path fill="#000000" fill-rule="nonzero" d="${f.d}"/></svg>`;
  const k = v.lag();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t(k.bredde)}mm" height="${t(k.hoyde)}mm" viewBox="0 0 ${t(k.bredde)} ${t(k.hoyde)}"><path fill="#000000" fill-rule="${k.kilde.fyllregel}" transform="translate(${t(k.bredde / 2)} ${t(k.hoyde / 2)}) scale(1 -1)" d="${k.kilde.stier.join('')}"/></svg>`;
}

const enkel = (t: string) => t.trim().toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a');

/** A gallery element by name or id, ignoring case and æ ø å (a CSV cell). */
export function finnDekorFraTekst(verdi: string, egne: EgetDekor[] = hentEgneDekor()): DekorValg | undefined {
  const v = enkel(verdi);
  if (!v) return undefined;
  return dekorValg(egne).find((d) => enkel(d.id) === v || enkel(d.navn) === v);
}

/** Cells that mean «no decoration on this sign». */
export function erIngenDekor(verdi: string): boolean {
  return ['', '-', 'ingen', 'nei', 'ingen dekor'].includes(enkel(verdi));
}
