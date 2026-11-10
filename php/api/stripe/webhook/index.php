<?php
/**
 * Stripe webhook (POST /api/stripe/webhook/), PHP version of
 * src/server/ruter/stripe-webhook.ts. Subscription events (the paid account
 * packages) go to the accounts (api/konto/_abonnement.php); the rest of this
 * file is the shop. On a paid Checkout Session the order is
 * saved in the CMS database (Studio → Butikk og betaling → Ordrer) when the
 * CMS is set up, and e-mailed to Designporten through the same delivery as
 * the forms (_felles.php). The customer's receipt is sent by Stripe. Refunds
 * and disputes are handled in the Stripe dashboard.
 *
 * Each session is delivered once: a claim file in api/stripe/data/ (never
 * served) stops Stripe's retries and parallel deliveries from sending the
 * order twice, and the order table has one row per session. If the e-mail
 * fails, an order that is safe in the database still answers 200 (Studio
 * shows it as «ikke varslet» and can send it again); without the database
 * the claim is dropped and the answer is 500, so Stripe tries again later.
 */

declare(strict_types=1);

require_once __DIR__ . '/../_ordre.php';

dp_bare_post();

const MAKS_BYTE = 512 * 1024;
const FORLATT_ETTER = 120; // seconds

ignore_user_abort(true);
@set_time_limit(90);

function svar(string $tekst, int $status): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $tekst;
    exit;
}

/** Save the order in the CMS database when the CMS is set up. True when it is there. */
function lagre_i_cms(array $ordre): bool
{
    $kjerne = __DIR__ . '/../../cms/_kjerne.php';
    if (!is_file($kjerne)) return false;
    require_once $kjerne;
    if (cms_konfig() === null) return false;
    try {
        cms_ordre_lagre($ordre);
        return true;
    } catch (Throwable $e) {
        error_log('Designporten webhook: ordren ble ikke lagret i CMS-et: ' . $e->getMessage());
        return false;
    }
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
if (!is_array($hendelse)) svar('Ugyldig hendelse', 400);
$okt = $hendelse['data']['object'] ?? null;
$type = (string) ($hendelse['type'] ?? '');
// A test-mode event never counts on a live setup, and the other way round.
if (isset($hendelse['livemode']) && (bool) $hendelse['livemode'] !== $konfig['live']) {
    error_log('Designporten webhook: hendelse fra feil modus (test/live) avvist.');
    svar('Feil modus', 400);
}
// Subscriptions (the paid account packages) belong to the accounts, not the shop:
// api/konto/_abonnement.php keeps the member's package in step with Stripe.
$abonnement = __DIR__ . '/../../konto/_abonnement.php';
if (is_file($abonnement)) {
    require_once $abonnement;
    if (konto_er_abonnementshendelse($type, $okt)) {
        [$status, $tekst] = konto_stripe_hendelse($hendelse, $konfig);
        svar($tekst, $status);
    }
}
$betalt = (($type === 'checkout.session.completed' && ($okt['payment_status'] ?? '') === 'paid')
    || $type === 'checkout.session.async_payment_succeeded')
    && ($okt['mode'] ?? 'payment') === 'payment';
if (!$betalt || !is_array($okt) || !preg_match('/^cs_[A-Za-z0-9_]{10,200}$/', (string) ($okt['id'] ?? ''))) {
    svar('ok', 200);
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
    // An empty claim older than two minutes is left by an attempt that died
    // (timeout, fatal error) before it delivered: take it over so Stripe's
    // retry or «Resend» still gets the order through.
    clearstatcache(true, $krav);
    $tid = @filemtime($krav);
    if (@filesize($krav) === 0 && $tid !== false && time() - $tid > FORLATT_ETTER) {
        error_log('Designporten webhook: tar over et avbrutt forsøk for ' . $okt['id'] . '.');
        @unlink($krav);
        $h = @fopen($krav, 'x');
    }
    if ($h === false) svar('ok', 200); // already delivered, or being delivered right now
}
// If the script dies before the order is delivered, drop the empty claim and
// log why, so the next attempt is not mistaken for a finished delivery.
$ferdig = false;
register_shutdown_function(function () use (&$ferdig, $krav, $okt): void {
    if ($ferdig) return;
    $feil = error_get_last();
    error_log('Designporten webhook: ordre ' . $okt['id'] . ' ble avbrutt før levering'
        . ($feil ? ' (' . $feil['message'] . ' i ' . basename((string) $feil['file']) . ':' . $feil['line'] . ')' : '') . '.');
    clearstatcache(true, $krav);
    if (@filesize($krav) === 0) @unlink($krav);
});

/** Class and message only (no keys or customer data): logged, and shown in Stripe's «Event deliveries». */
function krasjtekst(Throwable $e): string
{
    $t = get_class($e) . ': ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')';
    error_log('Designporten webhook: ' . $t);
    return $t;
}

$krasj = '';
$ordre = null;
$lagret = false;
$sendt = null;
try {
    $linjer = dp_stripe($konfig, 'GET', '/checkout/sessions/' . $okt['id'] . '/line_items?limit=100');
    $ordre = dp_ordre_fra_okt(
        $okt,
        $linjer['ok'] && is_array($linjer['data']['data'] ?? null) ? $linjer['data']['data'] : null,
        $konfig['live'],
    );
} catch (Throwable $e) {
    $krasj = krasjtekst($e);
}
if ($ordre !== null) {
    $lagret = lagre_i_cms($ordre);
    try {
        $sendt = dp_ordre_send($ordre);
        if ($sendt !== null && $lagret) cms_ordre_varslet($ordre['stripeOkt']);
    } catch (Throwable $e) {
        $krasj = krasjtekst($e);
    }
}

$ferdig = true;
if ($sendt === null && !$lagret) {
    fclose($h);
    @unlink($krav);
    error_log('Designporten webhook: ordre ' . $okt['id'] . ' ble ikke levert, Stripe prøver igjen.');
    svar('Kunne ikke levere' . ($krasj !== '' ? ': ' . $krasj : ''), 500);
}
if ($sendt === null) error_log('Designporten webhook: ordre ' . $okt['id'] . ' er lagret i Studio, men e-posten ble ikke sendt.');
fwrite($h, json_encode(['okt' => $okt['id'], 'epostreferanse' => $sendt, 'studio' => $lagret, 'tid' => gmdate('c')]));
fclose($h);
// The order is safe in Studio; the reply still says why the e-mail failed.
svar($sendt === null && $krasj !== '' ? 'ok (lagret i Studio, e-post feilet: ' . $krasj . ')' : 'ok', 200);
