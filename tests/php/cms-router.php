<?php
// Local-only router for the CMS API tests (scripts/cms.test.mjs). NEVER copied into dist/.
declare(strict_types=1);

$rot = getenv('DP_CMS_ROT');
define('DP_CMS_KONFIG', ['dsn' => 'sqlite:' . $rot . '/cms.sqlite', 'oppsettkode' => 'test-oppsettkode-1234']);
$sti = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if ($sti === '/api/cms/') { require $rot . '/api/cms/index.php'; return; }
if (str_ends_with($sti, '/') && is_file($rot . $sti . 'index.html') && is_file($rot . '/api/cms/data/publisert.json')) {
    require $rot . '/api/cms/side.php';
    return;
}
$fil = $rot . $sti . (str_ends_with($sti, '/') ? 'index.html' : '');
if (!is_file($fil)) { http_response_code(404); return; }
header('Content-Type: text/html; charset=utf-8');
readfile($fil);
