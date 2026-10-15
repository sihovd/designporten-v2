# 1. Funksjonell plan for Designporten CMS

## 1.1 Målbilde
Designporten.no skal ha et eget, innebygd CMS. Innlogget administrator kan åpne nettstedet slik kundene ser det og redigere **innhold** direkte, uten å måtte endre kode. **Design, layout, komponenter og teknisk utvikling** gjøres via Claude Code og GitHub, ikke via et visuelt designverktøy i CMS-et.

CMS-et skal håndtere:
- Produkter og produktvarianter, inkludert beskrivelse, pris, bilder, kategorier, status og tilgjengelighet.
- Tekster på sider, knapper, hero-seksjoner, metadata og strukturerte innholdsblokker.
- Eksisterende seksjoner: rekkefølge, synlighet og hvilket innhold de viser, innenfor maler utviklet i kode.
- Bilder og andre mediefiler med opplasting, bibliotek, metadata og tilknytning til produkter og sider.
- Produktbilder som kan komponeres fra flere kilder, og godkjennes før de publiseres.
- Kommentarer/henvendelser/anmeldelser **hvis disse finnes eller blir besluttet innført**; moderering og personvern må vurderes.
- Utkast, forhåndsvisning, publisering, tidsstyring, revisjonshistorikk og gjenoppretting.
- Kontrollerte AI-agentoppdateringer gjennom et API.

## 1.2 Redigering direkte på nettstedet
1. Administrator logger inn og aktiverer «Rediger innhold».
2. Redigerbare områder får diskrete markører. Klikk på tekst for å endre tekst; klikk på bilde for å bytte eller åpne mediebiblioteket; klikk på produkt for å åpne produktredigering.
3. Endringer lagres som **utkast** som standard, med forhåndsvisning på samme side.
4. «Publiser» gjør den godkjente innholdsversjonen synlig på nettstedet uten ny GitHub-commit eller deploy.
5. «Angre» og revisjonsoversikt gjør det mulig å gjenopprette tidligere publisert innhold.
6. Redigeringsmodus skal ikke tillate fri CSS, flytting av vilkårlige elementer eller endring av komponentkode.

## 1.3 Produktadministrasjon
Produktoversikt med søk, filtrering, kategorier og status (utkast, til vurdering, publisert, arkivert). Produktredigering omfatter navn, slug, kort/lang beskrivelse, pris, valuta, bilder, varianter, tilpasningsvalg, lager-/produksjonsstatus, SEO-felt og synlighet. Endring av publiserte produkter må ikke utilsiktet ødelegge aktive ordre eller historiske ordrelinjer. Priser og tilgjengelighet kan oppdateres automatisk via eksplisitt godkjente kilder.

## 1.4 Automatiske oppdateringer
Agentene kan foreslå eller opprette produktutkast, forbedre tekster, generere forslag til bildekombinasjoner, kategorisere bilder og oppdatere metadata. Automatiske endringer må følge en tydelig policy:
- Lav risiko: forslag, tagging og utkast kan lagres automatisk.
- Høyere risiko: publisering, prisendringer, sletting og endringer i synlige produktsider krever som standard godkjenning.
- Alle agenthandlinger loggføres med aktør, kilde, tidspunkt, før-/etter-verdi og resultat.
- Agenten skal ikke ha direkte skrivetilgang til produksjonsdatabasen eller til GitHub-deploynøkler.

## 1.5 Mediebibliotek
Bilder lastes opp én gang og får stabile ID-er og URL-er. Biblioteket støtter mapper/samlinger eller tagger, søk, filtype, dimensjoner, alternativ tekst, kreditering/rettigheter og bruksliste (hvilke produkter/sider som benytter bildet). Originalfilen beholdes; avledede størrelser og formater kan regenereres. En fil i bruk skal ikke kunne slettes uten tydelig advarsel og håndtering av referanser.

## 1.6 Publisering og drift
Utkast → forhåndsvisning → godkjenning → publisering. CMS må fungere når nytt design deployes. Et nytt design skal lese eksisterende innhold via stabile nøkler/API. Innhold skal kunne sikkerhetskopieres og gjenopprettes uavhengig av GitHub.

## 1.7 Hva CMS-et **ikke** skal være
Ikke WordPress. Ikke et fullverdig sidebygger-/designverktøy. Ikke en erstatning for GitHub. Ikke et sted der produkter og bilder lagres som filer i repo for vanlig drift.
