<?php
/**
 * GET /api/kasse/okt/?okt=cs_… : the thank-you page asks whether a Checkout
 * Session is paid before it says so and empties the cart. PHP version of
 * src/server/ruter/kasse-okt.ts. The answer comes from Stripe, never from the URL.
 */

declare(strict_types=1);

require __DIR__ . '/../../stripe/_stripe.php';

$id = is_string($_GET['okt'] ?? null) ? $_GET['okt'] : '';
if (!preg_match('/^cs_[A-Za-z0-9_]{10,200}$/', $id)) {
    dp_json(['betalt' => false], 400);
}
$konfig = dp_stripe_konfig();
if (!$konfig) {
    dp_json(['betalt' => false], 503);
}
$okt = dp_stripe($konfig, 'GET', '/checkout/sessions/' . $id);
if (!$okt['ok']) {
    dp_json(['betalt' => false], $okt['status'] === 404 ? 404 : 502);
}
dp_json([
    'betalt' => ($okt['data']['payment_status'] ?? '') === 'paid',
    'referanse' => $okt['data']['client_reference_id'] ?? null,
    'sumOre' => $okt['data']['amount_total'] ?? null,
]);
