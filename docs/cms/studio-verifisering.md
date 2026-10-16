# Studio: kontrollert 16.10.2026

Denne kontrollen gjelder branchen `codex/cms-studio`. Ingen produksjonsdatabase, One.com-filer eller betalingskontoer ble endret.

## Bestått lokalt

- `npm run verify`: formatering, lint, Astro/typekontroll, 565 enhetstester i 57 filer, 28 backend-/byggetester og ordinært bygg.
- PHP-syntakskontroll av de endrede PHP-filene.
- One.com-testbygg med separat `/designporten-test/`-base.
- `npm run test:e2e:onecom`: 32 bestått, 14 bevisst utelatt, ingen feil. CMS-testene kjører bare én gang fordi de deler database; responsive tester setter selv fem skjermbredder. Øvrige utelatelser er doble breddeprøver i mobilprosjektet.
- Faktisk PHP/SQLite i testene: rettigheter, CSRF, versjonskonflikt, unik/låst publisert adresse, utkast som forblir private, revisjoner, backup/restore, publiseringssnapshot og reelle oversiktstall.
- Nettleserflyt: oppsett/innlogging, eksisterende inline-tekst og bildebytte, bloggopprettelse, lagring, privat forhåndsvisning, publisering, offentlig artikkel og sitemap.
- Automatisert tilgjengelighetskontroll i bloggflyten og kontroll av horisontal overflyt ved 320, 390, 768, 1024 og 1440 piksler. Skjermbilder av oversikt og redaktør er gjennomgått visuelt. Dette erstatter ikke full manuell skjermlesertest.

Lokale testdata er syntetiske. Testoppsett og bilder ligger utenfor versjonskontrollen; ingen virkelige passord er tatt med.

## Ikke bekreftet

- One.coms faktiske Apache-regler, MySQL/MariaDB og produksjonskonfigurasjon. Lokal PHP-router og SQLite beviser ikke dette.
- E-postlevering, betalinger, ordre, lager, faktisk besøksstatistikk eller historisk oppetid.
- Full manuell kontroll med skjermleser eller alle nettlesermotorer.

## Før publisering

Følg utrullings- og backupstegene i [studio.md](studio.md). Test med separat database på One.com. Bevar privat konfigurasjon, eksisterende data og medier. Merge og produksjonspublisering krever Siverts godkjenning.

Denne leveransen er Studio med blogg og eksisterende innholdsfunksjoner. Full vare-/ordrestyring, Vipps/Stripe og bildebytte på alle offentlige flater er gjenstående arbeid.
