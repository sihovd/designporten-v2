import { nettsti } from '@/lib/nettsti';
/**
 * Asset registry. Every brand and photo asset the site uses is referenced
 * from here, so final files replace temporary ones in one place.
 *
 * `midlertidig: true` marks a temporary placeholder (Sivert, 2026-09-28:
 * missing assets must not stop work, but must be clearly identified).
 * `konsept: true` marks an AI concept image; the UI labels it «Konseptbilde».
 */

export interface Bilde {
  src: string;
  alt: string;
  bredde: number;
  hoyde: number;
  konsept: boolean;
  midlertidig: boolean;
  /** Transparent cut-out (PNG/WebP with alpha). */
  utklipp?: boolean;
}

const k = nettsti('/midlertidig/konsept');

function utklipp(navn: string, alt: string): Bilde {
  return {
    src: `${k}/utklipp/${navn}.webp`,
    alt,
    bredde: 900,
    hoyde: 900,
    konsept: true,
    midlertidig: true,
    utklipp: true,
  };
}

export const bakgrunner = {
  verksted: {
    src: `${k}/bakgrunn/workshop-hero-concept-v1.webp`,
    alt: 'Arbeidsbord i et verksted med 3D-printer og materialprøver',
    bredde: 1600,
    hoyde: 900,
    konsept: true,
    midlertidig: true,
  },
  samarbeid: {
    src: `${k}/bakgrunn/workshop-collaboration-concept-v1.webp`,
    alt: 'Skisser og printede deler på et arbeidsbord',
    bredde: 1200,
    hoyde: 800,
    konsept: true,
    midlertidig: true,
  },
  prosess: {
    src: `${k}/bakgrunn/process-strip-concept-v1.webp`,
    alt: 'Verkstedflate med verktøy og materialer',
    bredde: 1600,
    hoyde: 533,
    konsept: true,
    midlertidig: true,
  },
} satisfies Record<string, Bilde>;

export const utklippbilder = {
  spiralvase: utklipp('spiralvase', 'Spiralvase i kremhvit PLA'),
  lampeskjerm: utklipp('lampeskjerm', 'Lampeskjerm med bølgende ribber'),
  fasettpotte: utklipp('fasettpotte', 'Fasettert plantepotte i lys lilla'),
  skrivebordsorganiserer: utklipp('skrivebordsorganiserer', 'Trappeformet skrivebordsorganiserer i blått'),
  veggknagger: utklipp('veggknagger', 'Sett med modulære veggknagger i tre farger'),
  kabelholder: utklipp('kabelholder', 'Kabelholder med fire spor'),
  loopKnagg: utklipp('loop-knagg', 'Veggknagg formet som en løkke'),
  bokstotter: utklipp('bokstotter', 'To bokstøtter med buet profil'),
  bordbrikker: utklipp('bordbrikker', 'Bordbrikker i holder, fire farger'),
  stiklingstativ: utklipp('stiklingstativ', 'Stativ for stiklinger med tre glassrør'),
  telefonstativ: utklipp('telefonstativ', 'Telefonstativ i blått'),
  nokkelring: utklipp('nokkelring', 'Nøkkelring med innfelt navneflate'),
} satisfies Record<string, Bilde>;

/**
 * Sivert's logo (supplied 2026-09-28), in public/brand/. The artwork is his
 * original, only optimised. `logo` is the full stacked lockup ("dp" mark over
 * the wordmark); `logomerke` is the same "dp" mark on its own, cut from the
 * same file, for small places (header, favicon). The favicon set in public/
 * is generated from `logomerke`.
 */
export const logo: Bilde = {
  src: nettsti('/brand/designporten-logo.svg'),
  alt: 'Designporten',
  bredde: 2684,
  hoyde: 1205,
  konsept: false,
  midlertidig: false,
};

export const logomerke: Bilde = {
  src: nettsti('/brand/designporten-merke.svg'),
  alt: 'Designporten',
  bredde: 731,
  hoyde: 731,
  konsept: false,
  midlertidig: false,
};

/** Default social preview: the full logo on the showroom paper colour. */
export const standardDelingsbilde: Bilde = {
  src: nettsti('/brand/delingsbilde.png'),
  alt: 'Designporten',
  bredde: 1200,
  hoyde: 630,
  konsept: false,
  midlertidig: false,
};

/** Mascot (cute, slightly spiky dragon). Not yet supplied. */
export const maskot: Bilde | null = null;
