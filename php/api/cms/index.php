<?php
/**
 * Designporten CMS API. One entry point, the action in ?r=…:
 *
 *   GET  status              is the CMS set up, does it have users (public)
 *   GET  publisert           published texts only (public)
 *   POST oppsett             create the first admin with the setup code
 *   POST logginn / loggut    session sign-in for people
 *   GET  meg                 the signed-in actor and its CSRF token
 *   GET  innhold             every field: default, published, draft, version
 *   POST lagre               save drafts (optimistic locking on `versjon`)
 *   POST publiser / forkast  publish or drop drafts
 *   GET  historikk           revisions of one field
 *   POST gjenopprett         make an old revision the draft
 *   POST forslag             an agent proposes a text (Idempotency-Key)
 *   GET  forslag             proposals (editors: all, agents: their own)
 *   POST behandle            approve or reject a proposal
 *   GET  brukere / POST bruker / POST ny-nokkel / POST passord
 *   GET  logg                audit log
 *   GET  eksport / POST import   backup and restore of all content
 *
 * See docs/cms/README.md.
 */

declare(strict_types=1);

require_once __DIR__ . '/_kjerne.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function cms_svar(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cms_kropp(): array
{
    $raa = file_get_contents('php://input') ?: '';
    if (strlen($raa) > 20 * 1024 * 1024) throw new CmsFeil('Forespørselen er for stor.', 413);
    if ($raa === '') return [];
    $data = json_decode($raa, true);
    if (!is_array($data)) throw new CmsFeil('Forventet JSON.', 400);
    return $data;
}

function cms_metode(string $metode): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $metode) throw new CmsFeil('Feil metode.', 405);
}

function cms_rad(string $nokkel): ?array
{
    return cms_en('SELECT * FROM cms_innhold WHERE nokkel = ?', [$nokkel]);
}

function cms_felt(string $nokkel, ?array $rad, array $navn = []): array
{
    $def = cms_nokler()[$nokkel];
    return [
        'nokkel' => $nokkel,
        'type' => $def['type'] ?? 'linje',
        'sider' => $def['sider'] ?? [],
        'standard' => $def['standard'] ?? '',
        'publisert' => $rad['publisert'] ?? null,
        'utkast' => $rad['utkast'] ?? null,
        'versjon' => (int) ($rad['versjon'] ?? 0),
        'endret' => $rad['endret'] ?? null,
        'endretAv' => isset($rad['endret_av']) ? ($navn[(int) $rad['endret_av']] ?? null) : null,
        'publisertTid' => $rad['publisert_tid'] ?? null,
    ];
}

function cms_revisjon(string $nokkel, int $versjon, string $handling, ?string $verdi, array $aktor): void
{
    cms_kjor(
        'INSERT INTO cms_revisjoner (nokkel, versjon, handling, verdi, aktor_id, opprettet) VALUES (?, ?, ?, ?, ?, ?)',
        [$nokkel, $versjon, $handling, $verdi, $aktor['id'], cms_na()],
    );
}

/**
 * Write a field only if it still has the version the caller saw. Two people
 * editing the same field never overwrite each other silently (CMS-05).
 * Returns the new version, or null on a conflict.
 */
function cms_skriv(string $nokkel, int $versjon, array $sett, array $aktor): ?int
{
    $rad = cms_rad($nokkel);
    if ((int) ($rad['versjon'] ?? 0) !== $versjon) return null;
    $ny = $versjon + 1;
    $sett += ['endret' => cms_na(), 'endret_av' => $aktor['id']];
    if (!$rad) {
        $kolonner = array_keys($sett);
        $sql = 'INSERT INTO cms_innhold (nokkel, versjon, ' . implode(', ', $kolonner) . ') VALUES (?, ?'
            . str_repeat(', ?', count($kolonner)) . ')';
        try {
            cms_kjor($sql, [$nokkel, $ny, ...array_values($sett)]);
        } catch (PDOException) {
            return null;
        }
        return $ny;
    }
    $deler = implode(', ', array_map(fn($k) => "$k = ?", array_keys($sett)));
    $endret = cms_kjor(
        "UPDATE cms_innhold SET $deler, versjon = ? WHERE nokkel = ? AND versjon = ?",
        [...array_values($sett), $ny, $nokkel, $versjon],
    );
    return $endret === 1 ? $ny : null;
}

function cms_konflikt(string $nokkel): array
{
    return ['nokkel' => $nokkel, 'status' => 'konflikt', 'felt' => cms_felt($nokkel, cms_rad($nokkel)),
        'melding' => 'Noen andre har endret denne teksten i mellomtiden.'];
}

function cms_nokkelliste(array $kropp, string $navn = 'nokler'): array
{
    $liste = $kropp[$navn] ?? null;
    if (!is_array($liste) || !$liste || count($liste) > 500) throw new CmsFeil('Ingen felt valgt.', 422);
    $ut = [];
    foreach ($liste as $e) {
        $nokkel = is_array($e) ? ($e['nokkel'] ?? null) : null;
        if (!is_string($nokkel) || !isset(cms_nokler()[$nokkel])) throw new CmsFeil('Ukjent felt.', 422);
        $ut[] = ['nokkel' => $nokkel, 'versjon' => (int) ($e['versjon'] ?? -1)] + $e;
    }
    return $ut;
}

function cms_publiser_en(string $nokkel, int $versjon, array $aktor): array
{
    $rad = cms_rad($nokkel);
    if (!$rad || $rad['utkast'] === null) {
        return ['nokkel' => $nokkel, 'status' => 'ingen-utkast', 'felt' => cms_felt($nokkel, $rad)];
    }
    $ny = cms_skriv($nokkel, $versjon, [
        'publisert' => $rad['utkast'], 'utkast' => null, 'publisert_tid' => cms_na(), 'publisert_av' => $aktor['id'],
    ], $aktor);
    if ($ny === null) return cms_konflikt($nokkel);
    cms_revisjon($nokkel, $ny, 'publisert', $rad['utkast'], $aktor);
    cms_logg($aktor, 'innhold.publiser', $nokkel, $rad['publisert'], $rad['utkast']);
    return ['nokkel' => $nokkel, 'status' => 'ok', 'felt' => cms_felt($nokkel, cms_rad($nokkel))];
}

function cms_utkast_en(string $nokkel, int $versjon, string $verdi, array $aktor, string $handling): array
{
    $for = cms_rad($nokkel);
    $ny = cms_skriv($nokkel, $versjon, ['utkast' => $verdi], $aktor);
    if ($ny === null) return cms_konflikt($nokkel);
    cms_revisjon($nokkel, $ny, $handling, $verdi, $aktor);
    cms_logg($aktor, 'innhold.' . $handling, $nokkel, $for['utkast'] ?? $for['publisert'] ?? null, $verdi);
    return ['nokkel' => $nokkel, 'status' => 'ok', 'felt' => cms_felt($nokkel, cms_rad($nokkel))];
}

function cms_brukernavn(): array
{
    $navn = [];
    foreach (cms_alle('SELECT id, navn FROM cms_brukere') as $b) $navn[(int) $b['id']] = $b['navn'];
    return $navn;
}

function cms_ny_nokkel(): array
{
    $nokkel = 'dpcms_' . bin2hex(random_bytes(24));
    return [$nokkel, hash('sha256', $nokkel), substr($nokkel, 0, 12)];
}

function cms_passord_ok(string $passord): void
{
    if (mb_strlen($passord) < 12) throw new CmsFeil('Passordet må ha minst 12 tegn.', 422);
    if (strlen($passord) > 200) throw new CmsFeil('Passordet er for langt.', 422);
}

function cms_logg_inn(array $b): array
{
    cms_okt();
    session_regenerate_id(true);
    $_SESSION['bruker'] = (int) $b['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    cms_kjor('UPDATE cms_brukere SET sist_inne = ? WHERE id = ?', [cms_na(), $b['id']]);
    cms_merke(true);
    return ['bruker' => cms_offentlig_bruker($b), 'csrf' => $_SESSION['csrf']];
}

/** Tables in a backup, in restore order. Users are exported but restored only into an empty user table. */
const CMS_TABELLER = ['cms_innhold', 'cms_revisjoner', 'cms_forslag', 'cms_hendelser'];

try {
    $r = (string) ($_GET['r'] ?? '');
    $metode = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($r === 'status') {
        $konfig = cms_konfig();
        if ($konfig === null) cms_svar(['oppsett' => false, 'harBrukere' => false]);
        $n = (int) cms_en('SELECT COUNT(*) AS n FROM cms_brukere')['n'];
        cms_svar(['oppsett' => true, 'harBrukere' => $n > 0, 'felt' => count(cms_nokler())]);
    }

    if ($r === 'publisert') {
        $ut = [];
        foreach (cms_alle('SELECT nokkel, publisert FROM cms_innhold WHERE publisert IS NOT NULL') as $rad) {
            $ut[$rad['nokkel']] = $rad['publisert'];
        }
        cms_svar(['innhold' => (object) $ut]);
    }

    if ($r === 'oppsett') {
        cms_metode('POST');
        $kropp = cms_kropp();
        $kode = (string) (cms_konfig()['oppsettkode'] ?? '');
        cms_begrens('oppsett:' . cms_ip(), CMS_INNLOGGING_FORSOK, CMS_INNLOGGING_VINDU);
        cms_registrer_forsok('oppsett:' . cms_ip());
        if ((int) cms_en('SELECT COUNT(*) AS n FROM cms_brukere')['n'] > 0) throw new CmsFeil('CMS-et har allerede en administrator.', 409);
        if (strlen($kode) < 16) throw new CmsFeil('Oppsettkoden mangler i konfig.php (minst 16 tegn).', 503);
        if (!hash_equals($kode, (string) ($kropp['kode'] ?? ''))) {
            cms_logg(null, 'oppsett', null, null, null, 'avvist');
            throw new CmsFeil('Feil oppsettkode.', 403);
        }
        $epost = mb_strtolower(trim((string) ($kropp['epost'] ?? '')));
        $navn = trim((string) ($kropp['navn'] ?? ''));
        $passord = (string) ($kropp['passord'] ?? '');
        if (!filter_var($epost, FILTER_VALIDATE_EMAIL)) throw new CmsFeil('Skriv en gyldig e-postadresse.', 422);
        if ($navn === '' || mb_strlen($navn) > 100) throw new CmsFeil('Skriv navnet ditt.', 422);
        cms_passord_ok($passord);
        cms_kjor(
            "INSERT INTO cms_brukere (epost, navn, rolle, passord_hash, rettigheter, aktiv, opprettet) VALUES (?, ?, 'admin', ?, '[]', 1, ?)",
            [$epost, $navn, password_hash($passord, PASSWORD_DEFAULT), cms_na()],
        );
        $b = cms_en('SELECT * FROM cms_brukere WHERE epost = ?', [$epost]);
        cms_logg(cms_offentlig_bruker($b), 'oppsett', $epost, null, null);
        cms_svar(cms_logg_inn($b));
    }

    if ($r === 'logginn') {
        cms_metode('POST');
        $kropp = cms_kropp();
        $epost = mb_strtolower(trim((string) ($kropp['epost'] ?? '')));
        cms_begrens('inn:' . cms_ip(), CMS_INNLOGGING_FORSOK * 3, CMS_INNLOGGING_VINDU);
        cms_begrens('inn:' . $epost, CMS_INNLOGGING_FORSOK, CMS_INNLOGGING_VINDU);
        $b = cms_en("SELECT * FROM cms_brukere WHERE epost = ? AND aktiv = 1 AND rolle <> 'agent'", [$epost]);
        if (!$b || !password_verify((string) ($kropp['passord'] ?? ''), (string) $b['passord_hash'])) {
            cms_registrer_forsok('inn:' . cms_ip());
            cms_registrer_forsok('inn:' . $epost);
            cms_logg(null, 'logginn', $epost, null, null, 'avvist');
            throw new CmsFeil('Feil e-post eller passord.', 401);
        }
        if (password_needs_rehash((string) $b['passord_hash'], PASSWORD_DEFAULT)) {
            cms_kjor('UPDATE cms_brukere SET passord_hash = ? WHERE id = ?', [password_hash((string) $kropp['passord'], PASSWORD_DEFAULT), $b['id']]);
        }
        cms_logg(cms_offentlig_bruker($b), 'logginn', $epost, null, null);
        cms_svar(cms_logg_inn($b));
    }

    if ($r === 'loggut') {
        cms_metode('POST');
        cms_okt();
        $_SESSION = [];
        session_regenerate_id(true);
        session_destroy();
        cms_merke(false);
        cms_svar(['ok' => true]);
    }

    if ($r === 'meg') {
        $aktor = cms_aktor();
        if ($aktor === null) {
            cms_merke(false);
            throw new CmsFeil('Ikke logget inn.', 401);
        }
        cms_svar(['bruker' => $aktor, 'csrf' => $aktor['via'] === 'okt' ? cms_csrf() : null]);
    }

    if ($r === 'innhold') {
        cms_krev('les');
        $navn = cms_brukernavn();
        $rader = [];
        foreach (cms_alle('SELECT * FROM cms_innhold') as $rad) $rader[$rad['nokkel']] = $rad;
        $side = isset($_GET['side']) ? (string) $_GET['side'] : null;
        $felt = [];
        foreach (cms_nokler() as $nokkel => $def) {
            if ($side !== null && !in_array($side, $def['sider'] ?? [], true)) continue;
            $felt[] = cms_felt($nokkel, $rader[$nokkel] ?? null, $navn);
        }
        cms_svar(['felt' => $felt]);
    }

    if ($r === 'lagre') {
        cms_metode('POST');
        $aktor = cms_krev('utkast');
        $ut = [];
        foreach (cms_nokkelliste(cms_kropp(), 'endringer') as $e) {
            try {
                $verdi = cms_gyldig_verdi($e['nokkel'], $e['verdi'] ?? null);
            } catch (CmsFeil $f) {
                $ut[] = ['nokkel' => $e['nokkel'], 'status' => 'ugyldig', 'melding' => $f->getMessage()];
                continue;
            }
            $ut[] = cms_utkast_en($e['nokkel'], $e['versjon'], $verdi, $aktor, 'utkast');
        }
        cms_svar(['resultater' => $ut]);
    }

    if ($r === 'publiser') {
        cms_metode('POST');
        $aktor = cms_krev('publiser');
        $ut = [];
        foreach (cms_nokkelliste(cms_kropp()) as $e) $ut[] = cms_publiser_en($e['nokkel'], $e['versjon'], $aktor);
        cms_skriv_publisert();
        cms_svar(['resultater' => $ut]);
    }

    if ($r === 'forkast') {
        cms_metode('POST');
        $aktor = cms_krev('utkast');
        $ut = [];
        foreach (cms_nokkelliste(cms_kropp()) as $e) {
            $rad = cms_rad($e['nokkel']);
            if (!$rad || $rad['utkast'] === null) {
                $ut[] = ['nokkel' => $e['nokkel'], 'status' => 'ingen-utkast', 'felt' => cms_felt($e['nokkel'], $rad)];
                continue;
            }
            $ny = cms_skriv($e['nokkel'], $e['versjon'], ['utkast' => null], $aktor);
            if ($ny === null) {
                $ut[] = cms_konflikt($e['nokkel']);
                continue;
            }
            cms_revisjon($e['nokkel'], $ny, 'forkastet', null, $aktor);
            cms_logg($aktor, 'innhold.forkast', $e['nokkel'], $rad['utkast'], null);
            $ut[] = ['nokkel' => $e['nokkel'], 'status' => 'ok', 'felt' => cms_felt($e['nokkel'], cms_rad($e['nokkel']))];
        }
        cms_svar(['resultater' => $ut]);
    }

    if ($r === 'historikk') {
        cms_krev('les');
        $nokkel = (string) ($_GET['nokkel'] ?? '');
        if (!isset(cms_nokler()[$nokkel])) throw new CmsFeil('Ukjent felt.', 404);
        $navn = cms_brukernavn();
        $liste = array_map(fn($r) => [
            'id' => (int) $r['id'], 'versjon' => (int) $r['versjon'], 'handling' => $r['handling'],
            'verdi' => $r['verdi'], 'av' => $navn[(int) $r['aktor_id']] ?? null, 'tid' => $r['opprettet'],
        ], cms_alle('SELECT * FROM cms_revisjoner WHERE nokkel = ? ORDER BY id DESC LIMIT 200', [$nokkel]));
        cms_svar(['felt' => cms_felt($nokkel, cms_rad($nokkel), $navn), 'revisjoner' => $liste]);
    }

    if ($r === 'gjenopprett') {
        cms_metode('POST');
        $aktor = cms_krev('utkast');
        $kropp = cms_kropp();
        $rev = cms_en('SELECT * FROM cms_revisjoner WHERE id = ?', [(int) ($kropp['revisjon'] ?? 0)]);
        $standard = ($kropp['standard'] ?? false) === true;
        $nokkel = $standard ? (string) ($kropp['nokkel'] ?? '') : (string) ($rev['nokkel'] ?? '');
        if (!isset(cms_nokler()[$nokkel])) throw new CmsFeil('Fant ikke versjonen.', 404);
        $verdi = $standard ? (string) cms_nokler()[$nokkel]['standard'] : $rev['verdi'];
        if ($verdi === null || $verdi === '') throw new CmsFeil('Denne versjonen har ingen tekst å gjenopprette.', 422);
        $svar = cms_utkast_en($nokkel, (int) ($kropp['versjon'] ?? -1), $verdi, $aktor, 'gjenopprettet');
        cms_svar($svar, $svar['status'] === 'ok' ? 200 : 409);
    }

    if ($r === 'forslag' && $metode === 'POST') {
        $aktor = cms_krev('forslag');
        $kropp = cms_kropp();
        $nokkel = (string) ($kropp['nokkel'] ?? '');
        $verdi = cms_gyldig_verdi($nokkel, $kropp['verdi'] ?? null);
        $idem = trim((string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ($kropp['idempotens'] ?? '')));
        $idem = $idem === '' ? null : substr($aktor['id'] . ':' . $idem, 0, 191);
        if ($idem !== null && ($finnes = cms_en('SELECT * FROM cms_forslag WHERE idempotens = ?', [$idem]))) {
            cms_svar(['forslag' => ['id' => (int) $finnes['id'], 'status' => $finnes['status']], 'gjentatt' => true]);
        }
        $begrunnelse = mb_substr(trim((string) ($kropp['begrunnelse'] ?? '')), 0, 2000) ?: null;
        $kilde = mb_substr(trim((string) ($kropp['kilde'] ?? '')), 0, 191) ?: null;
        $rad = cms_rad($nokkel);
        try {
            cms_kjor(
                "INSERT INTO cms_forslag (nokkel, verdi, begrunnelse, kilde, aktor_id, idempotens, basert_pa_versjon, status, opprettet)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'venter', ?)",
                [$nokkel, $verdi, $begrunnelse, $kilde, $aktor['id'], $idem, (int) ($rad['versjon'] ?? 0), cms_na()],
            );
        } catch (PDOException) {
            $finnes = cms_en('SELECT * FROM cms_forslag WHERE idempotens = ?', [$idem]);
            cms_svar(['forslag' => ['id' => (int) $finnes['id'], 'status' => $finnes['status']], 'gjentatt' => true]);
        }
        $id = (int) cms_db()->lastInsertId();
        cms_logg($aktor, 'forslag.ny', $nokkel, $rad['publisert'] ?? cms_nokler()[$nokkel]['standard'] ?? null, $verdi);
        cms_svar(['forslag' => ['id' => $id, 'status' => 'venter'], 'gjentatt' => false], 201);
    }

    if ($r === 'forslag') {
        $aktor = cms_krev('les');
        $egne = $aktor['rolle'] === 'agent';
        $navn = cms_brukernavn();
        $rader = $egne
            ? cms_alle('SELECT * FROM cms_forslag WHERE aktor_id = ? ORDER BY id DESC LIMIT 200', [$aktor['id']])
            : cms_alle("SELECT * FROM cms_forslag ORDER BY CASE WHEN status = 'venter' THEN 0 ELSE 1 END, id DESC LIMIT 200");
        $innhold = [];
        foreach (cms_alle('SELECT * FROM cms_innhold') as $rad) $innhold[$rad['nokkel']] = $rad;
        cms_svar(['forslag' => array_map(fn($f) => [
            'id' => (int) $f['id'], 'nokkel' => $f['nokkel'], 'verdi' => $f['verdi'],
            'begrunnelse' => $f['begrunnelse'], 'kilde' => $f['kilde'], 'av' => $navn[(int) $f['aktor_id']] ?? null,
            'status' => $f['status'], 'opprettet' => $f['opprettet'], 'behandlet' => $f['behandlet'],
            'behandletAv' => $f['behandlet_av'] ? ($navn[(int) $f['behandlet_av']] ?? null) : null,
            'felt' => isset(cms_nokler()[$f['nokkel']]) ? cms_felt($f['nokkel'], $innhold[$f['nokkel']] ?? null, $navn) : null,
        ], $rader)]);
    }

    if ($r === 'behandle') {
        cms_metode('POST');
        $aktor = cms_krev('behandle');
        $kropp = cms_kropp();
        $f = cms_en('SELECT * FROM cms_forslag WHERE id = ?', [(int) ($kropp['id'] ?? 0)]);
        if (!$f) throw new CmsFeil('Fant ikke forslaget.', 404);
        if ($f['status'] !== 'venter') throw new CmsFeil('Forslaget er allerede behandlet.', 409);
        $beslutning = (string) ($kropp['beslutning'] ?? '');
        if (!in_array($beslutning, ['godkjenn', 'avvis'], true)) throw new CmsFeil('Ukjent beslutning.', 422);
        $resultat = null;
        if ($beslutning === 'godkjenn') {
            $rad = cms_rad($f['nokkel']);
            $resultat = cms_utkast_en($f['nokkel'], (int) ($rad['versjon'] ?? 0), $f['verdi'], $aktor, 'utkast');
            if ($resultat['status'] !== 'ok') cms_svar($resultat, 409);
            if (($kropp['publiser'] ?? false) === true && cms_kan($aktor, 'publiser')) {
                $resultat = cms_publiser_en($f['nokkel'], $resultat['felt']['versjon'], $aktor);
                cms_skriv_publisert();
            }
        }
        $status = $beslutning === 'godkjenn' ? 'godkjent' : 'avvist';
        cms_kjor('UPDATE cms_forslag SET status = ?, behandlet = ?, behandlet_av = ? WHERE id = ?', [$status, cms_na(), $aktor['id'], $f['id']]);
        cms_logg($aktor, 'forslag.' . $status, $f['nokkel'], null, $f['verdi']);
        cms_svar(['status' => $status, 'resultat' => $resultat]);
    }

    if ($r === 'brukere') {
        cms_krev('brukere');
        cms_svar(['brukere' => array_map('cms_offentlig_bruker', cms_alle('SELECT * FROM cms_brukere ORDER BY id'))]);
    }

    if ($r === 'bruker') {
        cms_metode('POST');
        $aktor = cms_krev('brukere');
        $kropp = cms_kropp();
        $id = (int) ($kropp['id'] ?? 0);
        $rolle = (string) ($kropp['rolle'] ?? '');
        $rettigheter = array_values(array_intersect(CMS_AGENTRETTIGHETER, (array) ($kropp['rettigheter'] ?? [])));
        $nokkel = null;
        if ($id === 0) {
            if (!in_array($rolle, CMS_ROLLER, true)) throw new CmsFeil('Ukjent rolle.', 422);
            $navn = trim((string) ($kropp['navn'] ?? ''));
            if ($navn === '' || mb_strlen($navn) > 100) throw new CmsFeil('Skriv et navn.', 422);
            if ($rolle === 'agent') {
                [$nokkel, $hash, $start] = cms_ny_nokkel();
                cms_kjor(
                    "INSERT INTO cms_brukere (navn, rolle, nokkel_hash, nokkel_start, rettigheter, aktiv, opprettet) VALUES (?, 'agent', ?, ?, ?, 1, ?)",
                    [$navn, $hash, $start, json_encode($rettigheter ?: ['forslag']), cms_na()],
                );
            } else {
                $epost = mb_strtolower(trim((string) ($kropp['epost'] ?? '')));
                if (!filter_var($epost, FILTER_VALIDATE_EMAIL)) throw new CmsFeil('Skriv en gyldig e-postadresse.', 422);
                $passord = (string) ($kropp['passord'] ?? '');
                cms_passord_ok($passord);
                if (cms_en('SELECT id FROM cms_brukere WHERE epost = ?', [$epost])) throw new CmsFeil('E-postadressen er allerede i bruk.', 409);
                cms_kjor(
                    "INSERT INTO cms_brukere (epost, navn, rolle, passord_hash, rettigheter, aktiv, opprettet) VALUES (?, ?, ?, ?, '[]', 1, ?)",
                    [$epost, $navn, $rolle, password_hash($passord, PASSWORD_DEFAULT), cms_na()],
                );
            }
            $id = (int) cms_db()->lastInsertId();
            cms_logg($aktor, 'bruker.ny', $navn . ' (' . $rolle . ')', null, $rolle === 'agent' ? ($rettigheter ?: ['forslag']) : null);
        } else {
            $b = cms_en('SELECT * FROM cms_brukere WHERE id = ?', [$id]);
            if (!$b) throw new CmsFeil('Fant ikke brukeren.', 404);
            if ($id === $aktor['id'] && (($kropp['aktiv'] ?? true) === false)) throw new CmsFeil('Du kan ikke sperre deg selv.', 422);
            $aktiv = array_key_exists('aktiv', $kropp) ? (($kropp['aktiv'] === true) ? 1 : 0) : (int) $b['aktiv'];
            $nyeRett = $b['rolle'] === 'agent' && array_key_exists('rettigheter', $kropp) ? json_encode($rettigheter) : $b['rettigheter'];
            cms_kjor('UPDATE cms_brukere SET aktiv = ?, rettigheter = ? WHERE id = ?', [$aktiv, $nyeRett, $id]);
            cms_logg($aktor, 'bruker.endre', $b['navn'], ['aktiv' => (bool) $b['aktiv'], 'rettigheter' => json_decode($b['rettigheter'])],
                ['aktiv' => (bool) $aktiv, 'rettigheter' => json_decode((string) $nyeRett)]);
        }
        $svar = ['bruker' => cms_offentlig_bruker(cms_en('SELECT * FROM cms_brukere WHERE id = ?', [$id]))];
        if ($nokkel !== null) $svar['nokkel'] = $nokkel;
        cms_svar($svar);
    }

    if ($r === 'ny-nokkel') {
        cms_metode('POST');
        $aktor = cms_krev('brukere');
        $b = cms_en("SELECT * FROM cms_brukere WHERE id = ? AND rolle = 'agent'", [(int) (cms_kropp()['id'] ?? 0)]);
        if (!$b) throw new CmsFeil('Fant ikke agenten.', 404);
        [$nokkel, $hash, $start] = cms_ny_nokkel();
        cms_kjor('UPDATE cms_brukere SET nokkel_hash = ?, nokkel_start = ? WHERE id = ?', [$hash, $start, $b['id']]);
        cms_logg($aktor, 'bruker.ny-nokkel', $b['navn'], $b['nokkel_start'], $start);
        cms_svar(['nokkel' => $nokkel, 'bruker' => cms_offentlig_bruker(cms_en('SELECT * FROM cms_brukere WHERE id = ?', [$b['id']]))]);
    }

    if ($r === 'passord') {
        cms_metode('POST');
        $aktor = cms_krev('les');
        if ($aktor['via'] !== 'okt') throw new CmsFeil('Bare for personer.', 403);
        $kropp = cms_kropp();
        $b = cms_en('SELECT * FROM cms_brukere WHERE id = ?', [$aktor['id']]);
        if (!password_verify((string) ($kropp['gammelt'] ?? ''), (string) $b['passord_hash'])) throw new CmsFeil('Det nåværende passordet er feil.', 403);
        cms_passord_ok((string) ($kropp['nytt'] ?? ''));
        cms_kjor('UPDATE cms_brukere SET passord_hash = ? WHERE id = ?', [password_hash((string) $kropp['nytt'], PASSWORD_DEFAULT), $aktor['id']]);
        cms_logg($aktor, 'bruker.passord', $aktor['navn'], null, null);
        cms_svar(['ok' => true]);
    }

    if ($r === 'logg') {
        cms_krev('logg');
        $rader = cms_alle('SELECT * FROM cms_hendelser ORDER BY id DESC LIMIT 300');
        cms_svar(['hendelser' => array_map(fn($h) => [
            'id' => (int) $h['id'], 'aktor' => $h['aktor'], 'handling' => $h['handling'], 'mal' => $h['mal'],
            'for' => $h['for_verdi'], 'etter' => $h['etter_verdi'], 'resultat' => $h['resultat'], 'tid' => $h['opprettet'],
        ], $rader)]);
    }

    if ($r === 'eksport') {
        $aktor = cms_krev('sikkerhetskopi');
        $data = ['format' => 'designporten-cms', 'versjon' => 1, 'laget' => cms_na(), 'tabeller' => []];
        foreach ([...CMS_TABELLER, 'cms_brukere'] as $t) $data['tabeller'][$t] = cms_alle("SELECT * FROM $t ORDER BY id");
        cms_logg($aktor, 'sikkerhetskopi.eksport', null, null, null);
        header('Content-Disposition: attachment; filename="designporten-cms-' . gmdate('Ymd-His') . '.json"');
        cms_svar($data);
    }

    if ($r === 'import') {
        cms_metode('POST');
        $aktor = cms_krev('sikkerhetskopi');
        $data = cms_kropp();
        if (($data['format'] ?? '') !== 'designporten-cms' || !is_array($data['tabeller'] ?? null)) {
            throw new CmsFeil('Filen er ikke en sikkerhetskopi fra Designporten CMS.', 422);
        }
        $kolonner = [
            'cms_innhold' => ['id', 'nokkel', 'utkast', 'publisert', 'versjon', 'endret', 'endret_av', 'publisert_tid', 'publisert_av'],
            'cms_revisjoner' => ['id', 'nokkel', 'versjon', 'handling', 'verdi', 'aktor_id', 'opprettet'],
            'cms_forslag' => ['id', 'nokkel', 'verdi', 'begrunnelse', 'kilde', 'aktor_id', 'idempotens', 'basert_pa_versjon', 'status', 'opprettet', 'behandlet', 'behandlet_av'],
            'cms_hendelser' => ['id', 'aktor_id', 'aktor', 'handling', 'mal', 'for_verdi', 'etter_verdi', 'resultat', 'ip', 'opprettet'],
        ];
        $db = cms_db();
        $db->beginTransaction();
        try {
            $antall = [];
            foreach (CMS_TABELLER as $t) {
                $db->exec("DELETE FROM $t");
                $k = $kolonner[$t];
                $s = $db->prepare("INSERT INTO $t (" . implode(', ', $k) . ') VALUES (' . implode(', ', array_fill(0, count($k), '?')) . ')');
                $rader = (array) ($data['tabeller'][$t] ?? []);
                foreach ($rader as $rad) $s->execute(array_map(fn($kol) => is_array($rad) ? ($rad[$kol] ?? null) : null, $k));
                $antall[$t] = count($rader);
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw new CmsFeil('Gjenopprettingen feilet, ingenting ble endret.', 422);
        }
        cms_skriv_publisert();
        cms_logg($aktor, 'sikkerhetskopi.import', (string) ($data['laget'] ?? ''), null, $antall);
        cms_svar(['ok' => true, 'antall' => $antall]);
    }

    throw new CmsFeil('Ukjent handling.', 404);
} catch (CmsFeil $f) {
    cms_svar(['feil' => $f->getMessage()] + $f->ekstra, $f->status);
} catch (Throwable $e) {
    error_log('Designporten CMS: ' . $e->getMessage());
    cms_svar(['feil' => 'Noe gikk galt på serveren.'], 500);
}
