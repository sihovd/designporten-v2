<?php
/**
 * Member accounts and the public sign gallery. One entry point, the action in ?r=…:
 *
 *   GET  status         is it switched on; the services and what they cost (public)
 *   POST registrer      new member: navn, epost, passord, vilkar (signs in)
 *   POST logginn / loggut
 *   GET  meg            the signed-in member, or null
 *   POST profil         change the name
 *   POST slett-konto    delete the member, their signs and sign-ins (passord)
 *   GET  skilt          the gallery, newest first (?antall, ?for = cursor)
 *   GET  mine-skilt     the member's own signs
 *   POST del            share a sign: mal, bilde; with id + nokkel it updates that sign
 *   POST bruk           a sign's template, to start from (counts the use)
 *   POST slett-skilt    remove a shared sign (id + nokkel, or the member who shared it)
 *   GET  bilde          a sign's preview (PNG)
 *   GET  admin-medlemmer / admin-skilt, POST admin-skjul   for CMS administrators
 *
 * POSTs need JSON and the header X-Konto: 1, which a form on another site
 * cannot send, so a signed-in member's cookie cannot be used from outside.
 * See docs/konto.md.
 */

declare(strict_types=1);

require_once __DIR__ . '/_konto.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function konto_svar(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function konto_kropp(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') throw new CmsFeil('Feil metode.', 405);
    if (($_SERVER['HTTP_X_KONTO'] ?? '') !== '1' || !str_starts_with((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        throw new CmsFeil('Forespørselen ble avvist.', 403);
    }
    $raa = file_get_contents('php://input', false, null, 0, KONTO_MAKS_MAL + KONTO_MAKS_BILDE * 2) ?: '';
    $data = json_decode($raa, true, 256);
    if (!is_array($data)) throw new CmsFeil('Forventet JSON.', 400);
    return $data;
}

function konto_get(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') throw new CmsFeil('Feil metode.', 405);
}

function konto_passord(mixed $p): string
{
    if (!is_string($p) || mb_strlen($p) < KONTO_MIN_PASSORD) {
        throw new CmsFeil('Passordet må ha minst ' . KONTO_MIN_PASSORD . ' tegn.', 422);
    }
    if (strlen($p) > 200) throw new CmsFeil('Passordet er for langt.', 422);
    return $p;
}

function konto_offentlig_id(mixed $v): string
{
    if (!is_string($v) || !preg_match('/^[a-z0-9]{16}$/D', $v)) throw new CmsFeil('Fant ikke skiltet.', 404);
    return $v;
}

/** The sign row, if the caller may change it: by the key from the browser that shared it, or as its member. */
function konto_eget_skilt(array $k, ?array $medlem): array
{
    $r = cms_en('SELECT * FROM dp_skilt WHERE offentlig_id = ?', [konto_offentlig_id($k['id'] ?? null)]);
    if (!$r) throw new CmsFeil('Fant ikke skiltet.', 404);
    $nokkel = $k['nokkel'] ?? null;
    $medNokkel = is_string($nokkel) && $nokkel !== '' && hash_equals($r['nokkel_hash'], hash('sha256', $nokkel));
    $somMedlem = $medlem !== null && $r['medlem_id'] !== null && (int) $r['medlem_id'] === (int) $medlem['id'];
    if (!$medNokkel && !$somMedlem) throw new CmsFeil('Du kan bare endre skilt du har delt selv.', 403);
    return $r;
}

$r = (string) ($_GET['r'] ?? '');

try {
    if ($r === 'status') {
        konto_get();
        $aktiv = cms_konfig() !== null;
        if ($aktiv) konto_db();
        konto_svar(['aktiv' => $aktiv] + konto_tjenester());
    }

    if (cms_konfig() === null) throw new CmsFeil('Brukerkontoer er ikke slått på på denne serveren ennå.', 503);
    konto_db();

    if ($r === 'bilde') {
        konto_get();
        $rad = cms_en('SELECT bilde FROM dp_skilt WHERE offentlig_id = ? AND skjult = 0', [konto_offentlig_id($_GET['id'] ?? null)]);
        $png = $rad && $rad['bilde'] ? base64_decode($rad['bilde'], true) : false;
        if ($png === false) throw new CmsFeil('Fant ikke bildet.', 404);
        header('Content-Type: image/png');
        header('Cache-Control: public, max-age=86400');
        header("Content-Security-Policy: default-src 'none'");
        echo $png;
        exit;
    }

    if ($r === 'skilt') {
        konto_get();
        $antall = max(1, min(48, (int) ($_GET['antall'] ?? 12)));
        // the cursor is the last sign's time and row, since several can share the same second
        $for = preg_match('/^(\S{1,32})_(\d{1,12})$/D', (string) ($_GET['for'] ?? ''), $m) ? $m : null;
        $hvor = 'skjult = 0' . ($for ? ' AND (endret < ? OR (endret = ? AND id < ?))' : '');
        $rader = cms_alle(
            'SELECT id, ' . KONTO_SKILTFELT . " FROM dp_skilt WHERE $hvor ORDER BY endret DESC, id DESC LIMIT " . ($antall + 1),
            $for ? [$for[1], $for[1], (int) $for[2]] : [],
        );
        $side = array_slice($rader, 0, $antall);
        $siste = end($side);
        konto_svar([
            'skilt' => array_map(fn($x) => konto_skilt_ut($x), $side),
            'neste' => count($rader) > $antall ? $siste['endret'] . '_' . $siste['id'] : null,
        ]);
    }

    if ($r === 'meg') {
        konto_get();
        $m = konto_medlem();
        konto_svar(['medlem' => $m ? konto_ut($m) : null]);
    }

    if ($r === 'registrer') {
        $k = konto_kropp();
        $navn = konto_tekst($k['navn'] ?? null, 'navn', 80);
        $epost = konto_epost($k['epost'] ?? null);
        $passord = konto_passord($k['passord'] ?? null);
        if (($k['vilkar'] ?? false) !== true) throw new CmsFeil('Du må godta vilkårene for å lage en konto.', 422);
        cms_begrens('konto-reg:' . cms_ip(), 5, 3600);
        cms_registrer_forsok('konto-reg:' . cms_ip());
        if (cms_en('SELECT id FROM dp_medlemmer WHERE epost = ?', [$epost])) {
            throw new CmsFeil('Det finnes allerede en konto med denne e-postadressen. Logg inn i stedet.', 409);
        }
        cms_kjor(
            'INSERT INTO dp_medlemmer (epost, navn, passord_hash, vilkar_godtatt, opprettet) VALUES (?, ?, ?, ?, ?)',
            [$epost, $navn, password_hash($passord, PASSWORD_DEFAULT), cms_na(), cms_na()],
        );
        $m = cms_en('SELECT * FROM dp_medlemmer WHERE epost = ?', [$epost]);
        konto_logg_inn($m);
        konto_svar(['medlem' => konto_ut($m)], 201);
    }

    if ($r === 'logginn') {
        $k = konto_kropp();
        $epost = mb_strtolower(trim((string) ($k['epost'] ?? '')));
        $passord = (string) ($k['passord'] ?? '');
        $nokler = ['konto-inn:' . cms_ip(), 'konto-inn:' . hash('sha256', $epost)];
        foreach ($nokler as $n) cms_begrens($n, CMS_INNLOGGING_FORSOK, CMS_INNLOGGING_VINDU);
        $m = cms_en('SELECT * FROM dp_medlemmer WHERE epost = ? AND aktiv = 1', [$epost]);
        if (!$m || !password_verify($passord, $m['passord_hash'])) {
            foreach ($nokler as $n) cms_registrer_forsok($n);
            throw new CmsFeil('Feil e-postadresse eller passord.', 401);
        }
        if (password_needs_rehash($m['passord_hash'], PASSWORD_DEFAULT)) {
            cms_kjor('UPDATE dp_medlemmer SET passord_hash = ? WHERE id = ?', [password_hash($passord, PASSWORD_DEFAULT), $m['id']]);
        }
        konto_logg_inn($m);
        konto_svar(['medlem' => konto_ut($m)]);
    }

    if ($r === 'loggut') {
        konto_kropp();
        konto_logg_ut();
        konto_svar(['ok' => true]);
    }

    if ($r === 'profil') {
        $k = konto_kropp();
        $m = konto_krev_medlem();
        $navn = konto_tekst($k['navn'] ?? null, 'navn', 80);
        cms_kjor('UPDATE dp_medlemmer SET navn = ? WHERE id = ?', [$navn, $m['id']]);
        cms_kjor('UPDATE dp_skilt SET skaper = ? WHERE medlem_id = ?', [$navn, $m['id']]);
        konto_svar(['medlem' => konto_ut(cms_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$m['id']]))]);
    }

    if ($r === 'slett-konto') {
        $k = konto_kropp();
        $m = konto_krev_medlem();
        if (!password_verify((string) ($k['passord'] ?? ''), $m['passord_hash'])) throw new CmsFeil('Feil passord.', 403);
        $db = konto_db();
        $db->beginTransaction();
        cms_kjor('DELETE FROM dp_skilt WHERE medlem_id = ?', [$m['id']]);
        cms_kjor('DELETE FROM dp_konto_okter WHERE medlem_id = ?', [$m['id']]);
        cms_kjor('DELETE FROM dp_medlemmer WHERE id = ?', [$m['id']]);
        $db->commit();
        konto_kake('', time() - 3600);
        konto_svar(['ok' => true]);
    }

    if ($r === 'mine-skilt') {
        konto_get();
        $m = konto_krev_medlem();
        $rader = cms_alle('SELECT ' . KONTO_SKILTFELT . ' FROM dp_skilt WHERE medlem_id = ? ORDER BY endret DESC LIMIT 200', [$m['id']]);
        konto_svar(['skilt' => array_map(fn($x) => konto_skilt_ut($x), $rader)]);
    }

    if ($r === 'del') {
        $k = konto_kropp();
        $medlem = konto_medlem();
        $mal = konto_gyldig_mal($k['mal'] ?? null);
        $bilde = konto_gyldig_bilde($k['bilde'] ?? null);
        $tittel = konto_tekst($k['mal']['navn'] ?? 'Skilt', 'tittel', 80, false) ?: 'Skilt';
        $skaper = $medlem['navn'] ?? 'Gjest';
        if (isset($k['id'])) {
            $rad = konto_eget_skilt($k, $medlem);
            // a guest who later signs in takes the sign over; a member's sign stays theirs
            $eier = $rad['medlem_id'] ?? $medlem['id'] ?? null;
            $navn = $eier === null ? $rad['skaper']
                : (string) cms_en('SELECT navn FROM dp_medlemmer WHERE id = ?', [$eier])['navn'];
            cms_kjor(
                'UPDATE dp_skilt SET tittel = ?, mal = ?, bilde = ?, endret = ?, medlem_id = ?, skaper = ? WHERE id = ?',
                [$tittel, $mal, $bilde, cms_na(), $eier, $navn, $rad['id']],
            );
            konto_svar(['id' => $rad['offentlig_id'], 'nokkel' => $k['nokkel'] ?? null, 'ny' => false]);
        }
        cms_begrens('konto-del:' . cms_ip(), KONTO_DELINGER_PER_TIME, 3600);
        cms_registrer_forsok('konto-del:' . cms_ip());
        $id = bin2hex(random_bytes(8));
        $nokkel = bin2hex(random_bytes(24));
        cms_kjor(
            'INSERT INTO dp_skilt (offentlig_id, nokkel_hash, medlem_id, skaper, tittel, mal, bilde, opprettet, endret)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, hash('sha256', $nokkel), $medlem['id'] ?? null, $skaper, $tittel, $mal, $bilde, cms_na(), cms_na()],
        );
        konto_svar(['id' => $id, 'nokkel' => $nokkel, 'ny' => true], 201);
    }

    if ($r === 'bruk') {
        $k = konto_kropp();
        $rad = cms_en('SELECT id, mal, skaper FROM dp_skilt WHERE offentlig_id = ? AND skjult = 0', [konto_offentlig_id($k['id'] ?? null)]);
        if (!$rad) throw new CmsFeil('Fant ikke skiltet.', 404);
        cms_kjor('UPDATE dp_skilt SET ganger_brukt = ganger_brukt + 1 WHERE id = ?', [$rad['id']]);
        konto_svar(['mal' => json_decode($rad['mal'], true), 'skaper' => $rad['skaper']]);
    }

    if ($r === 'slett-skilt') {
        $k = konto_kropp();
        $rad = konto_eget_skilt($k, konto_medlem());
        cms_kjor('DELETE FROM dp_skilt WHERE id = ?', [$rad['id']]);
        konto_svar(['ok' => true]);
    }

    // ---- for CMS administrators (their own sign-in, see api/cms/)
    if (str_starts_with($r, 'admin-')) {
        $aktor = cms_krev('admin');
        if ($r === 'admin-medlemmer') {
            konto_get();
            $rader = cms_alle(
                'SELECT m.*, (SELECT COUNT(*) FROM dp_skilt s WHERE s.medlem_id = m.id) AS antall_skilt
                 FROM dp_medlemmer m ORDER BY m.opprettet DESC LIMIT 1000',
            );
            konto_svar([
                'medlemmer' => array_map(fn($m) => konto_ut($m) + ['antallSkilt' => (int) $m['antall_skilt'], 'aktiv' => (bool) $m['aktiv']], $rader),
                'antall' => (int) cms_en('SELECT COUNT(*) AS n FROM dp_medlemmer')['n'],
                'gjesteskilt' => (int) cms_en('SELECT COUNT(*) AS n FROM dp_skilt WHERE medlem_id IS NULL')['n'],
            ]);
        }
        if ($r === 'admin-skilt') {
            konto_get();
            $rader = cms_alle('SELECT ' . KONTO_SKILTFELT . ' FROM dp_skilt ORDER BY endret DESC LIMIT 500');
            konto_svar(['skilt' => array_map(fn($x) => konto_skilt_ut($x, true), $rader)]);
        }
        if ($r === 'admin-skjul') {
            $k = konto_kropp();
            $id = konto_offentlig_id($k['id'] ?? null);
            $skjult = ($k['skjult'] ?? true) === true;
            if (cms_kjor('UPDATE dp_skilt SET skjult = ? WHERE offentlig_id = ?', [$skjult ? 1 : 0, $id]) !== 1) {
                throw new CmsFeil('Fant ikke skiltet.', 404);
            }
            cms_logg($aktor, $skjult ? 'skilt.skjul' : 'skilt.vis', $id, null, null);
            konto_svar(['ok' => true]);
        }
    }

    throw new CmsFeil('Ukjent handling.', 404);
} catch (CmsFeil $f) {
    konto_svar(['feil' => $f->getMessage()], $f->status);
} catch (Throwable $e) {
    error_log('Designporten konto: ' . $e->getMessage());
    konto_svar(['feil' => 'Noe gikk galt på serveren.'], 500);
}
