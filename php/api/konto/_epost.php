<?php
/**
 * E-mail from the account module: confirmation links, password reset and
 * notices. Small and swappable: one function sends, a driver decides how.
 * Settings in api/konto/konfig.php (see konfig.eksempel.php, docs/konto.md):
 *
 *   'offentlig_adresse' => 'https://designporten.no',
 *   'epost' => ['driver' => 'fil' | 'mail', 'fra' => 'konto@…', 'mappe' => '/outside/the/web/root'],
 *
 * - fil: each message is written as a JSON file to `mappe`, which must lie
 *   outside every folder the web may serve (konto_i_offentlig_mappe()). Used in development and tests, and on a
 *   test build, where a CMS administrator can read them in Studio. Nothing
 *   leaves the machine.
 * - mail: PHP mail(), as the site's forms use. Refused on a test build and
 *   on PHP's development server, so a test never falls back to real mail.
 * - SMTP is not built: it needs a maintained library (PHPMailer), which is a
 *   decision for when production e-mail is switched on.
 *
 * Without settings, sending fails with a KontoFeil (503) the page shows;
 * nothing pretends a message went. Links are built from the configured
 * public address and the build's base, never from the request's Host, and
 * carry the token after «#», so it never reaches a server log or a Referer.
 * Neither addresses, tokens nor links are logged.
 */

declare(strict_types=1);

require_once __DIR__ . '/_db.php';

const KONTO_EPOST_AV = 'E-post er ikke satt opp på denne serveren ennå, så vi kan ikke sende lenker.';

/** The app's own root (where api/ lives). */
function konto_nettrot(): string
{
    return (string) realpath(dirname(__DIR__, 2));
}

/**
 * Every folder the web may serve, as far as the server can tell: the app's
 * root; the site's root above it when the app lives under a base such as
 * /designporten-test/ (so a sister folder like /public_html/postfangst/ is
 * public too); the web server's DOCUMENT_ROOT (not on PHP's development
 * server, where it is only the folder it was started in); and any folders
 * named in the settings ('epost' => ['offentlige_mapper' => […]]).
 */
function konto_offentlige_mapper(): array
{
    $app = konto_nettrot();
    $mapper = [$app];
    $base = trim(konto_base(), '/');
    if ($base !== '' && str_ends_with($app, '/' . $base)) $mapper[] = substr($app, 0, -strlen('/' . $base)) ?: '/';
    if (PHP_SAPI !== 'cli-server' && !empty($_SERVER['DOCUMENT_ROOT'])) $mapper[] = (string) $_SERVER['DOCUMENT_ROOT'];
    $e = (konto_konfig() ?? [])['epost'] ?? [];
    foreach ((array) ($e['offentlige_mapper'] ?? []) as $m) $mapper[] = (string) $m;
    $ut = [];
    foreach ($mapper as $m) {
        $ekte = $m === '' ? false : realpath($m);
        if ($ekte !== false) $ut[] = rtrim($ekte, '/') ?: '/';
    }
    return array_values(array_unique($ut));
}

/**
 * True when `$mappe` (an absolute, resolved path) lies in a folder the web may
 * serve: inside one of konto_offentlige_mapper(), or below a folder that looks
 * like a web root of its own (it holds index.html, index.php or .htaccess).
 */
function konto_i_offentlig_mappe(string $mappe): bool
{
    foreach (konto_offentlige_mapper() as $rot) {
        if ($rot === '/' || $mappe === $rot || str_starts_with($mappe . '/', $rot . '/')) return true;
    }
    for ($d = $mappe; ; $d = dirname($d)) {
        foreach (['index.html', 'index.php', '.htaccess'] as $f) if (is_file("$d/$f")) return true;
        if ($d === '/' || $d === dirname($d)) return false;
    }
}

/** The e-mail settings, checked. KontoFeil 503 when they are missing or not allowed here. */
function konto_epost_oppsett(): array
{
    $k = konto_konfig() ?? [];
    $e = is_array($k['epost'] ?? null) ? $k['epost'] : [];
    $driver = (string) ($e['driver'] ?? '');
    $test = !empty(konto_bygg()['test']) || PHP_SAPI === 'cli-server';
    if ($driver === 'fil') {
        $mappe = (string) ($e['mappe'] ?? '');
        if ($mappe === '' || !str_starts_with($mappe, '/') || str_contains($mappe, '..')) throw new KontoFeil(KONTO_EPOST_AV, 503);
        // where the folder is or would be, checked before anything is created
        $finnes = $mappe;
        while (!is_dir($finnes) && $finnes !== '/') $finnes = dirname($finnes);
        $ekte = rtrim((string) realpath($finnes), '/') . substr($mappe, strlen($finnes));
        if (konto_i_offentlig_mappe($ekte)) {
            // where the web may serve it, anyone could read the links
            error_log('Designporten konto: e-postmappen kan ligge offentlig og brukes ikke.');
            throw new KontoFeil(KONTO_EPOST_AV, 503);
        }
        if (!is_dir($ekte) && !@mkdir($ekte, 0700, true)) throw new KontoFeil(KONTO_EPOST_AV, 503);
        return ['driver' => 'fil', 'mappe' => $ekte];
    }
    if ($driver === 'mail' && !$test) {
        $fra = (string) ($e['fra'] ?? '');
        if (!filter_var($fra, FILTER_VALIDATE_EMAIL)) throw new KontoFeil(KONTO_EPOST_AV, 503);
        return ['driver' => 'mail', 'fra' => $fra];
    }
    throw new KontoFeil(KONTO_EPOST_AV, 503);
}

/** The public address from the settings, without a trailing slash. */
function konto_offentlig_adresse(): string
{
    $a = rtrim((string) ((konto_konfig() ?? [])['offentlig_adresse'] ?? ''), '/');
    $ok = preg_match('~^https://[a-z0-9.-]+(:\d{1,5})?$~iD', $a)
        || preg_match('~^http://(127\.0\.0\.1|localhost)(:\d{1,5})?$~D', $a);
    if (!$ok) throw new KontoFeil('Lenker kan ikke lages: den offentlige adressen mangler i oppsettet.', 503);
    return $a;
}

/** Fails early (503) when no message could be sent, before anything is changed. */
function konto_epost_klar(): void
{
    konto_epost_oppsett();
    konto_offentlig_adresse();
}

/** A link to «Min konto» that acts on `$token` («#handling=token», never in a query string). */
function konto_lenke(string $handling, string $token): string
{
    return konto_offentlig_adresse() . konto_base() . 'konto/#' . $handling . '=' . $token;
}

/** Sends one plain-text message, or throws KontoFeil (503). */
function konto_send_epost(string $til, string $emne, string $tekst): void
{
    $o = konto_epost_oppsett();
    $linje = fn(string $v) => trim(str_replace(["\r", "\n"], ' ', $v));
    $til = $linje($til);
    if (!filter_var($til, FILTER_VALIDATE_EMAIL)) throw new KontoFeil('E-postadressen ser ikke riktig ut.', 422);
    $emne = $linje($emne);
    if ($o['driver'] === 'fil') {
        // sortable to the microsecond, so the newest message is the last name
        [$mikro, $sek] = explode(' ', microtime());
        $navn = gmdate('Ymd\THis', (int) $sek) . substr($mikro, 1, 7) . '-' . bin2hex(random_bytes(6)) . '.json';
        $json = json_encode(['til' => $til, 'emne' => $emne, 'tekst' => $tekst, 'tid' => konto_na()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (@file_put_contents($o['mappe'] . '/' . $navn, $json, LOCK_EX) === false) {
            error_log('Designporten konto: e-post kunne ikke skrives til fangstmappen.');
            throw new KontoFeil('E-posten kunne ikke sendes. Prøv igjen senere.', 503);
        }
        @chmod($o['mappe'] . '/' . $navn, 0600);
        return;
    }
    $hoder = [
        'From: Designporten <' . $linje($o['fra']) . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    $ok = mail($til, mb_encode_mimeheader($emne, 'UTF-8', 'B'), chunk_split(base64_encode($tekst)), implode("\r\n", $hoder), '-f' . $o['fra']);
    if (!$ok) {
        error_log('Designporten konto: mail() feilet.');
        throw new KontoFeil('E-posten kunne ikke sendes. Prøv igjen senere.', 503);
    }
}

/** The captured messages, newest first (test builds only, for Studio). */
function konto_fangede_eposter(int $antall = 20): array
{
    if (empty(konto_bygg()['test'])) throw new KontoFeil('Finnes bare på testbygg.', 404);
    $o = konto_epost_oppsett();
    if ($o['driver'] !== 'fil') return [];
    $filer = glob($o['mappe'] . '/*.json') ?: [];
    rsort($filer);
    $ut = [];
    foreach (array_slice($filer, 0, $antall) as $fil) {
        $e = json_decode((string) file_get_contents($fil), true);
        if (is_array($e)) $ut[] = ['til' => $e['til'] ?? '', 'emne' => $e['emne'] ?? '', 'tekst' => $e['tekst'] ?? '', 'tid' => $e['tid'] ?? ''];
    }
    return $ut;
}
