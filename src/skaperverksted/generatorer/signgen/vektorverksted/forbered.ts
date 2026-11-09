/**
 * Vektorverksted, before tracing (browser only): read an image, keep the
 * crop and the mask the user draws, and hand the tracer the cropped pixels
 * with a mask at the size they are traced at.
 *
 * The mask is a canvas over the whole original image (longest side at most
 * MASKE_MAKS): opaque where the user has removed something.
 */
import type { Piksler } from '../vektoriser';

export const MAKS_MB = 25;
export const MASKE_MAKS = 2400;
/** Removed parts of the image are shown red, protected parts green. */
export const MASKEFARGE = '#e0325a';
export const BESKYTTFARGE = '#2fd27a';

export interface Kildebilde {
  navn: string;
  url: string;
  bilde: HTMLImageElement;
  bredde: number;
  hoyde: number;
}

export interface Rektangel {
  x: number;
  y: number;
  b: number;
  h: number;
}

export async function lesBildefil(fil: File): Promise<Kildebilde> {
  if (!fil.type.startsWith('image/') || fil.type === 'image/svg+xml')
    throw new Error('Velg et bilde (PNG, JPG, WebP, GIF eller BMP).');
  if (fil.size > MAKS_MB * 1024 * 1024) throw new Error(`Bildet er større enn ${MAKS_MB} MB.`);
  const url = URL.createObjectURL(fil);
  const bilde = new Image();
  bilde.decoding = 'async';
  bilde.src = url;
  try {
    await bilde.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Bildet kunne ikke leses. Bruk PNG, JPG eller WebP.');
  }
  return {
    navn: fil.name.replace(/\.[a-z0-9]+$/i, '') || 'Bilde',
    url,
    bilde,
    bredde: bilde.naturalWidth,
    hoyde: bilde.naturalHeight,
  };
}

/** An empty mask for an image: nothing removed. */
export function nyMaske(k: Kildebilde): HTMLCanvasElement {
  const s = Math.min(1, MASKE_MAKS / Math.max(k.bredde, k.hoyde));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(k.bredde * s));
  c.height = Math.max(1, Math.round(k.hoyde * s));
  return c;
}

/** Factor from original image pixels to mask pixels. */
export const maskeskala = (k: Kildebilde, maske: HTMLCanvasElement) => maske.width / k.bredde;

/** Paints (or erases) a round brush stroke from a to b, in image coordinates. */
export function malStrok(
  k: Kildebilde,
  maske: HTMLCanvasElement,
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
  fjern: boolean,
  farge = MASKEFARGE,
): void {
  const s = maskeskala(k, maske);
  const ctx = maske.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = fjern ? 'source-over' : 'destination-out';
  ctx.strokeStyle = farge;
  ctx.fillStyle = farge;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, radius * 2 * s);
  ctx.beginPath();
  ctx.moveTo(a.x * s, a.y * s);
  ctx.lineTo(b.x * s + 0.01, b.y * s);
  ctx.stroke();
  ctx.restore();
}

/**
 * Fills a lasso. «fjern» removes what is inside; «behold» removes
 * everything outside it.
 */
export function malLasso(
  k: Kildebilde,
  maske: HTMLCanvasElement,
  punkter: { x: number; y: number }[],
  modus: 'fjern' | 'behold' | 'gjenopprett',
  farge = MASKEFARGE,
): void {
  if (punkter.length < 3) return;
  const s = maskeskala(k, maske);
  const ctx = maske.getContext('2d')!;
  ctx.save();
  ctx.beginPath();
  if (modus === 'behold') ctx.rect(0, 0, maske.width, maske.height);
  ctx.moveTo(punkter[0]!.x * s, punkter[0]!.y * s);
  for (const p of punkter.slice(1)) ctx.lineTo(p.x * s, p.y * s);
  ctx.closePath();
  ctx.fillStyle = farge;
  ctx.globalCompositeOperation = modus === 'gjenopprett' ? 'destination-out' : 'source-over';
  ctx.fill(modus === 'behold' ? 'evenodd' : 'nonzero');
  ctx.restore();
}

export function tomMaske(maske: HTMLCanvasElement): void {
  maske.getContext('2d')!.clearRect(0, 0, maske.width, maske.height);
}

export function inverterMaske(maske: HTMLCanvasElement): void {
  const ctx = maske.getContext('2d')!;
  const d = ctx.getImageData(0, 0, maske.width, maske.height);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = 224;
    d.data[i + 1] = 50;
    d.data[i + 2] = 90;
    d.data[i + 3] = 255 - d.data[i + 3]!;
  }
  ctx.putImageData(d, 0, 0);
}

/** A copy of the mask, for undo. */
export function maskeKopi(maske: HTMLCanvasElement): ImageData {
  return maske.getContext('2d')!.getImageData(0, 0, maske.width, maske.height);
}
export function settMaske(maske: HTMLCanvasElement, d: ImageData): void {
  maske.getContext('2d')!.putImageData(d, 0, 0);
}

/** The factor the crop is resized by so its longest side is `maksSide` (small images are scaled up). */
export function sporfaktor(b: number, h: number, maksSide: number): number {
  const lengst = Math.max(b, h);
  if (lengst > maksSide) return maksSide / lengst;
  if (lengst < 600) return Math.min(4, 600 / lengst);
  return 1;
}

/** The cropped pixels at trace size and the mask over them (1 = keep). */
export function sporgrunnlag(
  k: Kildebilde,
  maske: HTMLCanvasElement,
  utsnitt: Rektangel,
  maksSide: number,
): { piksler: Piksler; maske: Uint8Array; faktor: number } {
  const f = sporfaktor(utsnitt.b, utsnitt.h, maksSide);
  const b = Math.max(1, Math.round(utsnitt.b * f));
  const h = Math.max(1, Math.round(utsnitt.h * f));
  const c = document.createElement('canvas');
  c.width = b;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(k.bilde, utsnitt.x, utsnitt.y, utsnitt.b, utsnitt.h, 0, 0, b, h);
  const piksler = ctx.getImageData(0, 0, b, h);
  const ms = maskeskala(k, maske);
  ctx.clearRect(0, 0, b, h);
  ctx.drawImage(maske, utsnitt.x * ms, utsnitt.y * ms, utsnitt.b * ms, utsnitt.h * ms, 0, 0, b, h);
  const md = ctx.getImageData(0, 0, b, h).data;
  const ut = new Uint8Array(b * h);
  for (let i = 0; i < ut.length; i++) ut[i] = md[i * 4 + 3]! < 128 ? 1 : 0;
  return { piksler, maske: ut, faktor: f };
}

/** The image at mask resolution, for the magic wand. */
export function maskepiksler(k: Kildebilde, maske: HTMLCanvasElement): ImageData {
  const c = document.createElement('canvas');
  c.width = maske.width;
  c.height = maske.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(k.bilde, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * A wand selection applied to the mask: «fjern» removes what is selected,
 * «behold» removes everything else, «gjenopprett» brings the selected back.
 */
export function brukUtvalg(
  maske: HTMLCanvasElement,
  utvalg: Uint8Array,
  modus: 'fjern' | 'behold' | 'gjenopprett',
  farge = MASKEFARGE,
): void {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(farge.slice(i, i + 2), 16));
  const ctx = maske.getContext('2d')!;
  const d = ctx.getImageData(0, 0, maske.width, maske.height);
  for (let i = 0; i < utvalg.length; i++) {
    const valgt = utvalg[i] === 1;
    const p = i * 4;
    if ((modus === 'fjern' && valgt) || (modus === 'behold' && !valgt)) {
      d.data[p] = r!;
      d.data[p + 1] = g!;
      d.data[p + 2] = b!;
      d.data[p + 3] = 255;
    } else if (modus === 'gjenopprett' && valgt) d.data[p + 3] = 0;
  }
  ctx.putImageData(d, 0, 0);
}

/** What is protected is never removed: the protection is cut out of the mask. */
export function beskyttMaske(maske: HTMLCanvasElement, beskytt: HTMLCanvasElement): void {
  const ctx = maske.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(beskytt, 0, 0, maske.width, maske.height);
  ctx.restore();
}

/** A mask-sized canvas read at trace size for one crop: 1 where it is painted. */
export function lesLerret(
  k: Kildebilde,
  lerret: HTMLCanvasElement,
  utsnitt: Rektangel,
  b: number,
  h: number,
): Uint8Array {
  const c = document.createElement('canvas');
  c.width = b;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const ms = maskeskala(k, lerret);
  ctx.drawImage(lerret, utsnitt.x * ms, utsnitt.y * ms, utsnitt.b * ms, utsnitt.h * ms, 0, 0, b, h);
  const d = ctx.getImageData(0, 0, b, h).data;
  const ut = new Uint8Array(b * h);
  for (let i = 0; i < ut.length; i++) ut[i] = d[i * 4 + 3]! >= 128 ? 1 : 0;
  return ut;
}
