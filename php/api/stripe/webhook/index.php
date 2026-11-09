<?php
/**
 * Stripe webhook (POST /api/stripe/webhook/), PHP version of
 * src/server/ruter/stripe-webhook.ts. On a paid Checkout Session the order is
 * e-mailed to Designporten through the same delivery as the forms (_felles.php).
 * The customer's receipt is sent by Stripe. Refunds and disputes are handled
 * in the Stripe dashboard.
 *
 * Each session is delivered once: a claim file in api/stripe/data/ (never
 * served) stops Stripe's retries and parallel deliveries from sending the
 * order twice. A failed e-mail drops the claim and answers 500, so Stripe
 * tries again later.
 */

declare(strict_types=1);

require __DIR__ . '/../_stripe.php';

dp_bare_post();

const MAKS_BYTE = 512 * 1024;

function kroner(int $ore): string
{
    return number_format(round($ore / 100), 0, ',', "\u{00A0}") . "\u{00A0}kr";
}

function adressetekst(?array $a): string
{
    $x = $a['address'] ?? null;
    if (!is_array($x)) return '';
    return implode("\n", array_filter([
        $a['name'] ?? null,
        $x['line1'] ?? null,
        $x['line2'] ?? null,
        trim(($x['postal_code'] ?? '') . ' ' . ($x['city'] ?? '')),
    ], fn($v) => is_string($v) && $v !== ''));
}

function svar(string $tekst, int $status): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $tekst;
    exit;
}

$konfig = dp_stripe_konfig($hvorfor);
if (!$konfig || $konfig['webhook'] === '') {
    error_log('Designporten webhook: ikke satt opp (' . ($hvorfor ?? 'webhook_hemmelighet mangler') . ').');
    svar('Webhook er ikke satt opp', 503);
}
$payload = (string) file_get_contents('php://input', false, null, 0, MAKS_BYTE + 1);
if (strlen($payload) > MAKS_BYTE) svar('For stor', 413);
if (!dp_stripe_signatur($payload, (string) ($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? ''), $konfig['webhook'])) {
    svar('Ugyldig signatur', 400);
}
$hendelse = json_decode($payload, true);
$okt = $hendelse['data']['object'] ?? null;
$type = $hendelse['type'] ?? '';
$betalt = ($type === 'checkout.session.completed' && ($okt['payment_status'] ?? '') === 'paid')
    || $type === 'checkout.session.async_payment_succeeded';
if (!$betalt || !is_array($okt) || !preg_match('/^cs_[A-Za-z0-9_]{10,200}$/', (string) ($okt['id'] ?? ''))) {
    svar('ok', 200);
}
// A test-mode event never counts on a live setup, and the other way round.
if (isset($hendelse['livemode']) && (bool) $hendelse['livemode'] !== $konfig['live']) {
    error_log('Designporten webhook: hendelse fra feil modus (test/live) avvist.');
    svar('Feil modus', 400);
}

// ---- Deliver each session once ----
$mappe = PHP_SAPI === 'cli-server' && defined('DP_STRIPE_DATA') ? DP_STRIPE_DATA : __DIR__ . '/../data';
if (!is_dir($mappe) && !mkdir($mappe, 0700, true) && !is_dir($mappe)) {
    error_log('Designporten webhook: kan ikke lage api/stripe/data/.');
    svar('Kunne ikke lagre', 500);
}
$krav = $mappe . '/' . $okt['id'] . '.json';
$h = @fopen($krav, 'x');
if ($h === false) {
    svar('ok', 200); // already delivered, or being delivered right now
}

$oppsett = dp_oppsett();
$sendt = null;
if ($oppsett !== null) {
    $linjer = dp_stripe($konfig, 'GET', '/checkout/sessions/' . $okt['id'] . '/line_items?limit=100');
    $varer = $linjer['ok'] && is_array($linjer['data']['data'] ?? null)
        ? array_map(
            fn($l) => ($l['quantity'] ?? 1) . ' × ' . ($l['description'] ?? 'Vare') . '  ' . kroner((int) ($l['amount_total'] ?? 0)),
            $linjer['data']['data'],
        )
        : ['(Varelinjene kunne ikke hentes. Se ordren i Stripe-dashbordet.)'];
    $meta = is_array($okt['metadata'] ?? null) ? $okt['metadata'] : [];
    $kunde = is_array($okt['customer_details'] ?? null) ? $okt['customer_details'] : [];
    $ref = (string) ($okt['client_reference_id'] ?? $okt['id']);
    $navn = dp_tekst($meta['navn'] ?? '', 120) ?: dp_tekst($kunde['name'] ?? '', 120) ?: 'kunde';
    $epost = dp_tekst($kunde['email'] ?? '', 200);
    $adresse = $okt['collected_information']['shipping_details'] ?? $okt['shipping_details'] ?? null;
    $sendt = dp_send($oppsett, "Betalt ordre $ref fra $navn", [
        ['Referanse', $ref],
        ['Navn', $navn],
        ['E-post', $epost],
        ['Telefon', dp_tekst($kunde['phone'] ?? '', 40) ?: dp_tekst($meta['telefon'] ?? '', 40)],
        ['Leveringsadresse', dp_tekst(adressetekst(is_array($adresse) ? $adresse : null), 1000)],
        ['Melding', dp_tekst($meta['melding'] ?? '', 4000)],
        ['Varer', dp_tekst(implode("\n", $varer), 20000)],
        ['Frakt', isset($okt['shipping_cost']['amount_total']) ? kroner((int) $okt['shipping_cost']['amount_total']) : ''],
        ['Totalt betalt', isset($okt['amount_total']) ? kroner((int) $okt['amount_total']) : ''],
        ['Betaling', 'Betalt med kort via Stripe' . ($konfig['live'] ? '' : ' (TESTMODUS, ingen ekte penger)') . '. Stripe-økt: ' . $okt['id']],
    ], $epost, []);
}

if ($sendt === null) {
    fclose($h);
    @unlink($krav);
    error_log('Designporten webhook: ordre ' . $okt['id'] . ' ble ikke levert, Stripe prøver igjen.');
    svar('Kunne ikke levere', 500);
}
fwrite($h, json_encode(['okt' => $okt['id'], 'epostreferanse' => $sendt, 'tid' => gmdate('c')]));
fclose($h);
svar('ok', 200);
