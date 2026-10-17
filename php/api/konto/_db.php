<?php
/**
 * The account module's own base: settings, database connection, rate
 * limits and the sign-in cookie's name. The accounts no longer lean on the
 * CMS core, so they run with the CMS switched off or not installed
 * (Sivert's work order «tjenesteplattform», 2026-10-17; docs/konto.md).
 *
 * Settings come from api/konto/konfig.php. Until that file exists, the
 * CMS's api/cms/konfig.php is read instead, as before, so a web host that
 * already runs accounts on the CMS database keeps working. Only the file is
 * read: no CMS code is loaded.
 */

declare(strict_types=1);

const KONTO_INNLOGGING_FORSOK = 10;
const KONTO_INNLOGGING_VINDU = 15 * 60;

final class KontoFeil extends RuntimeException
{
    public function __construct(string $melding, public readonly int $status = 400)
    {
        parent::__construct($melding);
    }
}

/** Which settings file is in use: 'konto', 'cms' (the compatibility fallback) or null (switched off). */
function konto_kilde(): ?string
{
    return konto_konfig_med_kilde()[1];
}

function konto_konfig(): ?array
{
    return konto_konfig_med_kilde()[0];
}

/** @return array{0: ?array, 1: ?string} */
function konto_konfig_med_kilde(): array
{
    static $svar = null;
    if ($svar !== null) return $svar;
    if (PHP_SAPI === 'cli-server') {
        // the test servers (scripts/*.test.mjs, tests/php/router.php) define these instead of files
        if (defined('DP_KONTO_KONFIG')) return $svar = [DP_KONTO_KONFIG, 'konto'];
        if (defined('DP_CMS_KONFIG')) return $svar = [DP_CMS_KONFIG, 'cms'];
    }
    foreach (['konto' => __DIR__ . '/konfig.php', 'cms' => dirname(__DIR__) . '/cms/konfig.php'] as $kilde => $fil) {
        if (!is_file($fil)) continue;
        $k = require $fil;
        if (is_array($k) && !empty($k['dsn'])) return $svar = [$k, $kilde];
    }
    return $svar = [null, null];
}

function konto_bygg(): array
{
    static $bygg = null;
    if ($bygg === null) {
        $fil = dirname(__DIR__) . '/bygg.php';
        $bygg = is_file($fil) ? require $fil : [];
    }
    return $bygg;
}

function konto_base(): string
{
    return konto_bygg()['base'] ?? '/';
}

/**
 * The sign-in cookie. A test build has its own name (and its own path, the
 * base), so signing out on a test site never touches a sign-in on the real one.
 */
function konto_kakenavn(): string
{
    return !empty(konto_bygg()['test']) ? 'dp_konto_test' : 'dp_konto';
}

function konto_na(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function konto_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

function konto_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** The connection, without running migrations (the read-only survey uses this). */
function konto_pdo(): PDO
{
    static $db = null;
    if ($db instanceof PDO) return $db;
    $k = konto_konfig();
    if ($k === null) throw new KontoFeil('Brukerkontoer er ikke slått på på denne serveren ennå.', 503);
    $db = new PDO((string) $k['dsn'], $k['bruker'] ?? null, $k['passord'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if (konto_driver($db) === 'sqlite') {
        $db->exec('PRAGMA busy_timeout = 5000');
        $db->exec('PRAGMA journal_mode = WAL');
    }
    return $db;
}

function konto_driver(PDO $db): string
{
    return (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME);
}

function konto_en(string $sql, array $verdier = []): ?array
{
    $s = konto_db()->prepare($sql);
    $s->execute($verdier);
    $rad = $s->fetch();
    return $rad === false ? null : $rad;
}

function konto_alle(string $sql, array $verdier = []): array
{
    $s = konto_db()->prepare($sql);
    $s->execute($verdier);
    return $s->fetchAll();
}

function konto_kjor(string $sql, array $verdier = []): int
{
    $s = konto_db()->prepare($sql);
    $s->execute($verdier);
    return $s->rowCount();
}

// ---------------------------------------------------------------- Rate limits (own table, migration 2)

function konto_begrens(string $nokkel, int $maks, int $vindu): void
{
    $na = time();
    konto_kjor('DELETE FROM dp_konto_forsok WHERE tid < ?', [$na - 86400]);
    $antall = (int) konto_en('SELECT COUNT(*) AS n FROM dp_konto_forsok WHERE nokkel = ? AND tid >= ?', [$nokkel, $na - $vindu])['n'];
    if ($antall >= $maks) throw new KontoFeil('For mange forsøk. Vent litt og prøv igjen.', 429);
}

function konto_registrer_forsok(string $nokkel): void
{
    konto_kjor('INSERT INTO dp_konto_forsok (nokkel, tid) VALUES (?, ?)', [$nokkel, time()]);
}
