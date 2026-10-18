<?php
/**
 * Member accounts and the public sign gallery (Sivert, 2026-10-16).
 *
 * Members are the site's visitors with an account; they are not CMS users
 * (cms_brukere), who run the site. Both live in the same database and use
 * the CMS core for the connection and rate limits, so turning on the CMS on
 * the web host (api/cms/konfig.php) turns these on too.
 *
 * Payment: everything is free for now. Which services will cost something
 * later, and the payment providers, are described in tjenester.json; the
 * member rows have the fields a hosted Stripe Checkout or Vipps ePayment
 * flow will fill in (decision log 2026-10-15). Nothing here takes payment.
 *
 * Every sign exported from Sign Forge is shared in the gallery and can be
 * used as a template by others. A sign is stored as a template (signgen
 * maler.ts) with a PNG preview the server has re-encoded.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/cms/_kjerne.php';

const KONTO_OKT_DAGER = 30;
const KONTO_MIN_PASSORD = 10;
const KONTO_MAKS_MAL = 1_500_000;
const KONTO_MAKS_BILDE = 600_000;
const KONTO_MAKS_BILDESIDE = 1200;
const KONTO_DELINGER_PER_TIME = 30;

function konto_tjenester(): array
{
    static $t = null;
    if ($t === null) $t = json_decode((string) file_get_contents(__DIR__ . '/tjenester.json'), true, 16, JSON_THROW_ON_ERROR);
    return $t;
}

/**
 * Whether a member (or a guest, null) may use a service. Free services and
 * those that are free for now are open to everyone; a paid one needs a
 * member whose payment covers today.
 */
function konto_tilgang(?array $medlem, string $tjeneste): bool
{
    $t = konto_tjenester()['tjenester'][$tjeneste] ?? null;
    if ($t === null) return false;
    if ($t['betaling'] !== 'betalt') return true;
    return $medlem !== null && $medlem['betaling_status'] === 'aktiv'
        && $medlem['betalt_til'] !== null && $medlem['betalt_til'] >= cms_na();
}

// ---------------------------------------------------------------- Schema

/** Own migration steps (not the CMS's numbering), same rules: never edit a shipped step. */
function konto_migreringer(): array
{
    return [
        1 => [
            // betaling_status: ingen | aktiv | utlopt | avbrutt. betaling_leverandor: stripe | vipps.
            'CREATE TABLE dp_medlemmer (
                id {ID}, epost VARCHAR(191) NOT NULL UNIQUE, navn VARCHAR(80) NOT NULL,
                passord_hash VARCHAR(255) NOT NULL, plan VARCHAR(24) NOT NULL DEFAULT \'gratis\',
                betaling_status VARCHAR(16) NOT NULL DEFAULT \'ingen\', betaling_leverandor VARCHAR(16) NULL,
                betaling_kunde VARCHAR(191) NULL, betalt_til VARCHAR(32) NULL,
                vilkar_godtatt VARCHAR(32) NOT NULL, aktiv INTEGER NOT NULL DEFAULT 1,
                opprettet VARCHAR(32) NOT NULL, sist_inne VARCHAR(32) NULL
            ){TABELL}',
            'CREATE TABLE dp_konto_okter (
                id {ID}, token_hash CHAR(64) NOT NULL UNIQUE, medlem_id INTEGER NOT NULL,
                utloper INTEGER NOT NULL, opprettet VARCHAR(32) NOT NULL
            ){TABELL}',
            'CREATE INDEX dp_konto_okter_medlem ON dp_konto_okter (medlem_id)',
            'CREATE TABLE dp_skilt (
                id {ID}, offentlig_id CHAR(16) NOT NULL UNIQUE, nokkel_hash CHAR(64) NOT NULL,
                medlem_id INTEGER NULL, skaper VARCHAR(80) NOT NULL, tittel VARCHAR(80) NOT NULL,
                mal {DOKUMENT} NOT NULL, bilde {DOKUMENT} NULL, skjult INTEGER NOT NULL DEFAULT 0,
                ganger_brukt INTEGER NOT NULL DEFAULT 0, opprettet VARCHAR(32) NOT NULL, endret VARCHAR(32) NOT NULL
            ){TABELL}',
            'CREATE INDEX dp_skilt_medlem ON dp_skilt (medlem_id)',
            'CREATE INDEX dp_skilt_endret ON dp_skilt (endret)',
            // One row per payment once a provider is switched on (filled by its webhook). Empty for now.
            'CREATE TABLE dp_betalinger (
                id {ID}, medlem_id INTEGER NOT NULL, tjeneste VARCHAR(32) NOT NULL,
                leverandor VARCHAR(16) NOT NULL, ekstern_ref VARCHAR(191) NOT NULL UNIQUE,
                belop_ore INTEGER NULL, valuta CHAR(3) NOT NULL DEFAULT \'NOK\', status VARCHAR(16) NOT NULL,
                periode_til VARCHAR(32) NULL, opprettet VARCHAR(32) NOT NULL
            ){TABELL}',
        ],
    ];
}

function konto_db(): PDO
{
    static $klar = false;
    $db = cms_db();
    if ($klar) return $db;
    $sqlite = cms_driver($db) === 'sqlite';
    $tabell = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $db->exec("CREATE TABLE IF NOT EXISTS dp_konto_migrering (versjon INTEGER NOT NULL PRIMARY KEY, kjort VARCHAR(32) NOT NULL)$tabell");
    $kjort = (int) $db->query('SELECT COALESCE(MAX(versjon), 0) FROM dp_konto_migrering')->fetchColumn();
    foreach (konto_migreringer() as $versjon => $setninger) {
        if ($versjon <= $kjort) continue;
        foreach ($setninger as $sql) {
            $db->exec(str_replace(['{ID}', '{TABELL}', '{DOKUMENT}'], [$id, $tabell, $sqlite ? 'TEXT' : 'LONGTEXT'], $sql));
        }
        $db->prepare('INSERT INTO dp_konto_migrering (versjon, kjort) VALUES (?, ?)')->execute([$versjon, cms_na()]);
    }
    $klar = true;
    return $db;
}

// ---------------------------------------------------------------- Members and sessions

function konto_tekst(mixed $v, string $navn, int $maks, bool $pakrevd = true): string
{
    if ($v !== null && !is_string($v)) throw new CmsFeil("$navn må være tekst.", 422);
    $v = trim((string) preg_replace('/\s+/u', ' ', (string) $v));
    if (!mb_check_encoding($v, 'UTF-8')) throw new CmsFeil("$navn har ugyldige tegn.", 422);
    if ($pakrevd && $v === '') throw new CmsFeil("Skriv inn $navn.", 422);
    if (mb_strlen($v) > $maks) throw new CmsFeil(ucfirst($navn) . " kan være høyst $maks tegn.", 422);
    return $v;
}

function konto_epost(mixed $v): string
{
    $e = mb_strtolower(konto_tekst($v, 'e-postadresse', 191));
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) throw new CmsFeil('E-postadressen ser ikke riktig ut.', 422);
    return $e;
}

function konto_ut(array $m): array
{
    return [
        'id' => (int) $m['id'], 'navn' => $m['navn'], 'epost' => $m['epost'], 'plan' => $m['plan'],
        'betaling' => ['status' => $m['betaling_status'], 'leverandor' => $m['betaling_leverandor'], 'betaltTil' => $m['betalt_til']],
        'tilgang' => array_map(fn($id) => konto_tilgang($m, $id), array_combine(
            array_keys(konto_tjenester()['tjenester']), array_keys(konto_tjenester()['tjenester']),
        )),
        'opprettet' => $m['opprettet'], 'sistInne' => $m['sist_inne'],
    ];
}

function konto_kake(string $verdi, int $utloper): void
{
    setcookie('dp_konto', $verdi, [
        'expires' => $utloper, 'path' => cms_base(), 'secure' => cms_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

/** A new sign-in: a random token in an HttpOnly cookie, only its hash in the database. */
function konto_logg_inn(array $m): void
{
    $token = bin2hex(random_bytes(32));
    $utloper = time() + KONTO_OKT_DAGER * 86400;
    cms_kjor('DELETE FROM dp_konto_okter WHERE utloper < ?', [time()]);
    cms_kjor(
        'INSERT INTO dp_konto_okter (token_hash, medlem_id, utloper, opprettet) VALUES (?, ?, ?, ?)',
        [hash('sha256', $token), $m['id'], $utloper, cms_na()],
    );
    cms_kjor('UPDATE dp_medlemmer SET sist_inne = ? WHERE id = ?', [cms_na(), $m['id']]);
    konto_kake($token, $utloper);
}

function konto_logg_ut(): void
{
    $token = (string) ($_COOKIE['dp_konto'] ?? '');
    if ($token !== '') cms_kjor('DELETE FROM dp_konto_okter WHERE token_hash = ?', [hash('sha256', $token)]);
    konto_kake('', time() - 3600);
}

/** The signed-in member, or null. */
function konto_medlem(): ?array
{
    $token = (string) ($_COOKIE['dp_konto'] ?? '');
    if ($token === '' || strlen($token) > 128) return null;
    $m = cms_en(
        'SELECT m.* FROM dp_konto_okter o JOIN dp_medlemmer m ON m.id = o.medlem_id
         WHERE o.token_hash = ? AND o.utloper >= ? AND m.aktiv = 1',
        [hash('sha256', $token), time()],
    );
    return $m ?: null;
}

function konto_krev_medlem(): array
{
    $m = konto_medlem();
    if ($m === null) throw new CmsFeil('Du må logge inn.', 401);
    return $m;
}

// ---------------------------------------------------------------- Signs

/** A sign as the gallery shows it. */
function konto_skilt_ut(array $r, bool $admin = false): array
{
    $base = cms_base();
    return [
        'id' => $r['offentlig_id'], 'tittel' => $r['tittel'], 'skaper' => $r['skaper'],
        'bilde' => $r['har_bilde'] ? $base . 'api/konto/?r=bilde&id=' . $r['offentlig_id'] . '&v=' . rawurlencode($r['endret']) : null,
        'gangerBrukt' => (int) $r['ganger_brukt'], 'opprettet' => $r['opprettet'], 'endret' => $r['endret'],
    ] + ($admin ? ['skjult' => (bool) $r['skjult'], 'medlem' => $r['medlem_id'] !== null ? (int) $r['medlem_id'] : null] : []);
}

const KONTO_SKILTFELT = 'offentlig_id, tittel, skaper, ganger_brukt, opprettet, endret, skjult, medlem_id,
    CASE WHEN bilde IS NULL THEN 0 ELSE 1 END AS har_bilde';

/**
 * The template JSON from Sign Forge. Only its shape is checked here: the
 * editor cleans every template it opens (maler.ts rensMal), so nothing in it
 * is ever trusted.
 */
function konto_gyldig_mal(mixed $mal): string
{
    if (!is_array($mal) || !is_array($mal['dokument'] ?? null) || ($mal['dokument']['generator'] ?? '') !== 'signgen') {
        throw new CmsFeil('Skiltet kunne ikke leses.', 422);
    }
    $json = json_encode($mal, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (strlen($json) > KONTO_MAKS_MAL) throw new CmsFeil('Skiltet er for stort til å deles.', 413);
    return $json;
}

/**
 * The preview: a PNG as a data URL, decoded and drawn again with GD so only
 * plain pixels are stored. Without GD the sign is shared without a picture.
 */
function konto_gyldig_bilde(mixed $v): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !str_starts_with($v, 'data:image/png;base64,')) throw new CmsFeil('Forhåndsbildet må være PNG.', 422);
    $raa = base64_decode(substr($v, 22), true);
    if ($raa === false || strlen($raa) > KONTO_MAKS_BILDE) throw new CmsFeil('Forhåndsbildet er for stort.', 413);
    if (!function_exists('imagecreatefromstring')) return null;
    $info = @getimagesizefromstring($raa);
    if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] > KONTO_MAKS_BILDESIDE || $info[1] > KONTO_MAKS_BILDESIDE) {
        throw new CmsFeil('Forhåndsbildet kunne ikke leses.', 422);
    }
    $bilde = @imagecreatefromstring($raa);
    if (!$bilde) throw new CmsFeil('Forhåndsbildet kunne ikke leses.', 422);
    imagesavealpha($bilde, true);
    ob_start();
    imagepng($bilde, null, 9);
    imagedestroy($bilde);
    return base64_encode((string) ob_get_clean());
}
