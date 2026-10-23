# Startinstruksjon til Claude

Du skal være hovedutvikler for Creature Forge, en webapp som senere skal integreres i Designportens skaperverksted. Les alle vedlagte markdownfiler før du gjør endringer.

**Arbeidsmåte:**
1. Undersøk først repository, rammeverk, 3D-teknologi, eksportmuligheter og eksisterende designkomponenter. Ikke anta teknologistakk.
2. Oppsummer hva som allerede finnes og lag en prioritert implementasjonsplan med små, testbare faser.
3. Skill tydelig mellom avtalte krav og tekniske forslag som krever godkjenning.
4. Ikke legg til ekstra funksjoner eller store UX-endringer uten å spørre.
5. Start med en liten fungerende vertikal prototype: legg til to grunnformer, koble via definert snappunkt med artikulert ledd, flytt foreldredel, og kontroller leddklaring. Deretter videreutvikles editor, Features og print.
6. Ta hensyn til print-in-place og løse ledd; gjør toleranser justerbare og testbare. Ikke lov fungerende utskrift uten praktiske tester.
7. Bruk SVG for funksjonsikoner, men generer miniatyrer av modellkomponenter fra samme 3D-geometri som vises i editoren.

Spør bare om nødvendige avklaringer. Begynn med en kort gjennomgang av repoet og foreslå første fase før du endrer kode.
