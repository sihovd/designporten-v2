# Sign Forge – fullstendig samlet endringsspesifikasjon

## 0. Overordnet mål og arbeidsmåte

Sign Forge skal føles som en kompakt, profesjonell vektor- og 3D-skilteditor. Mindre forklarende tekst, mer intuitiv ikonbruk, tydelig laghierarki og kontekstbaserte kontroller. Ikke fjern eksisterende funksjonalitet med mindre dette er eksplisitt angitt nedenfor. Undersøk kodebasen før inngrep, og bevar data, redigerbarhet og eksisterende eksportmuligheter. Utviklingsgrensesnittet er på norsk; engelsk oversettelse er et senere arbeid.

**Viktig skille:** Avtalte ønsker beskrives som krav. Usikre alternativer er merket «Vurdering» og må ikke tas for endelig besluttet. Enkelte krav presiserer/overstyrer tidligere forslag.

## 1. Toppmeny, paneler og innstillinger

- Innfør en tradisjonell programmeny øverst, inspirert av Adobe-programmer, med blant annet **Fil**, eksport og innstillinger. Organiser funksjonene logisk.
- Ha en egen **Innstillinger**-meny med bakgrunnsfarge for editoren, ferdige/egendefinerte blå eller andre gradienter, mørk/lys modus, måleenheter (metrisk og eventuelle andre enheter), og valg av byggeplate-/kanvasstørrelse fra forhåndsdefinerte eller egendefinerte størrelser.
- **Vurdering:** Rutenett, hjelpelinjer, presisjon, paneloppsett, autolagring og 3D-visning kan høre hjemme i innstillinger; skill generelle programinnstillinger fra prosjektinnstillinger.
- Ha et lite, tydelig adskilt **Prosjektinnstillinger**-valg øverst ved overskriften i lagpanelet. Her flyttes prosjektdefinisjon, byggeplate/kanvas, farger i bruk, fargeprofiler og øvrige prosjektspesifikke oppsett som i dag ligger i Egenskaper.
- Inkluder valgt **printlaghøyde** i prosjektinnstillinger, for bruk i forhåndsvisning av hvordan printlagene ser ut. Dette er ikke et nytt «lag» i designhierarkiet.
- Egenskaper-panelet skal være for det valgte objektet, ikke generelle prosjektinnstillinger.
- Når man åpner **Paneler**-oversikten, skal menyen lukke seg automatisk ved klikk på kanvasen eller utenfor menyen; den skal ikke kreve nytt klikk på Paneler-knappen.
- Verktøyene i venstre verktøylinje skal ha relevante **kontekstbaserte kontroller på topplinjen** når de aktiveres.
- Unngå mye tekst og overflødige forklaringer i panelene; bruk små ikoner og kompakt layout, men behold tydelighet.
- Et lite **søkefelt for hjelp** øverst i editoren skal gi korte, konkrete forklaringer på hvordan oppgaver gjøres. Fjern lang, permanent hjelpetekst nederst i Profil-panelet. Ikke erstatt denne spesifikt med en mengde nye verktøytips; separat er hoverforklaringer ønsket i noen kontroller som eksportformater, fargeprofiler og transform.

## 2. Lagpanelet – hierarki og handlinger

- **Nytt lag** skal være et lite plussikon uten lang etikett, ikke en stor knapp øverst. Plasser det nederst i lagpanelet, nær **Omriss**-knappen / i tilknytning til aktiv laggruppe.
- Ved klikk opprettes **ett tomt lag umiddelbart**, plassert rett over aktivt lag. Fjern valgmenyen som i dag foreslår «Tomt lag», «SVG som pynt», «SVG som ramme», «Dekor fra galleri», «Tekstlag» osv.
- Ha et lite drahåndtak med riller ytterst til venstre på rader for lag og underlag. Gjør omorganisering med drag-and-drop mulig.
- Lag/grupper kan flyttes i strukturen. Underlag og omriss skal kunne omorganiseres **innenfor sitt tilhørende lag** (endre rekkefølge), uten utilsiktet flytting til andre grupper.
- Plasser synlighet (**øye**), låsing (**lås**) og sletting (**søppelbøtte**) tydelig ved lag/objekt, samlet mot venstre sammen med drahåndtak. Sletting skal være tilgjengelig også for omriss.
- Tydeligere skillelinjer mellom grupper, tekstlag, underlag og omriss. Gruppeoverskriften kan ha annen bakgrunn/innramming og skal oppfattes som gruppenavn, ikke som selve tekstinnholdet.
- Fremhev **tekstens faktiske innhold** visuelt i tekstlaget. Flere tekstfelt skal fortsatt kunne ligge i én gruppe.
- Vis underlag og omriss innrykket litt til høyre under tilhørende tekst, gjerne med enkel hierarkisk gren/pil. Dette skal tydelig illustrere eierskap.
- Klikk på **lagnavn** for et lag med flere streker/objekter skal markere alle objektene i det laget, slik at de kan flyttes samlet.
- Tekstfarge skal kunne velges **direkte i lagpanelet**, tilsvarende underlag og omriss.
- **Vurdering:** Om det er hensiktsmessig å knytte separate underlag til hvert enkelt tekstfelt i samme gruppe. Ikke besluttet.

## 3. Markering, pensel, penn, hull og tallkontroller

- Markeringsrektangel skal velge en vektor/et objekt **når markeringen berører objektet**, ikke bare når objektet er fullstendig omsluttet.
- Paint/pensel er nyttig, men penselstrøkets **underliggende vektorbane** må kunne redigeres etterpå som vanlig vektor: flytte punkter, forme kurver, mens penselbredde og utseende bevares.
- Integrer Paint-redigering naturlig med **penneverktøyet**, fremfor to isolerte redigeringsverdener. **Vurdering:** eksisterende breddekontrollpunkter kan eventuelt også kunne flyttes som vektorpunkter eller kombineres med slike. Brukervennlig implementasjon prioriteres.
- Oppgrader **Hull-verktøyet** med valg av hullform, for eksempel sirkel, firkant og andre eksisterende grunnformer.
- Fjern det separate **Hånd/Panorer-verktøyikonet** fra venstre verktøylinje. Panorering skal fremdeles fungere ved **mellomromstast** og ved å **holde nede musehjulet**.
- Numeriske felt med hover-/drajustering skal ha en konsistent, liten **linjal og trekantmarkør**. Nå fjærer markøren tilbake til midten når den slippes. Endre til **absolutt verdi/posisjon**: markøren blir stående i samsvar med gjeldende numerisk verdi; linjal, posisjon og tall må samsvare. Bruk prinsippet på tilsvarende tallfelter, ikke bare Paint.

## 4. Tekstegenskaper og transform

- Gjør Egenskaper for tekst mer kompakt. Fjern dobbeltforekomst av «Tekst»-overskrifter over selve tekstinnholdet.
- Behold fontvelger. Ved siden av plasseres bare et lite ikon med **stor A, liten a og pluss** for «legg til font»; ingen lang forklaringstekst i selve panelet.
- Ikonet åpner **Google Fonts-bibliotek** (norsk etikett). Fontliste med **visuell forhåndsvisning av hver font**, søk øverst og **20 fonter per side**, med Neste for de neste 20. **Vurdering/senere:** opplasting av egne fonter.
- Tekstjustering **venstre, midtstilt, høyre** skal vises som ikoner, uten ord ved hvert valg.
- Bruk den forståelige etiketten **Bokstavavstand** fremfor Sperring.
- I seksjonen **Plassering og størrelse** plasseres **Rotasjon** rett nedenfor; «Behold proporsjoner» nederst. Avkrysningsboks og tilhørende tekst på samme linje, med luft til kantene.
- Fjern seksjonen **Lag og rolle** fra Egenskaper; styr dette fra selve Lag-panelet.
- Transform-panelet beholdes, men gjøres **svært kompakt** og informativt, med små scrubbere for presis finjustering. Størrelse/skalering kan også justeres direkte på kanvasen. Rotasjon illustreres med et tydelig roteringsikon. «Lås proporsjoner» kan være liten avkrysningsboks / låsesymbol.
- Funksjonene fra separat **Juster**-panel flyttes til kontekstbaserte ikoner på topplinjen når relevante elementer, særlig tekst, er markert. Fjern Juster-panelet. Behold valg for justering/fordeling i forhold til markering, plate eller linje slik funksjonen tilsier.

## 5. Profil-panelet

- Behold den eksisterende Bézier-/profilkurvefunksjonaliteten, som oppleves nyttig.
- De runde redigeringspunktene skal ha **fast diameter**, uavhengig av hvor bredt panelet strekkes. De skal ikke skalere opp til store sirkler.
- Bytt tekstknappene «Legg til punkt», «Gjør glatt», «Fjern punkt» m.fl. til intuitiv ikonografi inspirert av vektor- og penneverktøy.
- **Vurdering:** Mulighet til å tegne kurve frihånd og så redigere punktene for presisjon. Nøyaktig punktredigering skal fortsatt være tilgjengelig.
- Fjern den lange permanente tekniske forklaringsteksten nederst i dette panelet, uten å erstatte med et tilsvarende tekstfelt.
- Profilenes **forhåndsinnstillinger** skal ligge i **én horisontal ikonrad øverst**. Former inkluderer rett, innover/hul, utover, S-kurve, trapp, avrundet kant, knekk/fas og til slutt egendefinert kurve. Hver knapp bør visuelt indikere kurveformen.

## 6. Fargevelgere, profiler og individuelle objektfarger

- Fargevelgere/swatches skal ligne profesjonelle, fleksible **fargepaletter**, slik at fargekombinasjoner kan velges enkelt. Unngå at standardflyten krever filamentregister, plasttype eller annet materialoppsett.
- Alle fargeswatches skal være **kvadratiske**.
- Komprimer Fargeprofil-panelet vesentlig: lite tekst, flere farger/ikoner, kort forklaring ved hover der nødvendig.
- Opprett ny profil via **pluss**: vis fargeprøver som kan flervelges (tydelig hake eller markert kant), velg ønskede farger, klikk **Lag profil**, og gi profilen navn. Eventuelle detaljinnstillinger legges i **Avansert**, ikke i hovedflyten.
- Hvert **tekstfelt** skal ha selvstendig farge, også når flere tekstfelt ligger i samme gruppe, helt uavhengig av underlag/omriss. Denne fargen må kunne settes fra lagpanelet.
- Hver **lukket vektorbane** i en importert flerfarget SVG skal kunne ha egen farge uten å skifte lag/gruppe. Nå oppstår tilsynelatende feil der banen «hopper ut» av laget ved fargeendring. Dette må undersøkes og rettes. Farge og lagtilhørighet er separate egenskaper; gruppestruktur og originale farger må bevares ved import og videre redigering.

## 7. Dekorgalleri og gjenbrukbare vektorelementer

- Gjør dekorgalleriet kompakt som en **emoji-velger**: horisontal rad med tematiske kategoriikoner øverst, rullebart rutenett med dekor-SVG-er nedenfor og rask navigering mellom temaer.
- Innloggede brukere skal kunne opprette **egne kategorier** og lagre **egne vektordekorasjoner** i biblioteket.
- Handling **Lagre dekorelement**: marker én eller flere vektorer på kanvasen, lagre kombinasjonen som ett gjenbrukbart dekorobjekt og hent det senere fra biblioteket.
- Dekorelement kan brukes som **selvstendig dekorlag** eller legges **inne i en eksisterende laggruppe**. Flere vektorer kan grupperes men hver del skal fortsatt kunne redigeres.
- Bruk gjerne SVG som utvekslingsformat, men bevar ved behov interne objektdata for redigerbare vektorbaner, grupper og spesielle Paint-egenskaper. **Vurdering:** eksakt intern lagringsrepresentasjon.
- Ved **hover over dekorikon** vises to tydelige valg: **Sett inn** (hele objektet direkte) og **Velg deler** (åpner lett forhåndsvisning der man markerer ønskede delbaner før import). Gjelder **alle** dekorasjoner, inkludert brukerlagrede.
- Importer bare de valgte SVG-delene ved selektiv import, slik at svært store og komplekse SVG-er ikke unødig belaster kanvasen. Hold dem redigerbare.
- Eksisterende dekorelementer må kunne redigeres med hensyn til form, punkter, kurver og farge. **Lisensforbehold:** Kontroller faktisk lisens for hvert brukt SVG-bibliotek; hvis Apache 2.0 gjelder, følg krav til lisens/NOTICE og endringsangivelser. Ikke anta at alle filer nødvendigvis er Apache-lisensiert.

## 8. Nytt mønsterverktøy

- Legg **Mønster (Pattern Tool)** i verktøylinjen til venstre.
- Når verktøyet er aktivt, skal en kompakt, kontekstbasert innstillingsrad/panel dukke opp.
- Brukeren skal kunne velge én eller flere vektorer som gjentas **langs en valgt bane** eller i **bestemt retning**, med kontroll over **antall**, **avstand** og eventuell **rotasjon/orientering** langs banen.
- **Vurdering:** Dynamisk redigerbart mønster (endre antall/avstand/bane etter opprettelse) og eventuelt todimensjonale rader/kolonner. Dette var forslag, ikke endelig avtalte detaljer.

## 9. Historikk og opprydding i paneler

- Flytt historikk fra sidepanel til en **kompakt horisontal tidslinje nederst**, inspirert av Fusion 360. Vis redigeringssteg med små ikoner og tillat navigering tilbake til tidligere tilstand. Historikken registreres under arbeid.
- Fjern det gamle sidepanelet for Historikk når tidslinjen erstatter det. **Vurdering:** Full parametrisk re-redigering av tidligere operasjoner er ikke fastsatt og skal ikke forveksles med vanlig undo/redo.
- Fjern **Produksjon** som permanent sidepanel; produksjonskontroller skal vises ved **Eksporter / Bestill**.

## 10. Eksporter / Bestill

- Flytt alt relatert til **CSV-eksport/massetilpasning** bort fra Egenskaper og inn i **Eksporter / Bestill**.
- Rett under illustrasjonen av byggeplaten skal det være **tre** kompakte knapper med ikoner, i denne rekkefølgen:
  1. **Last ned** – dropdown med filtypene **STL** og **3MF**.
  2. **Eksporter via CSV** – behold denne nøyaktige knappeteksten (ikke «Masseproduksjon»; det forslaget ble trukket tilbake).
  3. **Legg i handlekurv**.
- Ved hover over nedlastingsformat, vis **svært korte** forklaringer:
  - **STL:** «Geometri uten fargeinformasjon».
  - **3MF:** «Geometri med fargeinformasjon».
- 3MF kan inneholde fargeinformasjon, men det må ikke gis teknisk garanti for automatisk kobling til bestemte filamentplasser uten å verifisere eksport- og slicerlogikken.
- Behold det eksisterende **Merknader**-feltet. Ikke opprett et duplikat.

## 11. CSV – import, mapping, dekor, fargeprofiler og generering

CSV-flyten skal være intuitiv og fungere med både navn, individuelle SVG-er og ulike fargeprofiler. Bruk **tre faner øverst**: **Importer**, **Koble**, **Generer**. Dette erstatter ikke nødvendigvis alle eksisterende knapper; fjern **kun den separate Master-knappen**, som eksplisitt ble utpekt som unødvendig.

### Fane 1: Importer

- Vis CSV-innholdet som en redigerings-/utvalgstabell, ikke en tungvint importdialog.
- En avkrysningsboks på hver **kolonneoverskrift** lar brukeren velge hvilke datakolonner som tas videre.
- En avkrysningsboks ved hver **rad** lar brukeren velge hvilke oppføringer som tas videre. Støtt **Velg alle** samt individuelle valg/utelatelser (for eksempel bare bestemte personer fra en større gjesteliste).
- Brukeren går videre med bare valgte kolonner og rader. Ingen forhåndsredigering av CSV-fil skal være nødvendig.

### Fane 2: Koble

- Vis de valgte **kolonnene** og la hver kolonne kobles via dropdown til relevant tekstfelt/objektfelt på kanvasen. **Rader skal aldri måtte kobles én og én**; mappingen gjelder automatisk alle valgte rader.
- Legg til **+ Legg til egendefinert kolonne**.
- Egendefinerte kolonner kan brukes for **dekor**: velg SVG fra dekorgalleriet for en bestemt rad/person, for eksempel katt, hund eller rakett. Forskjellige rader kan få forskjellige dekorasjoner.
- Egendefinerte kolonner kan også brukes for **fargeprofil**. Velg profil per rad, f.eks. profil A for noen personer og profil B for andre.
- Fargeprofiler skal gi konsekvent **posisjonsmapping**: farge 1 i profil A tilsvarer farge 1 i B, farge 2 tilsvarer farge 2 osv. Samme design får da forskjellige men tilsvarende fordelte fargekombinasjoner.
- Disse individuelle tildelingene skal ikke kreve et nytt obligatorisk fjerde trinn.

### Fane 3: Generer

- Før generering: vis **kort status** (antall valgte rader, antall design og eventuelle manglende mappinger), uten tettpakket teknisk tekst.
- Når brukeren faktisk trykker **Generer**, skal systemet produsere resultatene og **deretter** vise dem i en **2D-platevisning**. Ikke gjør 2D-visningen til et eget før-genereringssteg.
- Vis alle genererte skilt på byggeplaten med navn, dekorasjon og respektiv fargeprofil. Tillat endring av individuelt fargevalg der.
- Brukeren skal kunne klikke **ett bestemt skilt i platevisningen**, åpne dette skiltet i Sign Forge-editoren, justere for eksempel størrelse, posisjon, tekst, farger eller dekor, og gå **tilbake til platevisningen** med justeringen bevart.
- Redigering av ett generert skilt må **ikke påvirke hovedmalen eller andre skilt**. Ikke krev regenerering av hele produksjonen etter individuell korrigering.
- Behold eksport/bestilling av sluttresultatet, og bevar øvrige relevante knapper som ikke er eksplisitt fjernet.

## 12. Brukerfelt / innlogging

- Øverst til høyre: kompakt **bruker/profilfelt** med aktiv bruker når innlogget, ellers **Logg inn**.
- I **utviklingsmodus** skal innlogging ikke tvinges ved hver økt; editoren må kunne brukes uten innloggingshindring. Klargjør gjerne grensesnitt for kontoer senere, men ikke la dette blokkere utvikling.

## 13. Akseptkriterier / regresjonskontroller

1. Nytt lag oppretter direkte tomt lag over aktivt lag og bevarer hierarkiet.
2. Dra-omorganisering, synlighet, lås og sletting fungerer uten å flytte underlag ut av riktig gruppe.
3. En markering som bare treffer deler av vektoren, velger den.
4. Paint-strøk kan etterredigeres på vektorbanen uten å miste bredde/uttrykk.
5. Tall-scrubbere er absolutte og beholder markørposisjon etter museknapp slippes.
6. Flere tekstfelt i samme gruppe kan ha forskjellige farger.
7. Fargeendring på individuell SVG-bane flytter aldri banen ut av gruppen; omriss påvirkes ikke utilsiktet.
8. SVG-dekor kan settes inn helt eller med utvalgte deler, også brukerens egne.
9. CSV-fane Importer støtter både valg av kolonner og rader; fane Koble mapper bare kolonner.
10. CSV-dekor og fargeprofil kan variere per rad, uten å endre mal.
11. Trykk Generer gir 2D-platevisning **etterpå**; individuelt redigerte skilt forblir individuelle og kan hentes tilbake i platevisningen.
12. Last ned viser STL/3MF; Eksporter via CSV er midtknappen; handlekurv er høyreknappen; eksisterende Merknader beholdes.
13. Bruker kan arbeide i utviklingsmodus uten gjentatt innlogging.

## 14. Punkter som ikke er besluttet fullt ut

- Underlag per tekstfelt innen samme gruppe.
- Om Paint-breddepunkter og vektoranker skal være samme punkttype.
- Presis teknisk implementasjon av internt SVG-/dekorformat og avansert SVG-utvalg.
- Frihåndstegning i profilpanelet, med påfølgende nøyaktig redigering.
- Full parametrisk historikk slik Fusion 360 har, utover ønsket tidslinje.
- Todelte mønsterrader/-kolonner og dynamisk oppdaterbar pattern-operasjon.
- Egne opplastede fonter (senere).
- Engelskspråklig oversettelse (senere).
- Eventuelle tilleggspreferanser for hjelpelinjer, snapping, paneloppsett, autolagring og detaljert 3D-visning.

**Viktig for Claude:** Respekter eksplisitte reverseringer i samtalen: Behold knappeteksten «Eksporter via CSV»; fjern bare Master-knappen, ikke øvrige CSV-knapper; platevisningen kommer etter klikk på «Generer»; «Merknader» finnes allerede og skal ikke legges til på nytt; fargeprofilvalg skal være på radnivå mens fargene kobles posisjonsvis; programmet skal ikke kreve pålogging i utviklingsmodus.
