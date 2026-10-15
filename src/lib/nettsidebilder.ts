import { z } from 'zod';
import data from '@/content/sider/bilder.json';
import { bakgrunner, type Bilde } from '@/lib/ressurser';
import { nettsti } from '@/lib/nettsti';

const bildefeltSkjema = z.object({
  fil: z.string().trim(),
  alt: z.string().trim().min(1),
  fokus: z.string().regex(/^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$/),
});

const skjema = z.object({
  forside: bildefeltSkjema,
  spesialdesign: bildefeltSkjema,
  bedrift: bildefeltSkjema,
  omHistorie: bildefeltSkjema,
});

const siderBilder = skjema.parse(data);

export function brukNettsidebilde(bildefelt: z.infer<typeof bildefeltSkjema>, reserve: Bilde): Bilde {
  if (!bildefelt.fil) return reserve;
  if (!bildefelt.fil.startsWith('/opplastet/') || bildefelt.fil.includes('..')) {
    throw new Error('Nettsidebilder må lastes opp til mediebiblioteket /opplastet/.');
  }

  return {
    src: nettsti(bildefelt.fil),
    alt: bildefelt.alt,
    bredde: reserve.bredde,
    hoyde: reserve.hoyde,
    konsept: false,
    midlertidig: false,
  };
}

export const nettsidebilder = {
  forside: {
    bilde: brukNettsidebilde(siderBilder.forside, bakgrunner.verksted),
    fokus: siderBilder.forside.fokus,
  },
  spesialdesign: {
    bilde: brukNettsidebilde(siderBilder.spesialdesign, bakgrunner.samarbeid),
    fokus: siderBilder.spesialdesign.fokus,
  },
  bedrift: {
    bilde: brukNettsidebilde(siderBilder.bedrift, bakgrunner.verksted),
    fokus: siderBilder.bedrift.fokus,
  },
  omHistorie: brukNettsidebilde(siderBilder.omHistorie, bakgrunner.samarbeid),
};
