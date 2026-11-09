<?php
/**
 * Stripe Checkout for the PHP build (one.com). The PHP counterpart of
 * src/server/stripe.ts and src/lib/handel/kasse.ts: hosted Checkout only, no
 * card data here (CLAUDE.md rule 5). Keys live in api/stripe/konfig.php on the
 * web host, never in git and never in the browser.
 *
 * Live keys are refused unless konfig.php says 'tillat_live' => true, and
 * always on test builds.
 */

declare(strict_types=1);

require_once __DIR__ . '/../_felles.php';

const DP_STRIPE_API = 'https://api.stripe.com/v1';
const DP_DESIGN_PREFIKS = 'skaperverksted-';

/** The build's own settings (api/bygg.php): base path and whether it is a test build. */
function dp_bygg(): array
{
    $fil = __DIR__ . '/../bygg.php';
    $b = is_file($fil) ? require $fil : [];
    return ['base' => (string) ($b['base'] ?? '/'), 'test' => (bool) ($b['test'] ?? false)];
}

/**
 * Stripe settings, or null with a reason in $grunn (for the log only, never
 * shown with key values).
 */
function dp_stripe_konfig(?string &$grunn = null): ?array
{
    if (PHP_SAPI === 'cli-server' && defined('DP_STRIPE_KONFIG')) {
        $k = DP_STRIPE_KONFIG;
    } else {
        $fil = __DIR__ . '/konfig.php';
        $k = is_file($fil) ? require $fil : null;
    }
    if (!is_array($k)) {
        $grunn = 'api/stripe/konfig.php mangler';
        return null;
    }
    $nokkel = trim((string) ($k['hemmelig_nokkel'] ?? ''));
    if (!preg_match('/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/', $nokkel, $m)) {
        $grunn = 'hemmelig_nokkel mangler eller har feil form';
        return null;
    }
    $live = $m[2] === 'live';
    if ($live && (empty($k['tillat_live']) || dp_bygg()['test'])) {
        $grunn = 'live-nøkkel uten tillat_live (eller på testbygg)';
        return null;
    }
    return [
        'nokkel' => $nokkel,
        'live' => $live,
        'webhook' => trim((string) ($k['webhook_hemmelighet'] ?? '')),
        'nettsted' => rtrim(trim((string) ($k['nettsted_url'] ?? '')), '/'),
        'api' => (string) ($k['api_url'] ?? DP_STRIPE_API),
    ];
}

/** The catalogue and shop settings the build writes to api/katalog.json. */
function dp_katalog(): ?array
{
    if (PHP_SAPI === 'cli-server' && defined('DP_LOKAL_KATALOG')) return DP_LOKAL_KATALOG;
    $fil = __DIR__ . '/../katalog.json';
    $k = is_file($fil) ? json_decode((string) file_get_contents($fil), true) : null;
    return is_array($k) && is_array($k['produkter'] ?? null) ? $k : null;
}

/** Same rule as kassestatus() in src/server/ruter/kasse.ts. */
function dp_kassestatus(?array $katalog, ?array $konfig): array
{
    $butikk = $katalog['butikk'] ?? null;
    if (!$katalog || !is_array($butikk) || empty($butikk['betaling'])) {
        return ['aktiv' => false, 'grunn' => 'Kortbetaling er ikke slått på ennå.'];
    }
    if (!$konfig) return ['aktiv' => false, 'grunn' => 'Betalingsløsningen er ikke koblet til ennå.'];
    if (empty($butikk['frakt'])) return ['aktiv' => false, 'grunn' => 'Frakt er ikke satt opp ennå.'];
    return ['aktiv' => true];
}

/** Public base URL for Stripe's return links, ending without a slash. */
function dp_nettsted(array $konfig): string
{
    if ($konfig['nettsted'] !== '') return $konfig['nettsted'];
    $vert = preg_replace('/[^A-Za-z0-9.:\-\[\]]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    return ($https ? 'https' : 'http') . '://' . $vert . rtrim(dp_bygg()['base'], '/');
}

/**
 * One call to Stripe's REST API. Returns ['ok' => true, 'data' => array] or
 * ['ok' => false, 'status' => int, 'melding' => string].
 */
function dp_stripe(array $konfig, string $metode, string $sti, array $kropp = [], string $idempotens = ''): array
{
    if (PHP_SAPI === 'cli-server' && function_exists('dp_stripe_fake')) {
        return dp_stripe_fake($metode, $sti, $kropp, $idempotens);
    }
    $hoder = ['Authorization: Bearer ' . $konfig['nokkel']];
    if ($idempotens !== '') $hoder[] = 'Idempotency-Key: ' . $idempotens;
    $c = curl_init($konfig['api'] . $sti);
    curl_setopt_array($c, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $hoder,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);
    if ($metode === 'POST') {
        curl_setopt($c, CURLOPT_POST, true);
        curl_setopt($c, CURLOPT_POSTFIELDS, http_build_query($kropp, '', '&', PHP_QUERY_RFC3986));
    }
    $raa = curl_exec($c);
    $status = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    $feil = curl_error($c);
    curl_close($c);
    $data = is_string($raa) ? json_decode($raa, true) : null;
    if ($raa === false || !is_array($data) || $status < 200 || $status >= 300) {
        $melding = is_array($data) ? (string) ($data['error']['message'] ?? "HTTP $status") : ($feil ?: "HTTP $status");
        return ['ok' => false, 'status' => $status, 'melding' => $melding];
    }
    return ['ok' => true, 'data' => $data];
}

/**
 * Verifies the Stripe-Signature header (t=…,v1=…): HMAC-SHA256 of "t.payload"
 * with the endpoint secret, within $toleranse seconds. Same as sjekkSignatur().
 */
function dp_stripe_signatur(string $payload, string $hode, string $hemmelighet, ?int $naa = null, int $toleranse = 300): bool
{
    if ($hode === '' || $hemmelighet === '') return false;
    $t = null;
    $signaturer = [];
    foreach (explode(',', $hode) as $del) {
        [$k, $v] = array_pad(explode('=', trim($del), 2), 2, '');
        if ($k === 't' && ctype_digit($v)) $t = (int) $v;
        if ($k === 'v1') $signaturer[] = $v;
    }
    if ($t === null || !$signaturer || abs(($naa ?? time()) - $t) > $toleranse) return false;
    $forventet = hash_hmac('sha256', $t . '.' . $payload, $hemmelighet);
    foreach ($signaturer as $s) {
        if (hash_equals($forventet, $s)) return true;
    }
    return false;
}

/**
 * The server check of lagKasse() in kasse.ts: confirmed, priced products only,
 * every price from the catalogue. Returns ['ok' => true, 'linjer' => [...]] or
 * ['ok' => false, 'grunn' => string].
 */
function dp_lag_kasse(array $linjer, array $katalog): array
{
    if (!$linjer) return ['ok' => false, 'grunn' => 'Handlekurven er tom.'];
    $produkter = array_column($katalog['produkter'], null, 'id');
    $ut = [];
    foreach ($linjer as $l) {
        if (str_starts_with($l['produktId'], DP_DESIGN_PREFIKS) || !empty($l['designId']) || !empty($l['design'])) {
            return ['ok' => false, 'grunn' => 'Design fra Skaperverksted prises sammen med deg, så de sendes som forespørsel.'];
        }
        $p = $produkter[$l['produktId']] ?? null;
        if (!$p) return ['ok' => false, 'grunn' => 'Et produkt i handlekurven finnes ikke lenger.'];
        if (($p['status'] ?? '') !== 'bekreftet') return ['ok' => false, 'grunn' => "«{$p['navn']}» er ikke klart for salg ennå."];
        $tekst = trim((string) ($l['valg']['tekst'] ?? ''));
        // beregnPris (pris.ts): the product's own price plus its text surcharge, or none.
        $pris = $p['prisOre'];
        if ($pris !== null && $p['egenTekst'] && $tekst !== '') {
            $pris = $p['egenTekst']['tilleggOre'] === null ? null : $pris + $p['egenTekst']['tilleggOre'];
        }
        if (!is_int($pris)) return ['ok' => false, 'grunn' => "«{$p['navn']}» har ingen fastsatt pris."];
        $farge = null;
        foreach ($p['farger'] as $f) {
            if ($f['id'] === ($l['valg']['farge'] ?? null)) $farge = $f;
        }
        $materiale = in_array($l['valg']['materiale'] ?? null, $p['materialer'], true) ? $l['valg']['materiale'] : null;
        if (!$farge || !$materiale) {
            return ['ok' => false, 'grunn' => "Valgene for «{$p['navn']}» er ikke gyldige lenger. Legg varen inn på nytt."];
        }
        if (array_diff(array_keys($l['valg']), ['farge', 'materiale', 'tekst'])) {
            return ['ok' => false, 'grunn' => 'Handlekurven inneholder ukjente valg.'];
        }
        if ($tekst !== '' && (!$p['egenTekst'] || mb_strlen($tekst) > $p['egenTekst']['maksTegn'])) {
            return ['ok' => false, 'grunn' => "Teksten for «{$p['navn']}» er for lang eller ikke tillatt."];
        }
        $ut[] = [
            'produktId' => $p['id'],
            'navn' => $p['navn'],
            'beskrivelse' => implode(', ', array_filter([
                "Farge: {$farge['navn']}",
                "Materiale: $materiale",
                $tekst !== '' ? "Tekst: «{$tekst}»" : null,
            ])),
            'enhetOre' => $pris,
            'antall' => $l['antall'],
        ];
    }
    return ['ok' => true, 'linjer' => $ut];
}

/** Same parameters as stripeParametre() in kasse.ts. Prices include VAT; Norwegian addresses only. */
function dp_stripe_parametre(array $linjer, array $kunde, array $frakt, string $base, string $ref): array
{
    $p = [
        'mode' => 'payment',
        'locale' => 'nb',
        'currency' => 'nok',
        'customer_email' => $kunde['epost'],
        'client_reference_id' => $ref,
        'success_url' => "$base/handlekurv/betalt/?okt={CHECKOUT_SESSION_ID}",
        'cancel_url' => "$base/handlekurv/",
        'shipping_address_collection' => ['allowed_countries' => ['NO']],
        'phone_number_collection' => ['enabled' => 'true'],
        'metadata' => array_filter([
            'referanse' => $ref,
            'navn' => mb_substr($kunde['navn'], 0, 500),
            'telefon' => mb_substr($kunde['telefon'], 0, 500),
            'melding' => mb_substr($kunde['melding'], 0, 500),
        ], fn($v) => $v !== ''),
        'line_items' => [],
        'shipping_options' => [],
    ];
    foreach ($linjer as $l) {
        $produkt = ['name' => $l['navn'], 'metadata' => ['produktId' => $l['produktId']]];
        if ($l['beskrivelse'] !== '') $produkt['description'] = $l['beskrivelse'];
        $p['line_items'][] = [
            'quantity' => (string) $l['antall'],
            'price_data' => ['currency' => 'nok', 'unit_amount' => (string) $l['enhetOre'], 'product_data' => $produkt],
        ];
    }
    foreach ($frakt as $f) {
        $rate = [
            'type' => 'fixed_amount',
            'display_name' => $f['navn'],
            'fixed_amount' => ['amount' => (string) $f['prisOre'], 'currency' => 'nok'],
        ];
        if (!empty($f['dagerMin']) && !empty($f['dagerMaks'])) {
            $rate['delivery_estimate'] = [
                'minimum' => ['unit' => 'business_day', 'value' => (string) $f['dagerMin']],
                'maximum' => ['unit' => 'business_day', 'value' => (string) max($f['dagerMin'], $f['dagerMaks'])],
            ];
        }
        $p['shipping_options'][] = ['shipping_rate_data' => $rate];
    }
    return $p;
}
