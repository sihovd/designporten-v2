# Designporten – plan for eget CMS
**Versjon:** 1.0 – 15. oktober 2026  
**Mottaker:** Claude Code / utvikler  
**Status:** Arkitektur- og implementeringsforslag, ikke dokumentasjon av ferdig kode.

## Formålet
Bygg et eget CMS integrert i Designporten.no. Nettstedets database og medielager skal være sannhetskilden for innhold. Ingen WordPress. Claude Code utvikler design og funksjonalitet, med GitHub som kilde for kode og versjonshistorikk. Innholdet skal ikke lagres i GitHub og skal ikke bli overskrevet ved utrulling av nytt design.

## Vedlagt
1. `01_FUNKSJONELL_PLAN.md` – hvordan CMS-et skal fungere for eieren og AI-agenter.
2. `02_ARKITEKTUR_OG_DATA.md` – komponenter, datamodell, API og tilgangskontroll.
3. `03_BILDE_OG_PRODUKTFLYT.md` – bildeopplasting, komposisjon og produktpublisering.
4. `04_UTVIKLINGSPLAN_TIL_CLAUDE.md` – rekkefølge, oppgaver, leveranser og migrering.
5. `05_AKSEPTANSETESTER.md` – testbare krav.
6. `06_BESLUTNINGER_OG_APNE_SPORSMAL.md` – hva som er avklart og hva Claude må kartlegge.
7. `07_ARKITEKTURSKISSE.svg` og `.png` – visuell oversikt.

## Før implementering
Claude må undersøke faktisk repo, dagens deploy, autentisering, database, lagring og produktmodell. Behold eksisterende innhold, funksjoner, URL-er og design med mindre annet er spesifikt avtalt. Ikke velg database, rammeverk eller bildemotor før eksisterende arkitektur er kartlagt.

## Viktigste regel
**Kode og design:** Claude Code → GitHub → test/utrulling → nettsted.  
**Innhold og produkter:** Eier/AI-agent → CMS API/database/medielager → nettsted.  
Disse to strømmene skal være adskilt.
