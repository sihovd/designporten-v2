<?php
// Local-only adapter for PHP's development server. NEVER copied into dist/.
declare(strict_types=1);

$rot = realpath(__DIR__ . '/../../dist');
$bygg = require $rot . '/api/bygg.php';
$base = $bygg['base'];
$sti = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');

// The test harness cannot send external mail, even if production settings exist.
define('DP_LOKAL_OPPSETT', ($_SERVER['HTTP_X_DP_TEST_DELIVERY'] ?? '') === 'unconfigured'
    ? null : ['til' => 'capture@example.invalid', 'fra' => 'capture@example.invalid']);
function dp_testmail(string $ref, string $tekst, array $vedlegg): bool
{
    if (($_SERVER['HTTP_X_DP_TEST_DELIVERY'] ?? '') === 'fail') return false;
    $mappe = __DIR__ . '/../../var/php-mail';
    if (!is_dir($mappe)) mkdir($mappe, 0700, true);
    return file_put_contents($mappe . '/' . $ref . '.json', json_encode([
        'referanse' => $ref, 'tekst' => $tekst,
        'vedlegg' => array_map(fn($v) => ['filnavn' => $v['filnavn'], 'innhold' => base64_encode($v['innhold'])], $vedlegg),
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) !== false;
}

// CMS: a local SQLite database instead of one.com's MySQL (DP_CMS_DB picks the file).
$cmsdb = getenv('DP_CMS_DB') ?: __DIR__ . '/../../var/cms-test.sqlite';
if (!is_dir(dirname($cmsdb))) mkdir(dirname($cmsdb), 0700, true);
define('DP_CMS_KONFIG', ['dsn' => 'sqlite:' . $cmsdb, 'oppsettkode' => 'lokal-test-oppsettkode']);

header('X-Robots-Tag: noindex, nofollow');
if (!str_starts_with($sti, $base)) { http_response_code(404); echo 'Outside test site'; return; }
$relativ = substr($sti, strlen($base));
if (preg_match('~(?:^|/)\.|\\\\|\x00~', $relativ)) { http_response_code(403); return; }
foreach (['api/foresporsel/', 'api/bestilling/'] as $api) {
    if ($relativ === $api || $relativ === $api . 'index.php') { require $rot . '/' . $api . 'index.php'; return; }
}
if ($relativ === 'api/cms/' || $relativ === 'api/cms/index.php') { require $rot . '/api/cms/index.php'; return; }
if ($relativ === 'sitemap.xml') { $_GET['kart'] = '1'; require $rot . '/api/cms/blogg.php'; return; }
if ($relativ === 'blogg' || str_starts_with($relativ, 'blogg/') || $relativ === 'api/cms/blogg.php') { require $rot . '/api/cms/blogg.php'; return; }
if (str_ends_with($relativ, '.php') || preg_match('~^api/cms/(data/|nokler\.json)~', $relativ)) { http_response_code(403); return; }
// Like the CMS rule in .htaccess: pages go through side.php once something is published.
if (($relativ === '' || str_ends_with($relativ, '/')) && is_file($rot . '/' . $relativ . 'index.html')
    && is_file($rot . '/api/cms/data/publisert.json')) { require $rot . '/api/cms/side.php'; return; }
$fil = realpath($rot . '/' . $relativ);
if ($fil && is_dir($fil)) {
    if (!str_ends_with($sti, '/')) { header('Location: ' . $sti . '/', true, 301); return; }
    $fil = realpath($fil . '/index.html');
}
if (!$fil || !is_file($fil) || !str_starts_with($fil, $rot . DIRECTORY_SEPARATOR)) {
    http_response_code(404); $fil = $rot . '/404.html';
}
$typer = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css', 'js' => 'text/javascript', 'mjs' => 'text/javascript',
    'json' => 'application/json', 'xml' => 'application/xml; charset=utf-8', 'webmanifest' => 'application/manifest+json', 'svg' => 'image/svg+xml',
    'png' => 'image/png', 'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'ico' => 'image/x-icon',
    'woff' => 'font/woff', 'woff2' => 'font/woff2', 'txt' => 'text/plain'];
header('Content-Type: ' . ($typer[pathinfo($fil, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
readfile($fil);
