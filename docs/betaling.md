# Slik kobler du Stripe til Designporten

Veiledning for Sivert. Kortbetaling går gjennom **Stripe Checkout**, en betalingsside som Stripe selv viser. Kortnummer kommer aldri innom serveren vår (CLAUDE.md regel 5).

> **Viktig:** Nøkler fra Stripe limes aldri inn i en chat, en e-post, GitHub eller CMS-et. De skrives bare i én fil på serveren (`api/stripe/konfig.php`) eller i Render → Environment.

## Hva som finnes i koden

| Del | Status |
|---|---|
| Handlekurv med «Gå til betaling» | Ferdig. Knappen vises bare når betaling er slått på, nøklene finnes, minst ett fraktvalg finnes og alle varene i kurven er «Klar for salg» med pris. Ellers sendes kurven som forespørsel, som i dag. |
| Prisen | Regnes alltid ut på serveren fra produktkatalogen. Nettleseren kan ikke endre prisen. |
| Stripe Checkout på Render (Node) | Ferdig siden oktober. |
| Stripe Checkout på one.com (PHP) | **Ny:** `api/kasse/`, `api/kasse/okt/` og `api/stripe/webhook/`. |
| Kvittering til kunden | Stripe sender den (slås på i Stripe, se steg 5). |
| Ordre til deg | Webhooken sender deg en e-post med varer, adresse, frakt og sum når betalingen er bekreftet. Hver betaling sendes én gang. Står det «TESTMODUS» i e-posten, er det ingen ekte penger. |
| Live-nøkler | Blir avvist til du selv skriver `'tillat_live' => true` i konfig-filen. På testbygg avvises de alltid. |

**Ikke bygget ennå:** ordrer og lager i CMS-databasen (i dag ligger ordren i Stripe og i e-posten din), Vipps, rabattkoder, refusjon fra Studio (gjøres i Stripe-dashbordet).

## Det du må bestemme selv

Dette fyller ikke Claude inn for deg: hvilke produkter som selges og til hvilken pris, fraktvalg og fraktpriser, salgsvilkår, angrerett og retur, og MVA-oppsettet (sjekk med regnskapsfører). Prisene på nettsiden er **inkludert MVA**, og Stripe trekker beløpet slik det står.

## Steg for steg

### 1. Bruk testmodus først

Logg inn på [dashboard.stripe.com](https://dashboard.stripe.com). Slå på **Test mode** (bryteren øverst, kan hete «Sandbox»). Alt du gjør i steg 2 til 5 skjer i testmodus. Ingen ekte penger flyttes.

### 2. Hent den hemmelige testnøkkelen

**Developers → API keys.** Kopier **Secret key**, som begynner med `sk_test_`. Lim den rett inn i konfig-filen i steg 4, ikke noe annet sted.

Tryggere valg: lag en **Restricted key** (`rk_test_…`) med skrivetilgang til *Checkout Sessions* og ellers ingenting.

### 3. Legg til webhooken

**Developers → Webhooks → Add endpoint**:

- Adresse: `https://designporten.no/api/stripe/webhook/` (eller adressen til testsiden din).
- Hendelser: `checkout.session.completed` og `checkout.session.async_payment_succeeded`.

Åpne endepunktet etterpå og kopier **Signing secret** (`whsec_…`).

### 4. Lag konfig-filen på one.com

1. Ta kopien av `api/stripe/konfig.eksempel.php` fra repoet, eller lag en fil med dette innholdet:

   ```php
   <?php
   return [
       'hemmelig_nokkel' => 'sk_test_…',     // fra steg 2
       'webhook_hemmelighet' => 'whsec_…',   // fra steg 3
       'nettsted_url' => 'https://designporten.no',
       'tillat_live' => false,
   ];
   ```

2. Kall den `konfig.php` og last den opp med one.com File Manager til mappen `api/stripe/` på nettstedet. Den samme mappen har allerede en `.htaccess` som gjør at filen aldri kan lastes ned.
3. Publiseringen («Publiser Designporten») sender aldri `konfig.php`, så filen overlever oppdateringer.

På **Render** legger du i stedet nøklene inn under *Environment* som `STRIPE_SECRET_KEY` og `STRIPE_WEBHOOK_SECRET`.

### 5. Kvitteringer og betalingsmåter i Stripe

- **Settings → Customer emails:** slå på *Successful payments*, så kunden får kvittering.
- **Settings → Payment methods:** her bestemmer du hva Checkout tilbyr. Koden låser ikke betalingsmåtene, så det du slår på her, vises. Kort er på fra start. Apple Pay og Google Pay kan slås på her.
- **Settings → Business → Public details:** firmanavn, kundeservice-e-post og vilkår-lenke vises på betalingssiden.

### 6. Slå på butikken

I `/admin` → **Butikk**:

1. Slå på **Kortbetaling**.
2. Legg inn minst ett **fraktvalg** med navn og pris (inkl. MVA). Uten frakt forblir betaling av.
3. Sett minst ett produkt til **«Klar for salg»** med en pris.

Disse endringene lagres i GitHub, så siden må publiseres på nytt («Publiser Designporten») før one.com får dem. Uten `konfig.php` på serveren står betaling fortsatt av, og handlekurven sender forespørsler som før.

### 7. Prøv et kjøp

Legg varen i handlekurven, trykk **Gå til betaling** og betal med testkortet `4242 4242 4242 4242`, en dato fram i tid og en hvilken som helst CVC. Etterpå skal du se:

1. Takkesiden sier «Betalt», og handlekurven er tom.
2. Betalingen står under **Payments** i Stripe (testmodus).
3. Du får e-posten «Betalt ordre DP-…» merket TESTMODUS.

Kort som avvises: `4000 0000 0000 0002`. Kort som krever ekstra bekreftelse (3D Secure): `4000 0025 0000 3155`.

**Pass på:** Med testnøkkel på designporten.no kan en ekte kunde «betale» med testkort uten at det kommer penger inn. Test derfor helst på testsiden eller Render, eller test raskt og ta testnøkkelen bort igjen.

### 8. Gå live (når vilkår, priser og frakt er klare)

1. Fullfør aktiveringen av kontoen i Stripe (firma, bankkonto, ID).
2. Slå av Test mode. Hent den **live** hemmelige nøkkelen (`sk_live_…`) og lag en ny webhook med den samme adressen i live-modus. Det gir en ny `whsec_…`.
3. Bytt nøklene i `konfig.php` og sett `'tillat_live' => true`.
4. Gjør ett ekte kjøp med lite beløp og refunder det i Stripe.

## Vipps

Stripe har Vipps, men bare som **privat forhåndsvisning** (private preview). Du må be Stripe om tilgang, og API-et krever en egen forhåndsversjon. Det er derfor ikke bygget inn. Alternativene er å søke om Vipps hos Stripe og la oss legge det til når du har tilgang, eller å bruke Vipps ePayment direkte via Vipps MobilePay-avtalen din (planen i CMS-dokumentene, 04_BETALING). Begge deler krever en avtale som du må ordne selv.

Kilde: [Stripe: Vipps](https://docs.stripe.com/payments/vipps).

## Hvis noe ikke virker

| Det du ser | Sannsynlig grunn |
|---|---|
| Handlekurven sier «Betalingsløsningen er ikke koblet til ennå» | `api/stripe/konfig.php` mangler, nøkkelen har feil form, eller det er en live-nøkkel uten `tillat_live`. |
| «Frakt er ikke satt opp ennå» | Ingen fraktvalg i `/admin` → Butikk, eller siden er ikke publisert etterpå. |
| Betalt, men ingen e-post | Webhooken svarer ikke 200. Se Developers → Webhooks → endepunktet → *Event deliveries*. 400 betyr feil `whsec_`, 503 betyr at konfig-filen mangler, 500 betyr at e-posten feilet (Stripe prøver igjen). |
| Takkesiden sier «Vi fant ikke betalingen» | Stripe har ikke bekreftet ennå, eller nøkkelen på serveren er fra en annen modus (test/live) enn betalingen. |

## Teknisk

Filene er `php/api/stripe/_stripe.php` (felles), `php/api/kasse/index.php`, `php/api/kasse/okt/index.php` og `php/api/stripe/webhook/index.php`. Butikkinnstillingene følger med i `api/katalog.json`. Hvilke webhooker som allerede er levert, lagres i `api/stripe/data/` (aldri tilgjengelig fra nettet, aldri sendt ved publisering). Testene er i `tests/onecom/kasse.spec.ts` og bruker en falsk Stripe i `tests/php/router.php`, så de når aldri det ekte API-et.
