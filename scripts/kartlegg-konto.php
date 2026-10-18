<?php
/**
 * Read-only survey of the account and gallery tables before a migration
 * (work order «tjenesteplattform», plan section 5.2). A command-line tool,
 * never on the web: it runs only when someone starts it with a settings
 * file, and it answers with counts only, never names, e-mail addresses or
 * signs. It does not load the account or CMS code, so nothing migrates, and
 * the connection itself is read-only (SQLite opened read-only, MySQL in a
 * read-only transaction that is rolled back).
 *
 *   php scripts/kartlegg-konto.php --konfig=sti/til/konfig.php
 *
 * The settings file is api/konto/konfig.php or api/cms/konfig.php (any file
 * that returns 'dsn', 'bruker', 'passord'). See docs/konto.md.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function kartlegg_stopp(string $melding, int $kode = 1): never
{
    fwrite(STDERR, $melding . "\n");
    exit($kode);
}

$valg = getopt('', ['konfig:']);
$fil = is_string($valg['konfig'] ?? null) ? $valg['konfig'] : '';
if ($fil === '') kartlegg_stopp("Bruk: php scripts/kartlegg-konto.php --konfig=sti/til/konfig.php\nLeser bare, og skriver bare antall.", 2);
if (!is_file($fil)) kartlegg_stopp("Fant ikke innstillingsfilen $fil.");
$k = require $fil;
if (!is_array($k) || empty($k['dsn']) || !is_string($k['dsn'])) {
    kartlegg_stopp('Innstillingsfilen har ingen dsn. Bruker kontoen CMS-ets database, pek på api/cms/konfig.php i stedet.');
}

$dsn = $k['dsn'];
$sqlite = str_starts_with($dsn, 'sqlite:');
$alternativ = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false];
if ($sqlite) {
    // opening a missing SQLite file would create it
    $sti = substr($dsn, strlen('sqlite:'));
    if (!is_file($sti)) kartlegg_stopp("Fant ikke databasefilen $sti.");
    $alternativ[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY;
}
try {
    $db = new PDO($dsn, $k['bruker'] ?? null, $k['passord'] ?? null, $alternativ);
    if ($sqlite) {
        $db->exec('PRAGMA query_only = ON');
        $navn = $db->query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    } else {
        $db->exec('SET SESSION TRANSACTION READ ONLY');
        $db->exec('START TRANSACTION READ ONLY');
        $navn = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    }

    $tabeller = [];
    foreach ($navn as $t) {
        if (!preg_match('/^(dp|cms|sf)_[a-z0-9_]+$/D', (string) $t)) continue;
        $tabeller[$t] = (int) $db->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    }
    $tall = fn(string $sql) => (int) $db->query($sql)->fetchColumn();
    $har = fn(string $t) => array_key_exists($t, $tabeller);
    $svar = [
        'database' => (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME),
        'tabeller' => (object) $tabeller,
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
    if (!$sqlite) $db->exec('ROLLBACK');
    echo json_encode($svar, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
} catch (PDOException $e) {
    kartlegg_stopp('Kartleggingen feilet: ' . $e->getMessage());
}
