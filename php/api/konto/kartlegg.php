<?php
/**
 * Read-only survey of the database before a migration (work order
 * «tjenesteplattform», plan section 5.2). Only a signed-in CMS
 * administrator may call it. It answers with counts only, never names,
 * e-mail addresses or signs, and it does not run migrations or write
 * anything. Remove it from the web host once the numbers are noted.
 *
 *   GET api/konto/kartlegg.php
 */

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_admin.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');

function kartlegg_svar(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') throw new KontoFeil('Feil metode.', 405);
    konto_krev_admin();
    if (konto_konfig() === null) kartlegg_svar(['oppsett' => null, 'merknad' => 'Kontoene er ikke slått på her.']);
    $db = konto_pdo();
    $driver = konto_driver($db);
    $navn = $driver === 'sqlite'
        ? $db->query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN)
        : $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $tabeller = [];
    foreach ($navn as $t) {
        if (!preg_match('/^(dp|cms|sf)_[a-z0-9_]+$/D', (string) $t)) continue;
        $tabeller[$t] = (int) $db->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    }
    $tall = fn(string $sql) => (int) $db->query($sql)->fetchColumn();
    $har = fn(string $t) => array_key_exists($t, $tabeller);
    $svar = [
        'oppsett' => konto_kilde(),
        'database' => $driver,
        'tabeller' => $tabeller,
        'migrering' => [
            'konto' => $har('dp_konto_migrering') ? $tall('SELECT COALESCE(MAX(versjon), 0) FROM dp_konto_migrering') : null,
            'cms' => $har('cms_migrering') ? $tall('SELECT COALESCE(MAX(versjon), 0) FROM cms_migrering') : null,
        ],
    ];
    if ($har('dp_medlemmer')) {
        $svar['medlemmer'] = [
            'aktive' => $tall('SELECT COUNT(*) FROM dp_medlemmer WHERE aktiv = 1'),
            'deaktiverte' => $tall('SELECT COUNT(*) FROM dp_medlemmer WHERE aktiv <> 1'),
            'eposterMedDuplikatUtenomStoreSmaBokstaver' => $tall(
                'SELECT COUNT(*) FROM (SELECT LOWER(epost) AS e FROM dp_medlemmer GROUP BY LOWER(epost) HAVING COUNT(*) > 1) d',
            ),
        ];
    }
    if ($har('dp_skilt')) {
        $svar['galleri'] = [
            'synlige' => $tall('SELECT COUNT(*) FROM dp_skilt WHERE skjult = 0'),
            'skjulte' => $tall('SELECT COUNT(*) FROM dp_skilt WHERE skjult <> 0'),
            'medEier' => $tall('SELECT COUNT(*) FROM dp_skilt WHERE medlem_id IS NOT NULL'),
            'utenEier' => $tall('SELECT COUNT(*) FROM dp_skilt WHERE medlem_id IS NULL'),
        ];
    }
    if ($har('dp_konto_okter')) $svar['gyldigeInnlogginger'] = $tall('SELECT COUNT(*) FROM dp_konto_okter WHERE utloper >= ' . time());
    kartlegg_svar($svar);
} catch (KontoFeil $f) {
    kartlegg_svar(['feil' => $f->getMessage()], $f->status);
} catch (Throwable $e) {
    error_log('Designporten kartlegging: ' . $e->getMessage());
    kartlegg_svar(['feil' => 'Noe gikk galt på serveren.'], 500);
}
