/**
 * The PHP form routes (php/, used on hosts without Node) repeat a few lists
 * from the TypeScript side. Keep them in step.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { opplasting } from '@/lib/skjema/levering';
import { antallValg } from '@/components/showroom/skjema/tolk';
import { startpunkter } from '@/components/showroom/startpunkter';

const felles = readFileSync('php/api/_felles.php', 'utf8');
const skjema = readFileSync('php/api/foresporsel/index.php', 'utf8');

describe('PHP routes', () => {
  it('know the same start points and quantity choices as the form', () => {
    for (const s of startpunkter) expect(skjema).toContain(`'${s.id}' => '${s.tittel}'`);
    expect(skjema).toContain(`const ANTALL_VALG = [${antallValg.map((a) => `'${a}'`).join(', ')}];`);
  });

  it('use the same upload limits', () => {
    expect(felles).toContain(`const DP_MAKS_FILER = ${opplasting.maksFiler};`);
    expect(felles).toContain(
      `const DP_MAKS_BYTE_PER_FIL = ${opplasting.maksBytePerFil / 1024 / 1024} * 1024 * 1024;`,
    );
    expect(felles).toContain(
      `const DP_MAKS_BYTE_TOTALT = ${opplasting.maksByteTotalt / 1024 / 1024} * 1024 * 1024;`,
    );
    expect(felles).toContain(
      `const DP_ENDELSER = [${opplasting.tillatteEndelser.map((e) => `'${e}'`).join(', ')}];`,
    );
  });
});
