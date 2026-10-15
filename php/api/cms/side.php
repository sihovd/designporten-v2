<?php
/**
 * Serves a built page (…/index.html) with the published CMS texts in place.
 * Apache sends page requests here (see .htaccess). If anything goes wrong,
 * the page is served exactly as built.
 */

declare(strict_types=1);

require_once __DIR__ . '/_side.php';

$rot = dirname(__DIR__, 2);
$byggfil = $rot . '/api/bygg.php';
$base = (is_file($byggfil) ? (require $byggfil)['base'] : '/') ?? '/';
$sti = rawurldecode((string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/'));

$fil = false;
if (str_starts_with($sti, $base) && str_ends_with($sti, '/')) {
    $relativ = substr($sti, strlen($base));
    if (!preg_match('~(?:^|/)\.|\\\\|\x00~', $relativ)) {
        $fil = realpath($rot . '/' . $relativ . 'index.html');
        if ($fil && !str_starts_with($fil, $rot . DIRECTORY_SEPARATOR)) $fil = false;
    }
}
if (!$fil || !is_file($fil)) {
    http_response_code(404);
    $fil = $rot . '/404.html';
}

$html = (string) file_get_contents($fil);
try {
    $html = cms_sett_inn($html, cms_les_publisert(__DIR__ . '/data'));
} catch (Throwable) {
    // Serve the page as built.
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
