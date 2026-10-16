<?php
/**
 * Designporten CMS: the core shared by the API (index.php) and the page
 * server (side.php). See docs/cms/README.md.
 *
 * The database is the source of truth for content. The code in GitHub only
 * supplies each field's default text (api/cms/nokler.json, written by the
 * build). A deploy never touches the database or the data folder, so design
 * changes keep published content (CMS-03).
 *
 * Runs on PHP 8.1+ with PDO: MySQL/MariaDB in production (one.com), SQLite
 * for local development and the automated tests.
 */

declare(strict_types=1);

const CMS_ROLLER = ['admin', 'redaktor', 'agent'];
const CMS_AGENTRETTIGHETER = ['forslag', 'utkast', 'publiser'];
const CMS_MAKS_TEKST = 5000;
const CMS_OKT_MAKS_SEKUNDER = 8 * 3600;
const CMS_INNLOGGING_FORSOK = 10;
const CMS_INNLOGGING_VINDU = 15 * 60;
const CMS_AGENT_KALL_PER_MINUTT = 120;

final class CmsFeil extends RuntimeException
{
    public function __construct(string $melding, public readonly int $status = 400, public readonly array $ekstra = [])
    {
        parent::__construct($melding);
    }
}

/** Settings from api/cms/konfig.php (never in the repository; see konfig.eksempel.php). */
function cms_konfig(): ?array
{
    if (PHP_SAPI === 'cli-server' && defined('DP_CMS_KONFIG')) return DP_CMS_KONFIG;
    $fil = __DIR__ . '/konfig.php';
    if (!is_file($fil)) return null;
    $k = require $fil;
    return is_array($k) && !empty($k['dsn']) ? $k : null;
}

function cms_datamappe(): string
{
    // Fixed place: Apache checks for data/publisert.json before routing pages here.
    $mappe = __DIR__ . '/data';
    if (!is_dir($mappe)) mkdir($mappe, 0750, true);
    return rtrim($mappe, '/\\');
}

function cms_base(): string
{
    $fil = dirname(__DIR__) . '/bygg.php';
    $bygg = is_file($fil) ? require $fil : ['base' => '/'];
    return $bygg['base'] ?? '/';
}

function cms_na(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function cms_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

// ---------------------------------------------------------------- Database

function cms_db(): PDO
{
    static $db = null;
    if ($db instanceof PDO) return $db;
    $k = cms_konfig();
    if ($k === null) throw new CmsFeil('CMS-et er ikke satt opp på denne serveren.', 503);
    $db = new PDO((string) $k['dsn'], $k['bruker'] ?? null, $k['passord'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if (cms_driver($db) === 'sqlite') {
        $db->exec('PRAGMA busy_timeout = 5000');
        $db->exec('PRAGMA journal_mode = WAL');
    }
    cms_migrer($db);
    return $db;
}

function cms_driver(PDO $db): string
{
    return (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME);
}

/**
 * Schema changes, in order. Never edit a step that has shipped: add a new
 * one. Unused columns are left in place, not dropped (plan 2.4).
 */
function cms_migreringer(): array
{
    return [
        1 => [
            'CREATE TABLE cms_brukere (
                id {ID}, epost VARCHAR(191) NULL UNIQUE, navn VARCHAR(191) NOT NULL,
                rolle VARCHAR(16) NOT NULL, passord_hash VARCHAR(255) NULL,
                nokkel_hash CHAR(64) NULL UNIQUE, nokkel_start VARCHAR(16) NULL,
                rettigheter TEXT NOT NULL, aktiv INTEGER NOT NULL DEFAULT 1,
                opprettet VARCHAR(32) NOT NULL, sist_inne VARCHAR(32) NULL
            ){TABELL}',
            'CREATE TABLE cms_innhold (
                id {ID}, nokkel VARCHAR(191) NOT NULL UNIQUE,
                utkast TEXT NULL, publisert TEXT NULL, versjon INTEGER NOT NULL,
                endret VARCHAR(32) NOT NULL, endret_av INTEGER NULL,
                publisert_tid VARCHAR(32) NULL, publisert_av INTEGER NULL
            ){TABELL}',
            'CREATE TABLE cms_revisjoner (
                id {ID}, nokkel VARCHAR(191) NOT NULL, versjon INTEGER NOT NULL,
                handling VARCHAR(24) NOT NULL, verdi TEXT NULL,
                aktor_id INTEGER NULL, opprettet VARCHAR(32) NOT NULL
            ){TABELL}',
            'CREATE INDEX cms_revisjoner_nokkel ON cms_revisjoner (nokkel)',
            'CREATE TABLE cms_forslag (
                id {ID}, nokkel VARCHAR(191) NOT NULL, verdi TEXT NOT NULL,
                begrunnelse TEXT NULL, kilde VARCHAR(191) NULL, aktor_id INTEGER NOT NULL,
                idempotens VARCHAR(191) NULL UNIQUE, basert_pa_versjon INTEGER NOT NULL,
                status VARCHAR(16) NOT NULL, opprettet VARCHAR(32) NOT NULL,
                behandlet VARCHAR(32) NULL, behandlet_av INTEGER NULL
            ){TABELL}',
            'CREATE INDEX cms_forslag_status ON cms_forslag (status)',
            'CREATE TABLE cms_hendelser (
                id {ID}, aktor_id INTEGER NULL, aktor VARCHAR(191) NULL,
                handling VARCHAR(48) NOT NULL, mal VARCHAR(191) NULL,
                for_verdi TEXT NULL, etter_verdi TEXT NULL, resultat VARCHAR(24) NOT NULL,
                ip VARCHAR(64) NULL, opprettet VARCHAR(32) NOT NULL
            ){TABELL}',
            'CREATE TABLE cms_forsok (id {ID}, nokkel VARCHAR(191) NOT NULL, tid INTEGER NOT NULL){TABELL}',
            'CREATE INDEX cms_forsok_nokkel ON cms_forsok (nokkel)',
        ],
        2 => [
            // The media library (_medier.php). Rows are archived, never deleted, so
            // revisions and published pages keep their pictures.
            'CREATE TABLE cms_medier (
                id {ID}, fil VARCHAR(64) NOT NULL UNIQUE, original VARCHAR(96) NOT NULL,
                mime VARCHAR(32) NOT NULL, bredde INTEGER NOT NULL, hoyde INTEGER NOT NULL,
                storrelse INTEGER NOT NULL, sjekksum CHAR(64) NOT NULL, navn VARCHAR(191) NOT NULL,
                alt TEXT NOT NULL, konsept INTEGER NOT NULL DEFAULT 0, rettigheter TEXT NULL,
                status VARCHAR(16) NOT NULL, varianter TEXT NOT NULL,
                opprettet VARCHAR(32) NOT NULL, opprettet_av INTEGER NULL
            ){TABELL}',
            'CREATE INDEX cms_medier_sjekksum ON cms_medier (sjekksum)',
        ],
        3 => [
            'CREATE TABLE cms_innlegg (
                id {ID}, slug VARCHAR(191) NULL UNIQUE, utkast {DOKUMENT} NULL,
                publisert {DOKUMENT} NULL, versjon INTEGER NOT NULL,
                opprettet VARCHAR(32) NOT NULL, endret VARCHAR(32) NOT NULL,
                endret_av INTEGER NULL, publisert_tid VARCHAR(32) NULL
            ){TABELL}',
            'CREATE TABLE cms_innlegg_revisjoner (
                id {ID}, innlegg_id INTEGER NOT NULL, versjon INTEGER NOT NULL,
                handling VARCHAR(32) NOT NULL, dokument {DOKUMENT} NOT NULL,
                aktor_id INTEGER NULL, opprettet VARCHAR(32) NOT NULL
            ){TABELL}',
            'CREATE INDEX cms_innlegg_revisjoner_id ON cms_innlegg_revisjoner (innlegg_id)',
        ],
    ];
}

function cms_migrer(PDO $db): void
{
    $sqlite = cms_driver($db) === 'sqlite';
    $tabell = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $db->exec("CREATE TABLE IF NOT EXISTS cms_migrering (versjon INTEGER NOT NULL PRIMARY KEY, kjort VARCHAR(32) NOT NULL)$tabell");
    $kjort = (int) $db->query('SELECT COALESCE(MAX(versjon), 0) FROM cms_migrering')->fetchColumn();
    foreach (cms_migreringer() as $versjon => $setninger) {
        if ($versjon <= $kjort) continue;
        foreach ($setninger as $sql) {
            $db->exec(str_replace(['{ID}', '{TABELL}', '{DOKUMENT}'], [$id, $tabell, $sqlite ? 'TEXT' : 'LONGTEXT'], $sql));
        }
        $db->prepare('INSERT INTO cms_migrering (versjon, kjort) VALUES (?, ?)')->execute([$versjon, cms_na()]);
    }
}

function cms_en(string $sql, array $verdier = []): ?array
{
    $s = cms_db()->prepare($sql);
    $s->execute($verdier);
    $rad = $s->fetch();
    return $rad === false ? null : $rad;
}

function cms_alle(string $sql, array $verdier = []): array
{
    $s = cms_db()->prepare($sql);
    $s->execute($verdier);
    return $s->fetchAll();
}

function cms_kjor(string $sql, array $verdier = []): int
{
    $s = cms_db()->prepare($sql);
    $s->execute($verdier);
    return $s->rowCount();
}

// ---------------------------------------------------------------- Fields

/**
 * The editable fields, written by the build from the pages themselves:
 * { "sider/forside#helt.tittel": { "type": "linje", "standard": "…", "sider": ["/"] } }.
 * Only these keys can be saved, so the CMS can never invent a field the
 * design does not show.
 */
function cms_nokler(): array
{
    static $nokler = null;
    if ($nokler !== null) return $nokler;
    $fil = __DIR__ . '/nokler.json';
    $nokler = is_file($fil) ? json_decode((string) file_get_contents($fil), true) : [];
    return is_array($nokler) ? $nokler : [];
}

/** The stored form of a text: one line, or paragraphs separated by one blank line. */
function cms_normaliser(string $tekst, string $type): string
{
    $tekst = str_replace(["\r\n", "\r"], "\n", $tekst);
    if ($type !== 'avsnitt') return trim((string) preg_replace('/\s+/u', ' ', $tekst));
    $avsnitt = array_filter(array_map(
        fn($a) => trim((string) preg_replace('/\s+/u', ' ', $a)),
        preg_split('/\n\s*\n|\n/u', $tekst) ?: [],
    ), fn($a) => $a !== '');
    return implode("\n\n", $avsnitt);
}

function cms_gyldig_verdi(string $nokkel, mixed $verdi): string
{
    $felt = cms_nokler()[$nokkel] ?? null;
    if ($felt === null) throw new CmsFeil("Feltet «{$nokkel}» finnes ikke på siden.", 422);
    if (($felt['type'] ?? '') === 'bilde') return cms_gyldig_bildeverdi($verdi);
    if (!is_string($verdi)) throw new CmsFeil('Teksten må være tekst.', 422);
    if (!mb_check_encoding($verdi, 'UTF-8')) throw new CmsFeil('Teksten har ugyldige tegn.', 422);
    $verdi = cms_normaliser($verdi, $felt['type'] ?? 'linje');
    if ($verdi === '') throw new CmsFeil('Teksten kan ikke være tom.', 422);
    if (mb_strlen($verdi) > CMS_MAKS_TEKST) throw new CmsFeil('Teksten er for lang.', 422);
    return $verdi;
}

// ---------------------------------------------------------------- Published snapshot

/**
 * Pages are served from a JSON snapshot of the published texts and pictures,
 * so a visit never waits for (or depends on) the database. A text is a
 * string; a picture is the finished attributes its <img> gets (side.php).
 */
function cms_skriv_publisert(): void
{
    $data = [];
    foreach (cms_alle('SELECT nokkel, publisert FROM cms_innhold WHERE publisert IS NOT NULL ORDER BY nokkel') as $rad) {
        if ((cms_nokler()[$rad['nokkel']]['type'] ?? '') !== 'bilde') {
            $data[$rad['nokkel']] = $rad['publisert'];
            continue;
        }
        $bilde = cms_bilde_info($rad['publisert']);
        if ($bilde === null) continue;
        $data[$rad['nokkel']] = ['type' => 'bilde'] + array_intersect_key($bilde, array_flip(
            ['src', 'srcset', 'bredde', 'hoyde', 'alt', 'fokus', 'fokusMobil', 'konsept'],
        ));
    }
    $fil = cms_datamappe() . '/publisert.json';
    $tmp = $fil . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode((object) $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    rename($tmp, $fil);
}

// ---------------------------------------------------------------- Audit log

function cms_logg(?array $aktor, string $handling, ?string $mal, mixed $for, mixed $etter, string $resultat = 'ok'): void
{
    $tekst = fn($v) => $v === null ? null : (is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE));
    cms_kjor(
        'INSERT INTO cms_hendelser (aktor_id, aktor, handling, mal, for_verdi, etter_verdi, resultat, ip, opprettet)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$aktor['id'] ?? null, $aktor ? $aktor['navn'] . ' (' . $aktor['rolle'] . ')' : null, $handling, $mal,
            $tekst($for), $tekst($etter), $resultat, cms_ip(), cms_na()],
    );
}

// ---------------------------------------------------------------- Rate limits

function cms_begrens(string $nokkel, int $maks, int $vindu): void
{
    $na = time();
    cms_kjor('DELETE FROM cms_forsok WHERE tid < ?', [$na - 86400]);
    $antall = (int) cms_en('SELECT COUNT(*) AS n FROM cms_forsok WHERE nokkel = ? AND tid >= ?', [$nokkel, $na - $vindu])['n'];
    if ($antall >= $maks) throw new CmsFeil('For mange forsøk. Vent litt og prøv igjen.', 429);
}

function cms_registrer_forsok(string $nokkel): void
{
    cms_kjor('INSERT INTO cms_forsok (nokkel, tid) VALUES (?, ?)', [$nokkel, time()]);
}

// ---------------------------------------------------------------- Sessions and actors

function cms_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function cms_okt(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('dp_cms_okt');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => cms_base(), 'secure' => cms_https(), 'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
    $sist = (int) ($_SESSION['sist'] ?? 0);
    if ($sist && time() - $sist > CMS_OKT_MAKS_SEKUNDER) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['sist'] = time();
}

/**
 * A readable marker cookie (no secret in it) that tells the pages someone is
 * signed in, so visitors never call the API (src/scripts/redigering.ts).
 */
function cms_merke(bool $pa): void
{
    setcookie('dp_cms', $pa ? '1' : '', [
        'expires' => $pa ? 0 : time() - 3600, 'path' => cms_base(), 'secure' => cms_https(),
        'httponly' => false, 'samesite' => 'Strict',
    ]);
}

function cms_bearer(): ?string
{
    $hode = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(\S+)$/i', (string) $hode, $m)) return $m[1];
    // Some shared hosts strip Authorization; agents may send this header instead.
    $alt = $_SERVER['HTTP_X_CMS_NOKKEL'] ?? '';
    return $alt !== '' ? (string) $alt : null;
}

function cms_offentlig_bruker(array $b): array
{
    return [
        'id' => (int) $b['id'], 'navn' => $b['navn'], 'epost' => $b['epost'], 'rolle' => $b['rolle'],
        'rettigheter' => json_decode((string) $b['rettigheter'], true) ?: [],
        'aktiv' => (bool) $b['aktiv'], 'nokkelStart' => $b['nokkel_start'],
        'opprettet' => $b['opprettet'], 'sistInne' => $b['sist_inne'],
    ];
}

/** Who is calling: an agent by API key, a person by session, or nobody. */
function cms_aktor(): ?array
{
    $nokkel = cms_bearer();
    if ($nokkel !== null) {
        $b = cms_en("SELECT * FROM cms_brukere WHERE nokkel_hash = ? AND rolle = 'agent' AND aktiv = 1", [hash('sha256', $nokkel)]);
        if (!$b) {
            cms_logg(null, 'agent.ugyldig-nokkel', null, null, null, 'avvist');
            throw new CmsFeil('Ugyldig API-nøkkel.', 401);
        }
        $aktor = cms_offentlig_bruker($b) + ['via' => 'nokkel'];
        cms_begrens('agent:' . $aktor['id'], CMS_AGENT_KALL_PER_MINUTT, 60);
        cms_registrer_forsok('agent:' . $aktor['id']);
        return $aktor;
    }
    cms_okt();
    $id = (int) ($_SESSION['bruker'] ?? 0);
    if (!$id) return null;
    $b = cms_en("SELECT * FROM cms_brukere WHERE id = ? AND aktiv = 1 AND rolle <> 'agent'", [$id]);
    if (!$b) {
        unset($_SESSION['bruker']);
        return null;
    }
    return cms_offentlig_bruker($b) + ['via' => 'okt'];
}

function cms_csrf(): string
{
    cms_okt();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

/** What each role may do. Agents get only the rights an admin gave them. */
function cms_kan(array $aktor, string $rett): bool
{
    if ($aktor['rolle'] === 'admin') return true;
    if ($aktor['rolle'] === 'redaktor') {
        return in_array($rett, ['les', 'utkast', 'publiser', 'forslag', 'behandle', 'logg', 'blogg'], true);
    }
    $egne = $aktor['rettigheter'];
    if ($rett === 'les') return (bool) $egne;
    return in_array($rett, $egne, true) && in_array($rett, CMS_AGENTRETTIGHETER, true);
}

/** Require a signed-in actor with a right. Refusals are logged (AGT-02, SEC-01). */
function cms_krev(string $rett): array
{
    $aktor = cms_aktor();
    if ($aktor === null) throw new CmsFeil('Du må logge inn.', 401);
    if (!cms_kan($aktor, $rett)) {
        cms_logg($aktor, 'nektet.' . $rett, $_GET['r'] ?? null, null, null, 'avvist');
        throw new CmsFeil('Du har ikke tilgang til dette.', 403);
    }
    if ($aktor['via'] === 'okt' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if ($token === '' || !hash_equals(cms_csrf(), $token)) throw new CmsFeil('Økten må lastes på nytt.', 403);
    }
    return $aktor;
}

require_once __DIR__ . '/_medier.php';
