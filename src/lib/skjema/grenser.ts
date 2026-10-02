/* Pure: safe to import from browser code (the form shows the same limits). */

/**
 * Upload limits shared by all forms (design revision 2026-10-02, §18).
 *
 * Files travel as e-mail attachments, both from Node (nodemailer) and from
 * PHP mail() on one.com, and most mail systems refuse messages over about
 * 25 MB. Base64 makes attachments a third larger, so the files together may
 * be at most 18 MB. Larger files (big 3D models) go as a link in `fillenke`.
 * Raising this to ~100 MB per file needs storage outside e-mail (for example
 * direct upload to object storage with a download link in the e-mail); see
 * docs/decisions/decision-log.md.
 */
export const opplasting = {
  maksFiler: 8,
  maksBytePerFil: 18 * 1024 * 1024,
  maksByteTotalt: 18 * 1024 * 1024,
  tillatteEndelser: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf', 'stl', '3mf', 'step', 'stp', 'obj', 'svg'],
} as const;

export const MB = (n: number) => Math.round(n / 1024 / 1024);

export function sjekkFil(f: File): string | null {
  const endelse = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(opplasting.tillatteEndelser as readonly string[]).includes(endelse)) {
    return `«${f.name}» har et filformat vi ikke tar imot.`;
  }
  if (f.size > opplasting.maksBytePerFil)
    return `«${f.name}» er større enn ${MB(opplasting.maksBytePerFil)} MB.`;
  return null;
}

/** The message when the files together are too large, or null. */
export function sjekkTotal(filer: readonly { size: number }[]): string | null {
  const sum = filer.reduce((s, f) => s + f.size, 0);
  return sum > opplasting.maksByteTotalt
    ? `Filene er til sammen større enn ${MB(opplasting.maksByteTotalt)} MB. Send store filer som en lenke.`
    : null;
}
