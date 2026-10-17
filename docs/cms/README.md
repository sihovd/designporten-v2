# Designporten CMS

Eget innholdssystem for designporten.no, bygget etter Siverts plan «Designporten – plan for eget CMS» (versjon 1.0, 15. oktober 2026). Planen ligger i [`plan/`](plan/). Dette dokumentet er fase 0-leveransen (kartlegging, arkitektur, migrasjonsplan, testplan, åpne beslutninger) og beskriver det som er bygget i fase 1 og 2.

**Hovedregelen fra planen:** Kode og design går Claude Code → GitHub → test → nettsted. Innhold går eier/agent → CMS-API → database → nettsted. De to strømmene er adskilt.

## Status

**Studio-utvidelse (16.10.2026):** Ny administrasjonsflate, reell innholdsoversikt og
databasebasert blogg er implementert i Studio-branchen. Se [studio.md](studio.md) for
funksjoner, avgrensninger, datamigrering og utrulling. Dette er ikke en bekreftelse på
at utvidelsen er publisert på one.com.

| Fase | Innhold | Status |
|---|---|---|
| 0 | Kartlegging, feltmatrise, migrasjonsplan, testplan | Ferdig (dette dokumentet, [feltmatrise.md](feltmatrise.md)) |
| 1 | CMS-kjerne: database, roller, innlogging, revisjoner, logg, publisering, API, sikkerhetskopi | Ferdig for sidetekster |
| 2 | «Rediger innhold» på siden, utkast og publisering hver for seg | Ferdig for sidetekster |
| 5 (del) | Agent-API: nøkler med rettigheter, forslag, godkjenningskø, idempotens | Ferdig for sidetekster |
| 3 (del) | Mediebibliotek, opplasting, bytte av bilde på siden ([Bilder](#bilder)) | Bygget for toppbildene på forsiden, Spesialdesign og For bedrifter. Resten av bildene kommer i neste pakke. |
| 3 (rest) | Produkter, varianter, lager, ordre, Stripe og Vipps | Ikke bygget. Sivert valgte 15.10 at ordre, lager og betaling skal ligge i CMS-et (beslutningsloggen). |
| 4 | Bildekomposisjon | Ikke bygget |
| 5 (rest) | Webhooks, jobbkø | Ikke bygget |
| 6 | Staging, lasttest, overvåkning, gradvis aktivering | Ikke bygget |

CMS-et er ikke slått på på designporten.no. Det krever en database og en innstillingsfil på one.com (se [Slik slås CMS-et på](#slik-slås-cms-et-på)). Inntil da oppfører siden seg nøyaktig som før.

## Fase 0: kartlegging

Svar på de åpne spørsmålene i planens punkt 6, slik koden og driften er 15. oktober 2026:

1. **Repo, branch og rammeverk.** `sihovd/designporten-v2`, branch `main`. Astro 7 (statiske sider), Preact-øyer, TypeScript. Skaperverkstedet bruker Three.js.
2. **Hosting, database, lagring, innlogging.** designporten.no kjører på one.com siden 14. oktober: statiske filer pluss PHP-skript for skjemaer og bestilling (`npm run build:onecom`, Apache, PHP 8.1+). one.com-kontoen har MySQL-databaser (det finnes en permanent databasebackup fra 14.10). Render (`designporten.onrender.com`) er en forhåndsvisning med Node, og gratisplanen har ingen fast lagring. Før CMS-et fantes ingen innlogging på nettstedet: `/admin` (Sveltia CMS) og «Rediger tekst» på sidene logger inn mot GitHub med en tilgangsnøkkel.
3. **Produkter, priser, ordre, bilder og SEO.** Produkter: én JSON-fil per produkt i `src/content/produkter/data/` (12 stk., alle merket plassholder, ingen priser). Produktbilder: `src/content/produkter/bilder/` og konseptbilder via `src/lib/ressurser.ts`. Sidetekster: `src/content/sider/*.json` (fem sider). SEO-tittel og -beskrivelse: i de samme sidefilene (`meta`). Ordre: lagres ikke; bestillingsforespørsler og skjemaer sendes på e-post. Butikkinnstillinger: `src/content/butikk/innstillinger.json`.
4. **Lager og Stripe.** Ingen lagerstyring. Stripe Checkout er bygget for Node-versjonen, men avslått, og one.com-versjonen har ingen betalingsruter.
5. **Hva skal kunne redigeres fra dag én.** Valgt standard: de 95 tekstene som allerede er merket redigerbare på forsiden, Om, Spesialdesign, For bedrifter og Kontakt ([feltmatrise.md](feltmatrise.md)). Produkter og bilder kommer i fase 3.
6. **Bildeformater og komposisjonsmaler.** Ikke avklart. Venter på fase 4.
7. **Agenter.** Ikke avklart hvilke. Valgt standard: en agent får bare «Foreslå tekster» til en administrator gir mer.
8. **Backup, staging, utrulling.** Se [Drift](#drift-sikkerhetskopi-og-tilbakerulling).

### Hvor innholdet ligger, før og etter

| Innhold | Før | Nå |
|---|---|---|
| Sidetekster (95 felt) | `src/content/sider/*.json` i GitHub | Database på one.com. Teksten i GitHub er standardteksten som vises til noe er publisert i CMS-et. |
| SEO-tittel og -beskrivelse | Sidefilene | Uendret (fase 3) |
| Produkter, produktbilder, butikkinnstillinger | JSON og bilder i GitHub, redigeres i `/admin` | Uendret (fase 3) |
| Inspirasjon | `src/content/inspirasjon/` | Uendret |
| Lenker, priser, prosess-stegene, meny, skjemaer, juridiske sider | Kode | Uendret: dette er design og regler, ikke innhold |

Ingen felt er fjernet eller flyttet ut av repoet. Feltmatrisen viser hvert felt og hvor det vises.

## Arkitektur

```
 Besøkende ──► Apache (one.com) ──► api/cms/side.php ──► bygget side + publiserte tekster (data/publisert.json)
                                                                     ▲
 Redaktør ──► /cms/ og «Rediger innhold» på siden ──► api/cms/ (PHP) ─┤──► MySQL: cms_innhold, cms_revisjoner,
 Agent ─────► api/cms/ med API-nøkkel ────────────────┘               │    cms_forslag, cms_hendelser, cms_brukere
                                                                     │
 Claude Code ──► GitHub ──► bygg ──► opplasting av dist/ ────────────┘ (rører aldri databasen eller data/)
```

- **Kontrakten mellom design og innhold** (planens 2.4) er `data-rediger`-nøkkelen: `sider/forside#helt.tittel` betyr «tittelen i toppen av forsiden». Koden bestemmer hvor og hvordan teksten vises. CMS-et bestemmer hva den sier. Bygget skriver alle nøklene til `api/cms/nokler.json`, og CMS-et godtar bare de nøklene. Bygget stopper hvis et merket felt har en form side.php ikke kan fylle inn (`scripts/cms-nokler.mjs`).
- **Visning uten ny utrulling.** Når noe er publisert, sender Apache sideforespørsler gjennom `api/cms/side.php`. Den leser den bygde siden og bytter ut teksten i de merkede elementene med det publiserte, escapet som ren tekst. Den leser en JSON-fil (`api/cms/data/publisert.json`) som skrives ved hver publisering, så et besøk aldri venter på databasen. Feiler noe, serveres siden som bygget. Før første publisering finnes ikke filen, og Apache sender sidene rett ut som i dag.
- **Utkast** vises bare for innloggede redaktører. Siden henter dem fra API-et og legger dem over den publiserte teksten (stiplet oransje kant). «Vis som besøkende» viser siden slik alle andre ser den.
- **Database.** PDO med MySQL på one.com (SQLite lokalt og i testene). Tabellene opprettes og oppgraderes automatisk ved første kall (`cms_migrering`, nummererte steg som aldri endres når de først er tatt i bruk). Kolonner som ikke brukes lenger blir stående.
- **Kode:** [`php/api/cms/`](../../php/api/cms/) (API, side.php, kjerne), [`src/components/cms/CmsPanel.tsx`](../../src/components/cms/CmsPanel.tsx) (`/cms/`), [`src/scripts/cmsverktoy.ts`](../../src/scripts/cmsverktoy.ts) (redigering på siden), [`src/lib/cms/`](../../src/lib/cms/) (klient).

### Datamodell

Tilpasset planens logiske modell (2.2) til det som trengs for tekster nå:

| Tabell | Planens navn | Innhold |
|---|---|---|
| `cms_brukere` | users | Personer (e-post, passord-hash, rolle) og agenter (API-nøkkel som SHA-256-hash, rettigheter) |
| `cms_innhold` | content_entries | Én rad per felt: `utkast`, `publisert`, `versjon` (optimistisk låsing), hvem og når |
| `cms_revisjoner` | revisions | Hver lagring, publisering, forkasting og gjenoppretting, med verdien |
| `cms_forslag` | approval_requests | Agentforslag med begrunnelse, kilde, idempotensnøkkel og status |
| `cms_hendelser` | audit_events | Alt som skjer, også det som blir nektet: aktør, handling, felt, før, etter, resultat, IP |
| `cms_forsok` | – | Telling for begrensning av innloggingsforsøk og agentkall |

`pages`, `sections`, `products`, `product_variants`, `media_*`, `image_compositions` og `agent_jobs` kommer med fasene de hører til.

### Roller

| Rolle | Kan |
|---|---|
| Administrator | Alt, også brukere, agentnøkler og sikkerhetskopi |
| Redaktør | Endre, publisere, gjenopprette, behandle forslag, se loggen |
| Agent | Bare det administratoren har krysset av for: «Foreslå tekster» (standard), «Lagre utkast», «Publisere» |

### API

Ett inngangspunkt, `api/cms/?r=<handling>`, JSON inn og ut. Personer bruker økt-cookie (HttpOnly, SameSite=Strict, Secure på https) og sender `X-CSRF-Token` på alle POST. Agenter sender `Authorization: Bearer <nøkkel>` (eller `X-CMS-Nokkel` der webhotellet fjerner Authorization).

| Handling | Hvem | Gjør |
|---|---|---|
| `GET status` | Alle | Om CMS-et er satt opp og har brukere |
| `GET publisert` | Alle | Bare publiserte tekster |
| `POST oppsett` | Første gang | Første administrator, krever oppsettkoden |
| `POST logginn`, `POST loggut`, `GET meg` | Personer | Økt og CSRF-token |
| `GET innhold[&side=/om/]` | Les | Alle felt: standard, publisert, utkast, versjon |
| `POST lagre` | Utkast | `{endringer: [{nokkel, verdi, versjon}]}`. Feil versjon gir `konflikt` med den nye versjonen. |
| `POST publiser`, `POST forkast` | Publiser / utkast | `{nokler: [{nokkel, versjon}]}` |
| `GET historikk&nokkel=` | Les | Revisjonene til ett felt |
| `POST gjenopprett` | Utkast | `{revisjon, versjon}` eller `{standard: true, nokkel, versjon}`: blir utkast |
| `POST forslag` | Forslag | `{nokkel, verdi, begrunnelse, kilde}` + `Idempotency-Key`. Samme nøkkel to ganger gir samme forslag. |
| `GET forslag`, `POST behandle` | Les / behandle | Kø; `{id, beslutning: godkjenn|avvis, publiser}` |
| `GET brukere`, `POST bruker`, `POST ny-nokkel`, `POST passord` | Admin (passord: alle) | Brukere og nøkler |
| `GET logg` | Logg | De siste 300 hendelsene |
| `GET eksport`, `POST import` | Admin | Sikkerhetskopi. Bildelisten er med; import legger bare til bilder som mangler og sletter aldri. |
| `GET medier[&arkiverte=1]` | Les | Bildebiblioteket med hvor hvert bilde er brukt |
| `POST last-opp` | Utkast | Multipart, feltet `fil` (ett bilde per kall), valgfritt `alt`. Maks 120 per time. |
| `POST medium` | Utkast | `{id, navn?, alt?, konsept?, rettigheter?, arkivert?}` |
| `GET drift` | Admin | Hva webhotellet støtter (PHP, GD, WebP, grenser, ledig plass). Ingen hemmeligheter. |

Eksempel for en agent:

```sh
curl -X POST 'https://designporten.no/api/cms/?r=forslag' \
  -H 'Authorization: Bearer dpcms_…' -H 'Idempotency-Key: jobb-42' -H 'Content-Type: application/json' \
  -d '{"nokkel":"sider/forside#helt.tittel","verdi":"Ny tittel","begrunnelse":"Kortere","kilde":"tekstagent"}'
```

### Sikkerhet

Passord med `password_hash` (minst 12 tegn). Innlogging begrenses til 10 feil per e-post og 30 per IP i 15 minutter; agenter til 120 kall i minuttet. Økten roteres ved innlogging og utløper etter 8 timer. CSRF-token på alle endringer fra nettleseren. API-nøkler lagres bare som hash, vises én gang og kan byttes. Tekst lagres som ren tekst og escapes både på serveren og i nettleseren, så HTML eller skript i en tekst vises som tegn (testet). Agentens tekst behandles alltid som data. Publiserte svar inneholder aldri utkast. `konfig.php`, kjernefilene, feltlisten og datamappen er sperret i `.htaccess`. Alt som nektes, logges.

## Bilder

Et bildefelt merkes i byggets HTML med `<img data-rediger-bilde="sider/forside#helt.bilde" data-konsept="1|0">`. Samme nøkkel kan stå på en forhåndslastingslenke (`<link data-rediger-bilde-forhand="…">`) og på «Konseptbilde»-merket (`<span data-konseptmerke="…">`). `scripts/cms-nokler.mjs` tar med bildefeltene i feltlisten, med bildet siden ble bygget med som standard.

- **Verdien** i databasen er JSON: `{"medium": id, "alt": "…", "dekorativ": false, "fokus": "50% 50%", "fokusMobil": "…"}`. `{"medium": null}` betyr bildet siden ble laget med. Alt-tekst kreves med mindre bildet er merket som pynt, og et arkivert bilde kan ikke velges.
- **Publisering** skriver bildet ferdig oppslått inn i `publisert.json`. `side.php` bytter `src`, `srcset`, `width`, `height`, `alt` og fokuspunktet (`--fokus`, `--fokus-mobil`) i `<img>`, oppdaterer forhåndslastingen og skjuler «Konseptbilde» når bildet ikke er et konseptbilde. Ingen bygging eller opplasting trengs.
- **Opplasting** godtar JPEG, PNG og WebP (sjekket med innholdet, ikke filnavnet), opptil 20 MB og 40 megapiksler, og avviser SVG. Like filer gjenkjennes på sjekksum. GD lager versjoner i 480–2560 px bredde (aldri større enn originalen) som WebP, eller JPEG/PNG når WebP mangler. Det fjerner EXIF og GPS, og bildet snus riktig først. Originalen ligger privat i `api/cms/data/medier/`, versjonene i `medier/ÅÅÅÅ/` på nettstedet, der `.htaccess` bare slipper ut bildefiler og ikke kjører PHP. `api/cms/.user.ini` ber om store nok opplastingsgrenser.
- **Bilder slettes aldri**, de arkiveres. Sider og revisjoner som bruker et arkivert bilde, viser det fortsatt.
- **På siden:** «Rediger innhold» gir en «Bytt bilde»-knapp på hvert bildefelt. Dialogen har bibliotek med søk, opplasting, fokuspunkt for stor skjerm og eget for mobil, alt-tekst, «Bildet er bare pynt» og «Bruk bildet siden ble laget med». Byttet blir et utkast som publiseres og har historikk som tekstene.
- **I /cms/:** fanen «Bilder» (opplasting, navn, alt-tekst, rettigheter, konseptbilde, arkiver) og, for administratorer, «Drift».

## Slik slås CMS-et på

Dette gjøres på one.com av Sivert eller utvikleren som har tilgang. Ingenting her er gjort ennå.

1. Last opp et nytt bygg fra `main` som vanlig (`npm run build:onecom`, se [lansering-onecom.md](../lansering-onecom.md)).
2. one.com kontrollpanel → Databaser: lag en ny MySQL-database (eller bruk en ledig), og noter vert, databasenavn, bruker og passord.
3. Kopier `api/cms/konfig.eksempel.php` fra repoet til `api/cms/konfig.php` på webhotellet, og fyll inn databasen og en lang tilfeldig `oppsettkode` (minst 16 tegn). Filen skal aldri inn i GitHub.
4. Åpne `https://designporten.no/cms/`, skriv oppsettkoden og opprett deg som administrator.
5. Endre en tekst, publiser, og se at den vises på siden i et privat vindu.

Ikke del passord eller oppsettkode i chat.

## Drift, sikkerhetskopi og tilbakerulling

- **Ny design-utrulling** laster opp `dist/` på nytt. Databasen og `api/cms/data/` er ikke med i pakken og blir stående (CMS-03). `konfig.php` er heller ikke med. Pakk derfor ut med «overskriv», og slett aldri mappen `api/cms/data/` eller `konfig.php`.
- **Sikkerhetskopi:** `/cms/` → Sikkerhetskopi laster ned alt (tekster, historikk, forslag, logg, brukere) som én JSON-fil. Gjenoppretting erstatter tekster, historikk, forslag og logg i én transaksjon og skriver den publiserte filen på nytt; brukerne beholdes. Databasen er også med i one.com sin egen backup.
- **Tilbakerulling av CMS-et:** slett `api/cms/data/publisert.json`. Da sender Apache sidene rett ut som bygget igjen, med tekstene fra GitHub. Databasen står urørt og kan slås på igjen ved å publisere.
- **Tilbakerulling av en tekst:** Historikk → «Bruk denne» (også «Standardtekst fra koden»), så Publiser.
- **Skjemaendringer** gjøres som nye nummererte steg i `cms_migreringer()`. Et steg som ikke kan kjøres, stopper API-et med en feil før noe skrives, og sidene vises fortsatt fra den publiserte filen.
- **Staging:** testbygget (`npm run build:onecom:test`, `/designporten-test/`) har sin egen `api/cms/` og trenger sin egen database og `konfig.php`. Det skal aldri peke på produksjonsdatabasen.

## /admin og GitHub-redigeringen

`/admin` (Sveltia) og «Rediger tekst» via GitHub virker som før, også for sidetekstene. Med CMS-et slått på endrer de bare standardteksten i koden, som vises der CMS-et ikke har publisert noe. På one.com-bygget starter «Rediger innhold» mot CMS-et når du er logget inn i `/cms/`, ellers GitHub-redigeringen som før. Produktene redigeres fortsatt i `/admin` til fase 3. Når CMS-et er i bruk, bør sidetekstene redigeres bare der.

## Akseptansetester

| ID | Status | Hvor |
|---|---|---|
| CMS-01 utkast synlig bare for redaktør | Bestått | `scripts/cms.test.mjs`, `tests/onecom/cms.spec.ts` |
| CMS-02 publisering uten commit eller utrulling | Bestått | Begge |
| CMS-03 ny utrulling beholder innhold | Bestått i prinsippet: innholdet ligger utenfor `dist/`. Ikke prøvd med en ekte opplasting. | Denne siden |
| CMS-04 gjenopprette tidligere versjon med historikk | Bestått | Begge |
| CMS-05 to redaktører på samme felt | Bestått: konflikt, ingen overskriving | `scripts/cms.test.mjs` |
| MED-01 opplasting, mobilutsnitt, responsive versjoner og alt-tekst | Bestått for toppbildene | Begge |
| MED-02 PHP med bildeendelse, SVG, for mange piksler | Bestått | `scripts/cms.test.mjs` |
| MED-03 konvertering feiler | Delvis: halvferdige filer ryddes bort og publisert bilde endres ikke. Full disk er ikke prøvd. | |
| MED-04 bilde i bruk eller i en revisjon | Bestått: arkivering i stedet for sletting, siden og historikken virker | `scripts/cms.test.mjs` |
| MED-05 delt bildebruk | Ikke prøvd: hvert felt har sin egen verdi, så ett bytte endrer ikke andre felt | |
| MED-06 alle redaksjonelle bilder | Ikke bygget (neste pakke: bildematrise) | |
| MED-07 EXIF/GPS fjernet | Bestått | `scripts/cms.test.mjs` |
| PRD-01–03 | Ikke bygget | |
| AGT-01 forslag med aktør, kilde og før/etter | Bestått | `scripts/cms.test.mjs` |
| AGT-02 publisering uten rettighet avvist og logget | Bestått | `scripts/cms.test.mjs` |
| AGT-03 samme jobb to ganger gir ikke duplikat | Bestått | `scripts/cms.test.mjs` |
| SEC-01 admin-API uten innlogging | Bestått, også POST uten CSRF-token | `scripts/cms.test.mjs` |
| OPS-01 restore fra sikkerhetskopi | Bestått for CMS-filen. one.com sin database-restore er ikke prøvd. | `scripts/cms.test.mjs` |
| OPS-02 inkompatibelt skjema stopper | Delvis: nummererte migreringer, men ingen egen sjekk i CI | |

Kjør selv: `npm run test:deploy` (API-et mot PHP og SQLite, hoppes over uten PHP med pdo_sqlite) og `npm run build:onecom:test && npm run test:e2e:onecom` (nettleser mot PHP).

API-testene kan også kjøres mot ekte MySQL/MariaDB. De lager og sletter en egen database `cmstest_<pid>`, så brukeren må kunne lage databaser:

```sh
DP_CMS_MYSQL='mysql:host=127.0.0.1;port=3306' DP_CMS_BRUKER=cms DP_CMS_PASSORD=… npm run test:deploy
```

Alle API-testene er kjørt mot MariaDB 10.11 lokalt (15.10).

**Ikke prøvd:** one.com sin MySQL-versjon, Apache-regelen i `.htaccess` (lokal test etterligner den i `tests/php/router.php`), og en ekte opplasting til one.com.

## Åpne beslutninger

1. Hvilke agenter skal få nøkler, og skal noen få publisere uten godkjenning?
2. Skal SEO-tittel og -beskrivelse inn i CMS-et nå, eller sammen med produktene?
3. Fase 3: skal produktene flyttes fra GitHub til databasen nå? Det betyr at produktsidene også må lages av PHP, fordi nye produkter ellers trenger et nytt bygg.
4. Fase 4: hvilke formater og maler skal bildekomponisten ha først?
6. Hvilke rettighetstekster skal bildene ha (fotograf, lisens)? Feltet finnes, men er fritt.
5. Skal `/admin` (Sveltia) fases ut for sidetekster når CMS-et er slått på?
