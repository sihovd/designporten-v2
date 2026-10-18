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
 *   outside the site's public files. Used in development and tests, and on a
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

/** The site's own root (where api/ lives): the capture folder must be outside it. */
function konto_nettrot(): string
{
    return (string) realpath(dirname(__DIR__, 2));
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
        $rot = konto_nettrot();
        if ($ekte === $rot || str_starts_with($ekte . '/', $rot . '/')) {
            // inside the web root anyone could read the links
            error_log('Designporten konto: e-postmappen ligger i nettroten og brukes ikke.');
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
