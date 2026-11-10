<?php
/**
 * The shop as Studio (the CMS) has set it. The build writes the catalogue
 * from the product files to api/katalog.json; what Sivert changes in Studio →
 * Butikk og betaling is written to api/cms/data/butikk.json (never served)
 * and laid over it here. Payment, order requests and the pages all read the
 * shop through dp_butikk_katalog(), so they never disagree.
 *
 * Only these fields can be changed in Studio: status, price, text surcharge,
 * name and descriptions per product, and the card payment switch and
 * shipping for the shop. Pictures, colours, materials and sizes still come
 * from the build. No database here: a visit never waits for the CMS.
 */

declare(strict_types=1);

const DP_BUTIKK_PRODUKTFELT = ['status', 'prisOre', 'tilleggOre', 'navn', 'kortBeskrivelse', 'beskrivelse'];

/** What Studio has published, or [] when nothing has been changed there. */
function dp_butikk_overstyring(?string $fil = null): array
{
    if ($fil === null && PHP_SAPI === 'cli-server' && defined('DP_LOKAL_BUTIKK')) return DP_LOKAL_BUTIKK;
    $fil ??= __DIR__ . '/cms/data/butikk.json';
    if (!is_file($fil)) return [];
    $data = json_decode((string) file_get_contents($fil), true);
    return is_array($data) ? $data : [];
}

/**
 * The catalogue with Studio's changes laid over it. Pure: anything in $over
 * that does not have the right form is ignored, and the build's value stays.
 */
function dp_butikk_flett(array $katalog, array $over): array
{
    $produkter = is_array($over['produkter'] ?? null) ? $over['produkter'] : [];
    foreach ($katalog['produkter'] as &$p) {
        $o = $produkter[$p['id']] ?? null;
        if (!is_array($o)) continue;
        if (in_array($o['status'] ?? null, ['bekreftet', 'plassholder'], true)) $p['status'] = $o['status'];
        if (array_key_exists('prisOre', $o) && ($o['prisOre'] === null || (is_int($o['prisOre']) && $o['prisOre'] > 0))) {
            $p['prisOre'] = $o['prisOre'];
        }
        if (!empty($p['egenTekst']) && array_key_exists('tilleggOre', $o)
            && ($o['tilleggOre'] === null || (is_int($o['tilleggOre']) && $o['tilleggOre'] > 0))) {
            $p['egenTekst']['tilleggOre'] = $o['tilleggOre'];
        }
        foreach (['navn', 'kortBeskrivelse', 'beskrivelse'] as $felt) {
            if (is_string($o[$felt] ?? null) && trim($o[$felt]) !== '') $p[$felt] = $o[$felt];
        }
    }
    unset($p);
    $butikk = is_array($katalog['butikk'] ?? null) ? $katalog['butikk'] : ['betaling' => false, 'frakt' => []];
    if (is_bool($over['betaling'] ?? null)) $butikk['betaling'] = $over['betaling'];
    if (is_array($over['frakt'] ?? null) && array_is_list($over['frakt'])) $butikk['frakt'] = $over['frakt'];
    $katalog['butikk'] = $butikk;
    return $katalog;
}

/** The build's catalogue (api/katalog.json) as it was built, or null if it is missing. */
function dp_butikk_bygget(): ?array
{
    $fil = __DIR__ . '/katalog.json';
    $k = is_file($fil) ? json_decode((string) file_get_contents($fil), true) : null;
    return is_array($k) && is_array($k['produkter'] ?? null) ? $k : null;
}

/** The catalogue the shop sells from: the build's, with Studio's changes. */
function dp_butikk_katalog(): ?array
{
    $k = dp_butikk_bygget();
    return $k === null ? null : dp_butikk_flett($k, dp_butikk_overstyring());
}

/** «12 345 kr», like formaterKroner() in src/lib/handel/kurv.ts (whole kroner, no-break spaces). */
function dp_butikk_kroner(int $ore): string
{
    return number_format(round($ore / 100), 0, ',', "\u{00A0}") . "\u{00A0}kr";
}

// ---------------------------------------------------------------- Pages

/** Set or remove the bare `hidden` attribute in a tag's attribute text. */
function dp_butikk_skjult(string $attr, bool $skjult): string
{
    $attr = (string) preg_replace('~\shidden(?:=""|="hidden")?(?=[\s/]|$)~', '', $attr);
    return $skjult ? $attr . ' hidden' : $attr;
}

function dp_butikk_html(string $t): string
{
    return htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

/**
 * A built page with Studio's product changes in place. The build marks what
 * may change with data-butikk="<id>#<felt>": navn (text), pris (text, hidden
 * without a price), status (the «Plassholder» label), plassholder (the
 * placeholder note) and beskrivelse (a run of <p>). Product pages also get
 * their title, description, search-index rule and structured data updated.
 * Scripts on the page read the same changes from <script id="dp-butikk">
 * (src/lib/handel/overstyring.ts). Anything not of the expected shape is
 * left as built.
 */
function dp_butikk_side(string $html, array $bygget, array $over, string $sti = ''): string
{
    $endret = is_array($over['produkter'] ?? null) ? $over['produkter'] : [];
    if (!$endret) return $html;
    $alle = array_column(dp_butikk_flett($bygget, $over)['produkter'], null, 'id');
    $for = array_column($bygget['produkter'], null, 'id');
    $produkter = array_filter($alle, fn($id) => is_array($endret[$id] ?? null), ARRAY_FILTER_USE_KEY);
    if (!$produkter) return $html;

    $html = (string) (preg_replace_callback(
        '~<([a-z][a-z0-9]*)\b([^>]*?\sdata-butikk="([a-z0-9-]+)#(navn|pris|beskrivelse)"[^>]*)>([^<]*|(?:\s*<p\b[^>]*>[^<]*</p>)+\s*)</\1>~',
        function (array $m) use ($produkter): string {
            $p = $produkter[$m[3]] ?? null;
            if (!$p) return $m[0];
            [$tagg, $attr, $felt, $innhold] = [$m[1], $m[2], $m[4], $m[5]];
            if ($felt === 'navn') {
                if (str_contains($innhold, '<')) return $m[0];
                return "<$tagg$attr>" . dp_butikk_html($p['navn']) . "</$tagg>";
            }
            if ($felt === 'pris') {
                if (str_contains($innhold, '<')) return $m[0];
                $pris = is_int($p['prisOre']) ? dp_butikk_kroner($p['prisOre']) : '';
                return '<' . $tagg . dp_butikk_skjult($attr, $pris === '') . '>' . dp_butikk_html($pris) . "</$tagg>";
            }
            $tekst = (string) ($p['beskrivelse'] ?? $p['kortBeskrivelse'] ?? '');
            if ($tekst === '' || !str_contains($innhold, '<p')) return $m[0];
            $apning = preg_match('~<p\b[^>]*>~', $innhold, $a) ? $a[0] : '<p>';
            $deler = array_map(fn($x) => $apning . dp_butikk_html($x) . '</p>', preg_split('/\n\s*\n/', $tekst) ?: []);
            return "<$tagg$attr>" . implode('', $deler) . "</$tagg>";
        },
        $html,
    ) ?? $html);

    $html = (string) (preg_replace_callback(
        '~<([a-z][a-z0-9]*)\b([^>]*\sdata-butikk="([a-z0-9-]+)#(status|plassholder)"[^>]*?)(/?)>~',
        function (array $m) use ($produkter): string {
            $p = $produkter[$m[3]] ?? null;
            if (!$p) return $m[0];
            return '<' . $m[1] . dp_butikk_skjult($m[2], $p['status'] !== 'plassholder') . $m[5] . '>';
        },
        $html,
    ) ?? $html);

    // The product's own page: head, search index and structured data.
    if (preg_match('~/produkter/([a-z0-9-]+)/$~', $sti, $s) && isset($produkter[$s[1]], $for[$s[1]])) {
        $p = $produkter[$s[1]];
        $b = $for[$s[1]];
        $erstatt = function (string $html, string $monster, string $gammel, string $ny): string {
            if ($gammel === $ny) return $html;
            return (string) (preg_replace_callback($monster, fn($m) => str_replace(dp_butikk_html($gammel), dp_butikk_html($ny), $m[0]), $html) ?? $html);
        };
        $html = $erstatt($html, '~<title>[^<]*</title>|<meta\s+(?:property|name)="(?:og|twitter):title"[^>]*>~', $b['navn'], $p['navn']);
        $html = $erstatt($html, '~<meta\s+(?:name="description"|property="og:description"|name="twitter:description")[^>]*>~',
            (string) ($b['kortBeskrivelse'] ?? ''), (string) $p['kortBeskrivelse']);
        $salgbar = $p['status'] === 'bekreftet' && is_int($p['prisOre']);
        if ($p['status'] === 'bekreftet') $html = (string) preg_replace('~<meta name="robots" content="noindex">\s*~', '', $html);
        $html = (string) (preg_replace_callback('~<script type="application/ld\+json">(.*?)</script>~s', function (array $m) use ($p, $salgbar): string {
            $d = json_decode($m[1], true);
            if (!is_array($d) || ($d['@type'] ?? '') !== 'Product') return $m[0];
            if (!$salgbar) return '';
            $d['name'] = $p['navn'];
            $d['description'] = $p['kortBeskrivelse'];
            if (is_array($d['offers'] ?? null)) $d['offers']['price'] = number_format($p['prisOre'] / 100, 2, '.', '');
            return '<script type="application/ld+json">' . json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . '</script>';
        }, $html) ?? $html);
    }

    // For the scripts: only what they show or check, per changed product.
    $klient = [];
    foreach ($produkter as $id => $p) {
        $klient[$id] = ['navn' => $p['navn'], 'status' => $p['status'], 'prisOre' => $p['prisOre'],
            'kortBeskrivelse' => $p['kortBeskrivelse'], 'tilleggOre' => $p['egenTekst']['tilleggOre'] ?? null];
    }
    $skript = '<script type="application/json" id="dp-butikk">'
        . json_encode($klient, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . '</script>';
    $ny = preg_replace('~</head>~', $skript . '</head>', $html, 1, $antall);
    return $antall === 1 && is_string($ny) ? $ny : $html;
}
