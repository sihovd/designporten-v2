# 4. Konkret utviklingsoppdrag til Claude Code

## Arbeidsinstruks
Undersøk eksisterende Designporten-kodebase og drift **før** implementering. Dokumenter faktisk stack, eksisterende produktsider, datakilder, mediaflyt, innlogging, GitHub-workflow, hosting, deployment, og alle nåværende innholdsnøkler. Ikke bytt rammeverk, database eller hosting uten å dokumentere begrunnelse og innhente godkjenning. Bevar funksjoner og design. Utarbeid først en endringsplan med risiko, datamigrering og rollback.

## Fase 0 – Kartlegging og spesifikasjon
- Kartlegg repo og dagens deploy/hosting, data og filer.
- Lag matrise: eksisterende felt → nytt CMS-felt; ingen felter skal forsvinne.
- Avklar rettigheter, datalagring, eksisterende produkt-/ordre-/lagerflyt.
- Avklar hvilke deler av nettstedet som skal være redigerbare.
**Leveranse:** arkitekturdiagram basert på faktisk kode, migrasjonsplan, testplan, åpne beslutninger.

## Fase 1 – CMS-kjerne
- Bygg/tilpass backend, database og medielager.
- Legg inn roller, autentisering, innholdsmodeller, revisjoner, audit log og publiseringsstatus.
- Lag sikre API-er og backup/restore-prosedyre.
**Ferdig når:** innhold kan opprettes, endres, forhåndsvises, publiseres og gjenopprettes uten GitHub-commit.

## Fase 2 – Admin og inline-redigering
- Diskret «Rediger innhold»-modus på nettstedet.
- Tekstredigering, bildebytte, redigering av eksisterende seksjoners innhold.
- Vis tydelig utkast/publisert og lagre/publiser separat.
**Ferdig når:** admin kan oppdatere forside uten å røre design eller kode.

## Fase 3 – Produkter og media
- Produkter, varianter, kategorier, pris, publiseringsstatus, søk/filtrering.
- Mediebibliotek, opplasting, responsive bilder, metadata og referansesjekk.
- Migrer eksisterende produkter og bilder med kontroll av URL-er.
**Ferdig når:** produkt kan opprettes og publiseres med bilder direkte fra CMS.

## Fase 4 – Bildekomposisjon
- Start med malbasert, ikke-destruktiv komposisjon.
- Lagre oppskrift, kilde-ID-er, output og status; vis original vs. resultat.
- Koble output til produkt og sørg for at rendring ikke blokkerer nettstedet.
**Ferdig når:** admin kan sette sammen et produktbilde og publisere det uten GitHub.

## Fase 5 – Agent-API og automasjon
- API-tilgang med separate roller/scopes og begrensninger.
- Opprett forslag/utkast, jobbstatus, godkjenningskø og audit log.
- Webhooks/jobber med idempotens og retries.
**Ferdig når:** en testagent kan foreslå produkt og bilde, men ikke publisere uten nødvendig tillatelse.

## Fase 6 – Hardening og lansering
- Integrasjons-, sikkerhets- og migrasjonstester.
- Backup/restore-test, stagingtest, lasttest for mediejobber.
- Gradvis aktivering, overvåkning og dokumentert rollback.
**Ferdig når:** design-deploy ikke endrer publisert innhold og CMS-endringer ikke krever deploy.

## Arbeidsform og leveranser
Hver fase skal levere kode, tester, dokumentasjon, skjermbilder/visuell verifikasjon og en kort endringsrapport. Ikke marker arbeid ferdig kun fordi en PR er opprettet. Test faktisk brukerflyt i nettleser. Be om godkjenning før irreversible migrasjoner, sletting, produksjonsdeploy eller vesentlig arkitekturendring.
