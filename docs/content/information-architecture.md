# Information architecture and pages

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Covers site structure, navigation, product discovery and presentation, special orders, business services, inspiration, about and contact.

## Site map

```
/                         Hjem (logo)
/produkter/               Produkter
  /produkter/<kategori>/    Personlige gaver · Interiør · Figurer · Tilbehør · Bedrift · Spesialbestillinger
  /produkter/<produkt>/     Product page
/skaperverksted/          Skaperverksted (generator hub)
  /skaperverksted/signgen/  Signgen
  /skaperverksted/lampe/    Lamp generator
  /skaperverksted/drage/    Articulated dragon generator
/spesialdesign/           Spesialdesign + idéskjema
/bedrift/                 For bedrifter
/inspirasjon/             Inspirasjon (projects, stories, guides)
  /inspirasjon/<sak>/
/om/                      Om Designporten
/kontakt/                 Kontakt
/handlekurv/, /kasse/     Cart and checkout (commerce platform)
/personvern/, /vilkar/, /frakt-og-levering/
```

URL slugs are Norwegian, lowercase, without æøå (`vilkar`, not `vilkår`). Final slugs are confirmed in Phase 0.

## Navigation

- **Main:** Produkter · Skaperverksted · Spesialdesign · For bedrifter · Inspirasjon · Om · Kontakt.
- **Logo = home.** No «Hjem» item (Sivert, 2026-09-03).
- **Utilities:** search, cart; account when accounts exist.
- **Priority on narrower desktop widths:** if seven items do not fit, «Om» and «Kontakt» move to the utility area first; the three paths (Produkter, Skaperverksted, Spesialdesign) always stay visible.
- **Mobile:** menu button + cart only. The sheet lists the paths first (Produkter, Skaperverksted, Spesialdesign), then the rest, then search and contact details.
- **Footer:** the paths, categories, For bedrifter, Inspirasjon, Om, Kontakt, legal pages, contact details, social links. Dark `--verksted` surface. Newsletter only if Sivert actually runs one.
- **Search:** products, categories, inspiration articles and generators. Placeholder: «Søk etter produkt, materiale eller mål».

## Homepage

**Section order (design revision 2026-10-02):**

1. **Hero** — full-width picture, «Vi gir ideer form», «Start å skape» + «Fortell oss ideen din». See [interaction-and-motion.md](../design/interaction-and-motion.md#homepage-hero).
2. **Populære produkter** — five product cards (four on tablets and phones) and «Se utvalget». Confirmed products first; placeholders are marked.
3. **Three small cards** — Finn noe (Ferdige produkter) / Lag noe (Skaperverksted) / Har du en idé? (opens the enquiry modal). Separate, compact cards with a picture, one line and an arrow; hover lifts 2 px, nothing grows.
4. **Process timeline** — «Slik blir en idé til et ferdig produkt», 6 steps.
5. **Proof** — real projects only (renders nothing until one is confirmed).
6. **Skaperverksted portal** — soft transition into graphite and the four Forge tools as compact cards.
7. Footer.

Removed in this revision: the print-animation hero, the three-doors band, the featured-product composition, the top slider and the idea band.

## Vårt utvalg (Produkter)

**Revised 2026-10-02 (§9, §10, §25).** Menu and heading «Vårt utvalg», short hero («Designet og laget av oss. Kanskje finner du akkurat det du leter etter.»). Desktop (≥1024 px): a sticky left column with category, sorting, colours, materials and «Kan få egen tekst». Below 1024 px: a category pill row and a «Filter» button that opens the same panel in a bottom sheet. «Finner du ikke det du leter etter?» stays at the bottom and opens the enquiry modal. The card's cart control keeps «+» in one place; it opens upwards and downwards into a vertical pill (count above, «−» below) and collapses to a small purple count badge.


**Purpose:** explore existing products and feel their material, detail and scale. Not a generic dropshipping store.

- **Categories:** Personlige gaver · Interiør · Figurer · Tilbehør · Bedrift · Spesialbestillinger. «Spesialbestillinger» links into Spesialdesign rather than listing products.
- **Listing:** the preserved card grid (square, fixed width, centred, max 6 across). Category filter as a row; sort (Utvalgt, Nyeste, Pris, Navn A–Å). Facets for material, colour and price only once the data exists; never shown disabled on the live site.
- **Personalisation cue:** products that accept custom text or are made in a generator are marked with a small mono tag («Egen tekst», «Lag i Skaperverksted»).
- **Quick view:** the product window (see interaction doc).
- **Product page:** large imagery with detail, scale (the object next to a hand or known object, with dimensions in mm), material choice with what it tolerates, colour choice, personalisation, price, delivery information when documented, «Legg i handlekurv». A "how it was made" strip reuses the process slider visual language. If the product has a generator, a clear link «Tilpass i Skaperverksted».
- **Materials explained plainly:** PLA for things that should look good indoors, PETG for sun, water and use, resin for fine detail (test bench copy, kept).

## Skaperverksted (public hub)

- The hub page is the showroom side of the portal: what you can make, each generator with a real preview, and what happens after you design (we print it, or you order it).
- Each generator card states honestly whether it is available or coming later. No fake «Kommer snart» tiles for tools that are not planned.
- The editors themselves are specified in [skaperverksted.md](../design/skaperverksted.md).

## Spesialdesign and the enquiry form

**Revised 2026-10-02 (§13–§18).** Full-width picture hero, two entries (Privatkunde / Bedriftskunde) and the process timeline; the page ends there. **One enquiry form** (`Foresporsel.astro` + `klient.ts`) for every place: first Privatperson / Bedrift, then «Hva har du å starte med?» (4 options), with fields shown for the chosen type (private: navn, e-post, telefon, beskrivelse, filer, mål, frist; business adds firmanavn, organisasjonsnummer, kontaktperson, antall, materialønske, tekniske krav). It opens as a modal (`ForesporselModal.astro`) from any `data-apne-foresporsel` link (`data-kundetype`, `data-start` preselect); `/foresporsel/` is the same form as a page without JavaScript. Uploads: JPG, PNG, HEIC, WebP, PDF, STL, 3MF, STEP/STP, OBJ, SVG; up to 8 files and 18 MB in total (the limit of e-mail delivery), with previews (image thumbnails, PDF tile, STL/3MF rendered in 3D) and a field for a link to larger files. Kontakt keeps a short message form.

The text below describes the earlier version and is kept for history.


**Mental model:** DU TRENGER IKKE HA EN FERDIG MODELL. START MED IDEEN.

Customers may arrive with a problem, a drawing, a photograph, a broken part, an idea, measurements, a reference object, or «Kan dere lage noe sånt som dette?». The page invites all of them explicitly.

- **Opening:** «Har du tegningen, bildet eller bare ideen? Vi hjelper deg å gjøre den fysisk.»
- **Four starting points** (from the concepts, kept): «Jeg har en idé», «Jeg har en tegning eller et bilde», «Jeg har en 3D-modell» (STL, 3MF, STEP, OBJ), «Jeg trenger en del» (something broke: send photos and measurements). Each opens the form with the right fields emphasised.
- **Process:** the process slider with the 6-step service flow IDÉ → DIALOG → DESIGN → PROTOTYPE → PRODUKSJON → FERDIG PRODUKT.
- **What it costs and how long it takes:** only documented facts. The test bench claims («svar innen 1–2 dager», «en forespørsel koster ingenting før du har sett hva den ender på», «filen er din å beholde») are candidates that Sivert must confirm before publishing.

### Idea form

Short and human. Required fields are minimal.

| Field | Required | Notes |
|---|---|---|
| Hva vil du lage? | Yes | Free text, generous size, example text in the placeholder |
| Last opp bilder, skisser, mål eller filer | No | Drag and drop and camera on mobile; JPG, PNG, HEIC, PDF, STL, 3MF, STEP, OBJ; size limit set in Phase 1 |
| Omtrentlige mål | No | Free text or W × H × D in mm |
| Antall | No | 1, 2–10, 11–100, 100+ |
| Til når? | No | Date or «ingen hast» |
| Navn | Yes | |
| E-post | Yes | |
| Telefon | No | |
| Privat eller bedrift | No | Toggle; shows company name for bedrift |

- One primary button: «Send ideen».
- A plain confirmation page says what happens next and when (only documented timings).
- Delivery: e-mail to Designporten plus a stored copy (mechanism decided with the stack). Never «posts nowhere»: the Aug 2026 prototype form did, and that must not be repeated.
- Privacy: a short line on how files and details are used, linked to /personvern/.

## For bedrifter

**Positioning:** an idea and production partner for businesses, not a conventional print shop.

- **Services:** prototyper, småserier, grafisk design, profilering, produktutvikling, idépartner. The live site also lists 3D-logos, office signs, brackets and 3D scanning/reproduction; scanning stays only if Sivert confirms the capability.
- Each service shows a real example (Inspirasjon case) and what a business sends to start.
- **Signgen for business:** named signs for offices, events and staff via CSV batch, shown only when batch generation exists.
- **Contact:** the idea form with «bedrift» preselected, plus direct e-mail/phone.
- No invented client logos or quotes. The concept's «Nordlys Eiendom» quote is a placeholder and is not used.

## Inspirasjon

- **Types:** Prosjekter (cases), Historier (from idea to object), Prosess (how things are made), Guider (useful content, for example choosing a material).
- Filter by type; cards use the editorial layout, not the product grid.
- Case template: the problem, the starting material (sketch, photo, part), the process in stages with images, the result, materials and dimensions. The process slider can be reused inside a case.
- Every case links to the matching path: the product, the generator or the idea form.

## Om Designporten

- The workshop, the story and the people behind it. Real photographs of the workspace and printers.
- Starting text from the test bench is kept as a draft: «Designporten er et lite verksted som både tegner og produserer …».
- Facts (years, printers, materials, delivered projects) only when confirmed. The test bench's fact tiles are placeholders.

## Kontakt

- Very low friction: the short version of the idea form on the page itself, plus e-mail, phone and opening hours when Sivert provides them.
- The concept details («hei@designporten.no», «+47 123 45 678», «Man–fre 09–17») are placeholders and are not used.
- FAQ only with real questions and answers.

## Cart and checkout

- Behind the `CommerceProvider` boundary (ADR-001). No custom cart, checkout or payment engine. Until a hosted provider account exists, the cart is sent as an order request and the page says clearly that no payment is taken.
- Payment methods planned: card via Stripe, and Vipps.
- The earlier test bench's shipping options and prices (69/89/179 kr) are placeholders.
- Skaperverksted orders add a configured item to the same cart, with the design file and a preview image attached.
