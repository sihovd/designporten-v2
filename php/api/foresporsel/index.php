<?php
/**
 * The idea form and the contact form, PHP version of
 * src/server/ruter/foresporsel.ts + src/components/showroom/skjema/tolk.ts.
 * JSON out when the browser asks for it (enhanced form); otherwise a 303
 * redirect to the static receipt or «not sent» page.
 */

declare(strict_types=1);

require __DIR__ . '/../_felles.php';

// Kept in step with startpunkter.ts and tolk.ts by src/server/php.test.ts.
const STARTPUNKTER = [
    'ide' => 'Jeg har en idé',
    'tegning' => 'Jeg har en tegning eller et bilde',
    'modell' => 'Jeg har en 3D-modell',
    'del' => 'Jeg trenger en del',
];
const ANTALL_VALG = ['1', '2–10', '11–100', '100+'];

dp_bare_post();

$vilJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
$type = dp_tekst($_POST['skjema'] ?? '') === 'kontakt' ? 'kontakt' : 'ide';

function kvittering(string $type): string
{
    return $type === 'kontakt' ? '/skjema/kvittering/kontakt/' : '/skjema/kvittering/';
}

function avvis(string $grunn, array $feil, bool $vilJson, string $type, int $status): never
{
    if ($vilJson) {
        dp_json(['ok' => false, 'feil' => (object) $feil, 'grunn' => $grunn], $status);
    }
    dp_videre('/skjema/ikke-sendt/', ['feil' => $grunn, 'type' => $type]);
}

// An upload over post_max_size arrives as an empty POST.
if (empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    avvis('Filene er for store til å sendes samlet. Send færre eller mindre filer.', [], $vilJson, $type, 413);
}

$beskrivelse = dp_tekst($_POST['beskrivelse'] ?? '', 8000);
$navn = dp_tekst($_POST['navn'] ?? '', 200);
$epost = dp_tekst($_POST['epost'] ?? '', 200);
$telefon = dp_tekst($_POST['telefon'] ?? '', 40);
$kundetype = dp_tekst($_POST['kundetype'] ?? '') === 'bedrift' ? 'bedrift' : 'privat';
$bedrift = $type === 'ide' && $kundetype === 'bedrift';
$firma = dp_tekst($_POST['firma'] ?? '', 200);
$orgnr = preg_replace('/\s/', '', dp_tekst($_POST['orgnr'] ?? '', 20)) ?? '';
$fillenke = dp_tekst($_POST['fillenke'] ?? '', 1000);
$feil = [];

if ($beskrivelse === '') {
    $feil['beskrivelse'] = $type === 'kontakt'
        ? 'Skriv hva henvendelsen gjelder.'
        : ($bedrift ? 'Skriv litt om prosjektet.' : 'Skriv litt om hva du ser for deg.');
}
if ($navn === '') {
    $feil['navn'] = $bedrift ? 'Skriv navnet på kontaktpersonen.' : 'Skriv navnet ditt.';
}
if ($epost === '') {
    $feil['epost'] = 'Skriv e-postadressen din, så vi kan svare.';
} elseif (!preg_match(DP_EPOST, $epost)) {
    $feil['epost'] = 'E-postadressen ser ikke riktig ut.';
}
if ($bedrift && $firma === '') {
    $feil['firma'] = 'Skriv navnet på firmaet.';
}
if ($bedrift && $orgnr !== '' && !preg_match('/^\d{9}$/', $orgnr)) {
    $feil['orgnr'] = 'Organisasjonsnummeret har ni siffer.';
}
if ($fillenke !== '' && !preg_match('/^https?:\/\/\S+$/i', $fillenke)) {
    $feil['fillenke'] = 'Lenken må begynne med https://';
}

// Uploaded files (field `filer[]`), skipping empty file inputs.
$filer = [];
$opp = $_FILES['filer'] ?? null;
if (is_array($opp) && is_array($opp['name'])) {
    foreach ($opp['name'] as $i => $filnavn) {
        if ($opp['error'][$i] === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $filer[] = [
            'filnavn' => basename((string) $filnavn),
            'type' => (string) ($opp['type'][$i] ?: 'application/octet-stream'),
            'sti' => (string) $opp['tmp_name'][$i],
            'storrelse' => (int) $opp['size'][$i],
            'feil' => (int) $opp['error'][$i],
        ];
    }
}
if (count($filer) > DP_MAKS_FILER) {
    $feil['filer'] = 'Du kan laste opp opptil ' . DP_MAKS_FILER . ' filer.';
} else {
    $filfeil = [];
    foreach ($filer as $f) {
        $endelse = strtolower(pathinfo($f['filnavn'], PATHINFO_EXTENSION));
        if (!in_array($endelse, DP_ENDELSER, true)) {
            $filfeil[] = "«{$f['filnavn']}» har et filformat vi ikke tar imot.";
        } elseif (
            $f['storrelse'] > DP_MAKS_BYTE_PER_FIL
            || in_array($f['feil'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
        ) {
            $filfeil[] = "«{$f['filnavn']}» er større enn " . intdiv(DP_MAKS_BYTE_PER_FIL, 1024 * 1024) . ' MB.';
        } elseif ($f['feil'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['sti'])) {
            $filfeil[] = "«{$f['filnavn']}» kom ikke fram. Prøv å legge den ved på nytt.";
        }
    }
    if ($filfeil) {
        $feil['filer'] = implode(' ', $filfeil);
    } elseif (array_sum(array_column($filer, 'storrelse')) > DP_MAKS_BYTE_TOTALT) {
        $feil['filer'] = 'Filene er til sammen større enn ' . intdiv(DP_MAKS_BYTE_TOTALT, 1024 * 1024)
            . ' MB. Send store filer som en lenke.';
    }
}

if ($feil) {
    avvis(implode(' ', $feil), $feil, $vilJson, $type, 400);
}

// Honeypot filled in: answer like a success, deliver nothing.
if (dp_tekst($_POST['nettside'] ?? '') !== '') {
    if ($vilJson) {
        dp_json(['ok' => true, 'referanse' => '', 'kanal' => 'epost']);
    }
    dp_videre(kvittering($type), []);
}

$oppsett = dp_oppsett();
if ($oppsett === null) {
    error_log('Designporten skjema: api/oppsett.php mangler eller er ufullstendig.');
    avvis('Skjemaet er ikke koblet til e-post ennå. Prøv igjen senere.', [], $vilJson, $type, 503);
}

$vedlegg = array_map(
    fn($f) => ['filnavn' => $f['filnavn'], 'type' => $f['type'], 'innhold' => (string) file_get_contents($f['sti'])],
    $filer,
);

$felter = [];
if ($type === 'ide') {
    $start = dp_tekst($_POST['start'] ?? '');
    $antall = dp_tekst($_POST['antall'] ?? '');
    $felter[] = ['Kundetype', $bedrift ? 'Bedrift' : 'Privat'];
    if ($bedrift) {
        $felter[] = ['Firma', $firma];
        $felter[] = ['Organisasjonsnummer', $orgnr];
    }
    $felter[] = ['Utgangspunkt', STARTPUNKTER[$start] ?? ''];
    $felter[] = [$bedrift ? 'Prosjektbeskrivelse' : 'Hva ser du for deg?', $beskrivelse];
    $felter[] = ['Omtrentlige mål', dp_tekst($_POST['mal'] ?? '', 400)];
    if ($bedrift) {
        $felter[] = ['Antall', in_array($antall, ANTALL_VALG, true) ? $antall : ''];
        $felter[] = ['Materialønske', dp_tekst($_POST['materiale'] ?? '', 400)];
        $felter[] = ['Tekniske krav', dp_tekst($_POST['krav'] ?? '', 4000)];
    }
    $felter[] = [
        $bedrift ? 'Ønsket leveringsfrist' : 'Til når?',
        dp_tekst($_POST['ingenHast'] ?? '') !== '' ? 'Ingen hast' : dp_tekst($_POST['frist'] ?? '', 40),
    ];
    $felter[] = ['Lenke til filer', $fillenke];
} else {
    $felter[] = ['Melding', $beskrivelse];
}
$felter[] = [$bedrift ? 'Kontaktperson' : 'Navn', $navn];
$felter[] = ['E-post', $epost];
$felter[] = ['Telefon', $telefon];
$felter[] = ['Vedlegg', implode(', ', array_column($vedlegg, 'filnavn'))];

$emne = $type === 'kontakt'
    ? "Melding fra $navn"
    : ($bedrift ? "Ny bedriftsforespørsel fra $firma" : "Ny forespørsel fra $navn");
$ref = dp_send($oppsett, $emne, $felter, $epost, $vedlegg);
if ($ref === null) {
    avvis('Meldingen kunne ikke sendes akkurat nå. Prøv igjen om litt.', [], $vilJson, $type, 503);
}

if ($vilJson) {
    dp_json(['ok' => true, 'referanse' => $ref, 'kanal' => 'epost']);
}
dp_videre(kvittering($type), ['ref' => $ref]);
