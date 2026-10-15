# 2. Arkitektur og datamodell

## 2.1 Logisk arkitektur
- **Publikumsnettsted:** viser publiserte produkter og innhold fra CMS API/server-side datatilgang.
- **Adminflate / inline-redigering:** samme nettsted med autentisert redigeringsmodus.
- **CMS backend/API:** validering, rettigheter, publiseringsflyt, revisjoner og webhooks.
- **Database:** autoritativt lager for strukturert innhold, produkter og relasjoner.
- **Objekt-/medielager:** originalbilder, bearbeidede bilder, miniatyrer og dokumenter.
- **Bakgrunnsjobber:** bildebehandling, import, agentforslag, publiseringsoppgaver og feilforsøk.
- **AI-agenter:** tilgang via begrensede API-nøkler/roller og jobbkø, ikke direkte DB.
- **GitHub:** kilde til kode, design, skjemaendringer/migrasjoner, tester og CI/CD.

## 2.2 Foreslått datamodell (tilpasses repo)
`users(id, role, status, ...)`  
`pages(id, slug, template_key, status, ...)`  
`content_entries(id, page_id, content_key, locale, value_json, status, revision, ...)`  
`sections(id, page_id, component_key, sort_order, visible, content_json, ...)`  
`products(id, sku, slug, name, description, status, price, currency, ...)`  
`product_variants(id, product_id, sku, attributes_json, price_override, availability, ...)`  
`media_assets(id, storage_key, mime_type, width, height, alt_text, rights, checksum, ...)`  
`media_derivatives(id, source_asset_id, kind, storage_key, parameters_json, ...)`  
`product_media(product_id, asset_id, role, sort_order, ...)`  
`image_compositions(id, source_assets_json, recipe_json, output_asset_id, status, ...)`  
`revisions(id, entity_type, entity_id, actor_id, snapshot_json, created_at, ...)`  
`approval_requests(id, entity_type, entity_id, proposed_revision, status, ...)`  
`agent_jobs(id, actor_id, kind, input_json, status, result_json, ...)`  
`audit_events(id, actor_id, action, target_type, target_id, diff_json, ...)`

Dette er en **logisk modell**, ikke et krav om bestemte tabellnavn eller SQL-dialekt. Bruk eksisterende modeller når de finnes; migrer uten datatap.

## 2.3 API-prinsipper og illustrative endepunkter
- `GET /api/content/pages/:slug` – publisert innhold.
- `GET /api/admin/pages/:id` – innhold inkludert utkast, krever innlogging.
- `PATCH /api/admin/content/:id` – lagre endring med versjon/optimistisk låsing.
- `POST /api/admin/content/:id/publish` – publiser autorisert revisjon.
- `GET /api/products` og `GET /api/products/:slug` – publiserte produkter.
- `POST /api/admin/products` – opprett produktutkast.
- `PATCH /api/admin/products/:id` – endre utkast.
- `POST /api/admin/media/uploads` – få sikker opplastingsflyt.
- `POST /api/admin/compositions` – opprett komposisjonsjobb.
- `GET /api/admin/jobs/:id` – status og resultat.
- `POST /api/agent/proposals` – agentforeslått endring.
- `POST /api/admin/proposals/:id/approve` – godkjenn og anvend.

Ruter er forslag. Claude må tilpasse navngivning, auth og API-stil til eksisterende løsning.

## 2.4 Kontrakt mellom design og innhold
Hver kodebasert seksjonskomponent har en stabil `component_key` og et validert innholdsskjema. Eksempel: `hero` leser `heading`, `lead`, `image_asset_id`, `cta_label`, `cta_url`. Claude kan endre utseendet uten å endre innholdet. Ved skjemaendringer må kode ha bakoverkompatibilitet eller eksplisitt datamigrering. Ubrukte felt må ikke slettes automatisk.

## 2.5 Sikkerhet og robusthet
Autentisering, rollebaserte rettigheter, CSRF-beskyttelse ved sesjoner, rate limits, opplastingskontroll, MIME-/filvalidering, private lagringsnøkler, audit log, API-nøkkelrotasjon og idempotente agentkall. Beskytt mot XSS i riktekst, prompt-injeksjon i eksternt innhold og usikre filformater. Publiserte API-er skal ikke returnere utkast eller interne felter. Backup av både DB og medielager; test faktisk restore.

## 2.6 CI/CD
Claude Code → pull request → tester/migrasjonssjekk → godkjent merge → deploy. Databaseinnhold og mediefiler blir stående. Miljøer: utvikling, staging og produksjon; separate databaser/medielagre. Staging kan bruke anonymiserte kopier, aldri direkte skrivetilgang til produksjon.
