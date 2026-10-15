# 5. Akseptansekriterier og tester

| ID | Scenario | Forventet resultat |
|---|---|---|
| CMS-01 | Admin endrer overskrift i redigeringsmodus | Utkast vises i preview, offentlig tekst uendret før publisering |
| CMS-02 | Admin publiserer endret overskrift | Ny tekst vises uten GitHub-commit eller deploy |
| CMS-03 | Claude deployer ny CSS/komponent | Publisert tekst, produktdata og media beholdes |
| CMS-04 | Admin gjenoppretter tidligere versjon | Valgt innhold kommer tilbake, med sporbar historikk |
| CMS-05 | To redaktører redigerer samme felt | Konflikt oppdages, ingen stille overskriving |
| PRD-01 | Admin oppretter produkt med bilder | Produktutkast lagres og kan forhåndsvises |
| PRD-02 | Admin publiserer produkt | Produkt vises på riktig URL, bilder og metadata lastes |
| PRD-03 | Produkt oppdateres | Eksisterende ordre-/historikkdata påvirkes ikke utilsiktet |
| MED-01 | Admin laster opp originalbilde | Original beholdes og metadata lagres |
| MED-02 | Admin komponerer bilde fra to kilder | Ny avledet fil og oppskrift lagres; kilder beholdes |
| MED-03 | Admin prøver å slette bilde i bruk | Systemet advarer eller hindrer brudd i referanser |
| AGT-01 | Agent sender produktforslag | Forslag/utkast opprettes med aktør, kilde og diff |
| AGT-02 | Agent forsøker publisering uten scope | Avvist, loggført, ingen offentlig endring |
| AGT-03 | Samme agentjobb sendes på nytt | Ingen utilsiktede duplikater |
| SEC-01 | Uautorisert besøker admin-API | Avvist uten lekkasje av utkast eller hemmeligheter |
| OPS-01 | Database og medielager gjenopprettes fra backup | Innhold og referanser fungerer etter restore |
| OPS-02 | Ny versjon deployes med inkompatibelt skjema | Pipeline stopper eller migrasjon kjøres kontrollert |

## Manuell visuell kontroll
Sjekk mobil og desktop: redigeringsmarkører skal ikke være synlige for publikum; bildene skal ikke forskyve layout; eksisterende design og URL-er skal beholdes; komposisjonsverktøy skal være forståelig med få kontroller i første versjon.
