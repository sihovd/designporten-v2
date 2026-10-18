<?php
/**
 * Member accounts and the public sign gallery. One entry point, the action in ?r=…:
 *
 *   GET  status         is it switched on (and from which settings file); the services and what they cost
 *   POST registrer      new member: navn, epost, passord, vilkar (signs in)
 *   POST logginn / loggut
 *   GET  meg            the signed-in member, or null
 *   POST profil         change the name
 *   POST send-bekreftelse   a new link to confirm the member's address
 *   POST bekreft-epost  token: confirms the address the link was sent to
 *   POST glemt-passord  epost: a reset link if the account exists (the answer never says)
 *   POST nytt-passord   token, passord: sets it, ends every sign-in (sign in again)
 *   POST endre-passord  passord, nytt: ends every other sign-in, this browser gets a new one
 *   POST endre-epost    passord, epost: sends a link to the new address; the old one stays until then
 *   POST bytt-epost     token: switches to the new address
 *   POST slett-konto    delete the member, their signs, sign-ins, links and access exceptions (passord)
 *   GET  prosjekter     the member's projects on the account (?app), and the quota
 *   GET  prosjekt       one project with its document (?id)
 *   POST prosjekt-lagre app, navn, dokument; with id + revisjon it updates (409 when older)
 *   POST prosjekt-slett id
 *   GET  skilt          the gallery, newest first (?antall, ?for = cursor)
 *   GET  mine-skilt     the member's own signs
 *   POST del            publish a sign in the gallery (signed-in members only): mal, bilde; with id it updates that sign
 *   POST bruk           a sign's template, to start from (counts the use)
 *   POST slett-skilt    remove a shared sign (id + nokkel, or the member who shared it)
 *   GET  bilde          a sign's preview (PNG)
 *   GET  admin-medlemmer / admin-skilt, POST admin-skjul / admin-status / admin-tilgang,
 *   GET  admin-testpost (test builds only)   for CMS administrators (_admin.php)
 *
 * Links in e-mails open «Min konto» with the token after «#»; the page asks
 * for an explicit click and POSTs it. A GET never changes anything, since
 * mail scanners open links. One-time tokens are used up atomically
 * (_konto.php konto_bruk_token).
 *
 * POSTs need JSON and the header X-Konto: 1, which a form on another site
 * cannot send, and when the browser names an Origin it must be this site,
 * so a signed-in member's cookie cannot be used from outside.
 * The accounts run without the CMS (_db.php). See docs/konto.md.
 */

declare(strict_types=1);

require_once __DIR__ . '/_konto.php';
require_once __DIR__ . '/_prosjekter.php';
require_once __DIR__ . '/_admin.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function konto_svar(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function konto_kropp(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') throw new KontoFeil('Feil metode.', 405);
    if (($_SERVER['HTTP_X_KONTO'] ?? '') !== '1' || !str_starts_with((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        throw new KontoFeil('Forespørselen ble avvist.', 403);
    }
    // a browser that says the request comes from another site is refused, whatever else it sends
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new KontoFeil('Forespørselen ble avvist.', 403);
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) {
        throw new KontoFeil('Forespørselen ble avvist.', 403);
    }
    $raa = file_get_contents('php://input', false, null, 0, KONTO_MAKS_MAL + KONTO_MAKS_BILDE * 2) ?: '';
    $data = json_decode($raa, true, 256);
    if (!is_array($data)) throw new KontoFeil('Forventet JSON.', 400);
    return $data;
}

function konto_get(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') throw new KontoFeil('Feil metode.', 405);
}

function konto_passord(mixed $p): string
{
    if (!is_string($p) || mb_strlen($p) < KONTO_MIN_PASSORD) {
        throw new KontoFeil('Passordet må ha minst ' . KONTO_MIN_PASSORD . ' tegn.', 422);
    }
    if (strlen($p) > 200) throw new KontoFeil('Passordet er for langt.', 422);
    return $p;
}

function konto_offentlig_id(mixed $v): string
{
    if (!is_string($v) || !preg_match('/^[a-z0-9]{16}$/D', $v)) throw new KontoFeil('Fant ikke skiltet.', 404);
    return $v;
}

/** The sign row, if the caller may change it: by the key from the browser that shared it, or as its member. */
function konto_eget_skilt(array $k, ?array $medlem): array
{
    $r = konto_en('SELECT * FROM dp_skilt WHERE offentlig_id = ?', [konto_offentlig_id($k['id'] ?? null)]);
    if (!$r) throw new KontoFeil('Fant ikke skiltet.', 404);
    $nokkel = $k['nokkel'] ?? null;
    $medNokkel = is_string($nokkel) && $nokkel !== '' && hash_equals($r['nokkel_hash'], hash('sha256', $nokkel));
    $somMedlem = $medlem !== null && $r['medlem_id'] !== null && (int) $r['medlem_id'] === (int) $medlem['id'];
    if (!$medNokkel && !$somMedlem) throw new KontoFeil('Du kan bare endre skilt du har delt selv.', 403);
    return $r;
}

$r = (string) ($_GET['r'] ?? '');

try {
    if ($r === 'status') {
        konto_get();
        $aktiv = konto_konfig() !== null;
        if ($aktiv) konto_db();
        konto_svar(['aktiv' => $aktiv, 'oppsett' => konto_kilde()] + konto_tjenester());
    }

    if (konto_konfig() === null) throw new KontoFeil('Brukerkontoer er ikke slått på på denne serveren ennå.', 503);
    konto_db();

    if ($r === 'bilde') {
        konto_get();
        $rad = konto_en('SELECT bilde FROM dp_skilt WHERE offentlig_id = ? AND skjult = 0', [konto_offentlig_id($_GET['id'] ?? null)]);
        $png = $rad && $rad['bilde'] ? base64_decode($rad['bilde'], true) : false;
        if ($png === false) throw new KontoFeil('Fant ikke bildet.', 404);
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
        $rader = konto_alle(
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
        if (($k['vilkar'] ?? false) !== true) throw new KontoFeil('Du må godta vilkårene for å lage en konto.', 422);
        konto_begrens('konto-reg:' . konto_ip(), 5, 3600);
        konto_registrer_forsok('konto-reg:' . konto_ip());
        if (konto_en('SELECT id FROM dp_medlemmer WHERE epost = ?', [$epost])) {
            throw new KontoFeil('Det finnes allerede en konto med denne e-postadressen. Logg inn i stedet.', 409);
        }
        konto_kjor(
            'INSERT INTO dp_medlemmer (epost, navn, passord_hash, vilkar_godtatt, opprettet) VALUES (?, ?, ?, ?, ?)',
            [$epost, $navn, password_hash($passord, PASSWORD_DEFAULT), konto_na(), konto_na()],
        );
        $m = konto_en('SELECT * FROM dp_medlemmer WHERE epost = ?', [$epost]);
        konto_logg_inn($m);
        // the account exists either way; the page says whether the link went out
        $epostFeil = null;
        try {
            konto_send_bekreftelse($m);
        } catch (KontoFeil $f) {
            $epostFeil = $f->getMessage();
        }
        konto_svar(['medlem' => konto_ut($m), 'bekreftelse' => ['sendt' => $epostFeil === null, 'feil' => $epostFeil]], 201);
    }

    if ($r === 'logginn') {
        $k = konto_kropp();
        $epost = mb_strtolower(trim((string) ($k['epost'] ?? '')));
        $passord = (string) ($k['passord'] ?? '');
        $nokler = ['konto-inn:' . konto_ip(), 'konto-inn:' . hash('sha256', $epost)];
        foreach ($nokler as $n) konto_begrens($n, KONTO_INNLOGGING_FORSOK, KONTO_INNLOGGING_VINDU);
        $m = konto_en('SELECT * FROM dp_medlemmer WHERE epost = ?', [$epost]);
        if (!$m || !password_verify($passord, $m['passord_hash'])) {
            foreach ($nokler as $n) konto_registrer_forsok($n);
            throw new KontoFeil('Feil e-postadresse eller passord.', 401);
        }
        // said only to someone who knows the password
        if ($m['status'] !== 'aktiv') throw new KontoFeil('Kontoen er stengt. Ta kontakt med oss hvis du mener det er feil.', 403);
        if (password_needs_rehash($m['passord_hash'], PASSWORD_DEFAULT)) {
            konto_kjor('UPDATE dp_medlemmer SET passord_hash = ? WHERE id = ?', [password_hash($passord, PASSWORD_DEFAULT), $m['id']]);
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
        konto_kjor('UPDATE dp_medlemmer SET navn = ? WHERE id = ?', [$navn, $m['id']]);
        konto_kjor('UPDATE dp_skilt SET skaper = ? WHERE medlem_id = ?', [$navn, $m['id']]);
        konto_svar(['medlem' => konto_ut(konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$m['id']]))]);
    }

    if ($r === 'slett-konto') {
        $k = konto_kropp();
        $m = konto_krev_medlem();
        if (!password_verify((string) ($k['passord'] ?? ''), $m['passord_hash'])) throw new KontoFeil('Feil passord.', 403);
        konto_slett_medlem((int) $m['id']);
        konto_kake('', time() - 3600);
        konto_svar(['ok' => true]);
    }

    if ($r === 'send-bekreftelse') {
        konto_kropp();
        $m = konto_krev_medlem();
        if ($m['epost_bekreftet']) konto_svar(['ok' => true, 'alleredeBekreftet' => true]);
        konto_epost_klar();
        foreach (['konto-bekreft:' . $m['id'] => 3, 'konto-bekreft:' . konto_ip() => 10] as $n => $maks) konto_begrens($n, $maks, 3600);
        foreach (['konto-bekreft:' . $m['id'], 'konto-bekreft:' . konto_ip()] as $n) konto_registrer_forsok($n);
        konto_send_bekreftelse($m);
        konto_svar(['ok' => true]);
    }

    if ($r === 'bekreft-epost') {
        $k = konto_kropp();
        konto_begrens('konto-lenke:' . konto_ip(), 20, 900);
        try {
            $m = konto_transaksjon(function () use ($k) {
                [, $m] = konto_bruk_token($k['token'] ?? null, 'bekreft');
                konto_kjor('UPDATE dp_medlemmer SET epost_bekreftet = ? WHERE id = ?', [konto_na(), $m['id']]);
                return $m;
            });
        } catch (KontoFeil $f) {
            konto_registrer_forsok('konto-lenke:' . konto_ip());
            throw $f;
        }
        konto_svar(['ok' => true, 'epost' => $m['epost']]);
    }

    if ($r === 'glemt-passord') {
        $k = konto_kropp();
        $epost = konto_epost($k['epost'] ?? null);
        // before looking anything up: without e-mail no one gets a link, whether the account exists or not
        konto_epost_klar();
        konto_begrens('konto-glemt:' . konto_ip(), 5, 900);
        konto_registrer_forsok('konto-glemt:' . konto_ip());
        $adresse = 'konto-glemt:' . hash('sha256', $epost);
        $m = konto_en("SELECT * FROM dp_medlemmer WHERE epost = ? AND status = 'aktiv'", [$epost]);
        // at most 3 links an hour to one address; above that, and for an unknown address, the answer is the same
        $antall = (int) konto_en('SELECT COUNT(*) AS n FROM dp_konto_forsok WHERE nokkel = ? AND tid >= ?', [$adresse, time() - 3600])['n'];
        if ($m && $antall < 3) {
            konto_registrer_forsok($adresse);
            try {
                $lenke = konto_lenke('nytt-passord', konto_lag_token($m, 'reset'));
                konto_send_epost(
                    $m['epost'],
                    'Nytt passord hos Designporten',
                    "Hei {$m['navn']},\n\nNoen (forhåpentlig du) ba om å sette nytt passord for kontoen din. Åpne lenken og velg et nytt passord:\n\n$lenke\n\n"
                    . "Lenken virker i én time og kan brukes én gang. Ba du ikke om dette, kan du se bort fra e-posten; passordet ditt er ikke endret.\n\nHilsen Designporten\n",
                );
            } catch (KontoFeil $f) {
                // the answer must not differ for a known address; the failure is logged without the address
                error_log('Designporten konto: lenke for nytt passord ble ikke sendt.');
            }
        }
        konto_svar(['ok' => true, 'melding' => 'Hvis det finnes en konto med denne adressen, har vi sendt en lenke for å velge nytt passord. Sjekk innboksen (og søppelposten).']);
    }

    if ($r === 'nytt-passord') {
        $k = konto_kropp();
        $passord = konto_passord($k['passord'] ?? null);
        konto_begrens('konto-lenke:' . konto_ip(), 20, 900);
        try {
            konto_transaksjon(function () use ($k, $passord) {
                [$t, $m] = konto_bruk_token($k['token'] ?? null, 'reset');
                // the link reached the inbox, so the address is confirmed too
                konto_kjor(
                    'UPDATE dp_medlemmer SET passord_hash = ?, epost_bekreftet = COALESCE(epost_bekreftet, ?) WHERE id = ?',
                    [password_hash($passord, PASSWORD_DEFAULT), konto_na(), $m['id']],
                );
                // every sign-in and every other link, an address change included
                konto_sikre_konto((int) $m['id']);
            });
        } catch (KontoFeil $f) {
            konto_registrer_forsok('konto-lenke:' . konto_ip());
            throw $f;
        }
        konto_kake('', time() - 3600);
        konto_svar(['ok' => true]);
    }

    if ($r === 'endre-passord' || $r === 'endre-epost') {
        $k = konto_kropp();
        $m = konto_krev_medlem();
        $nokkel = 'konto-passord:' . $m['id'];
        konto_begrens($nokkel, 5, 900);
        if (!password_verify((string) ($k['passord'] ?? ''), $m['passord_hash'])) {
            konto_registrer_forsok($nokkel);
            throw new KontoFeil('Feil passord.', 403);
        }
        if ($r === 'endre-passord') {
            $nytt = konto_passord($k['nytt'] ?? null);
            konto_transaksjon(function () use ($m, $nytt) {
                konto_las_medlem((int) $m['id']);
                konto_kjor('UPDATE dp_medlemmer SET passord_hash = ? WHERE id = ?', [password_hash($nytt, PASSWORD_DEFAULT), $m['id']]);
                konto_sikre_konto((int) $m['id']);
            });
            // every sign-in ended, this one included; this browser gets a fresh one
            konto_logg_inn($m);
            konto_svar(['medlem' => konto_ut(konto_en('SELECT * FROM dp_medlemmer WHERE id = ?', [$m['id']]))]);
        }
        $ny = konto_epost($k['epost'] ?? null);
        if ($ny === $m['epost']) throw new KontoFeil('Det er allerede e-postadressen din.', 422);
        if (konto_en('SELECT id FROM dp_medlemmer WHERE epost = ?', [$ny])) throw new KontoFeil('Adressen er allerede i bruk på en annen konto.', 409);
        konto_epost_klar();
        konto_begrens('konto-nyepost:' . $m['id'], 3, 3600);
        konto_registrer_forsok('konto-nyepost:' . $m['id']);
        $token = konto_transaksjon(function () use ($m, $ny) {
            // a new password since the check above ends this request: nothing started with the
            // old password may outlive it
            $na = konto_las_medlem((int) $m['id']);
            if (!$na || $na['status'] !== 'aktiv' || $na['passord_hash'] !== $m['passord_hash'] || $na['epost'] !== $m['epost']) {
                throw new KontoFeil('Kontoen er endret i mellomtiden. Logg inn og prøv igjen.', 409);
            }
            return konto_lag_token($m, 'epost', $ny);
        });
        $lenke = konto_lenke('ny-epost', $token);
        konto_send_epost(
            $ny,
            'Bekreft den nye e-postadressen din hos Designporten',
            "Hei {$m['navn']},\n\nÅpne lenken og trykk «Bytt adresse» for å bruke denne adressen på Designporten-kontoen din:\n\n$lenke\n\n"
            . "Lenken virker i et døgn. Til da gjelder den gamle adressen. Ba du ikke om dette, kan du se bort fra e-posten.\n\nHilsen Designporten\n",
        );
        try {
            konto_send_epost(
                $m['epost'],
                'Noen vil bytte e-postadressen på Designporten-kontoen din',
                "Hei {$m['navn']},\n\nDet er bedt om å bytte e-postadressen på kontoen din. Adressen endres først når den nye er bekreftet.\n"
                . "Var det ikke deg, bør du bytte passord under Min konto.\n\nHilsen Designporten\n",
            );
        } catch (KontoFeil) {
            // the notice to the old address is a courtesy; the link went out
        }
        konto_svar(['ok' => true]);
    }

    if ($r === 'bytt-epost') {
        $k = konto_kropp();
        konto_begrens('konto-lenke:' . konto_ip(), 20, 900);
        try {
            $ny = konto_transaksjon(function () use ($k) {
                [$t, $m] = konto_bruk_token($k['token'] ?? null, 'epost');
                $ny = (string) $t['ny_epost'];
                // still free now, and the address unchanged since the link was made; the UNIQUE
                // column stops a sign-up that slips in between (accounts are never merged)
                if (konto_en('SELECT id FROM dp_medlemmer WHERE epost = ? AND id <> ?', [$ny, $m['id']])) {
                    throw new KontoFeil('Adressen er tatt i bruk på en annen konto i mellomtiden.', 409);
                }
                try {
                    $n = konto_kjor('UPDATE dp_medlemmer SET epost = ?, epost_bekreftet = ? WHERE id = ? AND epost = ?', [$ny, konto_na(), $m['id'], $t['epost']]);
                } catch (PDOException) {
                    throw new KontoFeil('Adressen er tatt i bruk på en annen konto i mellomtiden.', 409);
                }
                if ($n !== 1) throw new KontoFeil(KONTO_UGYLDIG_LENKE, 400);
                konto_kjor('DELETE FROM dp_konto_tokens WHERE medlem_id = ? AND brukt IS NULL', [$m['id']]);
                return $ny;
            });
        } catch (KontoFeil $f) {
            konto_registrer_forsok('konto-lenke:' . konto_ip());
            throw $f;
        }
        konto_svar(['ok' => true, 'epost' => $ny]);
    }

    if ($r === 'prosjekter') {
        konto_get();
        $m = konto_krev_medlem();
        $app = isset($_GET['app']) ? konto_prosjektapp($_GET['app']) : null;
        $rader = konto_alle(
            'SELECT ' . KONTO_PROSJEKTFELT . ' FROM dp_prosjekter WHERE medlem_id = ?' . ($app ? ' AND app = ?' : '') . ' ORDER BY endret DESC',
            $app ? [$m['id'], $app] : [$m['id']],
        );
        konto_svar(['prosjekter' => array_map('konto_prosjekt_ut', $rader), 'kvote' => konto_prosjektkvote($m)]);
    }

    if ($r === 'prosjekt') {
        konto_get();
        $m = konto_krev_medlem();
        $rad = konto_eget_prosjekt($m, $_GET['id'] ?? null);
        konto_svar(['prosjekt' => konto_prosjekt_ut($rad) + ['dokument' => json_decode($rad['dokument'], true)]]);
    }

    if ($r === 'prosjekt-lagre') {
        $k = konto_kropp();
        $m = konto_krev_medlem();
        konto_begrens('konto-prosjekt:' . $m['id'], 120, 3600);
        konto_registrer_forsok('konto-prosjekt:' . $m['id']);
        $ny = !isset($k['id']);
        $p = konto_lagre_prosjekt($m, $k);
        konto_svar(['prosjekt' => $p, 'kvote' => konto_prosjektkvote($m)], $ny ? 201 : 200);
    }

    if ($r === 'prosjekt-slett') {
        $k = konto_kropp();
        $m = konto_krev_medlem();
        $rad = konto_eget_prosjekt($m, $k['id'] ?? null, 'offentlig_id');
        konto_kjor('DELETE FROM dp_prosjekter WHERE offentlig_id = ? AND medlem_id = ?', [$rad['offentlig_id'], $m['id']]);
        konto_svar(['ok' => true, 'kvote' => konto_prosjektkvote($m)]);
    }

    if ($r === 'mine-skilt') {
        konto_get();
        $m = konto_krev_medlem();
        $rader = konto_alle('SELECT ' . KONTO_SKILTFELT . ' FROM dp_skilt WHERE medlem_id = ? ORDER BY endret DESC LIMIT 200', [$m['id']]);
        konto_svar(['skilt' => array_map(fn($x) => konto_skilt_ut($x), $rader)]);
    }

    if ($r === 'del') {
        $k = konto_kropp();
        // publishing is a member's own choice (Sivert, 2026-10-17): guests no longer publish, so
        // every new sign in the gallery has an owner who can take it down again
        $medlem = konto_krev_medlem();
        konto_krev_funksjon($medlem, 'sign-forge', 'publisering');
        $mal = konto_gyldig_mal($k['mal'] ?? null);
        $bilde = konto_gyldig_bilde($k['bilde'] ?? null);
        $tittel = konto_tekst($k['mal']['navn'] ?? 'Skilt', 'tittel', 80, false) ?: 'Skilt';
        $skaper = $medlem['navn'];
        if (isset($k['id'])) {
            $rad = konto_eget_skilt($k, $medlem);
            // a sign shared earlier as a guest is taken over by the member who updates it with its key
            $eier = $rad['medlem_id'] ?? $medlem['id'];
            $navn = (string) konto_en('SELECT navn FROM dp_medlemmer WHERE id = ?', [$eier])['navn'];
            konto_kjor(
                'UPDATE dp_skilt SET tittel = ?, mal = ?, bilde = ?, endret = ?, medlem_id = ?, skaper = ? WHERE id = ?',
                [$tittel, $mal, $bilde, konto_na(), $eier, $navn, $rad['id']],
            );
            konto_svar(['id' => $rad['offentlig_id'], 'nokkel' => $k['nokkel'] ?? null, 'ny' => false]);
        }
        konto_begrens('konto-del:' . konto_ip(), KONTO_DELINGER_PER_TIME, 3600);
        konto_registrer_forsok('konto-del:' . konto_ip());
        $id = bin2hex(random_bytes(8));
        $nokkel = bin2hex(random_bytes(24));
        konto_kjor(
            'INSERT INTO dp_skilt (offentlig_id, nokkel_hash, medlem_id, skaper, tittel, mal, bilde, opprettet, endret)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, hash('sha256', $nokkel), $medlem['id'] ?? null, $skaper, $tittel, $mal, $bilde, konto_na(), konto_na()],
        );
        konto_svar(['id' => $id, 'nokkel' => $nokkel, 'ny' => true], 201);
    }

    if ($r === 'bruk') {
        $k = konto_kropp();
        $rad = konto_en('SELECT id, mal, skaper FROM dp_skilt WHERE offentlig_id = ? AND skjult = 0', [konto_offentlig_id($k['id'] ?? null)]);
        if (!$rad) throw new KontoFeil('Fant ikke skiltet.', 404);
        konto_kjor('UPDATE dp_skilt SET ganger_brukt = ganger_brukt + 1 WHERE id = ?', [$rad['id']]);
        konto_svar(['mal' => json_decode($rad['mal'], true), 'skaper' => $rad['skaper']]);
    }

    if ($r === 'slett-skilt') {
        $k = konto_kropp();
        $rad = konto_eget_skilt($k, konto_medlem());
        konto_kjor('DELETE FROM dp_skilt WHERE id = ?', [$rad['id']]);
        konto_svar(['ok' => true]);
    }

    // ---- for CMS administrators (their own sign-in, see api/cms/)
    if (str_starts_with($r, 'admin-')) {
        $aktor = konto_krev_admin();
        if ($r === 'admin-medlemmer') {
            konto_get();
            $rader = konto_alle(
                'SELECT m.*, (SELECT COUNT(*) FROM dp_skilt s WHERE s.medlem_id = m.id) AS antall_skilt,
                        (SELECT COUNT(*) FROM dp_prosjekter p WHERE p.medlem_id = m.id) AS antall_prosjekter
                 FROM dp_medlemmer m ORDER BY m.opprettet DESC LIMIT 1000',
            );
            konto_svar([
                'medlemmer' => array_map(fn($m) => konto_ut($m) + [
                    'antallSkilt' => (int) $m['antall_skilt'], 'antallProsjekter' => (int) $m['antall_prosjekter'],
                    'aktiv' => $m['status'] === 'aktiv',
                    'unntak' => array_column(konto_alle('SELECT nokkel, verdi FROM dp_konto_tilganger WHERE medlem_id = ?', [$m['id']]), 'verdi', 'nokkel'),
                ], $rader),
                'tilgangsnokler' => konto_tilgangsnokler(),
                'antall' => (int) konto_en('SELECT COUNT(*) AS n FROM dp_medlemmer')['n'],
                'gjesteskilt' => (int) konto_en('SELECT COUNT(*) AS n FROM dp_skilt WHERE medlem_id IS NULL')['n'],
            ]);
        }
        if ($r === 'admin-skilt') {
            konto_get();
            $rader = konto_alle('SELECT ' . KONTO_SKILTFELT . ' FROM dp_skilt ORDER BY endret DESC LIMIT 500');
            konto_svar(['skilt' => array_map(fn($x) => konto_skilt_ut($x, true), $rader)]);
        }
        if ($r === 'admin-skjul') {
            $k = konto_kropp();
            $id = konto_offentlig_id($k['id'] ?? null);
            $skjult = ($k['skjult'] ?? true) === true;
            if (konto_kjor('UPDATE dp_skilt SET skjult = ? WHERE offentlig_id = ?', [$skjult ? 1 : 0, $id]) !== 1) {
                throw new KontoFeil('Fant ikke skiltet.', 404);
            }
            konto_admin_logg($aktor, $skjult ? 'skilt.skjul' : 'skilt.vis', $id);
            konto_svar(['ok' => true]);
        }
        if ($r === 'admin-status') {
            $k = konto_kropp();
            $id = (int) ($k['id'] ?? 0);
            $status = (string) ($k['status'] ?? '');
            konto_sett_status($id, $status);
            konto_admin_logg($aktor, 'medlem.' . $status, (string) $id);
            konto_svar(['ok' => true]);
        }
        if ($r === 'admin-tilgang') {
            $k = konto_kropp();
            $id = (int) ($k['id'] ?? 0);
            $nokkel = (string) ($k['nokkel'] ?? '');
            $verdi = $k['verdi'] ?? null;
            if (!in_array($nokkel, konto_tilgangsnokler(), true)) throw new KontoFeil('Ukjent tjeneste eller funksjon.', 422);
            if ($verdi !== null && $verdi !== 'ja' && $verdi !== 'nei') throw new KontoFeil('Verdien må være ja, nei eller tom.', 422);
            if (!konto_en('SELECT id FROM dp_medlemmer WHERE id = ?', [$id])) throw new KontoFeil('Fant ikke medlemmet.', 404);
            konto_transaksjon(function () use ($id, $nokkel, $verdi, $aktor) {
                konto_kjor('DELETE FROM dp_konto_tilganger WHERE medlem_id = ? AND nokkel = ?', [$id, $nokkel]);
                if ($verdi !== null) {
                    konto_kjor(
                        'INSERT INTO dp_konto_tilganger (medlem_id, nokkel, verdi, endret, endret_av) VALUES (?, ?, ?, ?, ?)',
                        [$id, $nokkel, $verdi, konto_na(), mb_substr((string) ($aktor['navn'] ?? 'admin'), 0, 80)],
                    );
                }
            });
            konto_admin_logg($aktor, 'tilgang.' . ($verdi ?? 'standard'), "$id:$nokkel");
            konto_svar(['ok' => true]);
        }
        if ($r === 'admin-testpost') {
            konto_get();
            konto_svar(['eposter' => konto_fangede_eposter()]);
        }
    }

    throw new KontoFeil('Ukjent handling.', 404);
} catch (KontoFeil $f) {
    konto_svar(['feil' => $f->getMessage()] + $f->ekstra, $f->status);
} catch (Throwable $e) {
    error_log('Designporten konto: ' . $e->getMessage());
    konto_svar(['feil' => 'Noe gikk galt på serveren.'], 500);
}
