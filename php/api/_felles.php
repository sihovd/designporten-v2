<?php
/**
 * Shared by the PHP form and order routes for web hosts without Node
 * (one.com). The PHP counterpart of src/lib/skjema/levering.ts: never drops
 * a message silently. It either e-mails it with PHP mail() or answers with
 * an error the page shows to the visitor.
 *
 * E-mail settings live in api/oppsett.php, written by the deploy workflow
 * from GitHub secrets (docs/development.md#deploy). Without them the routes
 * refuse, like KREV_EPOST=true in the Node build.
 */

declare(strict_types=1);

const DP_EPOST = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/';
const DP_MAKS_FILER = 8;
const DP_MAKS_BYTE_PER_FIL = 18 * 1024 * 1024;
const DP_MAKS_BYTE_TOTALT = 18 * 1024 * 1024;
const DP_ENDELSER = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf', 'stl', '3mf', 'step', 'stp', 'obj', 'svg'];

function dp_oppsett(): ?array
{
    $fil = __DIR__ . '/oppsett.php';
    if (!is_file($fil)) {
        return null;
    }
    $o = require $fil;
    if (!is_array($o) || empty($o['til']) || !preg_match(DP_EPOST, (string) $o['til'])) {
        return null;
    }
    $o['fra'] = !empty($o['fra']) && preg_match(DP_EPOST, (string) $o['fra']) ? $o['fra'] : $o['til'];
    return $o;
}

function dp_referanse(): string
{
    $tegn = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $tilfeldig = '';
    for ($i = 0; $i < 5; $i++) {
        $tilfeldig .= $tegn[random_int(0, strlen($tegn) - 1)];
    }
    return 'DP-' . gmdate('Ymd') . '-' . $tilfeldig;
}

function dp_json(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function dp_videre(string $sti, array $parametre): never
{
    http_response_code(303);
    header('Location: ' . $sti . ($parametre ? '?' . http_build_query($parametre) : ''));
    exit;
}

/** Text without control characters (except newline and tab), trimmed and cut to $maks characters. */
function dp_tekst(mixed $v, int $maks = 4000): string
{
    if (!is_string($v)) {
        return '';
    }
    $v = preg_replace('/[^\P{C}\n\t]/u', '', $v) ?? '';
    return mb_substr(trim($v), 0, $maks);
}

/** One header value: no line breaks, so nothing can be injected. */
function dp_linje(string $v): string
{
    return trim(str_replace(["\r", "\n"], ' ', $v));
}

/**
 * Sends one submission. $felter is a list of [label, value]; $vedlegg a list
 * of ['filnavn' => , 'type' => , 'innhold' => bytes].
 * Returns the reference, or null when the mail could not be handed over.
 */
function dp_send(array $oppsett, string $emne, array $felter, string $svarTil, array $vedlegg): ?string
{
    $ref = dp_referanse();
    $tekst = $emne . "\nReferanse: " . $ref . "\n\n";
    foreach ($felter as [$navn, $verdi]) {
        $tekst .= $navn . ":\n" . ($verdi !== '' ? $verdi : '—') . "\n\n";
    }

    $grense = 'dp-' . bin2hex(random_bytes(12));
    $hoder = [
        'From: Designporten nettside <' . dp_linje($oppsett['fra']) . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' . $grense . '"',
    ];
    if ($svarTil !== '' && preg_match(DP_EPOST, $svarTil)) {
        $hoder[] = 'Reply-To: ' . dp_linje($svarTil);
    }

    $kropp = "--$grense\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($tekst)) . "\r\n";
    foreach ($vedlegg as $v) {
        $navn = dp_linje(str_replace('"', '', $v['filnavn']));
        $kropp .= "--$grense\r\n"
            . 'Content-Type: ' . dp_linje($v['type']) . '; name="' . $navn . "\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n"
            . 'Content-Disposition: attachment; filename="' . $navn . "\"\r\n\r\n"
            . chunk_split(base64_encode($v['innhold'])) . "\r\n";
    }
    $kropp .= "--$grense--\r\n";

    $emneHode = mb_encode_mimeheader(dp_linje("[$ref] $emne"), 'UTF-8', 'B');
    $ok = mail((string) $oppsett['til'], $emneHode, $kropp, implode("\r\n", $hoder), '-f' . $oppsett['fra']);
    if (!$ok) {
        error_log('Designporten skjema: mail() feilet for ' . $ref);
        return null;
    }
    return $ref;
}

function dp_bare_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        header('Allow: POST');
        exit;
    }
}
