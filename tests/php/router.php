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

header('X-Robots-Tag: noindex, nofollow');
if (!str_starts_with($sti, $base)) { http_response_code(404); echo 'Outside test site'; return; }
$relativ = substr($sti, strlen($base));
if (preg_match('~(?:^|/)\.|\\\\|\x00~', $relativ)) { http_response_code(403); return; }
foreach (['api/foresporsel/', 'api/bestilling/'] as $api) {
    if ($relativ === $api || $relativ === $api . 'index.php') { require $rot . '/' . $api . 'index.php'; return; }
}
if (str_ends_with($relativ, '.php')) { http_response_code(403); return; }
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
