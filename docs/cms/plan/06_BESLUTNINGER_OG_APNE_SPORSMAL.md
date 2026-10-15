# 6. Avklart / må undersøkes

## Avklart i samtalen
- Designporten.no skal ha **eget CMS**, ikke WordPress.
- **Nettstedets CMS/database er sannhetskilden** for produkter, tekster og bilder.
- **Claude Code og GitHub** håndterer kode, design og deploy.
- Eieren ønsker å kunne **redigere innhold direkte på nettstedet**.
- Designredigering skal **ikke** være en sentral funksjon i CMS-et.
- CMS-et skal støtte produktadministrasjon, bilder og automatiserte AI-agentoppdateringer.
- Det skal være mulig å **komponere bilder** og bruke resultatet i produktinnlegg.
- En **skisse** og en **plan til Claude** er ønsket.

## Anbefalinger som krever bekreftelse ved utvikling
- Agentendringer publiseres normalt ikke automatisk; de havner i godkjenningskø.
- Første bildekomponist bygges malbasert; AI-generering kommer eventuelt senere.
- Kommentarer/moderering tas bare med dersom behovet er reelt.
- Admin får redigere innhold og seksjoners synlighet/rekkefølge, men ikke fri layout.

## Åpne tekniske spørsmål Claude må kartlegge
1. Hvilket repo, branch og rammeverk er dagens produksjonsnettsted bygget med?
2. Hvilken hosting, database, medielagring og autentisering finnes allerede?
3. Hvor ligger eksisterende produktdata, priser, ordre, bilder og SEO-innhold?
4. Finnes det lagerstyring/Stripe-betaling som CMS-et må integreres med?
5. Hvilke side- og seksjonstyper skal kunne redigeres fra dag én?
6. Hvilke bildeformater og komposisjonsmaler skal støttes først?
7. Hvilke agenter skal ha API-tilgang, og hva får de lov til å publisere?
8. Hvordan skal backup, rettigheter, staging og utrulling organiseres på eksisterende drift?

**Ikke gjett på disse punktene.** Undersøk repo og be om konkrete avklaringer der det er nødvendig.
