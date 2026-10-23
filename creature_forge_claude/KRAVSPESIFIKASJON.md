# Creature Forge — avtalte produktkrav

## Formål
Brukeren bygger egne artikulerte, 3D-printbare figurer — fra søte dyr til fantasivesener — ved å sette sammen redigerbare former, koble dem med løse bevegelige ledd og tilpasse detaljer.

## Bygging og hierarki
- Start med et hode og bygg videre med grunnformer for kropp/overkropp, hofte, armer, ben, hender, føtter, hale m.m.
- Formene skal kunne endres i blant annet lengde og tykkelse.
- Hver grunnform har **forhåndsdefinerte** snappunkter. Når en kompatibel del trekkes nær punktet, kobles den automatisk via ledd. Ikke bruk vilkårlige nærmeste overflatepunkter som erstatning.
- Parent–child-hierarki: barn følger overordnede deler ved flytting.
- Symmetri kan aktiveres; midtlinje vises ved behov.

## Artikulasjon og ledd
- Løse, dinglende kjettinglignende ledd inspirert av print-in-place artikulerte drager — ikke stramme actionfigurhengsler.
- Ledd kan velges individuelt og flyttes/roteres. Avstand mellom tilknyttede deler kan justeres.
- En negativ Boolean-kuppel (dome) er sentrert ved leddets midtpunkt og skjærer ut bevegelsesklaring i tilstøtende deler.
- Kuppelen følger leddet og har uavhengige parametere for diameter, vinkel/orientering, dybde, tykkelse i ytterkant og tykkelse i sentrum.
- Utforming må ivareta både bevegelsesfrihet og nok styrke til 3D-print.

## Features og redigering
- Øyne, nese, munn, ører, horn, pigger, pelsdetaljer osv. er **Features i sidepanelet**, ikke grunnformer i nederste kroppsmeny.
- Valg av øyne plasserer som utgangspunkt et symmetrisk par; plassering, rotasjon og størrelse kan finjusteres med symmetri bevart.
- Features kan være additive (smelte inn i kroppen med justerbar blending) eller subtraktive (negative Boolean-volumer).
- Hver Feature har individuell blending og offset inn/ut langs overflatenormalen, og skal følge vertsdelens kurvatur/posisjon når den flyttes.
- Kroppsdel-editor kan bruke flere additive og negative primitive former på én del.
- Pels kan være ren overflatetekstur uten separat utstikkende geometri.

## 3D-printing
- Målet er 3D-printbare artikulerte figurer, gjerne rundt 10 cm i et eksempel, med løs bevegelse i leddene.
- Print-in-place, toleranser, minsteklaring, veggtykkelser, sammenhengende geometri og eksport må valideres teknisk.
- Ikke anta at visuell forhåndsvisning automatisk betyr printbar modell.

## Ikke besluttet
- Endelig motor/rammeverk, modellformat, produksjonstoleranser, eksportformat og alle algoritmiske detaljer må avgjøres etter vurdering av eksisterende kode og utskriftstester.
