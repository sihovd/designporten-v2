<?php
/**
 * Card payment through Stripe Checkout (hosted), PHP version of
 * src/server/ruter/kasse.ts. GET tells the cart page whether card payment is
 * on; POST checks the cart against the catalogue and returns the Checkout URL.
 * Prices always come from the catalogue, never from the browser.
 */

declare(strict_types=1);

require __DIR__ . '/../stripe/_stripe.php';

const MAKS_BYTE = 256 * 1024;

function er_tekst(mixed $v, int $min, int $maks): bool
{
    return is_string($v) && mb_strlen(trim($v)) >= $min && mb_strlen(trim($v)) <= $maks;
}

function ugyldig(string $felt, string $melding): never
{
    dp_json(['ok' => false, 'grunn' => 'Sjekk feltene som er markert.', 'felt' => [$felt => $melding]], 400);
}

$metode = $_SERVER['REQUEST_METHOD'] ?? '';
$katalog = dp_katalog();
$konfig = dp_stripe_konfig($hvorfor);
if ($katalog && !empty($katalog['butikk']['betaling']) && !$konfig) {
    error_log("Designporten kasse: Stripe er ikke satt opp ($hvorfor).");
}
$status = dp_kassestatus($katalog, $konfig);

if ($metode === 'GET') {
    dp_json($status);
}
if ($metode !== 'POST') {
    http_response_code(405);
    header('Allow: GET, POST');
    exit;
}
if (!$status['aktiv']) {
    dp_json(['ok' => false, 'grunn' => $status['grunn']], 503);
}
if (!str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
    dp_json(['ok' => false, 'grunn' => 'Forespørselen må sendes som JSON.'], 415);
}
$raa = (string) file_get_contents('php://input', false, null, 0, MAKS_BYTE + 1);
if (strlen($raa) > MAKS_BYTE) {
    dp_json(['ok' => false, 'grunn' => 'Forespørselen er for stor.'], 413);
}
$b = json_decode($raa, true);
if (!is_array($b)) {
    dp_json(['ok' => false, 'grunn' => 'Forespørselen kunne ikke leses.'], 400);
}

// ---- The same field checks as bestillingSkjema (bestilling.ts) ----
if (!er_tekst($b['navn'] ?? null, 2, 120)) ugyldig('navn', 'Skriv navnet ditt.');
$epost = is_string($b['epost'] ?? null) ? trim($b['epost']) : '';
if (!filter_var($epost, FILTER_VALIDATE_EMAIL)) ugyldig('epost', 'Skriv en gyldig e-postadresse.');
$telefon = $b['telefon'] ?? '';
$melding = $b['melding'] ?? '';
if (!er_tekst($telefon, 0, 40)) ugyldig('telefon', 'Telefonnummeret er for langt.');
if (!er_tekst($melding, 0, 4000)) ugyldig('melding', 'Meldingen er for lang.');
$linjer = $b['linjer'] ?? null;
if (!is_array($linjer) || !array_is_list($linjer) || count($linjer) < 1) ugyldig('linjer', 'Handlekurven er tom.');
if (count($linjer) > 50) ugyldig('linjer', 'Handlekurven har for mange linjer.');
foreach ($linjer as $l) {
    $gyldig = is_array($l)
        && er_tekst($l['produktId'] ?? null, 1, 100)
        && is_int($l['antall'] ?? null) && $l['antall'] >= 1 && $l['antall'] <= 999
        && is_array($l['valg'] ?? null);
    if ($gyldig) {
        foreach ($l['valg'] as $k => $v) {
            if (!is_string($k) || mb_strlen($k) > 40 || !is_string($v) || mb_strlen($v) > 300) $gyldig = false;
        }
    }
    if (!$gyldig) {
        ugyldig('linjer', 'Handlekurven inneholder en linje som ikke kan leses. Fjern den og legg varen inn på nytt.');
    }
}

$kasse = dp_lag_kasse($linjer, $katalog);
if (!$kasse['ok']) {
    dp_json(['ok' => false, 'grunn' => $kasse['grunn']], 400);
}

$ref = dp_referanse();
$kunde = [
    'navn' => dp_tekst($b['navn'], 120),
    'epost' => $epost,
    'telefon' => dp_tekst($telefon, 40),
    'melding' => dp_tekst($melding, 4000),
];
$parametre = dp_stripe_parametre($kasse['linjer'], $kunde, $katalog['butikk']['frakt'], dp_nettsted($konfig), $ref);
$okt = dp_stripe($konfig, 'POST', '/checkout/sessions', $parametre, $ref);
if (!$okt['ok'] || !is_string($okt['data']['url'] ?? null)) {
    error_log('Designporten kasse: Stripe kunne ikke opprette betaling (' . ($okt['status'] ?? 0) . '): ' . ($okt['melding'] ?? 'mangler url'));
    dp_json(['ok' => false, 'grunn' => 'Betalingen kunne ikke startes. Prøv igjen, eller send som forespørsel.'], 502);
}
dp_json(['ok' => true, 'url' => $okt['data']['url']]);
