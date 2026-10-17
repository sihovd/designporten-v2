<?php
/**
 * Designporten CMS: the media library and image fields. See docs/cms/README.md#bilder.
 *
 * An upload is checked by decoding the picture itself (not by its name or
 * the browser's word for it), kept unchanged as a private original in
 * data/medier/, and re-encoded by GD into a few widths in the public folder
 * medier/ next to the site. Re-encoding drops EXIF/GPS and anything hidden
 * in the file, and the public names are random and never reused, so a
 * published page can never point at a file that changes or disappears.
 *
 * An image field ("sider/forside#helt.bilde") stores a small JSON value:
 *   {"medium": 12, "alt": "…", "dekorativ": false, "fokus": "70% 45%", "fokusMobil": "50% 50%"}
 * {"medium": null} means «the picture the page was built with».
 */

declare(strict_types=1);

const CMS_BILDETYPER = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
const CMS_BILDEMIME = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_WEBP => 'image/webp'];
const CMS_BILDEBREDDER = [480, 800, 1200, 1600, 2000, 2560];
const CMS_MAKS_BILDEFIL = 20 * 1024 * 1024;
const CMS_MAKS_PIKSLER = 40_000_000;
const CMS_MAKS_ALT = 300;

/** Public folder for published image versions, next to the site (not inside api/). */
function cms_mediemappe(): string
{
    $mappe = dirname(__DIR__, 2) . '/medier';
    if (!is_dir($mappe)) mkdir($mappe, 0755, true);
    $vern = $mappe . '/.htaccess';
    if (!is_file($vern)) {
        // Same rules as php/medier/.htaccess, in case the folder was made before that file was uploaded.
        @file_put_contents($vern, cms_mediemappe_vern());
    }
    return $mappe;
}

function cms_mediemappe_vern(): string
{
    return "# Only pictures the CMS made are served from here; nothing in it can run.\n"
        . "Options -Indexes\n"
        . "Require all denied\n"
        . "<FilesMatch \"^[a-z0-9-]+\\.(webp|jpg|png)$\">\n  Require all granted\n</FilesMatch>\n"
        . "<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n"
        . "<IfModule mod_headers.c>\n  Header set Cache-Control \"public, max-age=31536000, immutable\"\n"
        . "  Header set X-Content-Type-Options \"nosniff\"\n</IfModule>\n";
}

/** Private folder for originals (data/ is closed to the web). */
function cms_originalmappe(): string
{
    $mappe = cms_datamappe() . '/medier';
    if (!is_dir($mappe)) mkdir($mappe, 0750, true);
    return $mappe;
}

function cms_medieurl(string $fil): string
{
    return cms_base() . 'medier/' . $fil;
}

/** Bytes from php.ini shorthand like «128M». -1 means no limit. */
function cms_ini_bytes(string $navn): int
{
    $v = trim((string) ini_get($navn));
    if ($v === '' || $v === '-1') return -1;
    $tall = (float) $v;
    return (int) match (strtolower(substr($v, -1))) {
        'g' => $tall * 1024 ** 3, 'm' => $tall * 1024 ** 2, 'k' => $tall * 1024, default => $tall,
    };
}

function cms_maks_opplasting(): int
{
    $grenser = array_filter(
        [CMS_MAKS_BILDEFIL, cms_ini_bytes('upload_max_filesize'), cms_ini_bytes('post_max_size')],
        fn($g) => $g > 0,
    );
    return min($grenser);
}

function cms_mb(int $bytes): string
{
    return str_replace('.', ',', (string) round($bytes / 1024 / 1024, 1)) . ' MB';
}

/** Can this server make the published versions at all? */
function cms_kan_lage_bilder(): bool
{
    return function_exists('imagecreatetruecolor') && function_exists('imagecreatefromjpeg')
        && function_exists('imagecreatefrompng');
}

function cms_utformat(): string
{
    return function_exists('imagewebp') && (gd_info()['WebP Support'] ?? false) ? 'webp' : 'jpg';
}

// ---------------------------------------------------------------- Rows

function cms_medium_rad(int $id): ?array
{
    return cms_en('SELECT * FROM cms_medier WHERE id = ?', [$id]);
}

/** A picture as the browser and the snapshot need it. */
function cms_medium_ut(array $m, ?array $bruk = null): array
{
    $varianter = json_decode((string) $m['varianter'], true) ?: [];
    usort($varianter, fn($a, $b) => $a['b'] <=> $b['b']);
    $storst = end($varianter) ?: ['fil' => '', 'b' => (int) $m['bredde'], 'h' => (int) $m['hoyde']];
    $liten = $varianter[0] ?? $storst;
    $ut = [
        'id' => (int) $m['id'],
        'navn' => $m['navn'],
        'alt' => $m['alt'],
        'konsept' => (bool) $m['konsept'],
        'rettigheter' => $m['rettigheter'],
        'status' => $m['status'],
        'mime' => $m['mime'],
        'bredde' => (int) $storst['b'],
        'hoyde' => (int) $storst['h'],
        'originalBredde' => (int) $m['bredde'],
        'originalHoyde' => (int) $m['hoyde'],
        'storrelse' => (int) $m['storrelse'],
        'src' => cms_medieurl($storst['fil']),
        'miniatyr' => cms_medieurl($liten['fil']),
        'srcset' => implode(', ', array_map(fn($v) => cms_medieurl($v['fil']) . ' ' . $v['b'] . 'w', $varianter)),
        'opprettet' => $m['opprettet'],
    ];
    if ($bruk !== null) $ut['bruktPa'] = $bruk;
    return $ut;
}

/** Image fields that use each picture now (draft or published): id → keys. */
function cms_mediebruk(): array
{
    $bruk = [];
    foreach (cms_alle('SELECT nokkel, utkast, publisert FROM cms_innhold') as $rad) {
        if ((cms_nokler()[$rad['nokkel']]['type'] ?? '') !== 'bilde') continue;
        foreach (['publisert', 'utkast'] as $kol) {
            $id = cms_bilde_medium($rad[$kol]);
            if ($id === null) continue;
            $bruk[$id][$rad['nokkel']] ??= [];
            $bruk[$id][$rad['nokkel']][] = $kol;
        }
    }
    foreach (cms_alle('SELECT id, utkast, publisert FROM cms_innlegg') as $rad) {
        foreach (['publisert', 'utkast'] as $kol) {
            $d = json_decode($rad[$kol] ?? 'null', true);
            if (!is_array($d)) continue;
            $ids = array_filter([$d['bilde'] ?? null, ...array_map(fn($b) => $b['type'] === 'bilde' ? ($b['medium'] ?? null) : null, $d['blokker'] ?? [])]);
            foreach (array_unique($ids) as $id) {
                $nokkel = 'blogg/' . $rad['id'];
                $bruk[$id][$nokkel] ??= [];
                $bruk[$id][$nokkel][] = $kol;
            }
        }
    }
    return array_map(fn($felt) => array_map(
        fn($n, $hvor) => ['nokkel' => $n, 'publisert' => in_array('publisert', $hvor, true), 'utkast' => in_array('utkast', $hvor, true)],
        array_keys($felt), $felt,
    ), $bruk);
}

// ---------------------------------------------------------------- Image field values

function cms_bilde_medium(?string $verdi): ?int
{
    if ($verdi === null) return null;
    $d = json_decode($verdi, true);
    return is_array($d) && is_int($d['medium'] ?? null) ? $d['medium'] : null;
}

function cms_gyldig_fokus(mixed $f): ?string
{
    if ($f === null || $f === '') return null;
    if (!is_string($f) || !preg_match('/^(\d{1,3})% (\d{1,3})%$/', $f, $m) || (int) $m[1] > 100 || (int) $m[2] > 100) {
        throw new CmsFeil('Fokuspunktet må være to prosenttall, som «50% 40%».', 422);
    }
    return "{$m[1]}% {$m[2]}%";
}

/** Validate an image field value and return its stored (canonical) JSON. */
function cms_gyldig_bildeverdi(mixed $verdi): string
{
    if (is_string($verdi)) $verdi = json_decode($verdi, true);
    if (!is_array($verdi) || !array_key_exists('medium', $verdi)) throw new CmsFeil('Bildefeltet mangler bilde.', 422);
    if ($verdi['medium'] === null) return json_encode(['medium' => null]);
    if (!is_int($verdi['medium'])) throw new CmsFeil('Ukjent bilde.', 422);
    $m = cms_medium_rad($verdi['medium']);
    if (!$m) throw new CmsFeil('Bildet finnes ikke i bildebiblioteket.', 422);
    if ($m['status'] !== 'aktiv') throw new CmsFeil('Bildet er arkivert. Hent det fram igjen i bildebiblioteket først.', 422);
    $dekorativ = ($verdi['dekorativ'] ?? false) === true;
    $alt = trim((string) preg_replace('/\s+/u', ' ', (string) ($verdi['alt'] ?? '')));
    if (!mb_check_encoding($alt, 'UTF-8')) throw new CmsFeil('Alt-teksten har ugyldige tegn.', 422);
    if (!$dekorativ && $alt === '') throw new CmsFeil('Skriv hva bildet viser (alt-tekst), eller merk det som pynt.', 422);
    if (mb_strlen($alt) > CMS_MAKS_ALT) throw new CmsFeil('Alt-teksten er for lang.', 422);
    return json_encode([
        'medium' => (int) $m['id'],
        'alt' => $dekorativ ? '' : $alt,
        'dekorativ' => $dekorativ,
        'fokus' => cms_gyldig_fokus($verdi['fokus'] ?? null) ?? '50% 50%',
        'fokusMobil' => cms_gyldig_fokus($verdi['fokusMobil'] ?? null),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** What a page needs to show an image field value, or null for «as built». */
function cms_bilde_info(?string $verdi): ?array
{
    $id = cms_bilde_medium($verdi);
    if ($id === null) return null;
    $m = cms_medium_rad($id);
    if (!$m) return null;
    $d = json_decode((string) $verdi, true);
    $u = cms_medium_ut($m);
    return [
        'medium' => $id, 'src' => $u['src'], 'srcset' => $u['srcset'], 'miniatyr' => $u['miniatyr'],
        'bredde' => $u['bredde'], 'hoyde' => $u['hoyde'], 'konsept' => $u['konsept'], 'navn' => $u['navn'],
        'alt' => (string) ($d['alt'] ?? ''), 'dekorativ' => (bool) ($d['dekorativ'] ?? false),
        'fokus' => $d['fokus'] ?? '50% 50%', 'fokusMobil' => $d['fokusMobil'] ?? null,
    ];
}

// ---------------------------------------------------------------- Upload

/**
 * Check, store and convert one uploaded file. Throws CmsFeil with a message
 * a person can act on; leaves no files behind on failure.
 */
function cms_last_opp(array $fil, array $aktor, string $alt = ''): array
{
    $feil = (int) ($fil['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($feil === UPLOAD_ERR_INI_SIZE || $feil === UPLOAD_ERR_FORM_SIZE) {
        throw new CmsFeil('Filen er større enn serveren tillater (' . cms_mb(cms_maks_opplasting()) . ').', 413);
    }
    if ($feil === UPLOAD_ERR_NO_FILE) throw new CmsFeil('Velg en bildefil.', 422);
    if ($feil !== UPLOAD_ERR_OK) throw new CmsFeil('Opplastingen ble avbrutt. Prøv igjen.', 422);
    $tmp = (string) $fil['tmp_name'];
    if (!is_uploaded_file($tmp) && !(PHP_SAPI === 'cli-server' && is_file($tmp))) throw new CmsFeil('Ugyldig opplasting.', 400);
    $storrelse = (int) filesize($tmp);
    if ($storrelse > CMS_MAKS_BILDEFIL) throw new CmsFeil('Bildet er for stort. Største filstørrelse er ' . cms_mb(CMS_MAKS_BILDEFIL) . '.', 413);
    if ($storrelse === 0) throw new CmsFeil('Filen er tom.', 422);
    if (!cms_kan_lage_bilder()) throw new CmsFeil('Serveren mangler bildebehandling (GD). Se «Drift» i CMS-et.', 503);

    $info = @getimagesize($tmp);
    $type = $info[2] ?? null;
    $mime = function_exists('finfo_open') ? (string) finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp) : '';
    if ($mime === 'image/svg+xml' || str_contains(strtolower((string) ($fil['name'] ?? '')), '.svg')) {
        throw new CmsFeil('SVG kan ikke lastes opp ennå. Bruk JPEG, PNG eller WebP.', 415);
    }
    if (!isset(CMS_BILDETYPER[$type]) || ($mime !== '' && $mime !== CMS_BILDEMIME[$type])) {
        throw new CmsFeil('Filen er ikke et bilde vi kan bruke. Bruk JPEG, PNG eller WebP.', 415);
    }
    [$bredde, $hoyde] = [(int) $info[0], (int) $info[1]];
    if ($bredde < 1 || $hoyde < 1) throw new CmsFeil('Bildet kunne ikke leses.', 422);
    if ($bredde * $hoyde > CMS_MAKS_PIKSLER) {
        throw new CmsFeil('Bildet har for mange piksler (' . round($bredde * $hoyde / 1e6) . ' megapiksler). Største er ' . (CMS_MAKS_PIKSLER / 1e6) . '.', 413);
    }
    if (!cms_nok_minne($bredde, $hoyde)) {
        throw new CmsFeil('Bildet er for stort til at serveren klarer å gjøre det om. Prøv et mindre bilde (under ' . cms_maks_piksler_for_minne() . ' megapiksler).', 413);
    }

    $sjekksum = hash_file('sha256', $tmp);
    $finnes = cms_en("SELECT * FROM cms_medier WHERE sjekksum = ? AND status = 'aktiv'", [$sjekksum]);
    if ($finnes) return ['medium' => cms_medium_ut($finnes), 'gjentatt' => true];

    $bilde = match ($type) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($tmp),
        IMAGETYPE_PNG => @imagecreatefrompng($tmp),
        IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmp) : false,
    };
    if (!$bilde) throw new CmsFeil('Bildet kunne ikke leses. Filen kan være skadet.', 422);
    if ($type === IMAGETYPE_JPEG) $bilde = cms_rett_opp($bilde, $tmp);
    [$bredde, $hoyde] = [imagesx($bilde), imagesy($bilde)];

    $navn = bin2hex(random_bytes(8));
    $aar = gmdate('Y');
    $format = cms_utformat();
    $alfa = $type !== IMAGETYPE_JPEG && cms_har_alfa($bilde);
    if ($format === 'jpg' && $alfa) $format = 'png';
    $laget = [];
    try {
        $mappe = cms_mediemappe() . '/' . $aar;
        if (!is_dir($mappe) && !mkdir($mappe, 0755, true)) throw new CmsFeil('Fikk ikke laget mappen for bilder.', 507);
        $bredder = array_values(array_filter(CMS_BILDEBREDDER, fn($b) => $b < $bredde));
        $bredder[] = min($bredde, max(CMS_BILDEBREDDER));
        $varianter = [];
        foreach (array_unique($bredder) as $b) {
            $h = max(1, (int) round($hoyde * $b / $bredde));
            $relativ = "$aar/$navn-$b.$format";
            $sti = cms_mediemappe() . '/' . $relativ;
            cms_skriv_variant($bilde, $b, $h, $format, $sti);
            $laget[] = $sti;
            $varianter[] = ['fil' => $relativ, 'b' => $b, 'h' => $h];
        }
        $original = cms_originalmappe() . "/$navn." . CMS_BILDETYPER[$type];
        if (!@copy($tmp, $original)) throw new CmsFeil('Fikk ikke lagret originalen. Serveren kan være full.', 507);
        $laget[] = $original;
        $filnavn = mb_substr(trim((string) preg_replace('/[\x00-\x1f\/\\\\]+/u', ' ', (string) ($fil['name'] ?? ''))), 0, 191);
        $alt = mb_substr(trim((string) preg_replace('/\s+/u', ' ', $alt)), 0, CMS_MAKS_ALT);
        cms_kjor(
            "INSERT INTO cms_medier (fil, original, mime, bredde, hoyde, storrelse, sjekksum, navn, alt, konsept, rettigheter, status, varianter, opprettet, opprettet_av)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'aktiv', ?, ?, ?)",
            [$navn, basename($original), CMS_BILDEMIME[$type], $bredde, $hoyde, $storrelse, $sjekksum,
                $filnavn !== '' ? $filnavn : 'Bilde', $alt, json_encode($varianter), cms_na(), $aktor['id']],
        );
    } catch (Throwable $e) {
        foreach ($laget as $sti) @unlink($sti);
        if ($e instanceof CmsFeil) throw $e;
        error_log('Designporten CMS bilde: ' . $e->getMessage());
        throw new CmsFeil('Bildet kunne ikke gjøres om. Ingenting ble lagret.', 500);
    } finally {
        imagedestroy($bilde);
    }
    $m = cms_medium_rad((int) cms_db()->lastInsertId());
    cms_logg($aktor, 'medium.ny', $m['navn'], null, ['id' => (int) $m['id'], 'bredde' => $bredde, 'hoyde' => $hoyde]);
    return ['medium' => cms_medium_ut($m), 'gjentatt' => false];
}

function cms_maks_piksler_for_minne(): int
{
    $grense = cms_ini_bytes('memory_limit');
    if ($grense < 0) return (int) (CMS_MAKS_PIKSLER / 1e6);
    return max(1, (int) floor(($grense - memory_get_usage() - 8 * 1024 * 1024) / 10 / 1e6));
}

/** GD needs about 5 bytes per pixel for the picture, and about as much again for the biggest version. */
function cms_nok_minne(int $bredde, int $hoyde): bool
{
    $grense = cms_ini_bytes('memory_limit');
    if ($grense < 0) return true;
    return $bredde * $hoyde * 10 + memory_get_usage() + 8 * 1024 * 1024 < $grense;
}

function cms_har_alfa(GdImage $bilde): bool
{
    $b = imagesx($bilde);
    $h = imagesy($bilde);
    $steg = max(1, (int) floor(sqrt($b * $h / 4000)));
    for ($y = 0; $y < $h; $y += $steg) {
        for ($x = 0; $x < $b; $x += $steg) {
            if (((imagecolorat($bilde, $x, $y) >> 24) & 0x7F) > 0) return true;
        }
    }
    return false;
}

/** Turn a JPEG the way the camera meant (EXIF orientation). Without the exif extension it stays as stored. */
function cms_rett_opp(GdImage $bilde, string $fil): GdImage
{
    if (!function_exists('exif_read_data')) return $bilde;
    $exif = @exif_read_data($fil);
    $o = (int) ($exif['Orientation'] ?? 1);
    if (in_array($o, [2, 4, 5, 7], true)) imageflip($bilde, $o === 4 ? IMG_FLIP_VERTICAL : IMG_FLIP_HORIZONTAL);
    $vinkel = match ($o) { 3, 4 => 180, 5, 6 => 270, 7, 8 => 90, default => 0 };
    if ($vinkel) {
        $snudd = imagerotate($bilde, $vinkel, 0);
        if ($snudd) {
            imagedestroy($bilde);
            $bilde = $snudd;
        }
    }
    return $bilde;
}

function cms_skriv_variant(GdImage $kilde, int $b, int $h, string $format, string $sti): void
{
    $ut = imagecreatetruecolor($b, $h);
    if (!$ut) throw new CmsFeil('Bildet kunne ikke gjøres om (minne).', 500);
    imagealphablending($ut, false);
    imagesavealpha($ut, true);
    imagefill($ut, 0, 0, imagecolorallocatealpha($ut, 0, 0, 0, 127));
    imagecopyresampled($ut, $kilde, 0, 0, 0, 0, $b, $h, imagesx($kilde), imagesy($kilde));
    $tmp = $sti . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if ($format === 'jpg') {
        // JPEG has no transparency: put it on white.
        $hvit = imagecreatetruecolor($b, $h);
        imagefill($hvit, 0, 0, imagecolorallocate($hvit, 255, 255, 255));
        imagecopy($hvit, $ut, 0, 0, 0, 0, $b, $h);
        imageinterlace($hvit, true);
        $ok = imagejpeg($hvit, $tmp, 82);
        imagedestroy($hvit);
    } elseif ($format === 'png') {
        $ok = imagepng($ut, $tmp, 9);
    } else {
        $ok = imagewebp($ut, $tmp, 80);
    }
    imagedestroy($ut);
    if (!$ok || !is_file($tmp) || filesize($tmp) === 0 || !rename($tmp, $sti)) {
        @unlink($tmp);
        throw new CmsFeil('Bildet kunne ikke lagres. Serveren kan være full.', 507);
    }
}

// ---------------------------------------------------------------- Server check («Drift»)

/** What this host can do, without secrets (plan B-04). */
function cms_drift(): array
{
    $gd = function_exists('gd_info') ? gd_info() : [];
    $ledig = @disk_free_space(dirname(__DIR__, 2));
    $skrivbar = fn(string $mappe) => is_dir($mappe) ? is_writable($mappe) : is_writable(dirname($mappe));
    $db = null;
    try {
        $pdo = cms_db();
        $db = ['driver' => cms_driver($pdo), 'versjon' => (string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION), 'ok' => true];
    } catch (Throwable) {
        $db = ['ok' => false];
    }
    return [
        'php' => PHP_VERSION,
        'pdoMysql' => extension_loaded('pdo_mysql'),
        'database' => $db,
        'gd' => (bool) $gd,
        'gdVersjon' => $gd['GD Version'] ?? null,
        'webp' => (bool) ($gd['WebP Support'] ?? false),
        'avif' => (bool) ($gd['AVIF Support'] ?? false),
        'imagick' => extension_loaded('imagick'),
        'exif' => function_exists('exif_read_data'),
        'fileinfo' => function_exists('finfo_open'),
        'curl' => extension_loaded('curl'),
        'opensslHttps' => extension_loaded('openssl'),
        'uploadMaxFilesize' => cms_ini_bytes('upload_max_filesize'),
        'postMaxSize' => cms_ini_bytes('post_max_size'),
        'memoryLimit' => cms_ini_bytes('memory_limit'),
        'maxExecutionTime' => (int) ini_get('max_execution_time'),
        'maksOpplasting' => cms_maks_opplasting(),
        'ledigPlass' => $ledig === false ? null : (int) $ledig,
        'dataSkrivbar' => $skrivbar(cms_datamappe()),
        'medierSkrivbar' => $skrivbar(dirname(__DIR__, 2) . '/medier'),
        'https' => cms_https(),
        'server' => preg_replace('~/[\d.]+.*$~', '', (string) ($_SERVER['SERVER_SOFTWARE'] ?? '')),
        'publisert' => is_file(cms_datamappe() . '/publisert.json'),
        'antallMedier' => (int) (cms_en('SELECT COUNT(*) AS n FROM cms_medier')['n'] ?? 0),
    ];
}
