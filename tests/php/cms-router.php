<?php
// Local-only router for the CMS API tests (scripts/cms.test.mjs). NEVER copied into dist/.
declare(strict_types=1);

$rot = getenv('DP_CMS_ROT');
// SQLite by default; DP_CMS_DSN runs the same tests against MySQL/MariaDB (see scripts/cms.test.mjs).
$konfig = [
    'dsn' => getenv('DP_CMS_DSN') ?: 'sqlite:' . $rot . '/cms.sqlite',
    'bruker' => getenv('DP_CMS_BRUKER') ?: null,
    'passord' => getenv('DP_CMS_PASSORD') ?: null,
    'oppsettkode' => 'test-oppsettkode-1234',
];
// The accounts always get their own settings (the same database here); the
// legacy fallback to the CMS's settings is never used in tests.
// DP_UTEN_CMS: no CMS at all. DP_UTEN_KONTO: no account settings (scripts/konto.test.mjs).
if (!getenv('DP_UTEN_CMS')) define('DP_CMS_KONFIG', $konfig);
if (!getenv('DP_UTEN_KONTO')) {
    // e-mail is captured in a folder outside the site (DP_KONTO_POST); without it, e-mail is not set up
    define('DP_KONTO_KONFIG', ['dsn' => $konfig['dsn'], 'bruker' => $konfig['bruker'], 'passord' => $konfig['passord']]
        + (getenv('DP_KONTO_POST') ? ['epost' => ['driver' => getenv('DP_KONTO_EPOSTDRIVER') ?: 'fil', 'mappe' => getenv('DP_KONTO_POST'), 'fra' => 'konto@example.invalid']] : [])
        + ['offentlig_adresse' => 'http://127.0.0.1:' . $_SERVER['SERVER_PORT']]);
}
$sti = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
// Stripe with a test key and a fake Stripe (tests/php/stripe-fake.php, never the real API); no
// shop e-mail settings exist here. X-DP-Test-Stripe: av is a server without Stripe settings.
// Only the accounts and the webhook get Stripe settings; the shop's CMS routes stay as before.
require_once __DIR__ . '/stripe-fake.php';
if (in_array($sti, ['/api/konto/', '/api/stripe/webhook/'], true) && ($_SERVER['HTTP_X_DP_TEST_STRIPE'] ?? '') !== 'av') {
    define('DP_STRIPE_KONFIG', ['hemmelig_nokkel' => 'sk_test_lokaltestnokkel123', 'webhook_hemmelighet' => 'whsec_lokaltest']);
    define('DP_STRIPE_DATA', $rot . '/stripe-data');
}
if ($sti === '/api/cms/') { require $rot . '/api/cms/index.php'; return; }
if ($sti === '/api/konto/') { require $rot . '/api/konto/index.php'; return; }
if ($sti === '/api/stripe/webhook/') { require $rot . '/api/stripe/webhook/index.php'; return; }
if ($sti === '/blogg' || str_starts_with($sti, '/blogg/') || $sti === '/api/cms/blogg.php') { require $rot . '/api/cms/blogg.php'; return; }
if ($sti === '/sitemap.xml') { $_GET['kart'] = '1'; require $rot . '/api/cms/blogg.php'; return; }
// Like api/cms/.htaccess: the CMS's data and the product template are never served.
if (preg_match('~^/api/cms/(?:data|maler)(?:/|$)~', $sti)) { http_response_code(403); return; }
// Like medier/.htaccess: only the picture files the CMS made.
if (preg_match('~^/medier/[0-9]{4}/[a-z0-9-]+\.(webp|jpg|png)$~', $sti, $m) && is_file($rot . $sti)) {
    header('Content-Type: image/' . ($m[1] === 'jpg' ? 'jpeg' : $m[1]));
    readfile($rot . $sti);
    return;
}
// Like .htaccess: Studio's catalogue serves the product and category pages.
if (preg_match('~^/produkter/(?:kategori/)?[a-z0-9-]+/$~', $sti) && is_file($rot . '/api/cms/data/butikk.json')) {
    require $rot . '/api/cms/side.php';
    return;
}
if (str_ends_with($sti, '/') && is_file($rot . $sti . 'index.html') && is_file($rot . '/api/cms/data/publisert.json')) {
    require $rot . '/api/cms/side.php';
    return;
}
$fil = $rot . $sti . (str_ends_with($sti, '/') ? 'index.html' : '');
if (!is_file($fil)) { http_response_code(404); return; }
header('Content-Type: text/html; charset=utf-8');
readfile($fil);
