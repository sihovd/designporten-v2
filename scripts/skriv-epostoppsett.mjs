import { writeFileSync } from 'node:fs';
const til = process.env.SKJEMA_TIL || '';
const fra = process.env.SKJEMA_FRA || '';
const gyldig = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
if ((til || fra) && (!gyldig(til) || !gyldig(fra))) {
  throw new Error('Set both SKJEMA_TIL and SKJEMA_FRA to valid addresses, or leave both unset.');
}
const q = (s) => `'${s.replace(/[\\']/g, '\\$&')}'`;
writeFileSync('dist/api/oppsett.php', `<?php\nreturn ['til' => ${q(til)}, 'fra' => ${q(fra)}];\n`);
console.warn(
  til
    ? 'PHP mail configuration written.'
    : 'Forms will safely refuse delivery until recipient and sender are configured.',
);
