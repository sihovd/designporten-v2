<?php
/**
 * Serves a built page (…/index.html) with the published CMS texts and
 * Studio's catalogue in place.
 * Apache sends page requests here (see .htaccess). If anything goes wrong,
 * the page is served exactly as built.
 *
 * Once Studio has saved the shop (api/cms/data/butikk.json), the product
 * pages come from the product template, so products Studio added have a
 * page too, and every product grid shows Studio's catalogue
 * (api/_katalog.php).
 */

declare(strict_types=1);

require_once __DIR__ . '/_side.php';
require_once dirname(__DIR__) . '/_katalog.php';

$rot = dirname(__DIR__, 2);
$base = dp_butikk_base();
$sti = rawurldecode((string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/'));

$katalog = null;
try {
    $over = dp_butikk_overstyring(__DIR__ . '/data/butikk.json');
    $bygget = $over ? dp_butikk_bygget() : null;
    if ($bygget) $katalog = dp_butikk_flett($bygget, $over);
} catch (Throwable $e) {
    // Serve the pages as built.
    error_log('Designporten side: ' . $e->getMessage());
}

$html = null;
$fant = true;
$relativ = str_starts_with($sti, $base) ? substr($sti, strlen($base)) : null;
if ($katalog && $relativ !== null && preg_match('~^produkter/(kategori/)?([a-z0-9]+(?:-[a-z0-9]+)*)/$~D', $relativ, $m)) {
    try {
        if ($m[1] === '') {
            $html = dp_katalog_produktside($katalog, $m[2]);
            if ($html === null && dp_katalog_malfil() !== null) $fant = false;
        } elseif (!dp_katalog_har_kategori($katalog, $m[2])) {
            $fant = false;
        }
    } catch (Throwable $e) {
        error_log('Designporten produktside: ' . $e->getMessage());
        $html = null;
    }
}

if ($html === null) {
    $fil = false;
    if ($fant && $relativ !== null && str_ends_with($sti, '/') && !preg_match('~(?:^|/)\.|\\\\|\x00~', $relativ)) {
        $fil = realpath($rot . '/' . $relativ . 'index.html');
        if ($fil && !str_starts_with($fil, $rot . DIRECTORY_SEPARATOR)) $fil = false;
    }
    if (!$fil || !is_file($fil)) {
        http_response_code(404);
        $fil = $rot . '/404.html';
    }
    $html = (string) file_get_contents($fil);
    if ($katalog && http_response_code() !== 404) {
        try {
            $html = dp_katalog_side($html, $katalog);
        } catch (Throwable $e) {
            // Keep the built shop.
            error_log('Designporten side: ' . $e->getMessage());
        }
    }
}

try {
    $html = cms_sett_inn($html, cms_les_publisert(__DIR__ . '/data'));
} catch (Throwable) {
    // Serve the page as built.
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
