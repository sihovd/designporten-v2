<?php
/**
 * Pages built from Studio's catalogue (php/api/_butikk.php), so a product
 * that is added or changed in Studio shows on the site at once, without a
 * new build. Used by api/cms/side.php once Studio has saved the shop.
 *
 * The build renders a product template (src/lib/handel/mal.ts) to
 * api/cms/maler/produkt.html: a whole product page and, in its «Flere
 * produkter» grid, one product card. Values are «§felt§»; parts that depend
 * on the product sit between <!--hvis:felt--> and <!--/hvis:felt-->, and
 * repeated parts between <!--gjenta:felt--> and <!--/gjenta:felt-->. Only
 * those exact shapes are touched, and every value is HTML-escaped.
 *
 * Built pages mark what comes from the catalogue: product grids
 * (data-produktrutenett with data-utvalg), the listing's filters and data,
 * and the homepage note. Those are rewritten from Studio's catalogue; the
 * rest of the page stays as built. The browser gets the same catalogue in
 * <script type="application/json" id="dp-katalog"> (src/lib/handel/overstyring.ts).
 */

declare(strict_types=1);

require_once __DIR__ . '/_butikk.php';

const DP_KATALOG_NETTSTED = 'https://designporten.no';

function dp_katalog_html(mixed $t): string
{
    return htmlspecialchars((string) $t, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

function dp_katalog_json(mixed $v): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR);
}

/** «120 × 80 × 45 mm», like formaterMal() in src/lib/handel/visning.ts. */
function dp_katalog_mal(?array $mal): ?string
{
    if (!$mal) return null;
    $f = function ($n): string {
        $n = round((float) $n, 1);
        $tekst = number_format($n, fmod($n, 1.0) === 0.0 ? 0 : 1, ',', '');
        // nb-NO groups thousands with a no-break space.
        return (string) preg_replace('/\B(?=(\d{3})+(?!\d))/', "\u{00A0}", $tekst);
    };
    return $f($mal['bredde']) . ' × ' . $f($mal['dybde']) . ' × ' . $f($mal['hoyde']) . ' mm';
}

/**
 * A product the way the browser code uses it (ProduktVisning in
 * src/lib/handel/visning.ts).
 */
function dp_katalog_visning(array $p, array $ref): array
{
    return [
        'id' => $p['id'],
        'navn' => $p['navn'],
        'status' => $p['status'],
        'kategori' => $p['kategori'],
        'kategoriNavn' => $p['kategoriNavn'],
        'kortBeskrivelse' => $p['kortBeskrivelse'],
        'href' => $p['href'],
        'bilde' => $p['bildeData'],
        'bildeAlternativ' => $p['bildeAlternativ'],
        'mal' => $p['mal'],
        'prisOre' => $p['prisOre'],
        'materialer' => array_map(fn($t) => ['type' => $t, 'beskrivelse' => $ref['materialer'][$t] ?? ''], $p['materialer']),
        'farger' => array_map(fn($f) => ['id' => $f['id'], 'navn' => $f['navn'], 'hex' => $ref['farger'][$f['id']]['hex'] ?? '#cccccc'], $p['farger']),
        'egenTekst' => $p['egenTekst'],
        'generator' => $p['generator'],
    ];
}

// ---------------------------------------------------------------- The template

/**
 * Fill a piece of the template: repeated parts, then the parts that depend
 * on the product, then the values. Unknown values become empty.
 *
 * @param array<string,scalar|null> $felt  value per «§felt§»
 * @param array<string,bool>        $hvis  whether each <!--hvis:felt--> part stays
 * @param array<string,list<array<string,scalar>>> $gjenta values per repeat
 */
function dp_mal_fyll(string $html, array $felt, array $hvis = [], array $gjenta = []): string
{
    $html = (string) (preg_replace_callback('~<!--gjenta:([a-zA-Z.]+)-->(.*?)<!--/gjenta:\1-->~s', function (array $m) use ($gjenta): string {
        $ut = '';
        foreach ($gjenta[$m[1]] ?? [] as $verdier) $ut .= dp_mal_verdier($m[2], $verdier);
        return $ut;
    }, $html) ?? $html);
    do {
        $for = $html;
        $html = (string) (preg_replace_callback('~<!--hvis:([a-zA-Z.]+)-->((?:(?!<!--hvis:).)*?)<!--/hvis:\1-->~s',
            fn(array $m) => !empty($hvis[$m[1]]) ? $m[2] : '', $html) ?? $html);
    } while ($html !== $for);
    return dp_mal_verdier($html, $felt);
}

function dp_mal_verdier(string $html, array $felt): string
{
    // A picture without widths has no srcset at all.
    $html = (string) preg_replace_callback('~\ssrcset="§([a-zA-Z.]+)§"~', fn($m) => ($felt[$m[1]] ?? '') === '' ? '' : $m[0], $html);
    return (string) preg_replace_callback('~§([a-zA-Z.]+)§~', fn($m) => dp_katalog_html($felt[$m[1]] ?? ''), $html);
}

/** The values for a picture's «§<navn>.src§» and so on. */
function dp_mal_bilde(string $navn, ?array $b): array
{
    if (!$b) return [];
    return ["$navn.src" => $b['src'], "$navn.srcset" => $b['srcset'] ?? '', "$navn.alt" => $b['alt'],
        "$navn.bredde" => $b['bredde'], "$navn.hoyde" => $b['hoyde']];
}

/** The built template (api/cms/maler/produkt.html), or null when it is missing. */
function dp_katalog_malfil(): ?string
{
    static $mal = false;
    if ($mal !== false) return $mal;
    $fil = __DIR__ . '/cms/maler/produkt.html';
    return $mal = is_file($fil) ? (string) file_get_contents($fil) : null;
}

/** The product card from the template: one <li> of the «Flere produkter» grid. */
function dp_katalog_kortmal(string $mal): ?string
{
    if (!preg_match('~<ul\b[^>]*\sdata-utvalg="relatert"[^>]*>\s*(<li\b.*?</li>)\s*</ul>~s', $mal, $m)) return null;
    return $m[1];
}

/** One product card, as ProduktKort.astro renders it inside ProduktRutenett.astro. */
function dp_katalog_kort(string $kortmal, array $p, array $ref, int $nr, string $nivaa = 'h3', bool $skjult = false): string
{
    $v = dp_katalog_visning($p, $ref);
    $felt = [
        'id' => $p['id'],
        'json' => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        'href' => $p['href'],
        'navn' => $p['navn'],
        'spek' => dp_katalog_mal($p['mal']) ?? $p['kategoriNavn'],
        'pris' => $p['prisOre'] !== null ? dp_butikk_kroner($p['prisOre']) : '',
        'lasting' => $nr < 6 ? 'eager' : 'lazy',
    ] + dp_mal_bilde('bilde', $p['bildeData']) + dp_mal_bilde('alt', $p['bildeAlternativ']);
    $hvis = [
        'alt' => (bool) $p['bildeAlternativ'],
        'egenTekst' => (bool) $p['egenTekst'],
        'bareGenerator' => !$p['egenTekst'] && $p['generator'],
        'plassholder' => $p['status'] === 'plassholder',
        'pris' => $p['prisOre'] !== null,
        'bilde.konsept' => !empty($p['bildeData']['konsept']),
        'alt.konsept' => !empty($p['bildeAlternativ']['konsept']),
    ];
    $html = dp_mal_fyll($kortmal, $felt, $hvis);
    if (!$p['bildeAlternativ']) $html = (string) preg_replace('~(<article\b[^>]*?)\sdata-alternativ(?:="[^"]*")?~', '$1', $html, 1);
    if ($nivaa !== 'h3' && preg_match('/^h[2-4]$/', $nivaa)) {
        $html = (string) preg_replace('~<h3(\s[^>]*class="produktkort__navn")~', "<$nivaa$1", $html, 1);
        $html = (string) preg_replace('~</h3>~', "</$nivaa>", $html, 1);
    }
    if ($skjult) $html = (string) preg_replace('~^<li\b[^>]*~', '$0 hidden', $html, 1);
    return $html;
}

// ---------------------------------------------------------------- Choosing products

/** Ids in a category ('alle' = every one), in the listing's «Utvalgt» order. */
function dp_katalog_i_kategori(array $produkter, string $kategori): array
{
    return array_values(array_filter($produkter, fn($p) => $kategori === 'alle' || $p['kategori'] === $kategori));
}

/** The homepage's five: confirmed products first; until there are any, the first ones. */
function dp_katalog_populaere(array $produkter): array
{
    $bekreftede = array_values(array_filter($produkter, fn($p) => $p['status'] === 'bekreftet'));
    return array_slice($bekreftede ?: $produkter, 0, 5);
}

/** «Flere produkter» on a product page: the same category first, at most six. */
function dp_katalog_relaterte(array $produkter, array $p): array
{
    $samme = array_filter($produkter, fn($x) => $x['id'] !== $p['id'] && $x['kategori'] === $p['kategori']);
    $andre = array_filter($produkter, fn($x) => $x['id'] !== $p['id'] && $x['kategori'] !== $p['kategori']);
    return array_slice([...$samme, ...$andre], 0, 6);
}

/** Replace the cards of every grid on the page marked with data-utvalg. */
function dp_katalog_rutenett(string $html, string $kortmal, array $katalog, array $ref, ?array $side = null): string
{
    $produkter = $katalog['produkter'];
    $aktiv = preg_match('~\sdata-produktliste\b[^>]*\sdata-aktiv="([a-z0-9-]+)"~', $html, $m) ? $m[1] : 'alle';
    return (string) (preg_replace_callback('~(<ul\b[^>]*\sdata-produktrutenett\b[^>]*>)(.*?)(</ul>)~s',
        function (array $m) use ($kortmal, $produkter, $ref, $side, $aktiv): string {
            if (!preg_match('~\sdata-utvalg="([a-z]+)"~', $m[1], $u)) return $m[0];
            $nivaa = preg_match('~\sdata-nivaa="(h[2-4])"~', $m[1], $n) ? $n[1] : 'h3';
            $kort = '';
            if ($u[1] === 'liste') {
                $synlige = dp_katalog_i_kategori($produkter, $aktiv);
                $vis = array_column($synlige, 'id', 'id');
                $rest = array_filter($produkter, fn($p) => !isset($vis[$p['id']]));
                foreach ([...$synlige, ...$rest] as $i => $p) $kort .= dp_katalog_kort($kortmal, $p, $ref, $i, $nivaa, !isset($vis[$p['id']]));
            } else {
                $utvalg = $u[1] === 'populaere' ? dp_katalog_populaere($produkter) : ($side ? dp_katalog_relaterte($produkter, $side) : []);
                foreach (array_values($utvalg) as $i => $p) $kort .= dp_katalog_kort($kortmal, $p, $ref, $i, $nivaa);
            }
            return $m[1] . $kort . $m[3];
        }, $html) ?? $html);
}

/** Set or remove the bare `hidden` attribute on every tag with attribute $attr="$verdi" (or any value). */
function dp_katalog_skjul(string $html, string $attr, callable $skjul): string
{
    return (string) (preg_replace_callback('~<([a-z]+)\b([^>]*\s' . preg_quote($attr, '~') . '(?:="([^"]*)")?)(\s[^>]*)?>~',
        function (array $m) use ($skjul): string {
            $attrs = $m[2] . ($m[4] ?? '');
            $attrs = (string) preg_replace('~\shidden(?:=""|="hidden")?(?=[\s/]|$)~', '', $attrs);
            return '<' . $m[1] . $attrs . ($skjul(html_entity_decode($m[3] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8')) ? ' hidden' : '') . '>';
        }, $html) ?? $html);
}

function dp_katalog_antall(int $n): string
{
    return $n === 1 ? '1 produkt' : "$n produkter";
}

/** The listing («Vårt utvalg» and the category pages): filters, sort options and the data liste.ts reads. */
function dp_katalog_liste(string $html, array $katalog, array $ref): string
{
    if (!preg_match('~\sdata-produktliste\b[^>]*\sdata-aktiv="([a-z0-9-]+)"~', $html, $m)) return $html;
    $aktiv = $m[1];
    $produkter = $katalog['produkter'];
    $kategorier = array_unique(array_column($produkter, 'kategori'));
    $farger = array_unique(array_merge(...array_map(fn($p) => array_column($p['farger'], 'id'), $produkter ?: [['farger' => []]])));
    $materialer = array_unique(array_merge(...array_map(fn($p) => $p['materialer'], $produkter ?: [['materialer' => []]])));
    $harTekst = (bool) array_filter($produkter, fn($p) => (bool) $p['egenTekst']);

    $html = dp_katalog_skjul($html, 'data-kategori-plass', fn($slug) => !in_array($slug, $kategorier, true));
    $html = dp_katalog_skjul($html, 'data-farge-plass', fn($id) => !in_array($id, $farger, true));
    $html = dp_katalog_skjul($html, 'data-materiale-plass', fn($t) => !in_array($t, $materialer, true));
    $html = dp_katalog_skjul($html, 'data-filtergruppe', fn($g) => match ($g) {
        'farge' => count($farger) < 2, 'materiale' => count($materialer) < 2, 'tekst' => !$harTekst, default => false,
    });
    $html = dp_katalog_skjul($html, 'data-plassholdernotis', fn() => !array_filter($produkter, fn($p) => $p['status'] === 'plassholder'));

    // Sort options that mean something for this data (tilgjengeligeSorteringer() in src/lib/handel/katalog.ts).
    $priset = count(array_filter($produkter, fn($p) => $p['prisOre'] !== null));
    $datoer = count(array_unique(array_column($produkter, 'lagtTil')));
    if ($priset < 2) $html = (string) preg_replace('~<option value="pris"[^>]*>[^<]*</option>~', '', $html);
    if ($datoer < 2) $html = (string) preg_replace('~<option value="nyeste"[^>]*>[^<]*</option>~', '', $html);

    $synlige = count(dp_katalog_i_kategori($produkter, $aktiv));
    $html = (string) preg_replace('~(<[a-z]+\b[^>]*\sdata-liste-antall(?:-knapp)?\b[^>]*>)[^<]*(</)~', '${1}' . dp_katalog_antall($synlige) . '$2', $html);

    // The data liste.ts sorts and filters with.
    $grunnlag = array_map(fn($p) => [
        'id' => $p['id'], 'navn' => $p['navn'], 'kategori' => $p['kategori'], 'prisOre' => $p['prisOre'],
        'utvalgt' => $p['rekkefolge'], 'nyeste' => strtotime($p['lagtTil'] . 'T00:00:00Z') * 1000,
        'farger' => array_column($p['farger'], 'id'), 'materialer' => $p['materialer'], 'egenTekst' => (bool) $p['egenTekst'],
    ], $produkter);
    $tekster = ['alle' => ['tittel' => 'Vårt utvalg', 'ingress' => 'Designet og laget av oss. Kanskje finner du akkurat det du leter etter.',
        'href' => dp_butikk_base() . 'produkter/']];
    if (preg_match('~<script type="application/json" data-produktliste-data>(.*?)</script>~s', $html, $d)) {
        $bygget = json_decode($d[1], true);
        if (is_array($bygget['tekster']['alle'] ?? null)) $tekster['alle'] = $bygget['tekster']['alle'];
    }
    foreach ($ref['kategorier'] as $slug => $k) {
        if (in_array($slug, $kategorier, true)) {
            $tekster[$slug] = ['tittel' => $k['navn'], 'ingress' => $k['ingress'], 'href' => dp_butikk_base() . "produkter/kategori/$slug/"];
        }
    }
    $data = dp_katalog_json(['grunnlag' => $grunnlag, 'tekster' => $tekster]);
    return (string) (preg_replace_callback('~(<script type="application/json" data-produktliste-data>).*?(</script>)~s', fn($m) => $m[1] . $data . $m[2], $html) ?? $html);
}

/** For the browser: every product as ProduktVisning, and which product this page is about. */
function dp_katalog_klient(string $html, array $katalog, array $ref, ?string $side = null): string
{
    $produkter = [];
    foreach ($katalog['produkter'] as $p) $produkter[$p['id']] = dp_katalog_visning($p, $ref);
    $skript = '<script type="application/json" id="dp-katalog">'
        . dp_katalog_json(['produkter' => (object) $produkter, 'side' => $side]) . '</script>';
    $ny = preg_replace('~</head>~', $skript . '</head>', $html, 1, $antall);
    return $antall === 1 && is_string($ny) ? $ny : $html;
}

/**
 * A built page with Studio's catalogue in place. Pages without products are
 * returned unchanged.
 */
function dp_katalog_side(string $html, array $katalog): string
{
    $harKort = str_contains($html, 'data-produktrutenett');
    if (!$harKort && !str_contains($html, 'data-trenger-katalog')) return $html;
    $ref = dp_butikk_referanse($katalog);
    if ($harKort) {
        $mal = dp_katalog_malfil();
        $kortmal = $mal ? dp_katalog_kortmal($mal) : null;
        if ($kortmal === null) return $html;
        $html = dp_katalog_rutenett($html, $kortmal, $katalog, $ref);
        $html = dp_katalog_liste($html, $katalog, $ref);
        $html = dp_katalog_skjul($html, 'data-bare-plassholdere',
            fn() => (bool) array_filter(dp_katalog_populaere($katalog['produkter']), fn($p) => $p['status'] !== 'plassholder'));
    }
    return dp_katalog_klient($html, $katalog, $ref);
}

/** Whether a category page has anything to show. */
function dp_katalog_har_kategori(array $katalog, string $slug): bool
{
    return (bool) array_filter($katalog['produkter'], fn($p) => $p['kategori'] === $slug);
}

/** A product's own page, from the template. Null when the product does not exist (or the template is missing). */
function dp_katalog_produktside(array $katalog, string $id): ?string
{
    $mal = dp_katalog_malfil();
    if ($mal === null) return null;
    $produkter = array_column($katalog['produkter'], null, 'id');
    $p = $produkter[$id] ?? null;
    if (!$p) return null;
    $ref = dp_butikk_referanse($katalog);
    $base = dp_butikk_base();

    $kortmal = dp_katalog_kortmal($mal);
    $relaterte = dp_katalog_relaterte($katalog['produkter'], $p);
    $samme = array_filter($relaterte, fn($x) => $x['kategori'] === $p['kategori']);
    $kategoriNavn = $p['kategoriNavn'];
    $felt = [
        'id' => $p['id'], 'navn' => $p['navn'], 'kortBeskrivelse' => $p['kortBeskrivelse'], 'href' => $p['href'],
        'kategori' => $p['kategori'], 'kategoriNavn' => $kategoriNavn,
        'mal' => dp_katalog_mal($p['mal']) ?? '',
        'materialer' => implode(', ', $p['materialer']),
        'maksTegn' => $p['egenTekst']['maksTegn'] ?? '',
        'generator' => $p['generator'] ?? '',
        'relatertTittel' => $samme ? 'Mer fra ' . mb_strtolower($kategoriNavn) : 'Flere produkter',
    ] + dp_mal_bilde('bilde', $p['bildeData']);
    $hvis = [
        'plassholder' => $p['status'] === 'plassholder',
        'mal' => (bool) $p['mal'], 'utenMal' => !$p['mal'],
        'egenTekst' => (bool) $p['egenTekst'],
        'generator' => (bool) $p['generator'],
        'relatert' => (bool) $relaterte,
        'bilde.konsept' => !empty($p['bildeData']['konsept']),
    ];
    $avsnitt = array_values(array_filter(array_map('trim', preg_split('/\n\s*\n/', $p['beskrivelse']) ?: []), fn($a) => $a !== ''));
    $gjenta = [
        'avsnitt' => array_map(fn($a) => ['avsnitt' => $a], $avsnitt ?: [$p['kortBeskrivelse']]),
        'materiale' => array_map(fn($t) => ['m.type' => $t, 'm.beskrivelse' => $ref['materialer'][$t] ?? ''], $p['materialer']),
    ];

    // The page first, then the related cards from the unfilled card template,
    // so the page's values never reach into the cards (or the other way round).
    $html = dp_mal_fyll($mal, $felt, $hvis, $gjenta);
    if ($kortmal !== null) $html = dp_katalog_rutenett($html, $kortmal, $katalog, $ref, $p);

    // Head: the template's address is /produkter/mal/.
    $html = str_replace($base . 'produkter/mal/', $base . 'produkter/' . $p['id'] . '/', $html);
    $bilde = str_starts_with($p['bildeData']['src'], 'http') ? $p['bildeData']['src'] : DP_KATALOG_NETTSTED . $p['bildeData']['src'];
    $html = (string) preg_replace_callback('~<meta\s+property="og:image"\s+content="[^"]*"\s*/?>~',
        fn() => '<meta property="og:image" content="' . dp_katalog_html($bilde) . '">', $html, 1);
    $html = (string) preg_replace('~<meta\s+property="og:image:alt"[^>]*>~', '', $html);
    if ($p['status'] === 'plassholder' && !preg_match('~<meta name="robots"~', $html)) {
        $html = (string) preg_replace('~(<meta name="description"[^>]*>)~', '$1<meta name="robots" content="noindex">', $html, 1);
    }
    // Structured data only for confirmed, priced products: never for placeholders.
    if ($p['status'] === 'bekreftet' && $p['prisOre'] !== null) {
        $data = ['@context' => 'https://schema.org', '@type' => 'Product', 'name' => $p['navn'], 'description' => $p['kortBeskrivelse'],
            'image' => $bilde, 'category' => $kategoriNavn, 'brand' => ['@type' => 'Brand', 'name' => 'Designporten'],
            'offers' => ['@type' => 'Offer', 'priceCurrency' => 'NOK', 'price' => number_format($p['prisOre'] / 100, 2, '.', ''),
                'url' => DP_KATALOG_NETTSTED . $p['href']]];
        $html = (string) preg_replace('~</head>~', '<script type="application/ld+json">' . dp_katalog_json($data) . '</script></head>', $html, 1);
    }
    return dp_katalog_klient($html, $katalog, $ref, $p['id']);
}

/** sitemap.xml with the products and categories Studio has now (confirmed products only). */
function dp_katalog_sitemap(string $xml, array $katalog): string
{
    $base = dp_butikk_base();
    $xml = (string) preg_replace('~\s*<url><loc>[^<]*/produkter/(?:kategori/)?[a-z0-9-]+/</loc>(?:<lastmod>[^<]*</lastmod>)?</url>~', '', $xml);
    $bekreftede = array_filter($katalog['produkter'], fn($p) => $p['status'] === 'bekreftet');
    $nye = '';
    foreach (array_unique(array_column($bekreftede, 'kategori')) as $slug) {
        $nye .= "\n  <url><loc>" . dp_katalog_html(DP_KATALOG_NETTSTED . $base . "produkter/kategori/$slug/") . '</loc></url>';
    }
    foreach ($bekreftede as $p) $nye .= "\n  <url><loc>" . dp_katalog_html(DP_KATALOG_NETTSTED . $p['href']) . '</loc></url>';
    return str_replace('</urlset>', $nye . "\n</urlset>", $xml);
}
