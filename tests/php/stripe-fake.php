<?php
// A small, stateful stand-in for Stripe's API in the PHP tests (never the real API, never in dist/).
// State lives in one JSON file ($fil); the tests read and change it to play what happens at
// Stripe (a customer pays, a renewal fails, the customer cancels in the portal). Every call is
// recorded under 'kall'. The shop's line items keep their old fixed answer.
declare(strict_types=1);

function dp_stripe_fake_fil(): string
{
    return (getenv('DP_CMS_ROT') ?: sys_get_temp_dir()) . '/stripe-fake.json';
}

function dp_stripe_fake(string $metode, string $sti, array $kropp, string $idempotens): array
{
    $fil = dp_stripe_fake_fil();
    $h = fopen($fil, 'c+');
    flock($h, LOCK_EX);
    $tilstand = json_decode((string) stream_get_contents($h), true) ?: [];
    $tilstand += ['kall' => [], 'produkter' => [], 'priser' => [], 'kunder' => [], 'okter' => [], 'abonnementer' => [], 'portaler' => [], 'feil' => []];
    $tilstand['kall'][] = ['metode' => $metode, 'sti' => $sti, 'kropp' => $kropp];
    $ok = fn(array $d) => ['ok' => true, 'data' => $d];
    $mangler = fn(string $hva) => ['ok' => false, 'status' => 404, 'melding' => "No such $hva"];
    $nyId = fn(string $p) => $p . substr(bin2hex(random_bytes(10)), 0, 14);
    $sti0 = (string) parse_url($sti, PHP_URL_PATH);
    parse_str((string) parse_url($sti, PHP_URL_QUERY), $sok);
    $svar = null;

    foreach ($tilstand['feil'] as $monster) {
        if (preg_match($monster, "$metode $sti0")) $svar = ['ok' => false, 'status' => 500, 'melding' => 'fake failure'];
    }
    if ($svar === null) {
        if (preg_match('~^/checkout/sessions/(cs_[A-Za-z0-9_]+)/line_items$~', $sti0)) {
            $svar = $ok(['data' => [['description' => 'Vase', 'quantity' => 2, 'amount_total' => 49800]]]);
        } elseif ($metode === 'GET' && preg_match('~^/products/(.+)$~', $sti0, $m)) {
            $svar = isset($tilstand['produkter'][$m[1]]) ? $ok($tilstand['produkter'][$m[1]]) : $mangler('product');
        } elseif ($metode === 'POST' && $sti0 === '/products') {
            $tilstand['produkter'][$kropp['id']] = $kropp;
            $svar = $ok($kropp);
        } elseif ($metode === 'GET' && $sti0 === '/prices') {
            $nokler = (array) ($sok['lookup_keys'] ?? []);
            $svar = $ok(['data' => array_values(array_filter($tilstand['priser'], fn($p) => in_array($p['lookup_key'], $nokler, true)))]);
        } elseif ($metode === 'POST' && $sti0 === '/prices') {
            $p = $kropp + ['id' => $nyId('price_')];
            $p['unit_amount'] = (int) $p['unit_amount'];
            $tilstand['priser'][$p['id']] = $p;
            $svar = $ok($p);
        } elseif ($metode === 'GET' && preg_match('~^/customers/(.+)$~', $sti0, $m)) {
            $svar = isset($tilstand['kunder'][$m[1]]) ? $ok($tilstand['kunder'][$m[1]]) : $mangler('customer');
        } elseif ($metode === 'POST' && $sti0 === '/customers') {
            $k = $kropp + ['id' => $nyId('cus_')];
            $tilstand['kunder'][$k['id']] = $k;
            $svar = $ok($k);
        } elseif ($metode === 'POST' && preg_match('~^/customers/(.+)$~', $sti0, $m)) {
            if (!isset($tilstand['kunder'][$m[1]])) $svar = $mangler('customer');
            else $svar = $ok($tilstand['kunder'][$m[1]] = $kropp + $tilstand['kunder'][$m[1]]);
        } elseif ($metode === 'POST' && $sti0 === '/checkout/sessions') {
            $id = 'cs_test_' . ($kropp['mode'] === 'subscription' ? 'abo' : 'fake') . bin2hex(random_bytes(8));
            $o = $kropp + ['id' => $id, 'url' => 'https://checkout.stripe.invalid/c/pay/' . $id, 'status' => 'open', 'subscription' => null];
            $tilstand['okter'][$id] = $o;
            $svar = $ok($o);
        } elseif ($metode === 'GET' && preg_match('~^/checkout/sessions/(cs_[A-Za-z0-9_]+)$~', $sti0, $m)) {
            $svar = isset($tilstand['okter'][$m[1]]) ? $ok($tilstand['okter'][$m[1]]) : $mangler('checkout.session');
        } elseif ($metode === 'GET' && $sti0 === '/subscriptions') {
            $liste = array_values(array_filter($tilstand['abonnementer'], fn($s) => $s['customer'] === ($sok['customer'] ?? '')));
            $svar = $ok(['data' => $liste]);
        } elseif ($metode === 'GET' && preg_match('~^/subscriptions/(sub_[A-Za-z0-9_]+)$~', $sti0, $m)) {
            $svar = isset($tilstand['abonnementer'][$m[1]]) ? $ok($tilstand['abonnementer'][$m[1]]) : $mangler('subscription');
        } elseif ($metode === 'DELETE' && preg_match('~^/subscriptions/(sub_[A-Za-z0-9_]+)$~', $sti0, $m)) {
            if (!isset($tilstand['abonnementer'][$m[1]])) $svar = $mangler('subscription');
            else {
                $tilstand['abonnementer'][$m[1]]['status'] = 'canceled';
                $tilstand['abonnementer'][$m[1]]['ended_at'] = time();
                $svar = $ok($tilstand['abonnementer'][$m[1]]);
            }
        } elseif ($metode === 'POST' && $sti0 === '/billing_portal/configurations') {
            $c = $kropp + ['id' => $nyId('bpc_')];
            $tilstand['portaler'][$c['id']] = $c;
            $svar = $ok($c);
        } elseif ($metode === 'POST' && $sti0 === '/billing_portal/sessions') {
            $svar = isset($tilstand['kunder'][$kropp['customer']])
                ? $ok(['id' => $nyId('bps_'), 'url' => 'https://billing.stripe.invalid/p/session/' . $kropp['customer']])
                : $mangler('customer');
        } else {
            $svar = ['ok' => false, 'status' => 400, 'melding' => "fake: $metode $sti0"];
        }
    }
    // the maps stay JSON objects even when empty, so a test can add to them by id
    foreach (['produkter', 'priser', 'kunder', 'okter', 'abonnementer', 'portaler'] as $kart) $tilstand[$kart] = (object) $tilstand[$kart];
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, json_encode($tilstand, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    flock($h, LOCK_UN);
    fclose($h);
    return $svar;
}
