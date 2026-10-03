# Designporten / Skaperverkstedet
## Prosjektbeskrivelse og handoff til Claude

Versjon: 1.0 · Dato: 3. oktober 2026 · Språk: norsk

**Formål:** Denne filen er selvstendig kontekst og arbeidsinstruks for å planlegge og bygge en felles, barnevennlig 3D-byggemotor for Designporten. Les hele dokumentet før implementering. Start med den avgrensede første leveransen i kapittel 19; ikke bygg alle fremtidsfunksjonene samtidig.

**Status:** Produktkonsept og foreslått teknisk spesifikasjon. Ingen kode, mekanisk passform, fysisk sikkerhet eller printbarhet er verifisert gjennom dette dokumentet.

### Kildegrunnlag og beslutningsstatus

Dokumentet bygger på brukerens samlede bestilling og det tilgjengelige utdraget av samtalen «Blødende hjerte samtale», ID `6abf8783-9ecc-83eb-90ae-5d710e8b7d27`. Det hentede utdraget inneholder de siste diskusjonene om ThingMaker, Womp og Enkel/Avansert. Eldre mekaniske detaljer var ikke tilgjengelige. Dokumentet er derfor en konsolidert spesifikasjon, ikke et fullstendig samtalereferat.

Bruk disse statusene gjennom prosjektet:

| Status | Betydning |
|---|---|
| KRAV | Uttrykt produktretning eller funksjon som skal realiseres i angitt fase. |
| FORSLAG | Anbefalt løsning i denne handoffen; kan endres med begrunnelse. |
| UAVKLART | Krever valg, måling eller prototype før det blir et implementerbart mekanisk krav. |
| VERIFISERT | Skal bare brukes når det finnes konkrete testresultater og angitt konfigurasjon. |

Alle tall for mekanisk klaring, switchpassform, veggtykkelse, masse, ledd og printeroppsett skal komme fra dokumenterte profiler og tester. Ikke fyll manglende mål med antatte «standardmål» og presenter dem som godkjent.

---

## 1. Visjon og produktmål

**Fra idé til fysisk objekt.** Skaperverkstedet skal gjøre det mulig å bygge personlige, funksjonelle 3D-printbare produkter gjennom en forståelig kreativ editor. Brukeren former uttrykket; motoren beskytter mekanikken.

Designporten skal oppleves som et kreativt makerverksted med to tydelige innganger:

1. **Kjøp ferdig** – finn og kjøp eksisterende produkter.
2. **Lag noe eget** – start fra en mal, sett sammen deler og form et personlig produkt.

Skaperverkstedet er motoren bak den andre inngangen. DesignLab kan være navnet på nettstedets inngang til egne prosjekter; unngå flere konkurrerende navn på selve editoren før navnevalget er bestemt.

Det langsiktige målet er én kjernemotor som kan drive klikkere, figurer, artikulerte drager og dyr, modulære bokstaver, koblingssystemer, stablede produkter og senere andre generatorer. Generatorene skal tilby ulike maler og regelsett, uten å bli isolerte redigeringsprogrammer.

### Målgrupper

| Bruker | Behov | Konsekvens |
|---|---|---|
| Barn sammen med foresatt eller veileder | Utforske og lykkes uten CAD-kunnskap | Store visuelle valg, få samtidige verktøy, trygg angre-funksjon. |
| Nybegynnere og gavekjøpere | Lage noe personlig raskt | Gode startmaler, tydelig forhåndsvisning og forståelig validering. |
| Kreative hobbybrukere | Mer frihet og egne modeller | Avansert modus, presise transformasjoner og import. |
| Designportens produksjonsansvarlige | Reproduserbare og kontrollerbare filer | Versjonerte profiler, eksportkontroll, testhistorikk og sporbarhet. |

Nøyaktig aldersgruppe og eventuell bruk uten voksen må avklares. «Barnevennlig» beskriver i første omgang brukergrensesnittet, ikke en sertifisering av de fysiske produktene som leketøy.

### Suksesskriterier

- En førstegangsbruker kan velge en klikker, endre uttrykket, prøve klikkbevegelsen og lagre prosjektet uten CAD-begreper.
- Enkel og Avansert viser samme prosjekt uten tap av data eller geometri ved modusbytte.
- Frie former, klær og importerte modeller kan ikke overskrive låste mekaniske grensesnitt.
- Valideringen forklarer konkrete problemer og peker på delen som må endres.
- Eksporten er reproduserbar og knyttet til samme prosjektrevisjon som kontrollrapporten.
- Flere generatorer kan bruke felles scene, kommandoer, validering og eksport uten duplisert grunnlogikk.

---

## 2. Inspirasjon og originalitet

### Womp som konseptuell inspirasjon

Inspirasjonen er en lav terskel for organisk forming: enkle grunnformer kan flyttes, skaleres og smelte sammen. I dette prosjektet beskrives dette som **SDF-basert forming og kontrollert glatt union**. «Goop» brukes bare for å forklare referansen, ikke som produktnavn eller et løfte om samme implementasjon.

### ThingMaker som konseptuell inspirasjon

Inspirasjonen er et visuelt delebibliotek, tydelige startfigurer, drag-and-drop og forståelige kompatible festepunkter. Virtuell magnetisme betyr at kompatible deler trekkes mot riktig plassering i editoren. Det betyr ikke fysiske magneter i produktet.

### Det som faktisk skal bygges

- Egen visuell identitet og egne komponenter.
- En enkel delbasert arbeidsflyt og en mer detaljert modelleringsmodus.
- Egne SDF-operasjoner eller dokumentert lisensierte biblioteker.
- Egne mekaniske grensesnitt, kalibrert for valgte produksjonsprofiler.
- Egne eller lovlig lisensierte modeller, ikoner, fonter og maler.

**Ikke kopier** skjermbilder, layout, proprietære modeller, kildekode, varemerker, særegne interaksjonsuttrykk eller udokumentert mekanikk fra referanseproduktene. Referansene er ikke en teknisk spesifikasjon eller bevis på at en mekanisme fungerer.

Referansebilder fra den opprinnelige chatten følger ikke med filen. Ikke finn på visuelle detaljer som om bildene var tilgjengelige. Dette dokumentet er tilstrekkelig for å starte arkitektur og prototyper uten dem.

---

## 3. Produktfamilier og felles byggeprinsipp

### 3.1 Klikkere med mekanisk tastaturswitch – første produktfamilie

En klikker består av en underdel med switchholder, en konkret mekanisk tastaturswitch og en bevegelig topp koblet til switchens bevegelige del. Dekor, figurkropp, klær og accessories kan tilhøre topp eller underdel; tilhørigheten må alltid være eksplisitt.

- **Underdel:** stabilitet, switchfeste og eventuelle godkjente produktkoblinger.
- **Topp:** aktiverer switchen og bærer et lett visuelt uttrykk.
- **Overkropp:** bør være lett og ha begrenset utkraging slik at den ikke hindrer retur eller gir uakseptabel sidebelastning.
- **Klær og accessories:** skal ha definerte festesteder, materialtilhørighet og kollisjonsregler.
- **Switch:** velges fra en dokumentert profil. Ulike switcher må ikke antas å ha lik geometri, vandring, kraft eller innfesting.

En fysisk switch er en separat innkjøpt komponent; motoren skal ikke generere den som en printet erstatning. En visuell referansemodell av switchen skal være markert som referanse og utelatt fra printfilene.

### 3.2 Artikulerte drager og dyr

Figurer bygges av segmenter med standardiserte, beskyttede ledd. Målet er fangede, permanente forbindelser som kan bevege seg, men ikke er laget for demontering under normal bruk.

Dette er forskjellig fra et fritt demonterbart ball-and-socket-system. Det skal utvikles en egen leddfamilie med tydelig bevegelsesområde, fangstgeometri, klaring og printorientering.

«Print-in-place-lignende» beskriver ønsket sluttfunksjon. Først må en fysisk prototype avgjøre om leddet faktisk printes samlet, eller om det monteres permanent etter utskrift. Disse produksjonsmåtene skal ha ulike profiler og ikke omtales som samme løsning.

### 3.3 Modulære bokstaver og koblinger

Bokstaver og symboler kan settes sammen gjennom standardiserte koblingspunkter. Glyphens dekorative form og koblingens mekanikk skal være separate. En smal bokstav må ikke automatisk få en kobling som ikke har plass; vis feil eller bruk en godkjent bærer/base.

Det må bestemmes per koblingsfamilie om forbindelsen er stiv, bevegelig, demonterbar eller permanent. Tekstretning, rekkefølge og lesbarhet skal ikke følge mekanisk speiling ukritisk.

### 3.4 Stablede klikkere

Produktfamilien skal støtte en fremtidig stablingsmekanisme med egne grensesnitt. Det må avklares om hver etasje klikker uavhengig, eller om en tilsiktet kraftoverføring aktiverer flere switcher. Dette er ulike konstruksjoner.

Kontrollene skal omfatte total høyde, stabilitet, tyngdepunkt, kraftvei, mulig utilsiktet aktivering, tilgang til montering og samlet bevegelsesvolum. Visuell stabling alene er ikke funksjonell stabling.

---

## 4. UX og arbeidsflyt

### Felles arbeidsflate

Editoren skal ha en stor 3D-arbeidsflate, et visuelt bibliotek og et kontekstavhengig egenskapspanel. Den skal føles som et kreativt verksted, ikke bare en rekke skjemaer. Startflyten kan være veiledet, mens selve redigeringen er direkte.

Faste handlinger: Angre, Gjør om, Lagre, Se hele modellen, Enkel/Avansert og Kontroller modell. Eksport og bestilling skal bare vises som reelle handlinger når de faktisk er implementert.

### Enkel modus

- Velg en godkjent startmal.
- Velg kropp, topp, hode, ben, vinger, klær eller annen tilgjengelig del visuelt.
- Dra en del til modellen, eller velg delen og trykk «Fest på …».
- Kompatible festepunkter fremheves, og en forhåndsvisning viser plassering før slipp.
- Tilpass farge, størrelse innen trygge grenser og noen få formparametere.
- Bruk forhåndsdefinerte symmetri- og bevegelsesvalg.
- Se grønn/gul/rød status med tekst og symbol.

Store valg og få kontroller skal redusere feil. Usikre handlinger forklares der de oppstår. Ingen tekniske SDF-parametere eller toleransefelt er nødvendig i denne modusen.

### Avansert modus

- Objekthierarki og grupper med navn og synlig tilhørighet.
- Presis flytting, rotasjon og skalering av redigerbar geometri.
- Grunnformer, harde boolske operasjoner og kontrollert smelting.
- Symmetri, delduplisering, komponentbytte og import i senere faser.
- Visning av beskyttede volumer, klaringer og bevegelsesvolum.
- Detaljert forklaring av valideringsresultater.

Avansert modus er **ikke** en bakdør rundt mekaniske regler. Profilutvikling er en separat intern arbeidsflyt, ikke en vanlig brukerinnstilling.

### Modusbytte

Begge moduser bruker samme prosjektdokument, historikk og geometri. Avanserte objekter som Enkel ikke kan redigere fullt ut, skal fortsatt vises og bevares. Vis «Flere innstillinger i Avansert» fremfor å konvertere eller slette data.

### Hovedflyt for MVP

1. Lag noe eget → Klikker → velg startmal.
2. Se en fungerende grunnmodell med topp, underdel og switchreferanse.
3. Legg til en form eller godkjent dekorativ del.
4. Flytt og form uttrykket; se låste områder ved behov.
5. Aktiver «Prøv klikk» og inspiser hele vandringen.
6. Kontroller modellen; velg en melding for å markere problemet.
7. Lagre prosjekt og last det inn igjen.
8. Generer og kontroller eksport av topp og underdel for valgt testprofil.

Hvis mekanikken ikke er fysisk godkjent, skal siste trinn være tydelig merket prototypeeksport. Det skal ikke tilbys som produksjonsgodkjent produkt.

### Drag-and-drop og festepunkter

Kompatibilitet må kontrolleres før snapping. Vis et spøkelsesobjekt, målpunkt og orientering. Slipp utfører én angrebar transaksjon. Ugyldig slipp lar delen bli værende eller gå tilbake, med en forklaring. Ikke velg et skjult festepunkt på baksiden uten tydelig forhåndsvisning.

Tastatur og berøring skal tilby samme resultat uten presis dragging: velg del → velg kompatibelt festepunkt → bekreft. Delbytte skal bevare kompatible tilkoblinger eller forklare hvilke som må fjernes.

### Tilgjengelighet og visuell retning

- Rolige bakgrunner og tydelig hierarki. Designportens lilla–blå gradient `#8A4DFF → #2FA4FF` brukes kontrollert til identitet og viktige handlinger.
- Originalt uttrykk med presisjon, kreativitet og fysisk makerpreg.
- Synlig tastaturfokus, forståelige etiketter og alternativer til canvas-only-handlinger.
- Objektliste og tekstlig validering skal kunne brukes uten å tolke farge eller 3D alene.
- Berøringsmål bør sikte mot minst 44 × 44 CSS-piksler. Kontroller kontrast i faktisk implementering, også på gradientknapper.
- Respekter redusert bevegelse. Ingen automatisk kameraflyging som er nødvendig for å forstå en feil.
- Desktop og nettbrett prioriteres for full redigering; mobil skal ha en tydelig, testet tilpasset flyt. Omfanget av full mobilmodellering avgjøres gjennom brukertest.

---

## 5. Mekaniske regler – ufravikelige prinsipper

### 5.1 Koordinater og eierskap

Bruk millimeter som fysisk enhet. Definer én verdensaksekonvensjon; forslag: Z opp og XY som printplan. Switchens lokale bevegelsesakse lagres i mekanikkprofilen og kan avvike fra verdens Z etter plassering.

Hver fysisk del har én entydig eier: topp, underdel eller annen navngitt kropp. Dekor skal ikke utilsiktet binde sammen bevegelige og faste deler.

### 5.2 Vertikale kollisjonsflater og 90-gradersprinsippet

Arbeidstolkningen er at relevante flater nær toppens og underdelens bevegelsesgrense skal stå vertikalt: parallelle med klikkets lokale bevegelsesakse, og dermed 90 grader mot det lokale referanseplanet vinkelrett på aksen. Dette må bekreftes mot en mekanisk skisse før profilen låses.

Prinsippet skal redusere risiko for at skrå dekorative flater kiler seg under bevegelse. Det betyr ikke at hele figuren skal ha vertikale vegger, og vertikale flater alene garanterer ikke fri bevegelse. Horisontale stoppflater og innføringsfas kan finnes der profilen uttrykkelig krever dem.

Det må skilles mellom:

- flater som aldri skal møtes,
- godkjente føringsflater med kalibrert klaring,
- tilsiktede kontakt-/stoppflater ved bestemte posisjoner.

### 5.3 Travel envelope – hele bevegelsesvolumet

La `M` være all geometri som beveger seg med toppen, inkludert klær og accessories. La `T(s)` være mekanismens transformasjon gjennom hele den tillatte vandringen `s ∈ [0, travel]`.

`E = union over s of T(s)(M)`

Bygg et konservativt klaringsvolum rundt `E` ut fra profilens toleranser. Statisk geometri må ikke overlappe dette volumet, bortsett fra eksplisitt definerte kontaktpar innen sine tillatte posisjoner.

Endepunktene alene er ikke tilstrekkelig. Bruk kontinuerlig kontroll, konservative sveip eller adaptiv sampling med dokumentert feilgrense. En enkel animasjon er bare visualisering, ikke kollisjonsbevis. Kontrollen skal inkludere godkjent sidebevegelse og relevante variasjoner i mekanikken.

### 5.4 Topp, masse og retur

En høy eller tung figur kan påvirke retur og stabilitet. Motoren skal beregne geometrisk volum og tyngdepunkt som hjelpemidler, men reell printmasse avhenger også av materiale og slicerinnstillinger.

En massegrense krever en valgt switch, orientering og fysisk test. Returkraft over hele vandringen, friksjon og sidebelastning må undersøkes; det er ikke tilstrekkelig å sammenligne oppgitt aktiveringskraft med vekten.

Huling og lette overkropper kan brukes, men må bevare veggtykkelse, forankring og understøttet mekanikk. Dekor skal ikke gi utilsiktet stopp før switchens tilsiktede bevegelse er fullført.

### 5.5 Låste grensesnitt

Hver mekanikkprofil definerer:

- eksakte innfestings- og kontaktflater,
- beskyttet positivt materiale som ikke kan fjernes,
- beskyttede hulrom og klaringer som ikke kan fylles,
- tillatte soner for dekor og sammenføyning,
- forbudte soner og bevegelsesvolumer,
- monteringsretning og nødvendig verktøy-/tilgangsrom,
- tillatte frihetsgrader, orienteringer og belastningsforutsetninger.

Låsingen håndheves i domenelogikken og geometri-/eksportpipeline, ikke bare ved å skjule håndtak i UI. Direkte endring av JSON, import eller skalering skal ikke kunne omgå den.

### 5.6 Toleranser og printbarhet

Profiler må skille nominelle designmål fra produksjonskompensasjon. En generell skaleringsfaktor skal ikke endre switchfeste, fangstledd og dekor samtidig.

Følgende er **UAVKLART** frem til profil og kalibreringsprøver finnes:

| Parameter | Må dokumenteres gjennom |
|---|---|
| Switchhus, stamme og innfesting | Identifisert switchvariant, måling og passformprøve. |
| Total vandring og tillatt sidebevegelse | Dokumentasjon og fysisk kontroll av valgt switch. |
| Klaringer mellom bevegelige printdeler | Kalibreringsserie på aktuell printer, materiale og orientering. |
| Minste vegg, tapp, bro og detalj | Geometritester og printprøver med aktuell prosess. |
| Leddklaring og fangstoverlapp | Bevegelse, belastning, slitasje og bruddprøver. |
| Maksimal toppmasse og utkraging | Returtest og sidebelastning i tiltenkt bruk. |
| Produksjonskompensasjon | Måleprotokoll og repeterte utskrifter. |

Ta hensyn til lagretning, første-lagsutvidelse, støttemateriale, tilgjengelighet for støttefjerning og variasjon mellom utskrifter. En lukket mesh er nødvendig i mange eksportløp, men beviser ikke at modellen kan printes eller fungerer.

---

## 6. Permanente artikulerte ledd

Ledd skal være en egen profiltype, ikke dekorative kuler som tilfeldig berører hverandre.

- Definer leddakse, maksimal rotasjon og eventuelle stopp.
- Bevar fangstgeometri gjennom hele bevegelsesområdet.
- Unngå at friform, klær eller speiling lukker klaringer eller svekker leddhalsen.
- Sørg for at deler ikke smeltes sammen gjennom SDF-union på tvers av leddet.
- Kontroller kollisjon mellom nabosegmenter og, der relevant, ikke-nabosegmenter.
- Ved print-in-place må hver bevegelig kropp beholdes som separat volum, med printbar klaring og gjennomførbar støttehåndtering.
- Ved permanent ettermontering må monteringssekvens og låsing dokumenteres separat.

«Skal ikke demonteres» betyr designet for permanent fangst under angitte bruksforhold. Det er ikke en garanti mot brudd eller voldsom belastning. Fysisk holdbarhet og eventuelle smådeler etter brudd må testes før produktet gis en bestemt alders- eller sikkerhetspåstand.

---

## 7. Geometri og SDF

### 7.1 Hybridmotor

**FORSLAG:** Kombiner fri SDF-geometri for uttrykk med presis, profilgenerert mekanikk. Én felles motor betyr felles prosjekt, operasjoner og regler; ikke at alle objekter må konverteres til samme geometrirepresentasjon.

SDF beskriver et felt `d(p)` med negativ verdi inne, null på overflaten og positiv verdi ute. Bruk grunnformer som kule, avrundet boks, sylinder og kapsel. Tilby union, differanse, snitt og kontrollert glatt union.

Smeltingsradius er en designparameter i millimeter, ikke en toleranse. Glatt union kan endre volum og lokal tykkelse. Skalering, særlig ulik skalering på aksene, kan gjøre et felt til en avstandsestimator snarere enn en eksakt SDF; meshing og validering må håndtere dette eksplisitt.

### 7.2 Beskyttet mekanikk

Prinsipiell oppbygging for hver fysisk kropp:

1. Evaluer brukerens dekorative felt/mesh i tillatt område.
2. Legg til profilens beskyttede solide geometri uten glatt overgang over presisjonsflater.
3. Trekk fra obligatoriske hulrom og klaringsvolumer.
4. Kontroller at dekor er forankret og at minimumstykkelse er oppfylt.
5. Kontroller bevegelse og grensesnitt på det ferdige resultatet.

Rekkefølgen alene garanterer ikke korrekt mekanikk. Kontroller sluttgeometri mot profilens referanseflater og toleranser. Profilens funksjonsflater skal ikke degraderes av en grov voxeloppløsning; bruk presis meshing/booleans eller lokalt fin nok oppløsning med dokumentert feilgrense.

### 7.3 Forhåndsvisning og eksport

- Rask forhåndsvisning kan ha lavere detaljgrad mens brukeren drar.
- Sluttberegning skal baseres på samme kanoniske prosjekt og profilversjoner.
- GPU-/canvasvisningen er ikke autoritativ eksportgeometri.
- Vis «Beregner» når resultatet er utdatert; ikke behold grønn status fra forrige modell.
- Mesh kontrolleres for lukkede volumer, selvskjæring, degenererte flater, normalretning, uønskede separate øyer og tilsiktede komponentgrenser.
- Hver fysisk kropp har egen identitet selv når den inngår i en samlet 3MF.

### 7.4 Ferdige komponenter

En bibliotekskomponent kan ha parametrisk oppskrift, SDF-tre eller mesh, og metadata om festepunkter, beskyttelse og kompatibilitet. Formdetaljene kan redigeres der det er tillatt; et komplett komponentobjekt skal ikke skaleres slik at mekaniske flater endres.

### 7.5 Symmetri

Symmetri skal være en redigerbar relasjon i prosjektet, ikke bare en engangskopi av mesh. Definer plan, omfang og hva som følger med. Håndter normaler og orientering ved speiling. Mekaniske grensesnitt som er høyre-/venstrespesifikke må byttes til en godkjent variant eller blokkere operasjonen.

Tekst og koblingsretning må behandles bevisst. Avanserte asymmetriske endringer skal kunne bryte symmetrirelasjonen uten datatap.

---

## 8. Opplasting av egne modeller

Import er en planlagt funksjon, men inngår ikke i første MVP. Start senere med ett eksplisitt format, eksempelvis STL, før mer sammensatte formater støttes.

Importflyt: velg fil → kontroller innhold → bekreft enhet og størrelse → orienter → analyser mesh → plasser som dekor → velg godkjent festesone → valider.

- Ikke anta millimeter når formatet ikke gir pålitelig enhet.
- Sett grenser for filstørrelse, polygonantall, utvidet arkivstørrelse, beregningstid og minne.
- Kontroller filinnhold, ikke bare filendelse. Avvis ikke-støttede eller skadelige strukturer.
- Ingen eksterne ressurser eller scripts skal kjøres fra importerte filer.
- Reparasjon skal være eksplisitt, bevare originalen og vise hva som ble endret.
- En vilkårlig mesh får ikke automatisk godkjente mekaniske festepunkter.
- Konvertering av importert mesh til SDF må vise mulig detaljtap og aldri arve en mekanisk godkjenning fra originalen.
- Lokale modeller holdes lokale som utgangspunkt. En senere serverflyt krever tilgangskontroll, lagrings- og slettingsregler.
- Brukeren må ha rett til å bruke modellen; ikke bygg inn et bibliotek av uavklarte tredjepartsfiler.

---

## 9. Validering med grønn, gul og rød

Validering skal være regelbasert og forklart i vanlig språk. Hver melding har regel-ID, berørte objekter, årsak, konsekvens, forslag til retting og evidensnivå.

| Status | Betydning | Eksempel | Handling |
|---|---|---|---|
| Grønn | Kontroller som gjelder valgt profil er fullført og bestått | Ingen funnet kollisjon gjennom godkjent vandring | Kan fortsette innen angitt verifikasjonsnivå. |
| Gul | Usikkerhet eller forhold som må vurderes | Toppens masse er estimert, fysisk returtest mangler | Vis konkret forbehold; prototype kan eventuelt eksporteres. |
| Rød | Brudd på en obligatorisk regel | Dekor fyller switchhulrom eller binder to bevegelige kropper | Blokker produksjonseksport, tilby retting. |
| Grå / beregner | Ikke kontrollert, utdatert eller under beregning | Ny form er lagt til | Må ikke vises som grønn. |

Hold to forhold tydelig atskilt:

1. **Digital kontroll:** Hva er undersøkt på denne modellen?
2. **Fysisk profilstatus:** Er denne mekanikken testet på denne produksjonsprofilen?

En grønn meshkontroll betyr ikke «trygt leketøy» eller «garantert printbar». Ukjente kritiske parametere skal blokkere produksjonsgodkjenning. Vanlig prosjektlagring skal alltid være mulig, også for røde og uferdige modeller.

En separat utvikler-/prototypeeksport kan tillate bestemte gule forhold med tydelig rapport. Røde mekaniske feil skal ikke få en vanlig «fortsett likevel»-knapp i barneflyten.

---

## 10. Systemarkitektur

**FORSLAG:** En lokal-først nettapp med separat, rammeverkuavhengig domenekjerne. Vurder TypeScript, et komponentbasert UI, en 3D-renderer og en worker-basert geometrimotor. Velg konkrete biblioteker etter en avgrenset evaluering av lisens, presisjon, vedlikehold og ytelse. Dette dokumentet fastsetter ikke dagens versjoner eller bibliotekskapabiliteter.

```text
Designporten / DesignLab-inngang
              |
Editor: Enkel + Avansert
              |
Kommandoer / historikk / prosjektlager
              |
Felles domenemodell og constraint-system
       |              |                 |
Generatorer      Komponentbibliotek   Mekanikkprofiler
       |              |                 |
       +--------- Geometriarbeider ------+
                   |       |
             Forhåndsvisning  Sluttmesh
                              |
                    Validering og eksport
                              |
                   Senere produksjonsadapter
```

### Ansvarsgrenser

| Modul | Ansvar |
|---|---|
| `domain` | Kanoniske typer, enheter, objektreferanser, kommandoer og invariants. |
| `generators` | Startmaler, tillatte komponenter og regler per produktfamilie. |
| `mechanics` | Versjonerte grensesnitt, bevegelse, beskyttede volumer og kompatibilitet. |
| `geometry` | SDF, meshoperasjoner, profilgenerering og meshing. |
| `validation` | Strukturelle, geometriske, mekaniske og produksjonsrelaterte kontroller. |
| `editor` | Verktøy, interaksjon, paneler og moduser. |
| `viewport` | Kamera, rendering, picking og visuelle hjelpelag. |
| `io` | Prosjektlagring, migrering, import og eksport. |
| `production-adapter` | Senere serverkontroll, prising og overføring til produksjon. |

Mekaniske regler skal ikke ligge inne i visningskomponenter. Generatorer skal kunne testes uten nettleser. Delte moduler skal trekkes ut når minst to konkrete behov støtter abstraksjonen; unngå en stor generell pluginplattform før første klikker fungerer.

### Beregningspipeline

1. Valider innkommende prosjekt og oppløs eksakte ressurs-/profilversjoner.
2. Utfør en atomisk kommando og øk prosjektrevisjonen.
3. Kjør billige domeneregler umiddelbart.
4. Send immutable jobb med revisjon og jobb-ID til worker.
5. Evaluer geometri og dyrere kontroller innen ressursgrenser.
6. Forkast resultater fra eldre revisjoner.
7. Oppdater forhåndsvisning og status samlet.
8. Ved eksport: beregn sluttgeometri, valider og knytt rapporten til eksportens innholdshash.

Støtt kansellering, feilmeldinger og gjenoppretting etter workerfeil. UI skal fortsatt kunne lagre prosjektet ved mislykket geometriarbeid.

---

## 11. Datastruktur og modulkontrakter

Dette er en **foreslått modell**, ikke et krav om å erstatte en eksisterende prosjektstruktur. Dersom Claude finner et eksisterende kanonisk format, skal det vurderes før nye felt eller migreringer innføres.

### Kanoniske data

| Entitet | Minimumsansvar |
|---|---|
| Project | Skjemaversjon, stabil ID, millimeterenhet, generator-ID/-versjon, innholdsreferanser. |
| Body | Fysisk kropp, rolle, geometrirot og tilhørighet til mekanisme. |
| ShapeNode | Primitiv, transformasjon, boolsk operasjon eller ressursreferanse. |
| ComponentInstance | Definisjons-ID/-versjon, tillatte parametere og kroppstilhørighet. |
| InterfaceInstance | Profilreferanse og lokalt koordinatsystem på en kropp. |
| Connection | To grensesnitt, koblingstype og godkjent bevegelses-/monteringsrelasjon. |
| SymmetryConstraint | Referanser, plan og type opprettholdt symmetri. |
| Resource | Innholdshash, format, enhet, kilde/lisens der relevant og lokal assetreferanse. |
| ProfileRef | Eksakt mekanikk- eller produksjonsprofilversjon. |

Scenens eierskapstre, SDF-operasjonstreet og forbindelsesgrafen er ulike strukturer. Ikke bruk ett generisk parent-felt for alle tre. En syklisk mekanisk forbindelse må være uttrykkelig støttet av solver; ellers skal den avvises. SDF-treet skal være asyklisk.

Eksempel på et logisk prosjekt, med referanser som må eksistere i den ferdige prosjektpakken:

```json
{
  "schemaVersion": 1,
  "id": "project-001",
  "units": "mm",
  "generator": { "id": "clicker", "version": "0.1.0" },
  "bodies": [
    { "id": "base", "role": "fixed", "geometryRootId": "base-root" },
    { "id": "top", "role": "moving", "geometryRootId": "top-root" }
  ],
  "mechanismProfile": {
    "id": "selected-switch-clicker-prototype",
    "version": "0.1.0"
  }
}
```

Eksempelet er illustrativt, ikke en komplett gyldig lagringsfil eller en fysisk godkjent profil.

### Avledede data og editorstatus

Mesh, beregnet bevegelsesvolum, valideringscache, markering, kameravinkel, åpne paneler og Enkel/Avansert hører ikke hjemme som autoritativ geometri. Editorstatus kan lagres separat for komfort.

Visuell skjuling må ikke endre produktets fysiske innhold. En egen eksplisitt operasjon må brukes for å fjerne eller deaktivere en fysisk del.

### Kontrakter og versjonering

- Stabile ID-er, runtime-validering og testet JSON-rundtur.
- Avvis ugyldige tall, dupliserte ID-er, ødelagte referanser og ukjente kritiske profilversjoner.
- Migrering skal være eksplisitt, testbar og bevare originalfilen.
- Profiloppdatering skal ikke stille endre tidligere modeller. Tilby oppgradering med ny validering.
- Generatorens første kontrakt kan være `createTemplate`, `listAllowedComponents` og `validateParameters`; legg til mer først når et konkret behov oppstår.
- En ny mekanikkprofil krever både digitale tester og et dokumentert fysisk kalibreringsløp.

---

## 12. MVP – en komplett, smal vertikal leveranse

MVP er én klikkergenerator med ett valgt switchsystem, én underdel og én bevegelig topp. Før fysisk profil er godkjent, leveres dette som en prototype.

### Inkludert

- Ett kanonisk prosjekt og samme modell i Enkel/Avansert.
- Et lite originalt bibliotek med kropp/dekor og minst ett virtuelt festepunkt som faktisk fungerer.
- Grunnformene kule, avrundet boks og sylinder, med flytting, skalering innen regler og glatt union i dekorområdet.
- Beskyttet switchfeste, toppkobling og klaringsvolum.
- Bevegelsesvisning og faktisk kollisjonskontroll gjennom vandringen.
- Én symmetrifunksjon for dekor.
- Grønn/gul/rød/grå status med klikkbare forklaringer.
- Angre/gjør om, lokal lagring og gjenåpning av prosjekt.
- Kontrollert eksport av topp og underdel, med enhet og profilinformasjon i en medfølgende rapport.
- Tastaturalternativ til dra-og-slipp, grunnleggende berøring og testede feiltilstander.

Velg ett eksportløp først. Separate STL-filer pluss rapport kan være en enkel start, men STL bærer ikke pålitelig enhets-/prosjektmetadata. 3MF vurderes for senere samlet produksjonspakke med separate kropper og enheter.

### Utenfor MVP

Fri modellimport, komplette drager, permanent artikulasjon, modulære bokstavsystemer, stabling, markedsplass, kontosystem, samarbeid, automatisk prising, betaling, automatisk slicer, vilkårlig CAD og full mobilmodellering.

Disse er planlagte retninger, ikke funksjoner som skal vises som fungerende. Klær og accessories kan representeres av noen godkjente dekorative komponenter i MVP; et omfattende garderobesystem kommer senere.

### MVP er ferdig først når

En testbruker kan gjennomføre hovedflyten, prosjektet gjenåpnes uten tap, eksporten samsvarer med valgt revisjon, og mekaniske ugyldigheter ikke kan omgås via UI eller lagret prosjekt. «Produksjonsklar MVP» krever i tillegg fysisk godkjenning av den konkrete profilen. En digital prototype skal omtales som nettopp det.

---

## 13. Senere faser

| Fase | Leveranse | Port før neste fase |
|---|---|---|
| 0 | Eksisterende kodekartlegging, switchvalg, mekanisk skisse og kalibreringsprøver | Profilens ukjente forhold er registrert og testplan er konkret. |
| 1 | Smal klikkermotor og MVP | Kritiske digitale flyter fungerer; fysisk status er dokumentert. |
| 2 | Flere kroppsformer, lette overkropper, klær, accessories og kontrollert import | Festesoner, masse og bevegelse valideres også for nye komponenter. |
| 3 | Én permanent leddfamilie og et enkelt artikulert dyr, deretter drager | Faktisk print-/monteringsmetode og leddholdbarhet er verifisert. |
| 4 | Modulære bokstaver/koblinger og stablede klikkere | Koblingsretning, kraftvei, stabilitet og samlet bevegelse testes. |
| 5 | Flere generatorer og integrasjon med Designportens produkt-/produksjonsflyt | Felles motor gjenbrukes uten duplisering, og serveren etterprøver ordregrunnlaget. |

CityKit kan undersøkes som en fremtidig flaggskipopplevelse når et konkret behov finnes. Det er ikke del av første gjennomføring eller begrunnelse for å overutvide kjernen nå.

---

## 14. Testing og akseptansekriterier

### Digitale tester

| Område | Obligatorisk bevis |
|---|---|
| Prosjektformat | Lagre/åpne bevarer ID-er, geometri, profiler og relasjoner; ugyldige referanser avvises. |
| Modusbytte | Flere bytter Enkel ↔ Avansert gir samme modell og eksporthash med fast pipeline. |
| Låst mekanikk | Skalering, differanse, import og manipulert JSON kan ikke endre obligatoriske grensesnitt. |
| SDF | Kjente grunnformer og kombinasjoner sammenlignes med forventede dimensjoner og feilgrenser. |
| Bevegelse | Kollisjon som oppstår midt i vandringen oppdages, ikke bare kollisjon i endeposisjon. |
| Festepunkter | Kompatible deler får korrekt posisjon og orientering; feil profil avvises. |
| Symmetri | Speiling gir riktig orientering og normaler, og ugyldig mekanisk speiling blokkeres. |
| Historikk | Sammensatt handling angres atomisk; sletting gir ikke hengende koblinger. |
| Eksport | Separate fysiske kropper, riktig målestokk, lukkede tilsiktede volumer og sporbar rapport. |
| Asynkronitet | Sene workerresultater kan ikke overskrive nyere geometri eller status. |
| Feiltilstander | Kansellering, ressursgrense, ødelagt prosjekt og workerfeil gir forklaring og bevarer arbeid. |
| Brukerflyt | En reell nettlesertest utfører valg, forming, snapping, kontroll, lagring og eksport. |

Bruk både enhetstester og integrasjonstester, supplert med egenskapsbaserte tester der det gir verdi: tilfeldige lovlige dekorendringer skal fortsatt bevare mekanikkens invariants.

### Fysisk verifikasjon

For hver godkjent profil registreres printer, materiale, dyse, laghøyde, orientering, relevante slicerinnstillinger, switchvariant, modellrevisjon og måleresultater.

- Print en serie toleranseprøver før en komplett figur.
- Kontroller montering, innfesting og demontering av switch der det er tilsiktet.
- Kontroller fri vandring og full retur med lett og mest krevende tillatt topp.
- Test sidebelastning, skjev aktivering, repeterte klikk og relevant slitasje.
- Kontroller at klær og accessories ikke hekter, kolliderer eller løsner utilsiktet.
- For ledd: test bevegelsesområde, fangst, brudd og behov for støttefjerning.
- For stabling: test stabilitet, kraftoverføring og aktivering i hele kombinasjonen.

Antall sykluser, belastning og akseptgrenser må settes før testen og knyttes til tiltenkt bruk. Dokumenter observerte feil. Ikke erklær testen bestått bare fordi én utskrift kunne beveges én gang.

### UX, tilgjengelighet og ytelse

- Test nybegynnere på reelle oppgaver; mål tid til første modell, behov for hjelp og forståelse av feil.
- Test tastaturflyt, fokus, objektliste og opplesbare meldinger.
- Test nettbrett, desktop og avgrenset mobilflyt med faktisk berøring der mulig.
- Test store men tillatte prosjekter, sakte enheter, avbrutte jobber og gjenåpning.
- Sett et dokumentert referanseapparat og scenebudsjett. Foreløpige mål kan være umiddelbar UI-respons og jevn interaksjon; konkret FPS, maksimal jobbvarighet og minnegrense må fastsettes etter første spike.
- Rapporter målte tall, ikke «rask» eller «optimalisert» uten måling.

---

## 15. Sikkerhet, personvern og nettstedsintegrasjon

Første editor bør fungere lokalt uten konto. En senere produksjonsbestilling må sende et versjonert prosjekt og ressurser til en server som kontrollerer dem på nytt. Klientens grønne indikator er ikke serverautorisasjon eller produksjonsbevis.

- Avgrens ressursbruk for prosjektfiler, mesh, SDF-dybde og rekursive strukturer.
- Ingen hemmeligheter i nettleserkode.
- Beskytt senere lagring og API-er med autorisasjon og inputvalidering.
- Unngå personopplysninger i feillogger og modellnavn som sendes til analyse.
- Ikke samle inn barns navn, alder eller kontaktopplysninger som standard for lokal modellering.
- Ved deling og opplasting må eierskap, tilgang, sletting og eventuell moderering avklares.

Designportens offentlige inngang skal forklare produktet, vise ekte eksempler og lede tydelig til Kjøp ferdig eller Lag noe eget. Editorprosjekter er private som utgangspunkt. Offentlige produkt- og inspirasjonssider kan få søkemotorvennlig innhold og metadata; tilfeldige private prosjekter skal ikke indekseres.

Eksisterende nettbutikk, betalingsoppsett og publiseringsstatus skal bevares. Denne handoffen autoriserer ikke produksjonsdeploy, betalingsaktivering eller endring av eksisterende priser. Slik integrasjon er en egen fase.

---

## 16. Risikoer og tiltak

| Risiko | Tiltak |
|---|---|
| Omfanget blir en generell CAD-editor før første produkt fungerer | Lever én komplett klikkerflyt først; utvid etter målte behov. |
| Pen forhåndsvisning gir feil eksport | Samme kanoniske input, sluttmeshkontroll og revisjonsbundet rapport. |
| SDF ødelegger presisjonsflater | Hybrid geometri, beskyttede volumer og kontroll av faktisk sluttgeometri. |
| Profil antas å passe alle printere og switcher | Eksakte profilversjoner og kalibrert produksjonsmatrise. |
| Tung topp returnerer ikke | Begrens geometri, estimer masse og gjennomfør fysiske returtester. |
| Permanent ledd blir fastprintet eller knekker | Egen mekanisk spike og fysisk port før produktbiblioteket utvides. |
| Enkel modus mister avansert arbeid | Samme dokument; skjul verktøy, ikke prosjektdata. |
| Fri import omgår regler eller låser nettleseren | Ressursgrenser, isolert beregning og ingen automatisk mekanisk tillit. |
| Barn misforstår grønn status som sikkerhetsgaranti | Tydelig tekst, separate evidensnivåer og avklart tiltenkt bruk. |
| Nye profiler endrer gamle modeller | Versjonslåsing og eksplisitt migrering med ny validering. |
| Referanseprodukter blir kopiert | Eget design, egne assets og dokumenterte bibliotekslisenser. |

---

## 17. Beslutninger som må tas

Følgende skal avklares så tidlig som nødvendig, men trenger ikke stoppe uavhengig arbeid med prosjektformat og UI-skall:

1. Eksisterende repository og hvilken kode som er autoritativ.
2. Konkret switchmodell og tilgang til mål/eksemplarer.
3. Mekanisk skisse som bekrefter tolkningen av vertikale 90-gradersflater.
4. Første printer, materiale og produksjonsorientering.
5. Tiltenkt alder, brukssituasjon og hvem som godkjenner fysiske tester.
6. Første originale klikkerform og hvilke deler som følger toppen.
7. Permanent ledd: faktisk print-in-place eller permanent ettermontering.
8. Stabling: uavhengige klikk eller tilsiktet samlet aktivering.
9. Første eksportformat og prototypens forhold til senere bestilling.

Claude skal bruke tydelig merkede prøveprofiler når mekaniske data mangler. Ikke gjør slike profiler tilgjengelige som produksjonsgodkjente.

---

## 18. Samspill med eksisterende Designporten-prosjekter

Det finnes historiske prosjektnotater om Signmaker og Formify. De antyder relevante prinsipper: kanoniske prosjektdata, stabile ID-er, runtime-validering, versjonering og workerberegning med avvisning av utdaterte resultater. Dette er historisk kontekst, ikke en bekreftelse på dagens kode eller ferdige funksjoner.

Før eventuell gjenbruk må Claude undersøke gjeldende repository, lokale instruksjoner, tester og lisensforhold. Ikke migrer eller slå sammen disse produktene automatisk. Gjenbruk av prinsipper krever ikke gjenbruk av hele applikasjonen.

---

## 19. Konkrete oppgaver til Claude

### Oppgave A – kartlegg og avgrens

Les lokale prosjektinstruksjoner. Finn faktisk rot, gjeldende prosjektformat, geometriarbeidere og eksisterende tester. Beskriv kort hva som kan gjenbrukes, hva som mangler og hvilke mekaniske data som er ukjente. Bevar eksisterende arbeid.

**Leveranse:** kort kodekart, beslutningslogg og en konkret plan for én vertikal klikkerprototype. Hvis repository ikke er vedlagt, be om det før implementering; ikke lat som eksisterende kode er inspisert.

### Oppgave B – etabler domenekontrakten

Implementer eller utvid bare det prosjektformatet MVP trenger: fysisk kropp, dekor, mekanikkprofil, festepunkt, kommando og eksportgrunnlag. Hold UI-status separat. Legg til runtime-validering, JSON-rundtur og migreringsinngang der nødvendig.

**Akseptanse:** ugyldige referanser og mekaniske overstyringer avvises; gyldig prosjekt kan lagres og lastes uten tap.

### Oppgave C – teknisk og mekanisk spike

Lag én topp og underdel med eksplisitt prøveprofil. Demonstrer beskyttet innfesting, full bevegelsesbane og en dekorform som med vilje kolliderer midt i vandringen. Lag kalibreringsprøver når faktiske mål er tilgjengelige.

**Akseptanse:** kollisjon oppdages; profilstatus og ukjente forhold vises; ingen påstand om fysisk passform før printtest.

### Oppgave D – minimal hybridgeometri

Legg inn de tre MVP-grunnformene og glatt union i dekorområdet. Bevar grensesnittene, generer sluttmesh og sammenlign referansemål. Skill de fysiske kroppene gjennom hele pipeline.

**Akseptanse:** formendring endrer eksportgeometrien, mens mekaniske flater består kontrollene. En render-effekt alene er ikke tilstrekkelig.

### Oppgave E – brukbar editor

Implementer Enkel/Avansert på samme dokument, lite visuelt bibliotek, faktisk snapping, tastaturalternativ, angre/gjør om, symmetri og lagring. Bruk Designportens originale identitet.

**Akseptanse:** en reell brukerflyt fungerer i nettleseren, og modusbytte bevarer prosjektet.

### Oppgave F – validering og eksport

Koble regelresultater til objekter og forklaringer. Håndter beregning, gule forhold og røde blokker. Knytt rapport og filer til én revisjon. Bevar lagring selv når eksport er blokkert.

**Akseptanse:** ingen utdatert grønn status, ingen eksport av feil revisjon og ingen referanseswitch i printfilene.

### Oppgave G – verifiser og rapporter

Kjør relevante automatiske tester og test hovedflyten visuelt og med tastatur. Dokumenter dimensjonskontroll og fysisk teststatus separat. Lever kjente begrensninger og ett tydelig neste steg.

Rapportformat:

- Implementert og kodeverifisert.
- Testet i nettleser, med navngitte flyter og enheter.
- Geometrisk kontrollert, med profil og revisjon.
- Fysisk testet, med dokumentert produksjonsoppsett.
- Ikke verifisert / gjenstår.

### Arbeidsregler

Arbeid i små, sammenhengende leveranser. Ikke legg inn tomme knapper, falske lastetilstander eller simulert validering som presenteres som ferdig funksjonalitet. Forklar nødvendige antakelser. Spør bare om valg som faktisk blokkerer neste leveranse, og fortsett med uavhengig arbeid.

Ikke kall produktet printklart, sikkert, produksjonsklart eller klart for salg uten nødvendig dokumentasjon. Ikke bygg fremtidsfasene før MVP-porten er oppfylt.

---

## 20. Kort oppstartsinstruks til Claude

Du skal bruke dette dokumentet som samlet produktkontekst for Designporten/Skaperverkstedet. Målet er én felles 3D-byggemotor der brukeren former uttrykket og motoren beskytter mekanikken. Start med en smal klikkergenerator med mekanisk tastaturswitch, topp og underdel. Enkel og Avansert bruker samme modell. SDF-forming og et visuelt delebibliotek skal være reelle funksjoner med originale assets og original UI. Mekaniske grensesnitt, klaringer og hele bevegelsesvolumet skal håndheves i kjernen og ved eksport.

Utfør først oppgave A. Deretter gjennomfører du neste avgrensede leveranse som tilgjengelig kode og mekaniske data tillater. Bevar eksisterende funksjonalitet. Skill uttrykkelig mellom implementert, digitalt validert og fysisk testet. De langsiktige generatorene styrer arkitekturretningen, men skal ikke blåse opp første leveranse.
