<?php
/**
 * Projects on the account (stage C, Sivert 2026-10-18). One table for every
 * app (dp_prosjekter, migration 4), so the quota counts across apps:
 *
 * - a guest stores nothing on the server; projects stay in the browser;
 * - a free account keeps at most `planer.gratis.prosjekter` (five) in total;
 * - a paid package sets its own quota (tjenester.json `planer`).
 *
 * The server decides: the owner is the signed-in member, never a value from
 * the browser, and the quota is counted with the member's row locked, so two
 * saves at once cannot pass it together. A member over the quota (after a
 * package ends) still opens, downloads, updates and deletes every project;
 * only a new one is refused. Nothing is deleted or uploaded automatically.
 * A save names the revision it was based on; an older one gives 409 with the
 * current revision, and the browser offers «Åpne nyeste» or «Lagre som kopi».
 */

declare(strict_types=1);

require_once __DIR__ . '/_konto.php';

/** Largest project document (JSON bytes). A bigger one can still be saved as a file. */
const KONTO_MAKS_PROSJEKT = 2_000_000;

const KONTO_PROSJEKTFELT = 'offentlig_id, app, navn, storrelse, revisjon, opprettet, endret';

/** The apps that store projects on the account (tjenester.json `prosjektapper`). */
function konto_prosjektapp(mixed $v): string
{
    if (!is_string($v) || !isset(konto_tjenester()['prosjektapper'][$v])) throw new KontoFeil('Ukjent verktøy.', 422);
    return $v;
}

function konto_prosjekt_id(mixed $v): string
{
    if (!is_string($v) || !preg_match('/^[a-f0-9]{16}$/D', $v)) throw new KontoFeil('Fant ikke prosjektet.', 404);
    return $v;
}

/** A project's list entry. */
function konto_prosjekt_ut(array $r): array
{
    return [
        'id' => $r['offentlig_id'], 'app' => $r['app'], 'navn' => $r['navn'], 'storrelse' => (int) $r['storrelse'],
        'revisjon' => (int) $r['revisjon'], 'opprettet' => $r['opprettet'], 'endret' => $r['endret'],
    ];
}

/** How many projects the member has, and may have. */
function konto_prosjektkvote(array $m): array
{
    $pakke = konto_plan($m);
    $brukt = (int) konto_en('SELECT COUNT(*) AS n FROM dp_prosjekter WHERE medlem_id = ?', [$m['id']])['n'];
    return ['brukt' => $brukt, 'maks' => $pakke['prosjekter'], 'pakke' => $pakke['id'], 'pakkenavn' => $pakke['navn']];
}

/**
 * The project document, checked: a Skaperverksted document of this app, as
 * JSON no larger than KONTO_MAKS_PROSJEKT. The browser opens it with its own
 * migration and cleaning (core/dokument.ts fraJson), as it does a file.
 */
function konto_gyldig_prosjekt(mixed $dok, string $app): string
{
    if (!is_array($dok) || !is_int($dok['versjon'] ?? null) || ($dok['generator'] ?? null) !== $app || !is_array($dok['lag'] ?? null)) {
        throw new KontoFeil('Prosjektet kunne ikke leses.', 422);
    }
    $json = json_encode($dok, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (strlen($json) > KONTO_MAKS_PROSJEKT) {
        throw new KontoFeil('Prosjektet er for stort til å lagres på kontoen (over 2 MB). Lagre det som fil i stedet.', 413);
    }
    return $json;
}

/** The member's own project row, or 404 (another member's project is never shown or changed). */
function konto_eget_prosjekt(array $m, mixed $id, string $felt = '*'): array
{
    $r = konto_en("SELECT $felt FROM dp_prosjekter WHERE offentlig_id = ? AND medlem_id = ?", [konto_prosjekt_id($id), $m['id']]);
    if (!$r) throw new KontoFeil('Fant ikke prosjektet.', 404);
    return $r;
}

/**
 * Saves a project: a new one when `id` is missing (counts against the quota),
 * otherwise the member's own project, if `revisjon` is the latest.
 * @return array the list entry
 */
function konto_lagre_prosjekt(array $m, array $k): array
{
    $app = konto_prosjektapp($k['app'] ?? null);
    $navn = konto_tekst($k['navn'] ?? 'Uten navn', 'navn', 80, false) ?: 'Uten navn';
    $json = konto_gyldig_prosjekt($k['dokument'] ?? null, $app);
    return konto_transaksjon(function () use ($m, $k, $app, $navn, $json) {
        konto_las_medlem((int) $m['id']);
        $na = konto_na();
        if (!isset($k['id'])) {
            $kvote = konto_prosjektkvote($m);
            if ($kvote['brukt'] >= $kvote['maks']) {
                throw new KontoFeil(
                    "Du har {$kvote['brukt']} av {$kvote['maks']} prosjekter på kontoen. Slett et prosjekt under Min konto for å få plass, eller lagre dette som fil. Prosjektet er fortsatt lagret i denne nettleseren.",
                    403,
                );
            }
            $id = bin2hex(random_bytes(8));
            konto_kjor(
                'INSERT INTO dp_prosjekter (offentlig_id, medlem_id, app, navn, dokument, storrelse, revisjon, opprettet, endret) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$id, $m['id'], $app, $navn, $json, strlen($json), $na, $na],
            );
        } else {
            $r = konto_eget_prosjekt($m, $k['id'], 'offentlig_id, app, revisjon, endret');
            if ($r['app'] !== $app) throw new KontoFeil('Prosjektet hører til et annet verktøy.', 422);
            $basert = $k['revisjon'] ?? null;
            if (!is_int($basert) || $basert !== (int) $r['revisjon']) {
                throw new KontoFeil(
                    'Prosjektet er endret et annet sted siden du åpnet det.',
                    409,
                    ['revisjon' => (int) $r['revisjon'], 'endret' => $r['endret']],
                );
            }
            konto_kjor(
                'UPDATE dp_prosjekter SET navn = ?, dokument = ?, storrelse = ?, revisjon = revisjon + 1, endret = ? WHERE offentlig_id = ? AND medlem_id = ? AND revisjon = ?',
                [$navn, $json, strlen($json), $na, $r['offentlig_id'], $m['id'], $basert],
            );
            $id = $r['offentlig_id'];
        }
        return konto_prosjekt_ut(konto_eget_prosjekt($m, $id, KONTO_PROSJEKTFELT));
    });
}
