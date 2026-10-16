# Designporten Studio

Implementasjon på branch `codex/cms-studio`, startet 16.10.2026 fra `3ebffb2` (nyeste sammenslåtte bildebibliotek). Ingen produksjonsfiler eller ekte database er endret under utviklingen.

## Bygget i denne leveransen

- Egen responsiv Studio-flate på `/cms/`, uten nettstedets offentlige topp-/bunnmeny.
- Startside med faktiske antall sideutkast, publiserte sidefelt, blogginnlegg, aktive bilder og forslag. Kurven teller registrerte CMS-hendelser per UTC-dag i valgt 7/30/90-dagersperiode. Den er ikke en salgs- eller besøkskurve.
- Teknisk øyeblikkskontroll for administrator. Andre redaktører får ikke tekniske serverdetaljer fra oversikten.
- Hvis publiserte sidetekster finnes i databasen, men visningsfilen ble borte under opplasting, kan administrator gjenopprette den fra oversikten uten å endre tekstene.
- Blogginnlegg i databasen, med introduksjon, kategori, emneknagger, forfatter, SEO, forsidebilde og blokker for avsnitt, mellomtitler og bilder.
- Utkast, eksplisitt publisering, avpublisering, optimistisk versjonskontroll, historikk og gjenoppretting som utkast.
- Privat forhåndsvisning med eksisterende innlogging; no-store og noindex. Ulagret innhold sendes ikke inn i offentlig visning.
- Offentlig blogg på `/blogg/` og nye artikkeladresser uten nytt kodebygg. Serverrenderet tekst og bilder, metadata, BlogPosting-data og sitemap. Publiserte nettadresser låses; omdøping/redirects kommer senere.
- Innlegg og revisjoner inngår i JSON-backup/restore. Eldre sikkerhetskopier uten bloggtabeller bevarer bloggdataene. Bildebinærer følger ikke JSON-eksporten; ta separat kopi av medielageret.
- Eksisterende sideredigering, bildebibliotek, forslag, konto, brukere, logg og backup er beholdt.

Ingen besøkssporing er lagt til. Omsetning, konvertering, ordre, betalingsforbindelser, backupovervåkning og historisk oppetid står som **ikke tilkoblet**. Det finnes ingen eksempelstatistikk i denne implementasjonen.

## Gjenstående moduler

Full vare-/variant-/lagerstyring, ordre, Vipps/Stripe, besøksanalyse, planlagt publisering, automatisk artikkelimport fra eksisterende Markdown, riktekst/lenkeblokker, produktkoblinger og direkte bildebytte for alle nettstedets bilder er ikke ferdigstilt av denne leveransen. Den eksisterende produktadministrasjonen er fortsatt tilgjengelig via en tydelig lenke og bruker GitHub. Denne leveransen er en fungerende CMS-/bloggutvidelse, ikke en ferdig handelsplattform.

Eksisterende Inspirasjon-saker beholdes. En lenke fra Inspirasjon leder til den nye bloggen; det er ingen destruktiv automatisk migrering av eldre artikler.

## Data og tilgang

Migrering 3 oppretter `cms_innlegg` og `cms_innlegg_revisjoner`. Ingen eksisterende tabeller slettes. Artikler bruker en JSON-modell med kontrollerte blokktyper; vilkårlig HTML rendres aldri som kode. Databaseoperasjon, revisjon og loggførelse utføres i samme transaksjon. Publisering forutsetter forventet versjon og unik nettadresse.

Administrator og redaktør får bloggerettigheten. Eksisterende agentnøkler får den ikke automatisk. De tidligere rettighetene for sidetekster er uendret. Blogg-API-et er cookie-/CSRF-beskyttet med eksisterende CMS-mekanisme.

API: `GET oversikt&dager=30`, `GET innlegg`, `GET innlegg-en&id=…`, `POST innlegg-lagre`, `POST innlegg-publiser`, `POST innlegg-avpubliser`, `POST innlegg-gjenopprett`. Dokumenter sendes som `{id, versjon, dokument}` ved lagring. Forhåndsvisning: `/api/cms/blogg.php?forhandsvis=<id>`.

Publisert blogg leses fra databasen i denne versjonen. Hvis databasen er utilgjengelig, returnerer bloggen en forståelig 503-feil fremfor å vise utdatert eller privat innhold. Sidetekstene fortsetter å bruke sitt eksisterende publiseringssnapshot.

## Før utrulling

1. Test i separat miljø med egen database og medielager. Ikke kopier ekte konfigurasjon eller kundedata inn i testene.
2. Ta databasebackup og separat backup av `medier/`, `api/cms/data/`, privat konfigurasjon og forrige kodeversjon.
3. Bevar `api/oppsett.php`, `api/cms/konfig.php`, `api/cms/data/` og `medier/` ved opplasting. Flytt ikke hele mapper over eksisterende mapper hvis filbehandleren erstatter innholdet.
4. Ny kode inkluderer bloggruter i `.htaccess`, PHP-filene, Astro-skjell, assets og migrering 3. Databasemigrering skjer ved første CMS-/bloggkall.
5. Kontroller API-tilgang, privat preview, publisering og faktisk Apache-routing på testmålet. PHPs lokale router etterligner reglene, men beviser ikke One.coms Apache-oppsett.
6. Ingen automatisk merge eller rotpublisering. Sivert godkjenner den konkrete releasen etter gjennomgang.

## Tilbakeføring

Tidligere kode kan gjenopprettes uten å slette de nye tabellene. Nye bloggdata blir da liggende urørt, men tidligere kode har ikke de offentlige bloggrutene. Ta derfor vurdering av nye publiserte URL-er før tilbakeføring. Tilbakeføring av en artikkel gjøres med revisjon → utkast → publiser, ikke ved å erstatte hele databasen.

## Lokale kontroller

`npm run verify`, `npm run lint:php`, `npm run build:onecom:test`, `npm run test:e2e:onecom`.

PHP-testene trenger mbstring, PDO SQLite og GD; MySQL/MariaDB må i tillegg testes før produksjonsaktivering. `PHP_BIN` og `PHPRC` kan peke på en lokal PHP-installasjon og privat test-ini. Ingen slike maskinspesifikke stier skal ligge i produksjonskoden.

Se testresultatene fra den aktuelle releasen for hva som faktisk er kjørt. SQLite-test alene dokumenterer ikke MySQL, og gjennomført PHP-router-test dokumenterer ikke Apache.
