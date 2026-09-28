/**
 * Delivery of form submissions (idea form, contact, order requests).
 * Server-only. Never drops a message silently:
 *  - with SMTP configured, sends an e-mail (attachments included);
 *  - without SMTP in development, writes the submission to var/innsendinger/;
 *  - without SMTP when KREV_EPOST=true (production), refuses with an error
 *    the page shows to the visitor.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

export interface Vedlegg {
  filnavn: string;
  type: string;
  innhold: Uint8Array;
}

export interface Innsending {
  type: 'ide' | 'kontakt' | 'bestilling';
  emne: string;
  /** Ordered fields shown in the e-mail, label → value. */
  felter: [string, string][];
  svarTil?: string;
  vedlegg?: Vedlegg[];
}

export type Leveringsresultat =
  { ok: true; kanal: 'epost' | 'fil'; referanse: string } | { ok: false; grunn: string };

function env(navn: string): string | undefined {
  const v = process.env[navn] ?? (import.meta.env as Record<string, string | undefined>)[navn];
  return v && v.length > 0 ? v : undefined;
}

export function referanse(): string {
  const d = new Date();
  const dato = d.toISOString().slice(0, 10).replaceAll('-', '');
  const tilfeldig = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `DP-${dato}-${tilfeldig}`;
}

function tekstkropp(inn: Innsending, ref: string): string {
  return [`${inn.emne}`, `Referanse: ${ref}`, '', ...inn.felter.map(([k, v]) => `${k}:\n${v || '—'}\n`)].join(
    '\n',
  );
}

export async function lever(inn: Innsending): Promise<Leveringsresultat> {
  const ref = referanse();
  const host = env('SMTP_HOST');
  const til = env('SKJEMA_TIL');

  if (host && til) {
    try {
      const transport = nodemailer.createTransport({
        host,
        port: Number(env('SMTP_PORT') ?? 587),
        secure: Number(env('SMTP_PORT') ?? 587) === 465,
        auth: env('SMTP_USER') ? { user: env('SMTP_USER')!, pass: env('SMTP_PASS') ?? '' } : undefined,
      });
      await transport.sendMail({
        from: env('SKJEMA_FRA') ?? til,
        to: til,
        replyTo: inn.svarTil,
        subject: `[${ref}] ${inn.emne}`,
        text: tekstkropp(inn, ref),
        attachments: (inn.vedlegg ?? []).map((v) => ({
          filename: v.filnavn,
          contentType: v.type,
          content: Buffer.from(v.innhold),
        })),
      });
      return { ok: true, kanal: 'epost', referanse: ref };
    } catch (feil) {
      console.error('Skjema: e-post feilet', feil);
      return { ok: false, grunn: 'Meldingen kunne ikke sendes akkurat nå. Prøv igjen om litt.' };
    }
  }

  if (env('KREV_EPOST') === 'true') {
    console.error('Skjema: SMTP er ikke satt opp, og KREV_EPOST=true.');
    return { ok: false, grunn: 'Skjemaet er ikke koblet til e-post ennå. Prøv igjen senere.' };
  }

  const mappe = path.resolve('var/innsendinger', ref);
  await mkdir(mappe, { recursive: true });
  await writeFile(path.join(mappe, 'melding.txt'), tekstkropp(inn, ref), 'utf8');
  for (const v of inn.vedlegg ?? []) {
    await writeFile(path.join(mappe, path.basename(v.filnavn)), v.innhold);
  }
  return { ok: true, kanal: 'fil', referanse: ref };
}

/** Upload limits shared by all forms. */
export const opplasting = {
  maksFiler: 8,
  maksBytePerFil: 15 * 1024 * 1024,
  tillatteEndelser: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf', 'stl', '3mf', 'step', 'stp', 'obj', 'svg'],
} as const;

export function sjekkFil(f: File): string | null {
  const endelse = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(opplasting.tillatteEndelser as readonly string[]).includes(endelse)) {
    return `«${f.name}» har et filformat vi ikke tar imot.`;
  }
  if (f.size > opplasting.maksBytePerFil) return `«${f.name}» er større enn 15 MB.`;
  return null;
}
