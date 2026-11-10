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
// X-DP-Test-Cms: av runs a request as on a server without the CMS (no database).
if (($_SERVER['HTTP_X_DP_TEST_CMS'] ?? '') !== 'av') {
    define('DP_CMS_KONFIG', ['dsn' => 'sqlite:' . $cmsdb, 'oppsettkode' => 'lokal-test-oppsettkode']);
}
// Accounts: their own settings and their own file, never the CMS's settings (no legacy fallback in tests).
$kontodb = getenv('DP_KONTO_DB') ?: __DIR__ . '/../../var/konto-test.sqlite';
define('DP_KONTO_KONFIG', [
    'dsn' => 'sqlite:' . $kontodb,
    'offentlig_adresse' => 'http://127.0.0.1:' . $_SERVER['SERVER_PORT'],
    // captured outside dist/, so it is never in a package
    'epost' => ['driver' => 'fil', 'mappe' => getenv('DP_KONTO_POST') ?: dirname(__DIR__, 2) . '/var/konto-post'],
]);

// Stripe: never the real API. X-DP-Test-Stripe picks a test-mode or live key,
// X-DP-Test-Katalog: pris gives one product a price and turns card payment on
// (test data only, never in a build). The fake records what it was sent.
$stripeTest = $_SERVER['HTTP_X_DP_TEST_STRIPE'] ?? '';
if ($stripeTest !== '') {
    define('DP_STRIPE_KONFIG', [
        'hemmelig_nokkel' => ($stripeTest === 'live' ? 'sk_live_' : 'sk_test_') . 'lokaltestnokkel123',
        'webhook_hemmelighet' => 'whsec_lokaltest',
        'nettsted_url' => 'http://127.0.0.1:' . $_SERVER['SERVER_PORT'] . rtrim($base, '/'),
        'tillat_live' => $stripeTest === 'live',
    ]);
    define('DP_STRIPE_DATA', getenv('DP_STRIPE_DATA') ?: dirname(__DIR__, 2) . '/var/stripe-data');
}
// X-DP-Test-Kortbetaling: av is Studio with the card switch off (api/_butikk.php), whatever the repository ships.
if (($_SERVER['HTTP_X_DP_TEST_KORTBETALING'] ?? '') === 'av') define('DP_LOKAL_BUTIKK', ['betaling' => false]);
if (($_SERVER['HTTP_X_DP_TEST_KATALOG'] ?? '') === 'pris') {
    $k = json_decode((string) file_get_contents($rot . '/api/katalog.json'), true);
    foreach ($k['produkter'] as &$p) {
        if ($p['id'] === 'spiralvase') { $p['status'] = 'bekreftet'; $p['prisOre'] = 12300; }
    }
    unset($p);
    $k['butikk'] = ['betaling' => true, 'frakt' => [['navn' => 'Testfrakt', 'prisOre' => 4500, 'dagerMin' => 2, 'dagerMaks' => 4]]];
    define('DP_LOKAL_KATALOG', $k);
}
function dp_stripe_fake(string $metode, string $sti, array $kropp, string $idempotens): array
{
    $mappe = dirname(__DIR__, 2) . '/var/stripe-fake';
    if (!is_dir($mappe)) mkdir($mappe, 0700, true);
    if (($_SERVER['HTTP_X_DP_TEST_STRIPE_SVAR'] ?? '') === 'feil') return ['ok' => false, 'status' => 500, 'melding' => 'fake failure'];
    if ($metode === 'POST' && $sti === '/checkout/sessions') {
        file_put_contents("$mappe/$idempotens.json", json_encode($kropp, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return ['ok' => true, 'data' => ['id' => 'cs_test_fake' . $idempotens, 'url' => 'https://checkout.stripe.invalid/c/pay/' . $idempotens]];
    }
    if ($metode === 'GET' && preg_match('~^/checkout/sessions/(cs_[A-Za-z0-9_]+)/line_items~', $sti)) {
        return ['ok' => true, 'data' => ['data' => [['description' => 'Spiralvase', 'quantity' => 1, 'amount_total' => 12300]]]];
    }
    if ($metode === 'GET' && preg_match('~^/checkout/sessions/(cs_[A-Za-z0-9_]+)$~', $sti, $m)) {
        if (str_contains($m[1], 'ukjent')) return ['ok' => false, 'status' => 404, 'melding' => 'No such session'];
        return ['ok' => true, 'data' => [
            'payment_status' => str_contains($m[1], 'ubetalt') ? 'unpaid' : 'paid',
            'client_reference_id' => 'DP-TEST-REF', 'amount_total' => 16800,
        ]];
    }
    return ['ok' => false, 'status' => 400, 'melding' => "fake: $metode $sti"];
}

header('X-Robots-Tag: noindex, nofollow');
if (!str_starts_with($sti, $base)) { http_response_code(404); echo 'Outside test site'; return; }
$relativ = substr($sti, strlen($base));
if (preg_match('~(?:^|/)\.|\\\\|\x00~', $relativ)) { http_response_code(403); return; }
foreach (['api/foresporsel/', 'api/bestilling/', 'api/kasse/', 'api/kasse/okt/', 'api/stripe/webhook/'] as $api) {
    if ($relativ === $api || $relativ === $api . 'index.php') { require $rot . '/' . $api . 'index.php'; return; }
}
if ($relativ === 'api/cms/' || $relativ === 'api/cms/index.php') { require $rot . '/api/cms/index.php'; return; }
if ($relativ === 'api/konto/' || $relativ === 'api/konto/index.php') { require $rot . '/api/konto/index.php'; return; }
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
