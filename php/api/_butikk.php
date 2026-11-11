<?php
/**
 * The shop's catalogue as Studio (the CMS) keeps it. Sivert 2026-11-11:
 * everything about a product lives in the CMS database on one.com, so no
 * product change needs a new build or GitHub.
 *
 * The build writes its products to api/katalog.json (the starting point,
 * plus the lists a product may choose from). Every save in Studio →
 * Butikk og betaling writes api/cms/data/butikk.json (never served), and
 * dp_butikk_katalog() lays it over the build's catalogue:
 *  - a product the build has can be changed in every field, or hidden;
 *  - a product Studio added exists only there;
 *  - pictures in butikk.json are already resolved from the media library.
 * Payment, order requests and the pages (api/_katalog.php) all read the
 * catalogue through here, so they never disagree. No database here: a visit
 * never waits for the CMS. Anything in butikk.json that does not have the
 * right form is ignored, and the build's value stays.
 */

declare(strict_types=1);

const DP_BUTIKK_ID = '/^[a-z0-9]+(?:-[a-z0-9]+)*$/';

/** What Studio has published, or [] when nothing has been changed there. */
function dp_butikk_overstyring(?string $fil = null): array
{
    if ($fil === null && PHP_SAPI === 'cli-server' && defined('DP_LOKAL_BUTIKK')) return DP_LOKAL_BUTIKK;
    $fil ??= __DIR__ . '/cms/data/butikk.json';
    if (!is_file($fil)) return [];
    $data = json_decode((string) file_get_contents($fil), true);
    return is_array($data) ? $data : [];
}

/** The build's catalogue (api/katalog.json) as it was built, or null if it is missing. */
function dp_butikk_bygget(): ?array
{
    $fil = __DIR__ . '/katalog.json';
    $k = is_file($fil) ? json_decode((string) file_get_contents($fil), true) : null;
    return is_array($k) && is_array($k['produkter'] ?? null) ? $k : null;
}

/** The build's base path ('/' on designporten.no). */
function dp_butikk_base(): string
{
    static $base = null;
    if ($base !== null) return $base;
    $fil = __DIR__ . '/bygg.php';
    $b = is_file($fil) ? require $fil : [];
    return $base = is_string($b['base'] ?? null) ? $b['base'] : '/';
}

/**
 * The lists a product chooses from: colours (id → {id, navn, hex}), material
 * types (type → description), categories (slug → {slug, navn, ingress}) and
 * Skaperverksted tools (id → navn). From the build; an older build without
 * them gets what its own products use.
 */
function dp_butikk_referanse(array $katalog): array
{
    $r = is_array($katalog['referanse'] ?? null) ? $katalog['referanse'] : [];
    $farger = [];
    foreach ($r['farger'] ?? [] as $f) {
        if (is_string($f['id'] ?? null)) $farger[$f['id']] = ['id' => $f['id'], 'navn' => (string) $f['navn'], 'hex' => (string) ($f['hex'] ?? '#cccccc')];
    }
    $materialer = [];
    foreach ($r['materialtyper'] ?? [] as $m) {
        if (is_string($m['type'] ?? null)) $materialer[$m['type']] = (string) ($m['beskrivelse'] ?? '');
    }
    $kategorier = [];
    foreach ($r['kategorier'] ?? [] as $k) {
        if (is_string($k['slug'] ?? null)) $kategorier[$k['slug']] = ['slug' => $k['slug'], 'navn' => (string) $k['navn'], 'ingress' => (string) ($k['ingress'] ?? '')];
    }
    $generatorer = [];
    foreach ($r['generatorer'] ?? [] as $g) {
        if (is_string($g['id'] ?? null)) $generatorer[$g['id']] = (string) $g['navn'];
    }
    foreach ($katalog['produkter'] ?? [] as $p) {
        foreach ($p['farger'] ?? [] as $f) $farger[$f['id']] ??= ['id' => $f['id'], 'navn' => $f['navn'], 'hex' => '#cccccc'];
        foreach ($p['materialer'] ?? [] as $m) $materialer[$m] ??= '';
        if (isset($p['kategori'])) $kategorier[$p['kategori']] ??= ['slug' => $p['kategori'], 'navn' => (string) ($p['kategoriNavn'] ?? $p['kategori']), 'ingress' => ''];
        if (!empty($p['generator'])) $generatorer[$p['generator']] ??= $p['generator'];
    }
    return ['farger' => $farger, 'materialer' => $materialer, 'kategorier' => $kategorier, 'generatorer' => $generatorer];
}

function dp_butikk_ore_ok(mixed $v): bool
{
    return $v === null || (is_int($v) && $v > 0);
}

function dp_butikk_tekst_ok(mixed $v): bool
{
    return is_string($v) && trim($v) !== '';
}

/** A picture as the pages use it, or null when $v is not one. */
function dp_butikk_bilde(mixed $v): ?array
{
    if (!is_array($v) || !is_string($v['src'] ?? null) || $v['src'] === '' || !is_string($v['alt'] ?? null)) return null;
    $b = (int) ($v['bredde'] ?? 0);
    $h = (int) ($v['hoyde'] ?? 0);
    if ($b < 1 || $h < 1) return null;
    $ut = ['src' => $v['src'], 'alt' => $v['alt'], 'bredde' => $b, 'hoyde' => $h,
        'konsept' => (bool) ($v['konsept'] ?? false), 'midlertidig' => (bool) ($v['midlertidig'] ?? false)];
    if (is_string($v['srcset'] ?? null) && $v['srcset'] !== '') $ut['srcset'] = $v['srcset'];
    if (!empty($v['utklipp'])) $ut['utklipp'] = true;
    return $ut;
}

/** Outer dimensions in millimetres, or null. Returns false when $v has the wrong form. */
function dp_butikk_mal(mixed $v): array|null|false
{
    if ($v === null) return null;
    if (!is_array($v)) return false;
    $ut = [];
    foreach (['bredde', 'dybde', 'hoyde'] as $k) {
        if (!is_int($v[$k] ?? null) && !is_float($v[$k] ?? null)) return false;
        if ($v[$k] <= 0 || $v[$k] > 10000) return false;
        $ut[$k] = $v[$k] + 0;
    }
    return $ut;
}

/**
 * One product with Studio's values laid over it. $p is the build's product
 * (or a bare ['id' => …] for a product only Studio has). Returns null when
 * the result is not a complete product.
 */
function dp_butikk_produkt(array $p, array $o, array $ref): ?array
{
    if (in_array($o['status'] ?? null, ['bekreftet', 'plassholder'], true)) $p['status'] = $o['status'];
    if (array_key_exists('prisOre', $o) && dp_butikk_ore_ok($o['prisOre'])) $p['prisOre'] = $o['prisOre'];
    foreach (['navn', 'kortBeskrivelse', 'beskrivelse'] as $felt) {
        if (dp_butikk_tekst_ok($o[$felt] ?? null)) $p[$felt] = $o[$felt];
    }
    if (is_string($o['kategori'] ?? null) && isset($ref['kategorier'][$o['kategori']])) $p['kategori'] = $o['kategori'];
    if (isset($o['bilde']) && ($b = dp_butikk_bilde($o['bilde']))) {
        $p['bildeData'] = $b;
    }
    if (array_key_exists('bildeAlternativ', $o)) {
        if ($o['bildeAlternativ'] === null) $p['bildeAlternativ'] = null;
        elseif ($b = dp_butikk_bilde($o['bildeAlternativ'])) $p['bildeAlternativ'] = $b;
    }
    if (array_key_exists('mal', $o) && ($m = dp_butikk_mal($o['mal'])) !== false) $p['mal'] = $m;
    if (is_array($o['materialer'] ?? null) && array_is_list($o['materialer'])) {
        $m = array_values(array_unique(array_filter($o['materialer'], fn($t) => is_string($t) && isset($ref['materialer'][$t]))));
        if ($m) $p['materialer'] = $m;
    }
    if (is_array($o['farger'] ?? null) && array_is_list($o['farger'])) {
        $f = array_values(array_unique(array_filter($o['farger'], fn($id) => is_string($id) && isset($ref['farger'][$id]))));
        if ($f) $p['farger'] = array_map(fn($id) => ['id' => $id, 'navn' => $ref['farger'][$id]['navn']], $f);
    }
    if (array_key_exists('egenTekst', $o)) {
        $e = $o['egenTekst'];
        if ($e === null) $p['egenTekst'] = null;
        elseif (is_array($e) && is_int($e['maksTegn'] ?? null) && $e['maksTegn'] >= 1 && $e['maksTegn'] <= 60
            && dp_butikk_ore_ok($e['tilleggOre'] ?? null)) {
            $p['egenTekst'] = ['maksTegn' => $e['maksTegn'], 'tilleggOre' => $e['tilleggOre'] ?? null];
        }
    } elseif (!empty($p['egenTekst']) && array_key_exists('tilleggOre', $o) && dp_butikk_ore_ok($o['tilleggOre'])) {
        // Studio's first version only set the surcharge.
        $p['egenTekst']['tilleggOre'] = $o['tilleggOre'];
    }
    if (array_key_exists('generator', $o) && ($o['generator'] === null || (is_string($o['generator']) && isset($ref['generatorer'][$o['generator']])))) {
        $p['generator'] = $o['generator'];
    }
    if (is_int($o['rekkefolge'] ?? null)) $p['rekkefolge'] = $o['rekkefolge'];
    if (is_string($o['lagtTil'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $o['lagtTil'])) $p['lagtTil'] = $o['lagtTil'];

    // Complete? (A product only Studio has must bring everything itself.)
    foreach (['navn', 'kortBeskrivelse', 'kategori', 'status'] as $k) {
        if (!is_string($p[$k] ?? null) || $p[$k] === '') return null;
    }
    if (empty($p['bildeData']) || empty($p['materialer']) || empty($p['farger'])) return null;
    if (!isset($ref['kategorier'][$p['kategori']])) return null;
    $p['prisOre'] = array_key_exists('prisOre', $p) && dp_butikk_ore_ok($p['prisOre']) ? $p['prisOre'] : null;
    $p['beskrivelse'] = dp_butikk_tekst_ok($p['beskrivelse'] ?? null) ? $p['beskrivelse'] : $p['kortBeskrivelse'];
    $p['kategoriNavn'] = $ref['kategorier'][$p['kategori']]['navn'];
    $p['bilde'] = $p['bildeData']['src'];
    $p['bildeAlternativ'] ??= null;
    $p['mal'] ??= null;
    $p['egenTekst'] ??= null;
    $p['generator'] ??= null;
    $p['rekkefolge'] = is_int($p['rekkefolge'] ?? null) ? $p['rekkefolge'] : 1000;
    $p['lagtTil'] = is_string($p['lagtTil'] ?? null) ? $p['lagtTil'] : gmdate('Y-m-d');
    $p['href'] = dp_butikk_base() . 'produkter/' . $p['id'] . '/';
    return $p;
}

/**
 * The catalogue with Studio's changes laid over it. Pure. Products come in
 * the shop's own order (Studio's «rekkefølge», then name).
 */
function dp_butikk_flett(array $katalog, array $over): array
{
    $ref = dp_butikk_referanse($katalog);
    $endret = is_array($over['produkter'] ?? null) ? $over['produkter'] : [];
    $ut = [];
    $sett = [];
    foreach ($katalog['produkter'] as $p) {
        $sett[$p['id']] = true;
        $o = is_array($endret[$p['id']] ?? null) ? $endret[$p['id']] : [];
        if (!empty($o['skjult'])) continue;
        $p['bildeData'] ??= is_string($p['bilde'] ?? null)
            ? ['src' => $p['bilde'], 'alt' => $p['navn'], 'bredde' => 900, 'hoyde' => 900, 'konsept' => false, 'midlertidig' => false]
            : null;
        $p['kategori'] ??= array_key_first(array_filter($ref['kategorier'], fn($k) => $k['navn'] === ($p['kategoriNavn'] ?? null))) ?? null;
        $ferdig = dp_butikk_produkt($p, $o, $ref);
        if ($ferdig) $ut[] = $ferdig;
    }
    foreach ($endret as $id => $o) {
        if (isset($sett[$id]) || !is_string($id) || !preg_match(DP_BUTIKK_ID, $id) || !is_array($o) || !empty($o['skjult'])) continue;
        $ferdig = dp_butikk_produkt(['id' => $id], $o, $ref);
        if ($ferdig) $ut[] = $ferdig;
    }
    $sammenlign = class_exists('Collator') ? [new Collator('nb_NO'), 'compare'] : 'strcasecmp';
    usort($ut, fn($a, $b) => $a['rekkefolge'] <=> $b['rekkefolge'] ?: $sammenlign($a['navn'], $b['navn']));
    $katalog['produkter'] = $ut;
    $butikk = is_array($katalog['butikk'] ?? null) ? $katalog['butikk'] : ['betaling' => false, 'frakt' => []];
    if (is_bool($over['betaling'] ?? null)) $butikk['betaling'] = $over['betaling'];
    if (is_array($over['frakt'] ?? null) && array_is_list($over['frakt'])) $butikk['frakt'] = $over['frakt'];
    $katalog['butikk'] = $butikk;
    return $katalog;
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
