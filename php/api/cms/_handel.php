<?php
/**
 * Studio → Butikk og betaling (Sivert 2026-11-09: «vi må ha alt i cms
 * funksjonen»). Per product: status, price, text surcharge, name and
 * descriptions. For the shop: the card payment switch and up to five
 * shipping options. And the orders Stripe's webhook saves.
 *
 * Every save is used at once: the rows are written to api/cms/data/butikk.json,
 * which api/_butikk.php lays over the build's catalogue for payment, order
 * requests and the pages (side.php). Prices are whole kroner, stored in øre
 * including VAT. Stripe keys never pass through here (api/stripe/konfig.php).
 * Administrators only: redaktører and agents have no shop rights.
 */

declare(strict_types=1);

require_once __DIR__ . '/../stripe/_ordre.php';

const CMS_MAKS_PRIS_ORE = 10_000_000;
const CMS_MAKS_FRAKT = 5;

// ---------------------------------------------------------------- Rows

function cms_butikk_rad(string $nokkel): ?array
{
    return cms_en('SELECT * FROM cms_butikk WHERE nokkel = ?', [$nokkel]);
}

function cms_butikk_verdi(?array $rad): ?array
{
    if (!$rad) return null;
    $v = json_decode((string) $rad['verdi'], true);
    return is_array($v) ? $v : null;
}

/**
 * Write (or with $verdi null remove) one row, only if it still has the
 * version the caller saw. Returns the new version (0 after removal), or
 * throws a conflict.
 */
function cms_butikk_skriv(string $nokkel, int $versjon, ?array $verdi, array $aktor): int
{
    $db = cms_db();
    $db->beginTransaction();
    try {
        $rad = cms_butikk_rad($nokkel);
        if ((int) ($rad['versjon'] ?? 0) !== $versjon) {
            throw new CmsFeil('Noen andre har endret dette i mellomtiden. Last inn på nytt.', 409);
        }
        $json = $verdi === null ? null : json_encode($verdi, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if ($verdi === null) {
            if ($rad) cms_kjor('DELETE FROM cms_butikk WHERE nokkel = ? AND versjon = ?', [$nokkel, $versjon]);
            $ny = 0;
        } elseif (!$rad) {
            cms_kjor('INSERT INTO cms_butikk (nokkel, verdi, versjon, endret, endret_av) VALUES (?, ?, 1, ?, ?)',
                [$nokkel, $json, cms_na(), $aktor['id']]);
            $ny = 1;
        } else {
            $ny = $versjon + 1;
            $n = cms_kjor('UPDATE cms_butikk SET verdi = ?, versjon = ?, endret = ?, endret_av = ? WHERE nokkel = ? AND versjon = ?',
                [$json, $ny, cms_na(), $aktor['id'], $nokkel, $versjon]);
            if ($n !== 1) throw new CmsFeil('Noen andre har endret dette i mellomtiden. Last inn på nytt.', 409);
        }
        cms_logg($aktor, $verdi === null ? 'butikk.tilbakestill' : 'butikk.lagre', $nokkel, $rad['verdi'] ?? null, $json);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($e instanceof PDOException && str_starts_with((string) $e->getCode(), '23')) {
            throw new CmsFeil('Noen andre har endret dette i mellomtiden. Last inn på nytt.', 409);
        }
        throw $e;
    }
    cms_skriv_butikk();
    return $ny;
}

/**
 * The snapshot the shop reads (api/_butikk.php). Pages only go through
 * side.php once publisert.json exists (.htaccess), so it is made if missing.
 */
function cms_skriv_butikk(): void
{
    $data = ['produkter' => (object) []];
    $produkter = [];
    foreach (cms_alle('SELECT nokkel, verdi FROM cms_butikk ORDER BY nokkel') as $rad) {
        $v = json_decode((string) $rad['verdi'], true);
        if (!is_array($v)) continue;
        if ($rad['nokkel'] === 'innstillinger') {
            $data['betaling'] = (bool) $v['betaling'];
            $data['frakt'] = $v['frakt'];
        } elseif (str_starts_with($rad['nokkel'], 'produkt/')) {
            $produkter[substr($rad['nokkel'], 8)] = $v;
        }
    }
    if ($produkter) $data['produkter'] = $produkter;
    $fil = cms_datamappe() . '/butikk.json';
    $tmp = $fil . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    rename($tmp, $fil);
    if (!is_file(cms_datamappe() . '/publisert.json')) cms_skriv_publisert();
}

// ---------------------------------------------------------------- Checks

function cms_butikk_tekst(mixed $v, string $navn, int $min, int $maks, bool $avsnitt = false): string
{
    if (!is_string($v) || !mb_check_encoding($v, 'UTF-8')) throw new CmsFeil("$navn må være tekst.", 422);
    $v = cms_normaliser($v, $avsnitt ? 'avsnitt' : 'linje');
    $lengde = mb_strlen($v);
    if ($lengde < $min) throw new CmsFeil($min <= 1 ? "$navn kan ikke være tom." : "$navn må ha minst $min tegn.", 422);
    if ($lengde > $maks) throw new CmsFeil("$navn kan ha høyst $maks tegn.", 422);
    return $v;
}

/** Whole kroner in øre, or null. $null: whether «no price» is allowed. */
function cms_butikk_ore(mixed $v, string $navn, int $min, int $maks, bool $null): ?int
{
    if ($v === null && $null) return null;
    if (!is_int($v) || $v % 100 !== 0) throw new CmsFeil("$navn må være hele kroner.", 422);
    if ($v < $min || $v > $maks) {
        throw new CmsFeil("$navn må være mellom " . intdiv($min, 100) . ' og ' . intdiv($maks, 100) . ' kr.', 422);
    }
    return $v;
}

function cms_butikk_produkt(array $bygget, mixed $d): array
{
    if (!is_array($d)) throw new CmsFeil('Produktet mangler innhold.', 422);
    if (!in_array($d['status'] ?? null, ['bekreftet', 'plassholder'], true)) throw new CmsFeil('Velg status.', 422);
    $ut = [
        'status' => $d['status'],
        'prisOre' => cms_butikk_ore($d['prisOre'] ?? null, 'Prisen', 100, CMS_MAKS_PRIS_ORE, true),
        'navn' => cms_butikk_tekst($d['navn'] ?? null, 'Navnet', 2, 80),
        'kortBeskrivelse' => cms_butikk_tekst($d['kortBeskrivelse'] ?? null, 'Kort beskrivelse', 1, 160),
        'beskrivelse' => cms_butikk_tekst($d['beskrivelse'] ?? null, 'Beskrivelsen', 1, CMS_MAKS_TEKST, true),
    ];
    if (!empty($bygget['egenTekst'])) {
        $ut['tilleggOre'] = cms_butikk_ore($d['tilleggOre'] ?? null, 'Tillegget for egen tekst', 100, CMS_MAKS_PRIS_ORE, true);
    }
    return $ut;
}

function cms_butikk_innstillinger(mixed $d): array
{
    if (!is_array($d) || !is_bool($d['betaling'] ?? null)) throw new CmsFeil('Velg om kortbetaling er på eller av.', 422);
    $frakt = $d['frakt'] ?? null;
    if (!is_array($frakt) || !array_is_list($frakt)) throw new CmsFeil('Fraktvalgene kunne ikke leses.', 422);
    if (count($frakt) > CMS_MAKS_FRAKT) throw new CmsFeil('Stripe viser høyst ' . CMS_MAKS_FRAKT . ' fraktvalg.', 422);
    $ut = [];
    foreach ($frakt as $i => $f) {
        $nr = $i + 1;
        if (!is_array($f)) throw new CmsFeil("Fraktvalg $nr kunne ikke leses.", 422);
        $min = $f['dagerMin'] ?? null;
        $maks = $f['dagerMaks'] ?? null;
        foreach ([$min, $maks] as $dager) {
            if ($dager !== null && (!is_int($dager) || $dager < 1 || $dager > 60)) {
                throw new CmsFeil("Leveringstiden for fraktvalg $nr må være 1 til 60 virkedager.", 422);
            }
        }
        if (($min === null) !== ($maks === null)) throw new CmsFeil("Fyll ut begge leveringsdagene for fraktvalg $nr, eller ingen.", 422);
        if ($min !== null && $maks < $min) throw new CmsFeil("Fraktvalg $nr: «til» kan ikke være før «fra».", 422);
        $ut[] = [
            'navn' => cms_butikk_tekst($f['navn'] ?? null, "Navnet på fraktvalg $nr", 2, 80),
            'prisOre' => cms_butikk_ore($f['prisOre'] ?? null, "Prisen for fraktvalg $nr", 0, 1_000_000, false),
            'dagerMin' => $min,
            'dagerMaks' => $maks,
        ];
    }
    return ['betaling' => $d['betaling'], 'frakt' => $ut];
}

// ---------------------------------------------------------------- Overview

/** Whether Stripe is connected, without ever showing a key. */
function cms_butikk_stripe(): array
{
    $konfig = dp_stripe_konfig($grunn);
    if (!$konfig) {
        return ['tilkoblet' => false, 'modus' => null, 'webhook' => false,
            'grunn' => str_contains((string) $grunn, 'mangler') && str_contains((string) $grunn, 'konfig')
                ? 'Nøkkelfilen api/stripe/konfig.php finnes ikke på serveren.'
                : 'Nøkkelfilen finnes, men nøkkelen godtas ikke (feil form, eller live-nøkkel uten tillat_live).'];
    }
    return ['tilkoblet' => true, 'modus' => $konfig['live'] ? 'live' : 'test', 'webhook' => $konfig['webhook'] !== '', 'grunn' => null];
}

function cms_butikk_oversikt(): array
{
    $bygget = dp_butikk_bygget();
    if ($bygget === null) throw new CmsFeil('Produktlisten fra nettsidebygget (api/katalog.json) mangler.', 503);
    $navn = cms_brukernavn();
    $rader = [];
    foreach (cms_alle('SELECT * FROM cms_butikk') as $r) $rader[$r['nokkel']] = $r;
    $meta = fn(?array $r) => ['versjon' => (int) ($r['versjon'] ?? 0), 'endret' => $r['endret'] ?? null,
        'endretAv' => isset($r['endret_av']) ? ($navn[(int) $r['endret_av']] ?? null) : null];
    $produkter = [];
    foreach ($bygget['produkter'] as $p) {
        $r = $rader['produkt/' . $p['id']] ?? null;
        $produkter[] = ['id' => $p['id'], 'bygget' => [
            'navn' => $p['navn'], 'status' => $p['status'], 'prisOre' => $p['prisOre'],
            'tilleggOre' => $p['egenTekst']['tilleggOre'] ?? null, 'egenTekst' => !empty($p['egenTekst']),
            'kortBeskrivelse' => $p['kortBeskrivelse'] ?? '', 'beskrivelse' => $p['beskrivelse'] ?? ($p['kortBeskrivelse'] ?? ''),
            'kategori' => $p['kategoriNavn'] ?? '', 'bilde' => $p['bilde'] ?? null, 'href' => $p['href'] ?? null,
        ], 'studio' => cms_butikk_verdi($r)] + $meta($r);
    }
    $r = $rader['innstillinger'] ?? null;
    $samlet = dp_butikk_flett($bygget, dp_butikk_overstyring(cms_datamappe() . '/butikk.json'));
    $konfig = dp_stripe_konfig();
    return [
        'produkter' => $produkter,
        'innstillinger' => ['bygget' => $bygget['butikk'] ?? ['betaling' => false, 'frakt' => []], 'studio' => cms_butikk_verdi($r)] + $meta($r),
        'stripe' => cms_butikk_stripe(),
        'kasse' => dp_kassestatus($samlet, $konfig),
        'nyeOrdrer' => (int) cms_en("SELECT COUNT(*) AS n FROM cms_ordrer WHERE levering = 'ny'")['n'],
    ];
}

// ---------------------------------------------------------------- Orders

/** Save a paid order once (one row per Stripe session). Called by the webhook. */
function cms_ordre_lagre(array $o): void
{
    if (cms_en('SELECT id FROM cms_ordrer WHERE stripe_okt = ?', [$o['stripeOkt']])) return;
    try {
        cms_kjor(
            "INSERT INTO cms_ordrer (stripe_okt, referanse, modus, betaling_id, levering, navn, epost, telefon, adresse, melding,
                linjer, frakt_ore, total_ore, valuta, varslet, notat, opprettet, endret)
             VALUES (?, ?, ?, ?, 'ny', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)",
            [$o['stripeOkt'], $o['referanse'], $o['modus'], $o['betalingId'], $o['navn'], $o['epost'], $o['telefon'],
                $o['adresse'], $o['melding'], json_encode($o['linjer'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                $o['fraktOre'], $o['totalOre'], $o['valuta'], cms_na(), cms_na()],
        );
    } catch (PDOException $e) {
        // a parallel delivery saved it first
        if (!str_starts_with((string) $e->getCode(), '23')) throw $e;
    }
}

function cms_ordre_varslet(string $stripeOkt): void
{
    try {
        cms_kjor('UPDATE cms_ordrer SET varslet = 1 WHERE stripe_okt = ?', [$stripeOkt]);
    } catch (Throwable $e) {
        error_log('Designporten: kunne ikke merke ordren som varslet: ' . $e->getMessage());
    }
}

function cms_ordre_ut(array $r): array
{
    return [
        'id' => (int) $r['id'], 'referanse' => $r['referanse'], 'modus' => $r['modus'], 'stripeOkt' => $r['stripe_okt'],
        'betalingId' => $r['betaling_id'], 'levering' => $r['levering'], 'navn' => $r['navn'], 'epost' => $r['epost'],
        'telefon' => $r['telefon'], 'adresse' => $r['adresse'], 'melding' => $r['melding'],
        'linjer' => json_decode((string) $r['linjer'], true), 'fraktOre' => $r['frakt_ore'] === null ? null : (int) $r['frakt_ore'],
        'totalOre' => $r['total_ore'] === null ? null : (int) $r['total_ore'], 'valuta' => $r['valuta'],
        'varslet' => (bool) $r['varslet'], 'notat' => $r['notat'], 'opprettet' => $r['opprettet'], 'endret' => $r['endret'],
    ];
}

function cms_ordre_rad(int $id): array
{
    $r = cms_en('SELECT * FROM cms_ordrer WHERE id = ?', [$id]);
    if (!$r) throw new CmsFeil('Fant ikke ordren.', 404);
    return $r;
}

/** The order as the webhook built it, for sending the e-mail again. */
function cms_ordre_som_epost(array $r): array
{
    return ['stripeOkt' => $r['stripe_okt'], 'referanse' => $r['referanse'], 'modus' => $r['modus'], 'navn' => $r['navn'],
        'epost' => $r['epost'], 'telefon' => $r['telefon'], 'adresse' => $r['adresse'], 'melding' => $r['melding'],
        'linjer' => json_decode((string) $r['linjer'], true), 'fraktOre' => $r['frakt_ore'] === null ? null : (int) $r['frakt_ore'],
        'totalOre' => $r['total_ore'] === null ? null : (int) $r['total_ore']];
}

// ---------------------------------------------------------------- Routes

function cms_handel_rute(string $r): void
{
    if ($r === 'butikk') {
        cms_metode('GET');
        cms_krev('butikk');
        cms_svar(['butikk' => cms_butikk_oversikt()]);
    }
    if ($r === 'butikk-produkt') {
        cms_metode('POST');
        $aktor = cms_krev('butikk');
        $k = cms_kropp();
        $id = (string) ($k['id'] ?? '');
        $bygget = null;
        foreach (dp_butikk_bygget()['produkter'] ?? [] as $p) {
            if ($p['id'] === $id) $bygget = $p;
        }
        if ($bygget === null) throw new CmsFeil('Fant ikke produktet.', 404);
        $verdi = ($k['verdi'] ?? null) === null ? null : cms_butikk_produkt($bygget, $k['verdi']);
        cms_butikk_skriv('produkt/' . $id, (int) ($k['versjon'] ?? -1), $verdi, $aktor);
        cms_svar(['butikk' => cms_butikk_oversikt()]);
    }
    if ($r === 'butikk-innstillinger') {
        cms_metode('POST');
        $aktor = cms_krev('butikk');
        $k = cms_kropp();
        $verdi = ($k['verdi'] ?? null) === null ? null : cms_butikk_innstillinger($k['verdi']);
        cms_butikk_skriv('innstillinger', (int) ($k['versjon'] ?? -1), $verdi, $aktor);
        cms_svar(['butikk' => cms_butikk_oversikt()]);
    }
    if ($r === 'ordrer') {
        cms_metode('GET');
        cms_krev('butikk');
        cms_svar(['ordrer' => array_map('cms_ordre_ut', cms_alle('SELECT * FROM cms_ordrer ORDER BY id DESC LIMIT 500')),
            'leveringer' => DP_ORDRE_LEVERING]);
    }
    if ($r === 'ordre') {
        cms_metode('POST');
        $aktor = cms_krev('butikk');
        $k = cms_kropp();
        $rad = cms_ordre_rad((int) ($k['id'] ?? 0));
        $sett = [];
        if (array_key_exists('levering', $k)) {
            if (!is_string($k['levering']) || !isset(DP_ORDRE_LEVERING[$k['levering']])) throw new CmsFeil('Ukjent leveringsstatus.', 422);
            $sett['levering'] = $k['levering'];
        }
        if (array_key_exists('notat', $k)) {
            if (!is_string($k['notat']) || mb_strlen($k['notat']) > 4000) throw new CmsFeil('Notatet kan ha høyst 4000 tegn.', 422);
            $sett['notat'] = trim($k['notat']) === '' ? null : trim(str_replace(["\r\n", "\r"], "\n", $k['notat']));
        }
        if (!$sett) throw new CmsFeil('Ingenting å endre.', 422);
        $sett['endret'] = cms_na();
        $deler = implode(', ', array_map(fn($x) => "$x = ?", array_keys($sett)));
        cms_kjor("UPDATE cms_ordrer SET $deler WHERE id = ?", [...array_values($sett), $rad['id']]);
        cms_logg($aktor, 'ordre.endre', $rad['referanse'], array_intersect_key($rad, $sett), $sett);
        cms_svar(['ordre' => cms_ordre_ut(cms_ordre_rad((int) $rad['id']))]);
    }
    if ($r === 'ordre-varsle') {
        cms_metode('POST');
        $aktor = cms_krev('butikk');
        $rad = cms_ordre_rad((int) (cms_kropp()['id'] ?? 0));
        cms_begrens('ordre-varsle:' . $aktor['id'], 20, 3600);
        cms_registrer_forsok('ordre-varsle:' . $aktor['id']);
        $sendt = dp_ordre_send(cms_ordre_som_epost($rad));
        cms_logg($aktor, 'ordre.varsle', $rad['referanse'], null, null, $sendt === null ? 'feilet' : 'ok');
        if ($sendt === null) throw new CmsFeil('E-posten kunne ikke sendes. Sjekk e-postoppsettet (api/oppsett.php) under Drift.', 502);
        cms_ordre_varslet($rad['stripe_okt']);
        cms_svar(['ordre' => cms_ordre_ut(cms_ordre_rad((int) $rad['id']))]);
    }
}

/**
 * Restore from a backup: shop rows are replaced when the backup has them;
 * orders are only added (an order Stripe was paid for is never removed).
 */
function cms_handel_import(array $tabeller, array &$antall): void
{
    if (is_array($tabeller['cms_butikk'] ?? null)) {
        cms_kjor('DELETE FROM cms_butikk');
        $s = cms_db()->prepare('INSERT INTO cms_butikk (nokkel, verdi, versjon, endret, endret_av) VALUES (?, ?, ?, ?, ?)');
        foreach ($tabeller['cms_butikk'] as $r) {
            if (!is_array($r) || !is_string($r['nokkel'] ?? null) || !is_string($r['verdi'] ?? null)) throw new CmsFeil('Ugyldig butikkrad i sikkerhetskopien.', 422);
            $s->execute([$r['nokkel'], $r['verdi'], (int) ($r['versjon'] ?? 1), (string) ($r['endret'] ?? cms_na()), $r['endret_av'] ?? null]);
        }
        $antall['cms_butikk'] = count($tabeller['cms_butikk']);
    }
    if (is_array($tabeller['cms_ordrer'] ?? null)) {
        $k = ['stripe_okt', 'referanse', 'modus', 'betaling_id', 'levering', 'navn', 'epost', 'telefon', 'adresse', 'melding',
            'linjer', 'frakt_ore', 'total_ore', 'valuta', 'varslet', 'notat', 'opprettet', 'endret'];
        $s = cms_db()->prepare('INSERT INTO cms_ordrer (' . implode(', ', $k) . ') VALUES (' . implode(', ', array_fill(0, count($k), '?')) . ')');
        $antall['cms_ordrer'] = 0;
        foreach ($tabeller['cms_ordrer'] as $r) {
            if (!is_array($r) || !is_string($r['stripe_okt'] ?? null)) continue;
            if (cms_en('SELECT id FROM cms_ordrer WHERE stripe_okt = ?', [$r['stripe_okt']])) continue;
            $s->execute(array_map(fn($x) => $r[$x] ?? null, $k));
            $antall['cms_ordrer']++;
        }
    }
}
