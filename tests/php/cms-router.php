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
    define('DP_KONTO_KONFIG', ['dsn' => $konfig['dsn'], 'bruker' => $konfig['bruker'], 'passord' => $konfig['passord']]);
}
$sti = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if ($sti === '/api/cms/') { require $rot . '/api/cms/index.php'; return; }
if ($sti === '/api/konto/') { require $rot . '/api/konto/index.php'; return; }
if ($sti === '/blogg' || str_starts_with($sti, '/blogg/') || $sti === '/api/cms/blogg.php') { require $rot . '/api/cms/blogg.php'; return; }
if ($sti === '/sitemap.xml') { $_GET['kart'] = '1'; require $rot . '/api/cms/blogg.php'; return; }
// Like medier/.htaccess: only the picture files the CMS made.
if (preg_match('~^/medier/[0-9]{4}/[a-z0-9-]+\.(webp|jpg|png)$~', $sti, $m) && is_file($rot . $sti)) {
    header('Content-Type: image/' . ($m[1] === 'jpg' ? 'jpeg' : $m[1]));
    readfile($rot . $sti);
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
