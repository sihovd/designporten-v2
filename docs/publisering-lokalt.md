# Publiser Designporten fra din egen PC

Laget 2026-11-08 etter Sivert: «Ok sett det opp og vis en veileder». En snarvei på skrivebordet henter siste versjon fra GitHub, tester den, bygger nettsiden og laster den opp til designporten.no over SFTP. GitHub laster ikke opp noe; innloggingen til one.com ligger bare på PC-en.

## Slik henger det sammen

| Sted | Jobb |
|---|---|
| GitHub (`sihovd/designporten-v2`) | Koden. Claude og Codex leverer endringer hit. Kundene ser ingenting her. |
| PC-en din | Bygger siden og sender den ut når du trykker på snarveien. |
| one.com | Der designporten.no ligger og kundene ser den. |

## Oppsett (én gang, ca. 15 minutter)

### 1. Installer Git og Node

Åpne **PowerShell** (trykk Windows-tasten, skriv `PowerShell`, Enter) og lim inn:

```powershell
winget install Git.Git OpenJS.NodeJS.LTS
```

Godta det som spørres om. **Lukk PowerShell og åpne det på nytt** etterpå, så Windows finner programmene.

### 2. Hent koden til PC-en

I det nye PowerShell-vinduet:

```powershell
git clone https://github.com/sihovd/designporten-v2 "$HOME\Documents\designporten"
```

Koden havner i `Dokumenter\designporten`. Repoet er offentlig, så du trenger ikke logge inn.

### 3. Finn innloggingen hos one.com

Logg inn på one.com → kontrollpanelet → **SFTP/SSH**. Der står vert (host), brukernavn og port. Har du ikke et SFTP-passord, lager du det der.

### 4. Kjør oppsettet

Åpne mappen `Dokumenter\designporten\verktoy\windows` i Filutforsker og dobbeltklikk **Oppsett.bat**. Det:

1. sjekker at Git og Node er installert;
2. installerer pakkene siden trenger (et par minutter);
3. åpner filen `.env.publisering` i Notisblokk. Fyll inn vert, brukernavn og passord fra steg 3, lagre (Ctrl+S) og lukk Notisblokk;
4. legger snarveien **Publiser Designporten** på skrivebordet.

Får du melding om at Windows beskyttet PC-en, trykk «Mer info» → «Kjør likevel». Filen kommer fra ditt eget repo.

`.env.publisering` blir liggende på PC-en og sendes aldri til GitHub. Del den ikke med noen.

## Publisere

Dobbeltklikk **Publiser Designporten** på skrivebordet. Et vindu viser hvert steg:

1. **Henter** siste versjon fra GitHub.
2. **Installerer pakker** – bare når de har endret seg.
3. **Tester.** Feiler noe, stopper den her, og ingenting lastes opp.
4. **Bygger** nettsiden for designporten.no.
5. **Kobler til one.com** og viser hvilken versjon som er live nå, og hvilken som kommer.
6. **Spør deg.** Skriv `JA` og trykk Enter for å laste opp. Alt annet avbryter.
7. **Laster opp** og sier fra når det er ferdig.

Det tar 2–5 minutter. Sjekk etterpå at `designporten.no/deployment.json` viser den nye versjonen, og ta en hard oppdatering av siden (Ctrl+F5).

### Første gang

Første gang du kobler til, viser skriptet serverens **fingeravtrykk** (`SHA256:…`) og spør om du stoler på serveren. Skriv `JA`. Fingeravtrykket lagres, og senere stopper skriptet hvis serveren plutselig har en annen nøkkel. Det beskytter mot at noen utgir seg for å være one.com.

## Sikkerhet innebygd

- Laster bare opp et produksjonsbygg av ren kode fra `main`.
- Laster bare opp til en mappe som allerede har Designporten (`deployment.json`) og ikke WordPress.
- Sletter aldri filer på serveren.
- Sender aldri innstillingsfiler (`konfig.php`, `oppsett.php`, CMS-data). De som ligger på serveren, blir stående.
- Skriver aldri ut passordet, heller ikke i feilmeldinger.
- Hver publisering logges i `var/publisering/logg.txt` på PC-en.

## Når noe går galt

| Melding | Gjør dette |
|---|---|
| «Fant ikke .env.publisering» | Kjør `Oppsett.bat` igjen. |
| «Innloggingen ble avvist» | Rett brukernavn eller passord i `.env.publisering` (åpne med Notisblokk). |
| «Fikk ikke kontakt med one.com» | Sjekk nettet og verten i `.env.publisering`. |
| «Fant ikke Designporten i "." på serveren» | SFTP starter et annet sted enn nettsiden. Sett `ONECOM_ROTMAPPE` til mappen siden ligger i, for eksempel `www`. |
| «Serverens nøkkel stemmer ikke» | Ikke last opp. Sjekk med one.com om de har byttet nøkkel. Er det bekreftet, tøm linjen `ONECOM_SFTP_FINGERAVTRYKK=` og kjør på nytt. |
| «Mappen har lokale endringer» | Noen filer i mappen er endret for hånd. Be Claude eller Codex rydde. |
| «Tester feilet» | Siden er ikke trygg å publisere. Be Claude eller Codex se på feilen. |

**Rulle tilbake:** be Claude eller Codex tilbakestille `main` til forrige versjon, og publiser igjen. one.com har dessuten egne backuper i kontrollpanelet.

## For utviklere

- Skriptet: `scripts/publiser-produksjon.mjs` (testet i `scripts/publiser-produksjon.test.mjs`). Startes av `verktoy/windows/Publiser Designporten.bat`, oppsett i `verktoy/windows/oppsett.ps1`.
- Mal for innstillingene: `.env.publisering.example`.
- Bygget er `npm run build:onecom` (rot `/`, ikke test). E-postoppsettet (`api/oppsett.php`) skrives ikke; serverens fil beholdes.
