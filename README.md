# Designporten

Dette er det nye prosjektet for Designporten.no, etablert fra bunnen av som grunnlag for en komplett, moderne webplattform.

DESIGNPORTEN_MASTER.md er prosjektets overordnede spesifikasjon og eneste inngang. Detaljene ligger i `docs/`, og arbeidsreglene for alle som jobber i repoet står i `CLAUDE.md`.

Nettstedet er en frittstående Astro-app (se ADR-001) med showroom, produkter og handlekurv med bestillingsforespørsel, og Skaperverkstedet med Signgen (skilt), lampegeneratoren og den artikulerte dragen. Eldre Designporten-kode er ikke brukt som grunnlag.

## Kom i gang

```sh
npm install
npm run dev      # http://localhost:4321
npm run verify   # formatering, lint, typesjekk, enhetstester og bygg
npm run test:e2e # nettlesertester på desktop og mobil
```

Mer i [docs/development.md](docs/development.md).

| Mappe | Innhold |
|---|---|
| `docs/design/` | Merkevare, visuell identitet, interaksjon, bevegelse, Skaperverksted |
| `docs/content/` | Informasjonsarkitektur, sider, spesialdesign, innhold |
| `docs/architecture/` | Teknisk arkitektur, domenemodell, tilgjengelighet, ytelse |
| `docs/decisions/` | Beslutningslogg, bevart arbeid, løste konflikter, åpne beslutninger |
| `reference/` | Konseptbilder og bevarte prototyper (ikke produksjonskode) |
| `src/`, `public/` | Kildekode og statiske filer |
| `tests/e2e/` | Nettlesertester per område |
