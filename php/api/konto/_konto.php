<?php
/**
 * Member accounts and the public sign gallery (Sivert, 2026-10-16).
 *
 * Members are the site's visitors with an account; they are not CMS users
 * (cms_brukere), who run the site. The accounts have their own settings,
 * connection and rate limits (_db.php) and run without the CMS; they may
 * share its database (docs/konto.md).
 *
 * Payment: everything is free for now. Which services will cost something
 * later, and the payment providers, are described in tjenester.json; the
 * member rows have the fields a hosted Stripe Checkout or Vipps ePayment
 * flow will fill in (decision log 2026-10-15). Nothing here takes payment.
 *
 * A signed-in member publishes a sign in the gallery with «Publiser i
 * galleriet»; nothing is shared on download or in the cart (Sivert,
 * 2026-10-17). A sign is stored as a template (signgen maler.ts) with a PNG
 * preview the server has re-encoded.
 */

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_epost.php';

const KONTO_OKT_DAGER = 30;
const KONTO_MIN_PASSORD = 10;
const KONTO_MAKS_MAL = 1_500_000;
const KONTO_MAKS_BILDE = 600_000;
const KONTO_MAKS_BILDESIDE = 1200;
const KONTO_DELINGER_PER_TIME = 30;
/** How long a link in an e-mail works (seconds): confirm an address, reset a password, switch address. */
const KONTO_TOKEN_UTLOP = ['bekreft' => 86400, 'reset' => 3600, 'epost' => 86400];
/** A member's status. 'slettet' is never stored: deleting removes the row and everything tied to it. */
const KONTO_STATUSER = ['aktiv', 'suspendert'];

function konto_tjenester(): array
{
    static $t = null;
    if ($t === null) $t = json_decode((string) file_get_contents(__DIR__ . '/tjenester.json'), true, 16, JSON_THROW_ON_ERROR);
    return $t;
}

/**
 * What a member (or a guest, null) may use: each service in tjenester.json
 * and each of its features, with the reason when the answer is no. The
 * server decides here and nowhere else; the browser only shows the answer.
 *
 * - A free service, or one free for now, is open; a paid one needs a
 *   payment that covers today.
 * - A feature lists what it needs: 'medlem' (signed in) and
 *   'bekreftet-epost' (a confirmed address).
 * - An administrator may set an exception per member (dp_konto_tilganger):
 *   'nei' always closes; 'ja' opens a paid service without payment, but
 *   never skips sign-in, an active account or a confirmed address.
 *
 * @return array<string, array{tilgang: bool, grunn: ?string, funksjoner: array<string, array{tilgang: bool, grunn: ?string}>}>
 */
function konto_tilganger(?array $medlem): array
{
    $unntak = [];
    if ($medlem !== null) {
        foreach (konto_alle('SELECT nokkel, verdi FROM dp_konto_tilganger WHERE medlem_id = ?', [$medlem['id']]) as $r) {
            $unntak[$r['nokkel']] = $r['verdi'];
        }
    }
    $aktiv = $medlem !== null && $medlem['status'] === 'aktiv';
    $betalt = $aktiv && $medlem['betaling_status'] === 'aktiv' && $medlem['betalt_til'] !== null && $medlem['betalt_til'] >= konto_na();
    $svar = [];
    foreach (konto_tjenester()['tjenester'] as $id => $t) {
        $grunn = null;
        if (($unntak[$id] ?? null) === 'nei') $grunn = 'Stengt for kontoen din. Ta kontakt hvis du mener det er feil.';
        elseif ($t['betaling'] === 'betalt' && !$betalt && !($aktiv && ($unntak[$id] ?? null) === 'ja')) $grunn = 'Krever betaling, som ikke er slått på ennå.';
        $funksjoner = [];
        foreach ($t['funksjoner'] ?? [] as $fid => $f) {
            $fgrunn = $grunn;
            $krever = $f['krever'] ?? [];
            if ($fgrunn === null && ($unntak["$id/$fid"] ?? null) === 'nei') $fgrunn = 'Stengt for kontoen din. Ta kontakt hvis du mener det er feil.';
            elseif ($fgrunn === null && in_array('medlem', $krever, true) && !$aktiv) $fgrunn = 'Logg inn først.';
            elseif ($fgrunn === null && in_array('bekreftet-epost', $krever, true) && empty($medlem['epost_bekreftet'])) {
                $fgrunn = 'Bekreft e-postadressen din først. Det gjør du under Min konto.';
            }
            $funksjoner[$fid] = ['tilgang' => $fgrunn === null, 'grunn' => $fgrunn];
        }
        $svar[$id] = ['tilgang' => $grunn === null, 'grunn' => $grunn, 'funksjoner' => $funksjoner];
    }
    return $svar;
}

/** Whether a member (or a guest, null) may use a service. */
function konto_tilgang(?array $medlem, string $tjeneste): bool
{
    return konto_tilganger($medlem)[$tjeneste]['tilgang'] ?? false;
}

/** A feature the request needs, or a KontoFeil (403) with the reason. */
function konto_krev_funksjon(?array $medlem, string $tjeneste, string $funksjon): void
{
    $f = konto_tilganger($medlem)[$tjeneste]['funksjoner'][$funksjon] ?? null;
    if ($f === null) throw new KontoFeil('Ukjent funksjon.', 404);
    if (!$f['tilgang']) throw new KontoFeil((string) $f['grunn'], $medlem === null ? 401 : 403);
}

/** The keys an administrator may set an exception for: 'csv', 'sign-forge/publisering', … */
function konto_tilgangsnokler(): array
{
    $n = [];
    foreach (konto_tjenester()['tjenester'] as $id => $t) {
        $n[] = $id;
        foreach (array_keys($t['funksjoner'] ?? []) as $fid) $n[] = "$id/$fid";
    }
    return $n;
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
        // 2026-10-17: own rate limits, so the accounts no longer need the CMS's cms_forsok
        2 => [
            'CREATE TABLE dp_konto_forsok (id {ID}, nokkel VARCHAR(191) NOT NULL, tid INTEGER NOT NULL){TABELL}',
            'CREATE INDEX dp_konto_forsok_nokkel ON dp_konto_forsok (nokkel, tid)',
        ],
        // 2026-10-18, stage B: status, confirmed addresses, one-time links, access exceptions.
        // Existing members keep their sign-ins and are unconfirmed (epost_bekreftet NULL): nothing
        // says their address was ever checked. `aktiv` stays in step with `status`, so code from
        // before this step still shuts out a suspended member.
        3 => [
            "ALTER TABLE dp_medlemmer ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'aktiv'",
            'ALTER TABLE dp_medlemmer ADD COLUMN epost_bekreftet VARCHAR(32) NULL',
            "UPDATE dp_medlemmer SET status = 'suspendert' WHERE aktiv <> 1",
            // formal: bekreft | reset | epost. epost = the member's address when it was made (the
            // link only works while it still is); ny_epost = the address to switch to.
            'CREATE TABLE dp_konto_tokens (
                id {ID}, token_hash CHAR(64) NOT NULL UNIQUE, formal VARCHAR(16) NOT NULL, medlem_id INTEGER NOT NULL,
                epost VARCHAR(191) NOT NULL, ny_epost VARCHAR(191) NULL, utloper INTEGER NOT NULL,
                brukt INTEGER NULL, opprettet VARCHAR(32) NOT NULL
            ){TABELL}',
            'CREATE INDEX dp_konto_tokens_medlem ON dp_konto_tokens (medlem_id, formal)',
            // nokkel: a service id or "service/feature"; verdi: ja | nei
            'CREATE TABLE dp_konto_tilganger (
                id {ID}, medlem_id INTEGER NOT NULL, nokkel VARCHAR(64) NOT NULL, verdi VARCHAR(8) NOT NULL,
                endret VARCHAR(32) NOT NULL, endret_av VARCHAR(80) NULL
            ){TABELL}',
            'CREATE UNIQUE INDEX dp_konto_tilganger_nokkel ON dp_konto_tilganger (medlem_id, nokkel)',
        ],
    ];
}

function konto_db(): PDO
{
    static $klar = false;
    $db = konto_pdo();
    if ($klar) return $db;
    $sqlite = konto_driver($db) === 'sqlite';
    $tabell = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $db->exec("CREATE TABLE IF NOT EXISTS dp_konto_migrering (versjon INTEGER NOT NULL PRIMARY KEY, kjort VARCHAR(32) NOT NULL)$tabell");
    $kjort = (int) $db->query('SELECT COALESCE(MAX(versjon), 0) FROM dp_konto_migrering')->fetchColumn();
    foreach (konto_migreringer() as $versjon => $setninger) {
        if ($versjon <= $kjort) continue;
        foreach ($setninger as $sql) {
            $db->exec(str_replace(['{ID}', '{TABELL}', '{DOKUMENT}'], [$id, $tabell, $sqlite ? 'TEXT' : 'LONGTEXT'], $sql));
        }
        $db->prepare('INSERT INTO dp_konto_migrering (versjon, kjort) VALUES (?, ?)')->execute([$versjon, konto_na()]);
    }
    $klar = true;
    return $db;
}

/**
 * Runs `$arbeid` in one transaction. SQLite takes the write lock at once
 * (BEGIN IMMEDIATE), so two requests never both read before either writes.
 */
function konto_transaksjon(callable $arbeid): mixed
{
    $db = konto_db();
    $sqlite = konto_driver($db) === 'sqlite';
    $sqlite ? $db->exec('BEGIN IMMEDIATE') : $db->beginTransaction();
    try {
        $svar = $arbeid();
        $sqlite ? $db->exec('COMMIT') : $db->commit();
        return $svar;
    } catch (Throwable $e) {
        $sqlite ? $db->exec('ROLLBACK') : $db->rollBack();
        throw $e;
    }
}

// ---------------------------------------------------------------- Members and sessions

function konto_tekst(mixed $v, string $navn, int $maks, bool $pakrevd = true): string
{
    if ($v !== null && !is_string($v)) throw new KontoFeil("$navn må være tekst.", 422);
    $v = trim((string) preg_replace('/\s+/u', ' ', (string) $v));
    if (!mb_check_encoding($v, 'UTF-8')) throw new KontoFeil("$navn har ugyldige tegn.", 422);
    if ($pakrevd && $v === '') throw new KontoFeil("Skriv inn $navn.", 422);
    if (mb_strlen($v) > $maks) throw new KontoFeil(ucfirst($navn) . " kan være høyst $maks tegn.", 422);
    return $v;
}

function konto_epost(mixed $v): string
{
    $e = mb_strtolower(konto_tekst($v, 'e-postadresse', 191));
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) throw new KontoFeil('E-postadressen ser ikke riktig ut.', 422);
    return $e;
}

function konto_ut(array $m): array
{
    return [
        'id' => (int) $m['id'], 'navn' => $m['navn'], 'epost' => $m['epost'], 'plan' => $m['plan'],
        'betaling' => ['status' => $m['betaling_status'], 'leverandor' => $m['betaling_leverandor'], 'betaltTil' => $m['betalt_til']],
        'status' => $m['status'], 'epostBekreftet' => $m['epost_bekreftet'],
        'tilgang' => array_map(fn($t) => $t['tilgang'], $tilganger = konto_tilganger($m)),
        'tilganger' => $tilganger,
        'opprettet' => $m['opprettet'], 'sistInne' => $m['sist_inne'],
    ];
}

function konto_kake(string $verdi, int $utloper): void
{
    setcookie(konto_kakenavn(), $verdi, [
        'expires' => $utloper, 'path' => konto_base(), 'secure' => konto_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

/** A new sign-in: a random token in an HttpOnly cookie, only its hash in the database. */
function konto_logg_inn(array $m): void
{
    $token = bin2hex(random_bytes(32));
    $utloper = time() + KONTO_OKT_DAGER * 86400;
    konto_kjor('DELETE FROM dp_konto_okter WHERE utloper < ?', [time()]);
    konto_kjor(
        'INSERT INTO dp_konto_okter (token_hash, medlem_id, utloper, opprettet) VALUES (?, ?, ?, ?)',
        [hash('sha256', $token), $m['id'], $utloper, konto_na()],
    );
    konto_kjor('UPDATE dp_medlemmer SET sist_inne = ? WHERE id = ?', [konto_na(), $m['id']]);
    konto_kake($token, $utloper);
}

function konto_logg_ut(): void
{
    $token = (string) ($_COOKIE[konto_kakenavn()] ?? '');
    if ($token !== '') konto_kjor('DELETE FROM dp_konto_okter WHERE token_hash = ?', [hash('sha256', $token)]);
    konto_kake('', time() - 3600);
}

/** The signed-in member, or null. */
function konto_medlem(): ?array
{
    $token = (string) ($_COOKIE[konto_kakenavn()] ?? '');
    if ($token === '' || strlen($token) > 128) return null;
    $m = konto_en(
        'SELECT m.* FROM dp_konto_okter o JOIN dp_medlemmer m ON m.id = o.medlem_id
         WHERE o.token_hash = ? AND o.utloper >= ? AND m.aktiv = 1 AND m.status = \'aktiv\'',
        [hash('sha256', $token), time()],
    );
    return $m ?: null;
}

function konto_krev_medlem(): array
{
    $m = konto_medlem();
    if ($m === null) throw new KontoFeil('Du må logge inn.', 401);
    return $m;
}

/** Ends every sign-in of a member (password change, reset, suspension). */
function konto_logg_ut_overalt(int $id): void
{
    konto_kjor('DELETE FROM dp_konto_okter WHERE medlem_id = ?', [$id]);
}

/**
 * Locks the member's row until the transaction ends, so the one-time actions
 * on one account (links, password, address) run one after the other and see
 * each other's changes. SQLite's BEGIN IMMEDIATE already locks the database.
 */
function konto_las_medlem(int $id): ?array
{
    $sqlite = konto_driver(konto_db()) === 'sqlite';
    return konto_en('SELECT * FROM dp_medlemmer WHERE id = ?' . ($sqlite ? '' : ' FOR UPDATE'), [$id]);
}

/**
 * Ends every sign-in and every unused link of a member: after a new password
 * nothing made before it may still change the account, an address change
 * started by someone else included.
 */
function konto_sikre_konto(int $id): void
{
    konto_logg_ut_overalt($id);
    konto_kjor('DELETE FROM dp_konto_tokens WHERE medlem_id = ? AND brukt IS NULL', [$id]);
}

/** Sets a member's status; suspending also ends their sign-ins and one-time links. */
function konto_sett_status(int $id, string $status): void
{
    if (!in_array($status, KONTO_STATUSER, true)) throw new KontoFeil('Ukjent status.', 422);
    konto_transaksjon(function () use ($id, $status) {
        if (konto_kjor('UPDATE dp_medlemmer SET status = ?, aktiv = ? WHERE id = ?', [$status, $status === 'aktiv' ? 1 : 0, $id]) !== 1
            && !konto_en('SELECT id FROM dp_medlemmer WHERE id = ?', [$id])) {
            throw new KontoFeil('Fant ikke medlemmet.', 404);
        }
        if ($status !== 'aktiv') {
            konto_logg_ut_overalt($id);
            konto_kjor('DELETE FROM dp_konto_tokens WHERE medlem_id = ?', [$id]);
        }
    });
}

/** Deletes a member and everything tied to them: signs, sign-ins, links, access exceptions. */
function konto_slett_medlem(int $id): void
{
    konto_transaksjon(function () use ($id) {
        foreach (['dp_skilt', 'dp_konto_okter', 'dp_konto_tokens', 'dp_konto_tilganger'] as $t) {
            konto_kjor("DELETE FROM $t WHERE medlem_id = ?", [$id]);
        }
        konto_kjor('DELETE FROM dp_medlemmer WHERE id = ?', [$id]);
    });
}

// ---------------------------------------------------------------- One-time links

/**
 * A new one-time token for a member: random, only its hash stored, bound to
 * the purpose, the member and their current address, with an expiry. Older
 * unused tokens of the same purpose stop working, so there is at most one.
 */
function konto_lag_token(array $m, string $formal, ?string $nyEpost = null): string
{
    if (!isset(KONTO_TOKEN_UTLOP[$formal])) throw new LogicException('Ukjent formål.');
    $token = bin2hex(random_bytes(32));
    konto_kjor('DELETE FROM dp_konto_tokens WHERE utloper < ? OR (medlem_id = ? AND formal = ? AND brukt IS NULL)', [time() - 86400, $m['id'], $formal]);
    konto_kjor(
        'INSERT INTO dp_konto_tokens (token_hash, formal, medlem_id, epost, ny_epost, utloper, opprettet) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [hash('sha256', $token), $formal, $m['id'], $m['epost'], $nyEpost, time() + KONTO_TOKEN_UTLOP[$formal], konto_na()],
    );
    return $token;
}

const KONTO_UGYLDIG_LENKE = 'Lenken er ugyldig, utløpt eller allerede brukt. Be om en ny.';

/**
 * Uses up a token, in the caller's transaction: the member's row is locked,
 * then one UPDATE marks the token used only if it is unused, unexpired and of
 * this purpose, so of two requests at the same time only one gets a row, and
 * a link revoked by a new password in the meantime gets none. Then the member must still be active
 * and still have the address the token was made for.
 * @return array{0: array, 1: array} the token row and the member
 */
function konto_bruk_token(mixed $token, string $formal): array
{
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) throw new KontoFeil(KONTO_UGYLDIG_LENKE, 400);
    $hash = hash('sha256', $token);
    // the member first, so this waits for any other one-time action on the account
    $eier = konto_en('SELECT medlem_id FROM dp_konto_tokens WHERE token_hash = ?', [$hash]);
    if (!$eier) throw new KontoFeil(KONTO_UGYLDIG_LENKE, 400);
    konto_las_medlem((int) $eier['medlem_id']);
    $n = konto_kjor(
        'UPDATE dp_konto_tokens SET brukt = ? WHERE token_hash = ? AND formal = ? AND brukt IS NULL AND utloper >= ?',
        [time(), $hash, $formal, time()],
    );
    if ($n !== 1) throw new KontoFeil(KONTO_UGYLDIG_LENKE, 400);
    $t = konto_en('SELECT * FROM dp_konto_tokens WHERE token_hash = ?', [$hash]);
    $m = konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$t['medlem_id']]);
    if (!$m || $m['status'] !== 'aktiv' || $m['epost'] !== $t['epost']) throw new KontoFeil(KONTO_UGYLDIG_LENKE, 400);
    return [$t, $m];
}

/** Sends the link that confirms the member's current address. */
function konto_send_bekreftelse(array $m): void
{
    $lenke = konto_lenke('bekreft', konto_lag_token($m, 'bekreft'));
    konto_send_epost(
        $m['epost'],
        'Bekreft e-postadressen din hos Designporten',
        "Hei {$m['navn']},\n\nBekreft at dette er e-postadressen din ved å åpne lenken og trykke «Bekreft»:\n\n$lenke\n\n"
        . "Lenken virker i et døgn. Har du ikke laget en konto hos Designporten, kan du se bort fra denne e-posten.\n\nHilsen Designporten\n",
    );
}

// ---------------------------------------------------------------- Signs

/** A sign as the gallery shows it. */
function konto_skilt_ut(array $r, bool $admin = false): array
{
    $base = konto_base();
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
        throw new KontoFeil('Skiltet kunne ikke leses.', 422);
    }
    $json = json_encode($mal, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (strlen($json) > KONTO_MAKS_MAL) throw new KontoFeil('Skiltet er for stort til å deles.', 413);
    return $json;
}

/**
 * The preview: a PNG as a data URL, decoded and drawn again with GD so only
 * plain pixels are stored. Without GD the sign is shared without a picture.
 */
function konto_gyldig_bilde(mixed $v): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !str_starts_with($v, 'data:image/png;base64,')) throw new KontoFeil('Forhåndsbildet må være PNG.', 422);
    $raa = base64_decode(substr($v, 22), true);
    if ($raa === false || strlen($raa) > KONTO_MAKS_BILDE) throw new KontoFeil('Forhåndsbildet er for stort.', 413);
    if (!function_exists('imagecreatefromstring')) return null;
    $info = @getimagesizefromstring($raa);
    if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] > KONTO_MAKS_BILDESIDE || $info[1] > KONTO_MAKS_BILDESIDE) {
        throw new KontoFeil('Forhåndsbildet kunne ikke leses.', 422);
    }
    $bilde = @imagecreatefromstring($raa);
    if (!$bilde) throw new KontoFeil('Forhåndsbildet kunne ikke leses.', 422);
    imagesavealpha($bilde, true);
    ob_start();
    imagepng($bilde, null, 9);
    imagedestroy($bilde);
    return base64_encode((string) ob_get_clean());
}
