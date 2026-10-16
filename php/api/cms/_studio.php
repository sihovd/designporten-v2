<?php
/** Studio dashboard and versioned articles. No commerce/analytics data is fabricated. */
declare(strict_types=1);

function cms_blogg_tekst(mixed $verdi, string $navn, int $maks, bool $pakrevd = false): string
{
    if (!is_string($verdi)) throw new CmsFeil("$navn må være tekst.", 422);
    $tekst = trim(str_replace(["\r\n", "\r"], "\n", $verdi));
    if (($pakrevd && $tekst === '') || mb_strlen($tekst) > $maks) {
        throw new CmsFeil("$navn må " . ($pakrevd ? 'fylles ut og ' : '') . "ha høyst $maks tegn.", 422);
    }
    return $tekst;
}

function cms_blogg_bilde(mixed $bilde): ?int
{
    if ($bilde === null) return null;
    if (!is_int($bilde) || $bilde < 1) throw new CmsFeil('Velg et gyldig bilde.', 422);
    $m = cms_medium_rad($bilde);
    if (!$m || $m['status'] !== 'aktiv') throw new CmsFeil('Bildet finnes ikke eller er arkivert.', 422);
    return $bilde;
}

/** Plain, typed blocks: never store or render arbitrary HTML. */
function cms_blogg_dokument(mixed $d): array
{
    if (!is_array($d)) throw new CmsFeil('Innlegget mangler innhold.', 422);
    $slug = cms_blogg_tekst($d['slug'] ?? '', 'Nettadresse', 120, true);
    if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $slug)) throw new CmsFeil('Nettadressen kan ha små bokstaver, tall og bindestrek.', 422);
    $blokker = $d['blokker'] ?? null;
    if (!is_array($blokker) || !array_is_list($blokker) || count($blokker) > 100) throw new CmsFeil('Et innlegg kan ha høyst 100 innholdsblokker.', 422);
    $ut = [];
    foreach ($blokker as $b) {
        if (!is_array($b)) throw new CmsFeil('Ugyldig innholdsblokk.', 422);
        $type = $b['type'] ?? '';
        if (in_array($type, ['avsnitt', 'overskrift'], true)) {
            $ut[] = ['type' => $type, 'tekst' => cms_blogg_tekst($b['tekst'] ?? '', 'Blokktekst', $type === 'overskrift' ? 200 : 10000)];
        } elseif ($type === 'bilde') {
            $id = cms_blogg_bilde($b['medium'] ?? null);
            if ($id === null) throw new CmsFeil('Velg bilde i bildeblokken.', 422);
            $ut[] = ['type' => 'bilde', 'medium' => $id,
                'alt' => cms_blogg_tekst($b['alt'] ?? '', 'Alternativ tekst', 500, true),
                'bildetekst' => cms_blogg_tekst($b['bildetekst'] ?? '', 'Bildetekst', 1000)];
        } else throw new CmsFeil('Denne blokktypen støttes ikke.', 422);
    }
    $tags = $d['emneknagger'] ?? [];
    if (!is_array($tags) || !array_is_list($tags) || count($tags) > 15) throw new CmsFeil('Bruk høyst 15 emneknagger.', 422);
    $tags = array_values(array_unique(array_filter(array_map(fn($t) => cms_blogg_tekst($t, 'Emneknagg', 60), $tags))));
    $bilde = cms_blogg_bilde($d['bilde'] ?? null);
    return [
        'tittel' => cms_blogg_tekst($d['tittel'] ?? '', 'Tittel', 200, true),
        'slug' => $slug,
        'ingress' => cms_blogg_tekst($d['ingress'] ?? '', 'Introduksjon', 1000),
        'kategori' => cms_blogg_tekst($d['kategori'] ?? '', 'Kategori', 100),
        'forfatter' => cms_blogg_tekst($d['forfatter'] ?? '', 'Forfatter', 191),
        'emneknagger' => $tags, 'bilde' => $bilde,
        'alt' => cms_blogg_tekst($d['alt'] ?? '', 'Alternativ tekst', 500, $bilde !== null),
        'seoTittel' => cms_blogg_tekst($d['seoTittel'] ?? '', 'SEO-tittel', 200),
        'seoBeskrivelse' => cms_blogg_tekst($d['seoBeskrivelse'] ?? '', 'SEO-beskrivelse', 500),
        'blokker' => $ut,
    ];
}

function cms_blogg_json(array $d): string
{
    return json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function cms_innlegg_rad(int $id): array
{
    $rad = cms_en('SELECT * FROM cms_innlegg WHERE id = ?', [$id]);
    if (!$rad) throw new CmsFeil('Fant ikke innlegget.', 404);
    return $rad;
}

function cms_innlegg_ut(array $r): array
{
    $utkast = $r['utkast'] !== null ? json_decode($r['utkast'], true, 64, JSON_THROW_ON_ERROR) : null;
    $publisert = $r['publisert'] !== null ? json_decode($r['publisert'], true, 64, JSON_THROW_ON_ERROR) : null;
    return ['id' => (int) $r['id'], 'versjon' => (int) $r['versjon'], 'utkast' => $utkast, 'publisert' => $publisert,
        'endret' => $r['endret'], 'opprettet' => $r['opprettet'], 'publisertTid' => $r['publisert_tid'],
        'url' => $publisert ? cms_base() . 'blogg/' . $r['slug'] . '/' : null];
}

function cms_innlegg_revisjon(int $id, int $versjon, string $handling, string $json, array $aktor): void
{
    cms_kjor('INSERT INTO cms_innlegg_revisjoner (innlegg_id, versjon, handling, dokument, aktor_id, opprettet) VALUES (?, ?, ?, ?, ?, ?)',
        [$id, $versjon, $handling, $json, $aktor['id'], cms_na()]);
}

/** All writes, including revision and audit, commit together. Version conflicts never overwrite. */
function cms_innlegg_skriv(string $handling, array $k, array $aktor): array
{
    if (!is_int($k['id'] ?? null) || !is_int($k['versjon'] ?? null)) throw new CmsFeil('Innlegget mangler ID eller versjon.', 422);
    $id = $k['id']; $versjon = $k['versjon'];
    if ($id < 0 || $versjon < 0) throw new CmsFeil('Ugyldig ID eller versjon.', 422);
    $db = cms_db(); $db->beginTransaction();
    try {
        if ($id === 0) {
            if ($handling !== 'lagre' || $versjon !== 0) throw new CmsFeil('Lagre et utkast først.', 422);
            $json = cms_blogg_json(cms_blogg_dokument($k['dokument'] ?? null));
            cms_kjor('INSERT INTO cms_innlegg (utkast, versjon, opprettet, endret, endret_av) VALUES (?, 1, ?, ?, ?)', [$json, cms_na(), cms_na(), $aktor['id']]);
            $id = (int) $db->lastInsertId(); $ny = 1;
        } else {
            $rad = cms_innlegg_rad($id);
            if ((int) $rad['versjon'] !== $versjon) throw new CmsFeil('Innlegget er endret av noen andre. Last inn den nye versjonen før du lagrer.', 409);
            $ny = $versjon + 1;
            if ($handling === 'lagre' || $handling === 'gjenopprett') {
                $d = $k['dokument'] ?? null;
                if ($handling === 'gjenopprett') {
                    $rev = cms_en('SELECT dokument FROM cms_innlegg_revisjoner WHERE id = ? AND innlegg_id = ?', [(int) ($k['revisjon'] ?? 0), $id]);
                    if (!$rev) throw new CmsFeil('Fant ikke revisjonen.', 404);
                    $d = json_decode($rev['dokument'], true, 64, JSON_THROW_ON_ERROR);
                }
                $json = cms_blogg_json(cms_blogg_dokument($d));
                $antall = cms_kjor('UPDATE cms_innlegg SET utkast = ?, versjon = ?, endret = ?, endret_av = ? WHERE id = ? AND versjon = ?', [$json, $ny, cms_na(), $aktor['id'], $id, $versjon]);
            } elseif ($handling === 'publiser') {
                if ($rad['utkast'] === null) throw new CmsFeil('Det finnes ikke et utkast å publisere.', 422);
                $d = cms_blogg_dokument(json_decode($rad['utkast'], true, 64, JSON_THROW_ON_ERROR));
                if (!array_filter($d['blokker'], fn($b) => $b['type'] === 'bilde' || trim($b['tekst'] ?? '') !== '')) throw new CmsFeil('Legg til innhold før du publiserer.', 422);
                if ($rad['slug'] !== null && $rad['slug'] !== $d['slug']) throw new CmsFeil('Behold nettadressen til et publisert innlegg. Endring med videresending er ikke støttet ennå.', 422);
                if (cms_en('SELECT id FROM cms_innlegg WHERE slug = ? AND id <> ?', [$d['slug'], $id])) throw new CmsFeil('Denne nettadressen er allerede i bruk.', 409);
                $json = cms_blogg_json($d);
                $antall = cms_kjor('UPDATE cms_innlegg SET publisert = ?, slug = ?, utkast = NULL, versjon = ?, endret = ?, endret_av = ?, publisert_tid = ? WHERE id = ? AND versjon = ?', [$json, $d['slug'], $ny, cms_na(), $aktor['id'], $rad['publisert_tid'] ?? cms_na(), $id, $versjon]);
            } elseif ($handling === 'avpubliser') {
                if ($rad['publisert'] === null) throw new CmsFeil('Innlegget er allerede avpublisert.', 422);
                $json = $rad['publisert'];
                $antall = cms_kjor('UPDATE cms_innlegg SET utkast = COALESCE(utkast, publisert), publisert = NULL, versjon = ?, endret = ?, endret_av = ? WHERE id = ? AND versjon = ?', [$ny, cms_na(), $aktor['id'], $id, $versjon]);
            } else throw new CmsFeil('Ukjent innleggshandling.', 422);
            if ($antall !== 1) throw new CmsFeil('Innlegget ble endret samtidig. Last inn på nytt.', 409);
        }
        cms_innlegg_revisjon($id, $ny, $handling, $json, $aktor);
        cms_logg($aktor, 'innlegg.' . $handling, (string) $id, null, ['versjon' => $ny]);
        $db->commit();
        return cms_innlegg_ut(cms_innlegg_rad($id));
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($e instanceof PDOException && (str_starts_with((string) $e->getCode(), '23'))) throw new CmsFeil('Nettadressen er allerede i bruk. Velg en annen.', 409);
        throw $e;
    }
}

function cms_studio_oversikt(int $dager, array $aktor): array
{
    if (!in_array($dager, [7, 30, 90], true)) throw new CmsFeil('Velg 7, 30 eller 90 dager.', 422);
    $fra = gmdate('Y-m-d', time() - ($dager - 1) * 86400) . 'T00:00:00Z';
    $felt = cms_en('SELECT COUNT(*) AS endret, SUM(CASE WHEN utkast IS NOT NULL THEN 1 ELSE 0 END) AS utkast, SUM(CASE WHEN publisert IS NOT NULL THEN 1 ELSE 0 END) AS publisert FROM cms_innhold');
    $innlegg = cms_en('SELECT COUNT(*) AS alle_innlegg, SUM(CASE WHEN utkast IS NOT NULL THEN 1 ELSE 0 END) AS utkast, SUM(CASE WHEN publisert IS NOT NULL THEN 1 ELSE 0 END) AS publisert FROM cms_innlegg');
    $aktiviteter = cms_alle('SELECT SUBSTR(opprettet, 1, 10) AS dag, COUNT(*) AS antall FROM cms_hendelser WHERE opprettet >= ? AND resultat = ? AND handling NOT LIKE ? GROUP BY SUBSTR(opprettet, 1, 10) ORDER BY dag', [$fra, 'ok', 'nektet.%']);
    return ['malt' => cms_na(), 'kilde' => 'CMS-databasen', 'dager' => $dager,
        'felt' => ['totalt' => count(cms_nokler()), 'endret' => (int) $felt['endret'], 'utkast' => (int) $felt['utkast'], 'publisert' => (int) $felt['publisert']],
        'innlegg' => ['totalt' => (int) $innlegg['alle_innlegg'], 'utkast' => (int) $innlegg['utkast'], 'publisert' => (int) $innlegg['publisert']],
        'medier' => (int) cms_en("SELECT COUNT(*) AS antall FROM cms_medier WHERE status = 'aktiv'")['antall'],
        'forslag' => (int) cms_en("SELECT COUNT(*) AS antall FROM cms_forslag WHERE status = 'venter'")['antall'],
        'aktivitet' => array_map(fn($r) => ['dag' => $r['dag'], 'antall' => (int) $r['antall']], $aktiviteter),
        'hendelser' => array_map(fn($r) => ['id' => (int) $r['id'], 'handling' => $r['handling'], 'mal' => $r['mal'], 'tid' => $r['opprettet']], cms_alle('SELECT id, handling, mal, opprettet FROM cms_hendelser WHERE opprettet >= ? ORDER BY id DESC LIMIT 8', [$fra])),
        'teknisk' => cms_kan($aktor, 'drift') ? ['database' => true, 'publisert' => is_file(cms_datamappe() . '/publisert.json'), 'dataSkrivbar' => is_writable(cms_datamappe())] : null,
        'tilkoblinger' => ['besok' => null, 'salg' => null, 'ordre' => null, 'betaling' => null, 'backupovervakning' => null]];
}

function cms_studio_rute(string $r): void
{
    if ($r === 'gjenbygg-visning') {
        cms_metode('POST'); $aktor = cms_krev('drift');
        cms_skriv_publisert();
        cms_logg($aktor, 'drift.gjenbygg-visning', null, null, null);
        cms_svar(['ok' => true]);
    }
    if ($r === 'oversikt') {
        cms_metode('GET'); $aktor = cms_krev('blogg');
        cms_svar(['oversikt' => cms_studio_oversikt((int) ($_GET['dager'] ?? 30), $aktor)]);
    }
    if ($r === 'innlegg') {
        cms_metode('GET'); cms_krev('blogg');
        cms_svar(['innlegg' => array_map('cms_innlegg_ut', cms_alle('SELECT * FROM cms_innlegg ORDER BY endret DESC, id DESC'))]);
    }
    if ($r === 'innlegg-en') {
        cms_metode('GET'); cms_krev('blogg'); $id = (int) ($_GET['id'] ?? 0);
        $rev = cms_alle('SELECT id, versjon, handling, dokument, opprettet FROM cms_innlegg_revisjoner WHERE innlegg_id = ? ORDER BY id DESC LIMIT 50', [$id]);
        cms_svar(['innlegg' => cms_innlegg_ut(cms_innlegg_rad($id)), 'revisjoner' => array_map(fn($v) => ['id' => (int) $v['id'], 'versjon' => (int) $v['versjon'], 'handling' => $v['handling'], 'tid' => $v['opprettet']], $rev)]);
    }
    if (in_array($r, ['innlegg-lagre', 'innlegg-publiser', 'innlegg-avpubliser', 'innlegg-gjenopprett'], true)) {
        cms_metode('POST'); $aktor = cms_krev('blogg');
        cms_svar(['innlegg' => cms_innlegg_skriv(substr($r, 8), cms_kropp(), $aktor)]);
    }
}

/** Old backups without blog tables preserve existing articles. New backups restore both tables atomically. */
function cms_blogg_import(array $tabeller, array &$antall): void
{
    if (!array_key_exists('cms_innlegg', $tabeller)) return;
    if (!is_array($tabeller['cms_innlegg']) || !is_array($tabeller['cms_innlegg_revisjoner'] ?? null)) throw new CmsFeil('Sikkerhetskopien mangler innleggshistorikken.', 422);
    foreach ($tabeller['cms_innlegg'] as $r) {
        if (!is_array($r) || !is_int($r['id'] ?? null) || $r['id'] < 1 || !is_int($r['versjon'] ?? null)) throw new CmsFeil('Ugyldig innlegg i sikkerhetskopien.', 422);
        foreach (['utkast', 'publisert'] as $felt) {
            if (($r[$felt] ?? null) !== null) cms_blogg_dokument(json_decode($r[$felt], true, 64, JSON_THROW_ON_ERROR));
        }
        if ($r['publisert'] !== null && ($r['slug'] ?? '') !== json_decode($r['publisert'], true)['slug']) throw new CmsFeil('Ugyldig publisert nettadresse.', 422);
    }
    foreach ($tabeller['cms_innlegg_revisjoner'] as $r) {
        if (!is_array($r) || !is_int($r['id'] ?? null) || !is_int($r['innlegg_id'] ?? null)) throw new CmsFeil('Ugyldig innleggshistorikk.', 422);
        cms_blogg_dokument(json_decode($r['dokument'], true, 64, JSON_THROW_ON_ERROR));
    }
    foreach (['cms_innlegg_revisjoner', 'cms_innlegg'] as $t) cms_kjor("DELETE FROM $t");
    foreach (['cms_innlegg' => ['id', 'slug', 'utkast', 'publisert', 'versjon', 'opprettet', 'endret', 'endret_av', 'publisert_tid'],
        'cms_innlegg_revisjoner' => ['id', 'innlegg_id', 'versjon', 'handling', 'dokument', 'aktor_id', 'opprettet']] as $t => $kolonner) {
        $s = cms_db()->prepare("INSERT INTO $t (" . implode(', ', $kolonner) . ') VALUES (' . implode(', ', array_fill(0, count($kolonner), '?')) . ')');
        foreach ($tabeller[$t] as $r) $s->execute(array_map(fn($k) => $r[$k] ?? null, $kolonner));
        $antall[$t] = count($tabeller[$t]);
    }
}
