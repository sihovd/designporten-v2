<?php
/**
 * A paid Stripe Checkout Session as Designporten's own order: the same facts
 * for the e-mail to Designporten and for the order list in Studio (orders
 * live in the CMS database, decision log 2026-10-15). Payment itself stays
 * with Stripe: no card data here, and refunds are made in Stripe's dashboard.
 */

declare(strict_types=1);

require_once __DIR__ . '/_stripe.php';

/** Delivery states an order can have in Studio. Payment is Stripe's, not ours. */
const DP_ORDRE_LEVERING = [
    'ny' => 'Ny',
    'i_produksjon' => 'I produksjon',
    'klar' => 'Klar til henting/sending',
    'sendt' => 'Sendt',
    'levert' => 'Levert',
    'kansellert' => 'Kansellert',
];

function dp_ordre_adresse(?array $a): string
{
    $x = $a['address'] ?? null;
    if (!is_array($x)) return '';
    return implode("\n", array_filter([
        $a['name'] ?? null,
        $x['line1'] ?? null,
        $x['line2'] ?? null,
        trim(($x['postal_code'] ?? '') . ' ' . ($x['city'] ?? '')),
    ], fn($v) => is_string($v) && trim($v) !== ''));
}

/**
 * The order from a Checkout Session and its line items (null when Stripe
 * could not list them). Every text is trimmed to a safe length.
 */
function dp_ordre_fra_okt(array $okt, ?array $varelinjer, bool $live): array
{
    $meta = is_array($okt['metadata'] ?? null) ? $okt['metadata'] : [];
    $kunde = is_array($okt['customer_details'] ?? null) ? $okt['customer_details'] : [];
    $adresse = $okt['collected_information']['shipping_details'] ?? $okt['shipping_details'] ?? null;
    $linjer = null;
    if (is_array($varelinjer)) {
        $linjer = [];
        foreach (array_slice($varelinjer, 0, 100) as $l) {
            if (!is_array($l)) continue;
            $linjer[] = [
                'navn' => dp_tekst($l['description'] ?? 'Vare', 300),
                'antall' => max(1, (int) ($l['quantity'] ?? 1)),
                'belopOre' => (int) ($l['amount_total'] ?? 0),
            ];
        }
    }
    $intent = $okt['payment_intent'] ?? null;
    if (is_array($intent)) $intent = $intent['id'] ?? null;
    return [
        'stripeOkt' => (string) $okt['id'],
        'referanse' => dp_tekst($okt['client_reference_id'] ?? $okt['id'], 64),
        'modus' => $live ? 'live' : 'test',
        'betalingId' => is_string($intent) && preg_match('/^pi_[A-Za-z0-9_]{6,190}$/', $intent) ? $intent : null,
        'navn' => dp_tekst($meta['navn'] ?? '', 120) ?: dp_tekst($kunde['name'] ?? '', 120) ?: 'Kunde',
        'epost' => dp_tekst($kunde['email'] ?? '', 200),
        'telefon' => dp_tekst($kunde['phone'] ?? '', 40) ?: dp_tekst($meta['telefon'] ?? '', 40),
        'adresse' => dp_tekst(dp_ordre_adresse(is_array($adresse) ? $adresse : null), 1000),
        'melding' => dp_tekst($meta['melding'] ?? '', 4000),
        'linjer' => $linjer,
        'fraktOre' => isset($okt['shipping_cost']['amount_total']) ? (int) $okt['shipping_cost']['amount_total'] : null,
        'totalOre' => isset($okt['amount_total']) ? (int) $okt['amount_total'] : null,
        'valuta' => strtoupper(dp_tekst($okt['currency'] ?? 'nok', 8)) ?: 'NOK',
    ];
}

/** The fields of the e-mail to Designporten about a paid order. */
function dp_ordre_epostfelt(array $o): array
{
    $varer = is_array($o['linjer'])
        ? array_map(fn($l) => $l['antall'] . ' × ' . $l['navn'] . '  ' . dp_butikk_kroner($l['belopOre']), $o['linjer'])
        : ['(Varelinjene kunne ikke hentes. Se ordren i Stripe-dashbordet.)'];
    return [
        ['Referanse', $o['referanse']],
        ['Navn', $o['navn']],
        ['E-post', $o['epost']],
        ['Telefon', $o['telefon']],
        ['Leveringsadresse', $o['adresse']],
        ['Melding', $o['melding']],
        ['Varer', dp_tekst(implode("\n", $varer), 20000)],
        ['Frakt', $o['fraktOre'] !== null ? dp_butikk_kroner($o['fraktOre']) : ''],
        ['Totalt betalt', $o['totalOre'] !== null ? dp_butikk_kroner($o['totalOre']) : ''],
        ['Betaling', 'Betalt med kort via Stripe' . ($o['modus'] === 'live' ? '' : ' (TESTMODUS, ingen ekte penger)')
            . '. Stripe-økt: ' . $o['stripeOkt']],
    ];
}

/** E-mail the order to Designporten. Returns the delivery reference, or null when it was not sent. */
function dp_ordre_send(array $o): ?string
{
    $oppsett = dp_oppsett();
    if ($oppsett === null) return null;
    return dp_send($oppsett, "Betalt ordre {$o['referanse']} fra {$o['navn']}", dp_ordre_epostfelt($o), $o['epost'], []);
}

/**
 * The order confirmation to the customer, from Designporten's own address
 * («fra» in api/oppsett.php) with Designporten as Reply-To. Plain text, sent
 * once per order by the webhook. The payment receipt itself is Stripe's.
 * Returns true when it was handed over; false when there is no customer
 * address or no e-mail setup.
 */
function dp_ordre_bekreftelse(array $o): bool
{
    $oppsett = dp_oppsett();
    if ($oppsett === null || !preg_match(DP_EPOST, $o['epost'])) return false;

    $fornavn = trim(explode(' ', $o['navn'])[0] ?? '');
    $linjer = is_array($o['linjer'])
        ? array_map(fn($l) => '  ' . $l['antall'] . ' × ' . $l['navn'] . ' – ' . dp_butikk_kroner($l['belopOre']), $o['linjer'])
        : ['  (Se varene i betalingskvitteringen.)'];
    $deler = [
        'Hei' . ($fornavn !== '' && $fornavn !== 'Kunde' ? ' ' . $fornavn : '') . ',',
        '',
        'Takk for bestillingen! Vi har mottatt betalingen, og ordren din er registrert hos Designporten.',
        '',
        'Ordrenummer: ' . $o['referanse'],
        '',
        'Varer:',
        ...$linjer,
    ];
    if ($o['fraktOre'] !== null) $deler[] = 'Frakt: ' . dp_butikk_kroner($o['fraktOre']);
    if ($o['totalOre'] !== null) $deler[] = 'Totalt betalt: ' . dp_butikk_kroner($o['totalOre']) . ' (inkl. mva)';
    if ($o['adresse'] !== '') array_push($deler, '', 'Leveringsadresse:', $o['adresse']);
    array_push(
        $deler,
        '',
        'Du hører fra oss når ordren er sendt eller klar til henting.',
        '',
        'Lurer du på noe? Svar på denne e-posten, og oppgi ordrenummeret.',
        '',
        'Hilsen',
        'Designporten',
        'https://designporten.no',
    );
    if ($o['modus'] !== 'live') array_unshift($deler, '[TESTMODUS: ingen ekte penger er trukket]', '');
    $tekst = implode("\n", $deler) . "\n";

    $emne = 'Takk for bestillingen – ordre ' . $o['referanse'];
    if (PHP_SAPI === 'cli-server' && function_exists('dp_testmail')) {
        return dp_testmail('kunde-' . $o['referanse'], "Til: {$o['epost']}\nEmne: $emne\n\n$tekst", []);
    }
    $hoder = [
        'From: Designporten <' . dp_linje($oppsett['fra']) . '>',
        'Reply-To: ' . dp_linje($oppsett['fra']),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    return dp_mail(
        dp_linje($o['epost']),
        mb_encode_mimeheader(dp_linje($emne), 'UTF-8', 'B'),
        chunk_split(base64_encode($tekst)),
        implode("\r\n", $hoder),
        (string) $oppsett['fra'],
    );
}
