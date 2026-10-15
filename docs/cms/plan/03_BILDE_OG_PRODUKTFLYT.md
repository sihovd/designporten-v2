# 3. Bilder, komposisjon og produkter

## 3.1 Brukerflyt for bilde til produkt
1. Velg «Nytt produkt» eller åpne eksisterende produkt.
2. Velg «Legg til bilder» → last opp, velg fra mediebibliotek eller hent fra godkjent integrasjon.
3. Originalbilder lagres i medielageret med ID, metadata og kildeinformasjon.
4. Velg «Komponer produktbilde»: bakgrunn, utsnitt, skala, plassering, skygge, tekst/merkeelementer og ønsket format innenfor definerte maler.
5. Se forhåndsvisning. Komposisjonsoppskriften lagres **ikke-destruktivt**; originalbildene endres ikke.
6. Eksporter/render ny mediefil med egen ID og koble den til produktet som hovedbilde, galleri eller miniatyr.
7. Lagre produktutkast. Godkjenn og publiser når bilde, tekst og pris er kontrollert.

## 3.2 To mulige komposisjonsmåter
**A. Malbasert (første versjon):** utsnitt, bakgrunn, plassering, skygge, logo, produktnavn, format. Forutsigbar og lett å automatisere.  
**B. AI-assistert (senere):** generering/fjerning av bakgrunn, scenebygging og retusj. Må tydelig skille ekte produktfoto fra syntetiske visualiseringer og aldri endre produktets fysiske egenskaper misvisende.

## 3.3 Filbehandling
Originalen lagres permanent med sjekksum. Generer responsive formater (f.eks. WebP/AVIF der støttet), miniatyrer og kvalitetsvarianter. Ikke skriv store binærfiler inn i GitHub. Lagre kilde, rettigheter, alt-tekst, produksjonsparametere og historikk. Bruk kø for tunge bildejobber, med status, retry og feillogg.

## 3.4 Agentstyrt oppdatering
Eksempel: En agent mottar et nytt produktbilde og produktdata → oppretter media asset → foreslår produkttekst og kategori → lager komposisjon etter mal → oppretter produktutkast → sender til vurdering. Administrator kan sammenligne original og komposisjon, redigere og publisere. Automatisk direktepublisering kan eventuelt aktiveres **per godkjent regel**, ikke som generell standard.

## 3.5 Kilder og synkronisering
Produkter og bilder hentes fra CMS-et. GitHub skal **ikke** være innholdskilden. Dersom det senere brukes eksterne leverandører, lagersystemer eller produksjonsdata, etabler egne importadaptere med feltmapping, konflikthåndtering, siste synkronisering, idempotens og tydelig prioritet for hvem som kan endre hvilke felt. Ingen toveis synkronisering uten eksplisitt konfliktstrategi.

## 3.6 Eksempel på produktdata
```json
{
  "sku": "DP-DEMO-001",
  "name": "Eksempelprodukt",
  "slug": "eksempelprodukt",
  "status": "draft",
  "price": {"amount": 29900, "currency": "NOK"},
  "media": [{"asset_id": "asset_123", "role": "hero"}],
  "description": "Beskrivelse lagres i CMS-et",
  "source": "manual"
}
```
Eksemplet er kun for å illustrere strukturen, ikke en faktisk vare eller bestemt pris.
