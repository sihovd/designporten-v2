# Publisering av Designporten på one.com

Sivert godkjente 14. oktober 2026 at den nye siden i `sihovd/designporten-v2` skal erstatte nettstedet på designporten.no. Den eldre instruksen om kun testutrulling gjelder ikke selve dette godkjente byttet. Arbeid skjer på branch og via PR; `main` har automatisk Render-publisering.

## Verifisert før byttet

- Webroten inneholder en statisk forside, gamle HTML-sider og WordPress-filer.
- Permanent webbackup fra 14. oktober 2026, 20:42 UTC, er ferdig hos one.com: 718 MB. En permanent databasebackup fra 20:44 UTC er også ferdig. Databasene og e-postkontoene slettes ikke under byttet.
- Brreg bekrefter Designporten Hovde, org.nr. 835 792 552, Nyveien 1457, 1960 Løken. Postkassene `kontakt@designporten.no` og `post@designporten.no` finnes hos one.com. Telefonnummer og åpningstider er ikke bekreftet.
- Kortbetaling er avslått i butikkinnstillingene, og PHP-bygget har ikke Stripe-ruter. Handlekurven sender forespørsler.

## Bygg og lokal kontroll

```sh
npm ci
npm run verify
npm run test:e2e
npm run build:onecom:test
npm run lint:php
npm run test:e2e:onecom
node scripts/pakk-onecom.mjs
```

PHP 8.1+ med mbstring må finnes i PATH, eller via `PHP_BIN`. Lokal PHP-testserver fanger meldinger i `var/php-mail` og deaktiverer `mail()`; ingen automatisk test sender e-post ut. Testbygget bruker `/designporten-test/`, egne interne lenker og noindex. Bygg med `npm run build:onecom` for domenets rot etter at endringen ligger på `main`.

`dist/deployment.json` angir commit, om kildekoden var endret ved bygging, URL-base og testmodus. Produksjon skal pakkes fra ren kildekode på den avtalte GitHub-commiten. `node scripts/skriv-epostoppsett.mjs` skriver mottaker/avsender fra `SKJEMA_TIL` og `SKJEMA_FRA`, uten å logge adressene. Disse innstillingene er nødvendige for faktisk levering; uten dem svarer PHP med en tydelig 503-feil.

## Første publisering via innlogget File Manager

1. Last opp og pakk ut test-ZIP i den nye, tomme `designporten-test`-mappen. Kontroller nettsted, ressurser og PHP-validering på webhotellet. Gamle WordPress-regler i overordnet `.htaccess` kan påvirke testområdets 404; den endelige root-404 kontrolleres etter byttet.
2. Bekreft permanent backup. Opprett `gammel-side-2026-10-14` og flytt det gamle nettstedets innhold dit. Arkivet er kun for tilbakerulling; det skal gi 403 fra nettet.
3. Last opp/pakk ut produksjonsbygget i webroten. E-postkontoer og DNS endres ikke. ZIP-arkivet er et midlertidig distribusjonsformat og fjernes når utpakkingen er verifisert.
4. Kontroller produksjonsforsiden, navigasjon, kontakt/idéskjema, handlekurv, logo, favicon, 404 og gamle HTML-adressers 301-videresendinger. Kontroller commit i `deployment.json` og at global test-noindex er fjernet. Plassholderprodukters egne noindex beholdes.
5. Faktisk e-postmottak bekreftes med en manuell innsending til den eksisterende kontaktpostkassen; automatiserte tester bruker kun lokal mail capture eller validering/honeypot som ikke leverer.

Ved tilbakeføring: bruk one.coms permanente backup eller flytt det gamle nettstedet tilbake. Ikke bland gamle og nye `.htaccess`-filer.

## GitHub → SFTP til testområdet

Arbeidsflyten `Test deployment to one.com` krever miljøet `onecom-test` og følgende secrets: `ONECOM_SFTP_HOST`, `ONECOM_SFTP_BRUKER`, `ONECOM_SFTP_PASSORD`, `ONECOM_SFTP_FINGERAVTRYKK`, `ONECOM_MAPPE`. Port kan overstyres med `ONECOM_SFTP_PORT` (standard 22). `SKJEMA_TIL` og `SKJEMA_FRA` er valgfrie for utrulling, men kreves for levering. Legg dem inn i Settings → Environments → onecom-test eller Settings → Secrets and variables → Actions.

`ONECOM_MAPPE` er en relativ, dedikert sti som slutter på `-test`. Standard URL-base er `/designporten-test/`, overstyrt med variabelen `ONECOM_TEST_BASE`. URL-stien og SFTP-stien er ulike dersom SFTP starter over webroten. Bekreft den faktiske startmappen hos one.com. Fingeravtrykket må bekreftes mot verten; ingen automatisk godkjenning av ukjent SSH-nøkkel.

Denne testarbeidsflyten kan ikke brukes til rotpublisering: den avviser rot, traversal, WordPress, symlinker og ikke-tomme mål uten riktig eierskapsmarkør. Den laster bare opp dist og sletter ingen fjernfiler. Fremtidige produksjonsoppdateringer krever en tilsvarende kontrollert publisering av et nytt verifisert produksjonsbygg.

## Innhold og drift som fortsatt trenger oppfølging

Produktene og flere bilder er markerte plassholdere/konseptbilder. Ingen priser, lagerstatus, leveringstider, telefonnummer eller åpningstider er oppdiktet. Det må legges inn ekte innhold før siden behandles som en ferdig nettbutikk. Juridiske sider har fortsatt punkter som eieren må fastsette for faktisk salg og personvernets lagringstid. Koden aktiverer ingen kortbetaling.

`npm audit --omit=dev` er uten kjente sårbarheter etter de kompatible lockfile-oppdateringene. Et gjenværende auditvarsel gjelder braces/fast-glob i ESLint-verktøykjeden; den sendes ikke til one.com. Ikke bruk `npm audit fix --force` som en utestet nedgradering av lintverktøyene.
