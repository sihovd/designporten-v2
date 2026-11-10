<?php
/**
 * Paid packages as Stripe subscriptions (Sivert, 2026-11-10: «vi må koble
 * medlemsstyring til medlemshåndtering i stripe med alle funksjoner»).
 *
 * - Buying: Stripe Checkout in subscription mode, monthly or yearly, at the
 *   price set in Studio (Pakker og priser). Hosted by Stripe; no card data
 *   here (CLAUDE.md rule 5). Only for a signed-in member with a confirmed
 *   address, only for a package Studio has put up for sale, and only when
 *   Stripe and its webhook are set up (api/stripe/konfig.php).
 * - Managing: Stripe's customer portal (change card, see receipts, switch
 *   between monthly and yearly, cancel at the end of the period, take the
 *   cancellation back). Its settings are made here through the API.
 * - The member's package follows the subscription as Stripe reports it: the
 *   webhook (api/stripe/webhook/) passes subscription and invoice events
 *   here, and every change is read back from Stripe before it is stored, so
 *   events that arrive late or twice change nothing. The return from
 *   Checkout and from the portal also reads it back, so the page is right at
 *   once even when the webhook is slow.
 * - E-mails from Designporten (not Stripe): welcome, payment received,
 *   payment failed, cancellation scheduled or taken back, package ended.
 *
 * Price and object ids: one Stripe product per package (id dp_plan_<plan>),
 * one price per package, period and amount (lookup key
 * dp_<plan>_<periode>_<øre>), made when first needed. A new price in Studio
 * makes a new Stripe price for new purchases; running subscriptions keep the
 * price they were bought at until Sivert moves them in Stripe.
 */

declare(strict_types=1);

require_once __DIR__ . '/_konto.php';
require_once __DIR__ . '/_epost.php';
require_once dirname(__DIR__) . '/stripe/_stripe.php';

const KONTO_PERIODER = ['maned' => 'month', 'ar' => 'year'];
const KONTO_PERIODENAVN = ['maned' => 'månedlig', 'ar' => 'årlig'];
/** Days a member keeps the package after a failed renewal while Stripe tries again. */
const KONTO_FORFALT_DAGER = 7;
/** Hours after the period's end before access stops, so a renewal that is charged a little late never shuts anyone out. */
const KONTO_FORNYELSE_TIMER = 48;
/** Stripe's statuses that still mean a subscription (bought and not ended). */
const KONTO_LEVENDE = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];

/** Stripe's settings, or a KontoFeil (503) that says what is missing. */
function konto_stripe(): array
{
    $k = dp_stripe_konfig($grunn);
    if ($k === null) {
        error_log('Designporten konto: Stripe er ikke satt opp (' . $grunn . ').');
        throw new KontoFeil('Betaling er ikke slått på ennå.', 503);
    }
    return $k;
}

/**
 * Whether a package can be bought here now, and why not. The same answer for
 * the page (status) and for the server's own check before Checkout.
 * @return array{aktiv: bool, grunn: ?string}
 */
function konto_kjop_status(string $plan = 'skaper'): array
{
    $p = konto_planer()[$plan] ?? null;
    if (!$p || !isset($p['pris'])) return ['aktiv' => false, 'grunn' => 'Pakken kan ikke kjøpes.'];
    if (empty($p['kanKjopes'])) return ['aktiv' => false, 'grunn' => 'Pakken kan ikke kjøpes ennå.'];
    $k = dp_stripe_konfig($grunn);
    if ($k === null) return ['aktiv' => false, 'grunn' => 'Betaling er ikke slått på ennå.'];
    if ($k['webhook'] === '') return ['aktiv' => false, 'grunn' => 'Betaling er ikke ferdig satt opp ennå.'];
    if ((int) $p['pris']['maned'] < 1 || (int) $p['pris']['ar'] < 1) return ['aktiv' => false, 'grunn' => 'Pakken har ingen pris ennå.'];
    return ['aktiv' => true, 'grunn' => null];
}

/** One Stripe call that must succeed, or a KontoFeil with a calm message (details only in the log). */
function konto_stripe_kall(array $k, string $metode, string $sti, array $kropp = [], string $idempotens = ''): array
{
    $svar = dp_stripe($k, $metode, $sti, $kropp, $idempotens);
    if (!$svar['ok']) {
        error_log("Designporten konto: Stripe $metode " . preg_replace('/\?.*/', '', $sti) . " svarte {$svar['status']}: {$svar['melding']}");
        throw new KontoFeil('Fikk ikke kontakt med betalingsløsningen. Prøv igjen om litt.', 502);
    }
    return $svar['data'];
}

/** Ids of Stripe objects we made, per mode (test and live never mix). */
function konto_stripe_id(array $k, string $nokkel): ?string
{
    $r = konto_en('SELECT verdi FROM dp_konto_stripe WHERE nokkel = ?', [($k['live'] ? 'live:' : 'test:') . $nokkel]);
    return $r['verdi'] ?? null;
}

function konto_stripe_husk(array $k, string $nokkel, string $verdi): void
{
    $n = ($k['live'] ? 'live:' : 'test:') . $nokkel;
    konto_kjor('DELETE FROM dp_konto_stripe WHERE nokkel = ?', [$n]);
    konto_kjor('INSERT INTO dp_konto_stripe (nokkel, verdi, endret) VALUES (?, ?, ?)', [$n, $verdi, konto_na()]);
}

/** The Stripe product for a package, made once (id dp_plan_<plan>). */
function konto_stripe_produkt(array $k, string $plan): string
{
    $id = 'dp_plan_' . $plan;
    if (konto_stripe_id($k, "produkt:$plan") === $id) return $id;
    $finnes = dp_stripe($k, 'GET', '/products/' . $id);
    if (!$finnes['ok']) {
        $navn = (string) (konto_planer()[$plan]['navn'] ?? $plan);
        konto_stripe_kall($k, 'POST', '/products', [
            'id' => $id, 'name' => "Designporten $navn", 'metadata' => ['plan' => $plan],
        ], "dp-produkt-$plan");
    }
    konto_stripe_husk($k, "produkt:$plan", $id);
    return $id;
}

/** The Stripe price for a package and period at today's price in Studio, made when first needed. */
function konto_stripe_pris(array $k, string $plan, string $periode): string
{
    $p = konto_planer()[$plan];
    $ore = (int) $p['pris'][$periode] * 100;
    $oppslag = "dp_{$plan}_{$periode}_{$ore}";
    $husket = konto_stripe_id($k, "pris:$oppslag");
    if ($husket !== null) return $husket;
    $funnet = konto_stripe_kall($k, 'GET', '/prices?active=true&limit=1&lookup_keys[]=' . rawurlencode($oppslag));
    $id = $funnet['data'][0]['id'] ?? null;
    if (!is_string($id)) {
        $ny = konto_stripe_kall($k, 'POST', '/prices', [
            'product' => konto_stripe_produkt($k, $plan),
            'currency' => 'nok',
            'unit_amount' => (string) $ore,
            'tax_behavior' => 'inclusive',
            'recurring' => ['interval' => KONTO_PERIODER[$periode]],
            'lookup_key' => $oppslag,
            'nickname' => $p['navn'] . ' ' . KONTO_PERIODENAVN[$periode],
            'metadata' => ['plan' => $plan, 'periode' => $periode],
        ], "dp-pris-$oppslag");
        $id = (string) $ny['id'];
    }
    konto_stripe_husk($k, "pris:$oppslag", $id);
    return $id;
}

/** The member's Stripe customer, made at the first purchase. */
function konto_stripe_kunde(array $k, array $m): string
{
    $kunde = (string) ($m['betaling_kunde'] ?? '');
    if ($kunde !== '' && dp_stripe($k, 'GET', '/customers/' . rawurlencode($kunde))['ok']) return $kunde;
    // none yet, or one from the other mode (a test customer does not exist in live mode)
    $ny = konto_stripe_kall($k, 'POST', '/customers', [
        'email' => $m['epost'],
        'name' => $m['navn'],
        'preferred_locales' => ['nb'],
        'metadata' => ['medlem_id' => (string) $m['id']],
    ], 'dp-kunde-' . $m['id'] . '-' . ($k['live'] ? 'live' : 'test') . '-' . substr(hash('sha256', $kunde), 0, 8));
    $kunde = (string) $ny['id'];
    konto_kjor("UPDATE dp_medlemmer SET betaling_kunde = ?, betaling_leverandor = 'stripe' WHERE id = ?", [$kunde, $m['id']]);
    return $kunde;
}

/** Where Stripe sends the member back: «Min konto» on the public address from the settings. */
function konto_kontoside(string $sok = ''): string
{
    return konto_offentlig_adresse() . konto_base() . 'konto/' . $sok;
}

/**
 * A Checkout Session for a package, monthly or yearly. Refused while the
 * member already has a subscription that is not ended (they change it in
 * the portal instead), so nobody pays twice.
 */
function konto_start_abonnement(array $m, mixed $plan, mixed $periode): string
{
    if (!is_string($plan) || !isset(konto_planer()[$plan]) || !isset(konto_planer()[$plan]['pris'])) throw new KontoFeil('Ukjent pakke.', 422);
    if (!is_string($periode) || !isset(KONTO_PERIODER[$periode])) throw new KontoFeil('Velg månedlig eller årlig betaling.', 422);
    $salg = konto_kjop_status($plan);
    if (!$salg['aktiv']) throw new KontoFeil((string) $salg['grunn'], 409);
    if (empty($m['epost_bekreftet'])) throw new KontoFeil('Bekreft e-postadressen din først. Det gjør du under Profil.', 403);
    if (in_array($m['abonnement_status'] ?? null, KONTO_LEVENDE, true) && ($m['abonnement_status'] ?? '') !== 'incomplete') {
        throw new KontoFeil('Du har allerede et abonnement. Endre det med «Administrer abonnement».', 409);
    }
    konto_begrens('konto-kjop:' . $m['id'], 10, 3600);
    konto_registrer_forsok('konto-kjop:' . $m['id']);
    $k = konto_stripe();
    $pris = konto_stripe_pris($k, $plan, $periode);
    $kunde = konto_stripe_kunde($k, $m);
    $meta = ['medlem_id' => (string) $m['id'], 'plan' => $plan, 'periode' => $periode];
    $okt = konto_stripe_kall($k, 'POST', '/checkout/sessions', [
        'mode' => 'subscription',
        'locale' => 'nb',
        'customer' => $kunde,
        'client_reference_id' => 'medlem-' . $m['id'],
        'line_items' => [['price' => $pris, 'quantity' => '1']],
        'success_url' => konto_kontoside('?abonnement=ferdig&okt={CHECKOUT_SESSION_ID}'),
        'cancel_url' => konto_kontoside('?abonnement=avbrutt'),
        'metadata' => $meta,
        'subscription_data' => ['metadata' => $meta],
    ], 'dp-kjop-' . $m['id'] . '-' . bin2hex(random_bytes(8)));
    $url = (string) ($okt['url'] ?? '');
    if (!str_starts_with($url, 'https://')) throw new KontoFeil('Fikk ikke kontakt med betalingsløsningen. Prøv igjen om litt.', 502);
    return $url;
}

/**
 * The customer portal's settings: card, receipts, switching between the
 * package's monthly and yearly price, and cancelling at the period's end
 * (with a reason, which can be taken back until then). Made through the API
 * and made again when the prices change, so the switch offers today's prices.
 */
function konto_portaloppsett(array $k): string
{
    $priser = [];
    foreach (konto_planer() as $plan => $p) {
        if (empty($p['pris']) || empty($p['kanKjopes'])) continue;
        $produkt = konto_stripe_produkt($k, $plan);
        $priser[$produkt] = [konto_stripe_pris($k, $plan, 'maned'), konto_stripe_pris($k, $plan, 'ar')];
    }
    $nokkel = 'portal:' . substr(hash('sha256', json_encode($priser) . konto_kontoside()), 0, 24);
    $husket = konto_stripe_id($k, $nokkel);
    if ($husket !== null) return $husket;
    $oppsett = [
        'business_profile' => ['headline' => 'Designporten: abonnementet ditt'],
        'default_return_url' => konto_kontoside('?abonnement=portal'),
        'features' => [
            'customer_update' => ['enabled' => 'false'],
            'invoice_history' => ['enabled' => 'true'],
            'payment_method_update' => ['enabled' => 'true'],
            'subscription_cancel' => [
                'enabled' => 'true',
                'mode' => 'at_period_end',
                'proration_behavior' => 'none',
                'cancellation_reason' => [
                    'enabled' => 'true',
                    'options' => ['too_expensive', 'missing_features', 'unused', 'switched_service', 'other'],
                ],
            ],
        ],
        'metadata' => ['laget_av' => 'designporten-konto'],
    ];
    if ($priser) {
        $oppsett['features']['subscription_update'] = [
            'enabled' => 'true',
            'default_allowed_updates' => ['price'],
            'proration_behavior' => 'create_prorations',
            'products' => array_map(fn($produkt, $p) => ['product' => $produkt, 'prices' => $p], array_keys($priser), $priser),
        ];
    }
    $ny = konto_stripe_kall($k, 'POST', '/billing_portal/configurations', $oppsett, 'dp-portal-' . $nokkel);
    konto_stripe_husk($k, $nokkel, (string) $ny['id']);
    return (string) $ny['id'];
}

/** A link into Stripe's customer portal for the member. */
function konto_portal(array $m): string
{
    if (empty($m['betaling_kunde'])) throw new KontoFeil('Du har ikke noe abonnement å administrere ennå.', 409);
    konto_begrens('konto-portal:' . $m['id'], 20, 3600);
    konto_registrer_forsok('konto-portal:' . $m['id']);
    $k = konto_stripe();
    $okt = konto_stripe_kall($k, 'POST', '/billing_portal/sessions', [
        'customer' => $m['betaling_kunde'],
        'configuration' => konto_portaloppsett($k),
        'return_url' => konto_kontoside('?abonnement=portal'),
        'locale' => 'nb',
    ]);
    $url = (string) ($okt['url'] ?? '');
    if (!str_starts_with($url, 'https://')) throw new KontoFeil('Fikk ikke kontakt med betalingsløsningen. Prøv igjen om litt.', 502);
    return $url;
}

// ---------------------------------------------------------------- From Stripe to the member

/** A Stripe time (seconds) as our time string. */
function konto_tid(int $sek): string
{
    return gmdate('Y-m-d\TH:i:s\Z', $sek);
}

/** The current period of a subscription; newer Stripe versions keep it on the item. */
function konto_periode(array $sub, string $felt): ?int
{
    $v = $sub[$felt] ?? $sub['items']['data'][0][$felt] ?? null;
    return is_int($v) ? $v : null;
}

/**
 * What a subscription means for the member: the package, the payment status,
 * until when it is paid, and when it ends if it is cancelled.
 */
function konto_tolk_abonnement(array $sub): array
{
    $meta = is_array($sub['metadata'] ?? null) ? $sub['metadata'] : [];
    $plan = is_string($meta['plan'] ?? null) && isset(konto_planer()[$meta['plan']]) ? $meta['plan'] : 'skaper';
    $intervall = $sub['items']['data'][0]['price']['recurring']['interval'] ?? null;
    $periode = $intervall === 'year' ? 'ar' : ($intervall === 'month' ? 'maned' : (is_string($meta['periode'] ?? null) ? $meta['periode'] : null));
    $start = konto_periode($sub, 'current_period_start');
    $slutt = konto_periode($sub, 'current_period_end');
    $status = (string) ($sub['status'] ?? '');
    $avsluttes = !empty($sub['cancel_at_period_end']) || is_int($sub['cancel_at'] ?? null);
    $slutter = $avsluttes ? (is_int($sub['cancel_at'] ?? null) ? $sub['cancel_at'] : $slutt) : null;
    $ut = ['plan' => $plan, 'periode' => $periode, 'status' => $status, 'slutter' => $slutter ? konto_tid($slutter) : null];
    switch ($status) {
        case 'active':
        case 'trialing':
            return $ut + ['betaling' => 'aktiv', 'betaltTil' => $slutt ? konto_tid($slutt + KONTO_FORNYELSE_TIMER * 3600) : null];
        case 'past_due':
            return $ut + ['betaling' => 'forfalt', 'betaltTil' => $start ? konto_tid($start + KONTO_FORFALT_DAGER * 86400) : null];
        case 'canceled':
        case 'incomplete_expired':
            $endt = is_int($sub['ended_at'] ?? null) ? $sub['ended_at'] : time();
            return ['plan' => 'gratis'] + $ut + ['betaling' => 'avbrutt', 'betaltTil' => konto_tid($endt), 'slutter' => konto_tid($endt)];
        case 'unpaid':
        case 'paused':
            return $ut + ['betaling' => 'utlopt', 'betaltTil' => konto_tid(time())];
        default: // incomplete: the first payment has not gone through
            return $ut + ['betaling' => 'ingen', 'betaltTil' => null];
    }
}

/** The member a subscription belongs to: by our id in its metadata, checked against the customer, or by the customer. */
function konto_medlem_for(array $sub): ?array
{
    $kunde = is_array($sub['customer'] ?? null) ? ($sub['customer']['id'] ?? '') : (string) ($sub['customer'] ?? '');
    $id = (int) ($sub['metadata']['medlem_id'] ?? 0);
    if ($id > 0) {
        $m = konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$id]);
        if ($m && ($m['betaling_kunde'] === null || $m['betaling_kunde'] === $kunde)) return $m;
    }
    return $kunde !== '' ? konto_en('SELECT * FROM dp_medlemmer WHERE betaling_kunde = ?', [$kunde]) : null;
}

/**
 * Stores what Stripe says about a subscription on its member, with the row
 * locked, and returns [before, after] (null when no member owns it, or when
 * the member already has another subscription that is still running: then
 * the newer one is left alone and logged, nothing is overwritten).
 */
function konto_synk_abonnement(array $sub): ?array
{
    return konto_transaksjon(function () use ($sub) {
        $eier = konto_medlem_for($sub);
        if ($eier === null) {
            error_log('Designporten konto: abonnement ' . ($sub['id'] ?? '?') . ' hører ikke til noe medlem.');
            return null;
        }
        $for = konto_las_medlem((int) $eier['id']);
        $ny = konto_tolk_abonnement($sub);
        $annet = $for['abonnement_id'] !== null && $for['abonnement_id'] !== $sub['id'];
        if ($annet && in_array($for['abonnement_status'], KONTO_LEVENDE, true) && $for['abonnement_status'] !== 'incomplete') {
            if (in_array($ny['status'], KONTO_LEVENDE, true) && $ny['status'] !== 'incomplete') {
                error_log("Designporten konto: medlem {$for['id']} har to løpende abonnementer ({$for['abonnement_id']} og {$sub['id']}). Sjekk i Stripe.");
            }
            return null;
        }
        $kunde = is_array($sub['customer'] ?? null) ? $sub['customer']['id'] : $sub['customer'];
        konto_kjor(
            "UPDATE dp_medlemmer SET plan = ?, betaling_status = ?, betaling_leverandor = 'stripe', betaling_kunde = ?, betalt_til = ?,
                abonnement_id = ?, abonnement_status = ?, abonnement_periode = ?, abonnement_slutter = ?, abonnement_oppdatert = ?
             WHERE id = ?",
            [$ny['plan'], $ny['betaling'], $kunde, $ny['betaltTil'], $sub['id'], $ny['status'], $ny['periode'], $ny['slutter'], konto_na(), $for['id']],
        );
        return [$for, konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$for['id']])];
    });
}

/** Reads a subscription from Stripe and stores it (see konto_synk_abonnement()). */
function konto_hent_og_synk(array $k, string $id): ?array
{
    if (!preg_match('/^sub_[A-Za-z0-9_]{6,190}$/D', $id)) return null;
    return konto_synk_abonnement(konto_stripe_kall($k, 'GET', '/subscriptions/' . $id));
}

/**
 * The member's subscription read again from Stripe (the return from Checkout
 * or the portal, or «Oppdater fra Stripe» in Studio): the newest one that is
 * not ended, otherwise the newest.
 */
function konto_oppdater_fra_stripe(array $m): array
{
    if (empty($m['betaling_kunde'])) return $m;
    $k = konto_stripe();
    $liste = konto_stripe_kall($k, 'GET', '/subscriptions?status=all&limit=10&customer=' . rawurlencode($m['betaling_kunde']));
    $subs = array_values(array_filter($liste['data'] ?? [], 'is_array'));
    usort($subs, function ($a, $b) {
        $la = in_array($a['status'] ?? '', KONTO_LEVENDE, true) && ($a['status'] ?? '') !== 'incomplete';
        $lb = in_array($b['status'] ?? '', KONTO_LEVENDE, true) && ($b['status'] ?? '') !== 'incomplete';
        return [$lb, $b['created'] ?? 0] <=> [$la, $a['created'] ?? 0];
    });
    if ($subs) {
        $endring = konto_synk_abonnement($subs[0]);
        if ($endring) konto_abonnement_epost($endring[0], $endring[1]);
    }
    return konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$m['id']]);
}

/**
 * The return from Checkout: the session must be this member's; then its
 * subscription is read from Stripe and stored, so the page shows the package
 * without waiting for the webhook.
 */
function konto_fullfor_kjop(array $m, mixed $okt): array
{
    if (!is_string($okt) || !preg_match('/^cs_[A-Za-z0-9_]{10,200}$/D', $okt)) throw new KontoFeil('Ukjent kjøp.', 404);
    $k = konto_stripe();
    $s = konto_stripe_kall($k, 'GET', '/checkout/sessions/' . $okt);
    if (($s['metadata']['medlem_id'] ?? null) !== (string) $m['id'] || ($s['mode'] ?? '') !== 'subscription') {
        throw new KontoFeil('Ukjent kjøp.', 404);
    }
    $sub = is_array($s['subscription'] ?? null) ? ($s['subscription']['id'] ?? '') : (string) ($s['subscription'] ?? '');
    if (($s['status'] ?? '') === 'complete' && $sub !== '') {
        $endring = konto_hent_og_synk($k, $sub);
        if ($endring) konto_abonnement_epost($endring[0], $endring[1]);
    }
    return konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$m['id']]);
}

/**
 * Ends a member's running subscription at once (the account is deleted).
 * Nothing is refunded; Stripe keeps its records. A failure stops the deletion.
 */
function konto_avslutt_abonnement_na(array $m): void
{
    if (empty($m['abonnement_id']) || !in_array($m['abonnement_status'], KONTO_LEVENDE, true)) return;
    $k = konto_stripe();
    $svar = dp_stripe($k, 'DELETE', '/subscriptions/' . $m['abonnement_id']);
    if (!$svar['ok'] && $svar['status'] !== 404) {
        error_log("Designporten konto: abonnement {$m['abonnement_id']} kunne ikke avsluttes: {$svar['melding']}");
        throw new KontoFeil('Abonnementet kunne ikke avsluttes hos betalingsløsningen, så kontoen er ikke slettet. Prøv igjen om litt.', 502);
    }
}

/** A changed address goes to the Stripe customer too, so receipts and the portal's e-mails reach the member. Best effort. */
function konto_stripe_ny_epost(array $m, string $epost): void
{
    if (empty($m['betaling_kunde']) || dp_stripe_konfig() === null) return;
    $svar = dp_stripe(dp_stripe_konfig(), 'POST', '/customers/' . rawurlencode($m['betaling_kunde']), ['email' => $epost]);
    if (!$svar['ok']) error_log('Designporten konto: ny e-post ble ikke sendt til Stripe: ' . $svar['melding']);
}

// ---------------------------------------------------------------- E-mails

function konto_dato(?string $tid): string
{
    if (!$tid) return '';
    $d = new DateTimeImmutable($tid);
    $mnd = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
    return $d->setTimezone(new DateTimeZone('Europe/Oslo'))->format('j') . '. ' . $mnd[(int) $d->format('n') - 1] . ' ' . $d->format('Y');
}

/** The real end of the paid period (betalt_til has a few hours' margin added). */
function konto_periodeslutt(array $m): ?string
{
    if (!$m['betalt_til']) return null;
    return konto_tid(strtotime($m['betalt_til']) - KONTO_FORNYELSE_TIMER * 3600);
}

/** Sends one message to the member; a failure is logged and never stops a payment from counting. */
function konto_send_trygt(array $m, string $emne, string $tekst): void
{
    try {
        konto_send_epost($m['epost'], $emne, "Hei {$m['navn']},\n\n$tekst\n\nDu ser og endrer abonnementet under Min konto:\n" . konto_kontoside() . "\n\nHilsen Designporten\n");
    } catch (Throwable $e) {
        error_log('Designporten konto: e-post om abonnementet ble ikke sendt: ' . $e->getMessage());
    }
}

/** A short note to Designporten (the address the forms use) about a new or ended subscription. Best effort. */
function konto_varsle_designporten(array $m, string $hva): void
{
    $oppsett = dp_oppsett();
    if ($oppsett === null) return;
    try {
        $plan = konto_planer()[$m['plan']]['navn'] ?? $m['plan'];
        dp_send($oppsett, "Abonnement: $hva ({$m['navn']})", [
            ['Hva', $hva], ['Medlem', "{$m['navn']} <{$m['epost']}>"], ['Pakke', (string) $plan],
            ['Betaling', KONTO_PERIODENAVN[$m['abonnement_periode'] ?? ''] ?? ''], ['Stripe-abonnement', (string) $m['abonnement_id']],
        ], $m['epost'], []);
    } catch (Throwable $e) {
        error_log('Designporten konto: varsel om abonnement ble ikke sendt: ' . $e->getMessage());
    }
}

/**
 * The e-mail a change calls for, decided by what changed (not by which event
 * brought it), so each change is told once even when Stripe sends several
 * events about it. Returns which message was sent, or null.
 */
function konto_abonnement_epost(array $for, array $etter): ?string
{
    $navn = konto_planer()[$etter['plan']]['navn'] ?? 'Skaper';
    $varig = fn($s) => in_array($s, ['aktiv', 'forfalt'], true);
    $periode = KONTO_PERIODENAVN[$etter['abonnement_periode'] ?? ''] ?? null;
    if (!$varig($for['betaling_status']) && $etter['betaling_status'] === 'aktiv') {
        konto_send_trygt($etter, "Velkommen som $navn hos Designporten",
            "Takk! Abonnementet ditt på $navn er i gang" . ($periode ? " med $periode betaling" : '') . '. '
            . 'Du har nå plass til ' . (konto_planer()[$etter['plan']]['prosjekter'] ?? '') . ' prosjekter på kontoen'
            . (in_array('csv', konto_planer()[$etter['plan']]['tjenester'] ?? [], true) ? ' og CSV-batch i Sign Forge' : '') . ".\n\n"
            . 'Neste fornyelse er ' . konto_dato(konto_periodeslutt($etter)) . '. Du kan si opp når du vil, og beholder pakken ut perioden du har betalt for.');
        konto_varsle_designporten($etter, 'nytt abonnement');
        return 'velkommen';
    }
    if ($for['betaling_status'] === 'forfalt' && $etter['betaling_status'] === 'aktiv') {
        konto_send_trygt($etter, 'Betalingen gikk gjennom', "Betalingen for $navn har gått gjennom, og abonnementet fortsetter som før.");
        return 'gjenopprettet';
    }
    if ($for['betaling_status'] !== 'forfalt' && $etter['betaling_status'] === 'forfalt') {
        konto_send_trygt($etter, "Betalingen for $navn gikk ikke gjennom",
            "Vi fikk ikke trukket fornyelsen av $navn. Kortet kan være utløpt eller sperret. "
            . 'Betalingsløsningen prøver igjen de neste dagene. Oppdater kortet under Min konto → «Administrer abonnement», '
            . 'så beholder du pakken. Du har den i alle fall til ' . konto_dato($etter['betalt_til']) . '.');
        return 'feilet';
    }
    if ($varig($for['betaling_status']) && in_array($etter['betaling_status'], ['avbrutt', 'utlopt'], true)) {
        konto_send_trygt($etter, "$navn-abonnementet er avsluttet",
            "Abonnementet ditt på $navn er avsluttet, og kontoen er nå en gratis konto. Alle prosjektene dine ligger der fortsatt "
            . 'og kan åpnes og lastes ned. Nye prosjekter krever ledig plass i gratispakken. Du kan starte abonnementet igjen når du vil.');
        konto_varsle_designporten($etter, 'avsluttet');
        return 'avsluttet';
    }
    if (!$for['abonnement_slutter'] && $etter['abonnement_slutter'] && $varig($etter['betaling_status'])) {
        konto_send_trygt($etter, "Oppsigelsen av $navn er registrert",
            "Vi har registrert at du sier opp $navn. Du beholder pakken til " . konto_dato($etter['abonnement_slutter'])
            . ', og blir ikke trukket mer. Ombestemmer du deg før det, kan du fortsette abonnementet under «Administrer abonnement».');
        konto_varsle_designporten($etter, 'sagt opp');
        return 'sagt-opp';
    }
    if ($for['abonnement_slutter'] && !$etter['abonnement_slutter'] && $varig($etter['betaling_status'])) {
        konto_send_trygt($etter, "$navn fortsetter", "Oppsigelsen er trukket tilbake. Abonnementet på $navn fortsetter, og neste fornyelse er "
            . konto_dato(konto_periodeslutt($etter)) . '.');
        return 'fortsetter';
    }
    if ($for['abonnement_periode'] && $etter['abonnement_periode'] && $for['abonnement_periode'] !== $etter['abonnement_periode']) {
        konto_send_trygt($etter, "Du betaler nå $periode for $navn", "Abonnementet på $navn er endret til $periode betaling. "
            . 'Betalingsløsningen regner ut forskjellen for perioden du er i, og den står på neste kvittering.');
        return 'periode';
    }
    return null;
}

// ---------------------------------------------------------------- Webhook

/** Whether the webhook should hand an event to the accounts. */
function konto_er_abonnementshendelse(string $type, mixed $objekt): bool
{
    if (str_starts_with($type, 'customer.subscription.')) return true;
    if (in_array($type, ['invoice.paid', 'invoice.payment_failed'], true)) return true;
    return str_starts_with($type, 'checkout.session.') && is_array($objekt) && ($objekt['mode'] ?? '') === 'subscription';
}

/** The subscription an invoice belongs to (older and newer Stripe versions). */
function konto_faktura_abonnement(array $f): string
{
    $s = $f['subscription'] ?? $f['parent']['subscription_details']['subscription'] ?? '';
    return is_array($s) ? (string) ($s['id'] ?? '') : (string) $s;
}

/** One row per invoice in dp_betalinger (paid or failed); true when it was paid and not seen before. */
function konto_lagre_faktura(array $m, array $f, string $status): bool
{
    $id = (string) ($f['id'] ?? '');
    if (!preg_match('/^in_[A-Za-z0-9_]{6,190}$/D', $id)) return false;
    $til = $f['lines']['data'][0]['period']['end'] ?? null;
    return konto_transaksjon(function () use ($m, $f, $id, $status, $til) {
        $for = konto_en('SELECT status FROM dp_betalinger WHERE ekstern_ref = ?', [$id]);
        if ($for) {
            if ($for['status'] !== 'betalt') {
                konto_kjor('UPDATE dp_betalinger SET status = ?, belop_ore = ? WHERE ekstern_ref = ?', [
                    $status, (int) ($status === 'betalt' ? ($f['amount_paid'] ?? 0) : ($f['amount_due'] ?? 0)), $id,
                ]);
            }
            return $status === 'betalt' && $for['status'] !== 'betalt';
        }
        konto_kjor(
            'INSERT INTO dp_betalinger (medlem_id, tjeneste, leverandor, ekstern_ref, belop_ore, valuta, status, periode_til, opprettet)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$m['id'], $m['plan'], 'stripe', $id, (int) ($status === 'betalt' ? ($f['amount_paid'] ?? 0) : ($f['amount_due'] ?? 0)),
                strtoupper((string) ($f['currency'] ?? 'nok')), $status, is_int($til) ? konto_tid($til) : null, konto_na()],
        );
        return $status === 'betalt';
    });
}

/**
 * A subscription event from the webhook, already checked (signature and
 * mode). Each event counts once (dp_konto_hendelser); if it fails, it is
 * forgotten again and the answer is 500, so Stripe sends it again later.
 * @return array{0: int, 1: string} status and text for Stripe
 */
function konto_stripe_hendelse(array $hendelse, array $k): array
{
    if (konto_konfig() === null) return [503, 'Brukerkontoer er ikke slått på'];
    konto_db();
    $id = (string) ($hendelse['id'] ?? '');
    $type = (string) ($hendelse['type'] ?? '');
    $o = $hendelse['data']['object'] ?? null;
    if (!preg_match('/^evt_[A-Za-z0-9_]{6,190}$/D', $id) || !is_array($o)) return [400, 'Ugyldig hendelse'];
    try {
        konto_kjor('INSERT INTO dp_konto_hendelser (hendelse_id, type, mottatt) VALUES (?, ?, ?)', [$id, mb_substr($type, 0, 64), konto_na()]);
    } catch (PDOException) {
        return [200, 'ok (allerede behandlet)'];
    }
    try {
        $sub = match (true) {
            str_starts_with($type, 'customer.subscription.') => (string) ($o['id'] ?? ''),
            str_starts_with($type, 'invoice.') => konto_faktura_abonnement($o),
            default => is_array($o['subscription'] ?? null) ? (string) ($o['subscription']['id'] ?? '') : (string) ($o['subscription'] ?? ''),
        };
        $endring = $sub !== '' ? konto_hent_og_synk($k, $sub) : null;
        if ($endring) {
            [$for, $etter] = $endring;
            $sendt = konto_abonnement_epost($for, $etter);
            if ($type === 'invoice.paid' || $type === 'invoice.payment_failed') {
                $ny = konto_lagre_faktura($etter, $o, $type === 'invoice.paid' ? 'betalt' : 'feilet');
                // a renewal paid (the first payment is told by the welcome message, a late one by «Betalingen gikk gjennom»)
                if ($ny && ($o['billing_reason'] ?? '') === 'subscription_cycle' && $sendt === null) {
                    $navn = konto_planer()[$etter['plan']]['navn'] ?? 'Skaper';
                    konto_send_trygt($etter, "Kvittering: $navn er fornyet",
                        "Vi har mottatt " . dp_butikk_kroner((int) ($o['amount_paid'] ?? 0)) . " for $navn. Abonnementet er fornyet til "
                        . konto_dato(konto_periodeslutt($etter)) . '.' . (!empty($o['hosted_invoice_url']) ? "\n\nKvittering: {$o['hosted_invoice_url']}" : ''));
                }
            }
        }
        return [200, 'ok'];
    } catch (Throwable $e) {
        konto_kjor('DELETE FROM dp_konto_hendelser WHERE hendelse_id = ?', [$id]);
        error_log('Designporten konto: abonnementshendelse ' . $type . ' feilet: ' . get_class($e) . ': ' . $e->getMessage());
        return [500, 'Kunne ikke oppdatere medlemmet: ' . get_class($e)];
    }
}
