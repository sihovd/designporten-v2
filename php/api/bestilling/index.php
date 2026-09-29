<?php
/**
 * Order requests from the cart, PHP version of src/server/ruter/bestilling.ts
 * and src/lib/handel/foresporsel.ts. Checks the cart against the catalogue
 * the build writes to api/katalog.json and recomputes prices; the browser's
 * numbers are never trusted. No payment is taken.
 */

declare(strict_types=1);

require __DIR__ . '/../_felles.php';

const MAKS_BYTE = 4 * 1024 * 1024;
const DESIGN_PREFIKS = 'skaperverksted-';

function svar(array $data, int $status = 200): never
{
    dp_json($data, $status);
}

function ugyldig(string $felt, string $melding): never
{
    svar(['ok' => false, 'grunn' => 'Sjekk feltene som er markert.', 'felt' => [$felt => $melding]], 400);
}

/** Same format as formaterKroner() in kurv.ts: «1 250 kr». */
function kroner(int $ore): string
{
    return number_format(round($ore / 100), 0, ',', "\u{00A0}") . "\u{00A0}kr";
}

function er_tekst(mixed $v, int $min, int $maks): bool
{
    return is_string($v) && mb_strlen(trim($v)) >= $min && mb_strlen(trim($v)) <= $maks;
}

dp_bare_post();

if (!str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
    svar(['ok' => false, 'grunn' => 'Forespørselen må sendes som JSON.'], 415);
}
$raa = (string) file_get_contents('php://input', false, null, 0, MAKS_BYTE + 1);
if (strlen($raa) > MAKS_BYTE) {
    svar(['ok' => false, 'grunn' => 'Forespørselen er for stor.'], 413);
}
$b = json_decode($raa, true);
if (!is_array($b)) {
    svar(['ok' => false, 'grunn' => 'Forespørselen kunne ikke leses.'], 400);
}

// ---- The same checks as bestillingSkjema (bestilling.ts) ----
// A filled honeypot looks like success to the bot and is never delivered.
if (($b['nettside'] ?? '') !== '') {
    svar(['ok' => true, 'referanse' => dp_referanse(), 'kanal' => 'epost']);
}
if (!er_tekst($b['navn'] ?? null, 2, 120)) {
    ugyldig('navn', 'Skriv navnet ditt.');
}
$epost = is_string($b['epost'] ?? null) ? trim($b['epost']) : '';
if (!filter_var($epost, FILTER_VALIDATE_EMAIL)) {
    ugyldig('epost', 'Skriv en gyldig e-postadresse.');
}
$telefon = $b['telefon'] ?? '';
$melding = $b['melding'] ?? '';
if (!er_tekst($telefon, 0, 40)) {
    ugyldig('telefon', 'Telefonnummeret er for langt.');
}
if (!er_tekst($melding, 0, 4000)) {
    ugyldig('melding', 'Meldingen er for lang.');
}
$linjer = $b['linjer'] ?? null;
if (!is_array($linjer) || !array_is_list($linjer) || count($linjer) < 1) {
    ugyldig('linjer', 'Handlekurven er tom.');
}
if (count($linjer) > 50) {
    ugyldig('linjer', 'Handlekurven har for mange linjer.');
}
foreach ($linjer as $l) {
    $gyldig = is_array($l)
        && er_tekst($l['produktId'] ?? null, 1, 100)
        && (!isset($l['navn']) || er_tekst($l['navn'], 0, 160))
        && is_int($l['antall'] ?? null) && $l['antall'] >= 1 && $l['antall'] <= 999
        && is_array($l['valg'] ?? null);
    if ($gyldig) {
        foreach ($l['valg'] as $k => $v) {
            if (!is_string($k) || mb_strlen($k) > 40 || !is_string($v) || mb_strlen($v) > 300) {
                $gyldig = false;
            }
        }
    }
    if ($gyldig && isset($l['design'])) {
        $d = $l['design'];
        $gyldig = is_array($d)
            && is_string($d['id'] ?? null) && preg_match('/^design_[a-z0-9]+$/', $d['id'])
            && is_string($d['generator'] ?? null) && preg_match('/^[a-z0-9-]{1,40}$/', $d['generator'])
            && er_tekst($d['navn'] ?? null, 1, 120)
            && is_array($d['sammendrag'] ?? null) && count($d['sammendrag']) <= 30
            && count(array_filter($d['sammendrag'], fn($x) => !is_string($x) || mb_strlen($x) > 400)) === 0;
    }
    if (!$gyldig) {
        ugyldig('linjer', 'Handlekurven inneholder en linje som ikke kan leses. Fjern den og legg varen inn på nytt.');
    }
}

// ---- The same checks as lagInnsending (foresporsel.ts) ----
$katalogfil = __DIR__ . '/../katalog.json';
$katalogdata = is_file($katalogfil) ? json_decode((string) file_get_contents($katalogfil), true) : null;
if (!is_array($katalogdata)) {
    error_log('Designporten bestilling: api/katalog.json mangler.');
    svar(['ok' => false, 'grunn' => 'Bestillinger kan ikke tas imot akkurat nå. Prøv igjen senere.'], 503);
}
$katalog = array_column($katalogdata['produkter'], null, 'id');

$varelinjer = [];
$vedlegg = [];
$sum = 0;
$utenPris = 0;
$design = 0;

foreach ($linjer as $l) {
    $erDesign = str_starts_with($l['produktId'], DESIGN_PREFIKS) || !empty($l['designId']) || !empty($l['design']);
    if ($erDesign) {
        $d = $l['design'] ?? null;
        if (!$d) {
            svar(['ok' => false, 'grunn' => 'Et design i handlekurven mangler. Fjern linjen og legg designet inn på nytt fra Skaperverksted.'], 400);
        }
        if ($l['produktId'] !== DESIGN_PREFIKS . $d['generator']) {
            svar(['ok' => false, 'grunn' => 'Et design i handlekurven passer ikke med linjen sin.'], 400);
        }
        $dok = $d['dokument'] ?? null;
        $lesbar = is_array($dok) && !array_is_list($dok)
            && is_int($dok['versjon'] ?? null) && $dok['versjon'] <= (int) $katalogdata['dokumentVersjon']
            && ($dok['generator'] ?? null) === $d['generator']
            && is_array($dok['lag'] ?? null);
        if (!$lesbar) {
            svar(['ok' => false, 'grunn' => "Designet «{$d['navn']}» kunne ikke leses. Legg det inn på nytt fra Skaperverksted."], 400);
        }
        $valg = [];
        foreach ($l['valg'] as $k => $v) {
            $valg[] = "$k: $v";
        }
        $tekst = [$l['antall'] . ' × ' . (trim($l['navn'] ?? '') ?: $d['navn']) . " [Skaperverksted: {$d['generator']}, pris avtales]"];
        foreach ([...$valg, ...$d['sammendrag']] as $x) {
            $tekst[] = "  $x";
        }
        $tekst[] = "  Designfil: design-{$d['id']}.json (vedlagt)";
        $varelinjer[] = implode("\n", $tekst);
        $vedlegg[] = [
            'filnavn' => "design-{$d['id']}.json",
            'type' => 'application/json',
            'innhold' => json_encode($dok, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
        $design += $l['antall'];
        continue;
    }

    $p = $katalog[$l['produktId']] ?? null;
    if (!$p) {
        svar(['ok' => false, 'grunn' => 'Et produkt i handlekurven finnes ikke lenger. Fjern det og prøv igjen.'], 400);
    }
    $farge = null;
    foreach ($p['farger'] as $f) {
        if ($f['id'] === ($l['valg']['farge'] ?? null)) {
            $farge = $f;
        }
    }
    $materiale = in_array($l['valg']['materiale'] ?? null, $p['materialer'], true) ? $l['valg']['materiale'] : null;
    if (!$farge || !$materiale) {
        svar(['ok' => false, 'grunn' => "Valgene for «{$p['navn']}» er ikke gyldige lenger. Fjern varen og legg den inn på nytt."], 400);
    }
    $tekst = trim($l['valg']['tekst'] ?? '');
    if ($tekst !== '' && (!$p['egenTekst'] || mb_strlen($tekst) > $p['egenTekst']['maksTegn'])) {
        svar(['ok' => false, 'grunn' => "Teksten for «{$p['navn']}» er for lang eller ikke tillatt."], 400);
    }
    if (array_diff(array_keys($l['valg']), ['farge', 'materiale', 'tekst'])) {
        svar(['ok' => false, 'grunn' => 'Handlekurven inneholder ukjente valg.'], 400);
    }

    // beregnPris (pris.ts): the product's own price plus its text surcharge, or none.
    $pris = $p['prisOre'];
    if ($pris !== null && $p['egenTekst'] && $tekst !== '') {
        $pris = $p['egenTekst']['tilleggOre'] === null ? null : $pris + $p['egenTekst']['tilleggOre'];
    }
    if ($pris === null) {
        $utenPris += $l['antall'];
    } else {
        $sum += $pris * $l['antall'];
    }

    $valgtekst = implode(', ', array_filter([
        "Farge: {$farge['navn']}",
        "Materiale: $materiale",
        $tekst !== '' ? "Tekst: «{$tekst}»" : null,
    ]));
    $pristekst = $pris === null ? 'pris ikke fastsatt' : kroner($pris) . ' per stk.';
    $status = $p['status'] === 'plassholder' ? ' [plassholderprodukt]' : '';
    $varelinjer[] = "{$l['antall']} × {$p['navn']} ({$p['id']})$status\n  $valgtekst\n  $pristekst";
}

$antall = array_sum(array_column($linjer, 'antall'));
$sumtekst = implode("\n", array_filter([
    $sum > 0 ? kroner($sum) . ' for varer med pris' : null,
    $utenPris > 0 ? "$utenPris " . ($utenPris === 1 ? 'vare' : 'varer') . ' uten fastsatt pris' : null,
    $design > 0 ? "$design design fra Skaperverksted, pris avtales" : null,
]));

$oppsett = dp_oppsett();
if ($oppsett === null) {
    error_log('Designporten bestilling: api/oppsett.php mangler eller er ufullstendig.');
    svar(['ok' => false, 'grunn' => 'Skjemaet er ikke koblet til e-post ennå. Prøv igjen senere.'], 503);
}

$navn = trim($b['navn']);
$emne = "Bestillingsforespørsel fra $navn ($antall " . ($antall === 1 ? 'vare' : 'varer') . ')';
$ref = dp_send($oppsett, $emne, [
    ['Navn', $navn],
    ['E-post', $epost],
    ['Telefon', trim($telefon)],
    ['Melding', trim($melding)],
    ['Varer', implode("\n\n", $varelinjer)],
    ['Sum', $sumtekst],
    ['Betaling', 'Ingen betaling er tatt. Dette er en bestillingsforespørsel fra nettsiden.'],
], $epost, $vedlegg);
if ($ref === null) {
    svar(['ok' => false, 'grunn' => 'Meldingen kunne ikke sendes akkurat nå. Prøv igjen om litt.'], 503);
}
svar(['ok' => true, 'referanse' => $ref, 'kanal' => 'epost']);
