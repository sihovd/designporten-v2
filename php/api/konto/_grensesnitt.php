<?php
/**
 * The account module's contract for the other parts on this server
 * (Sign Forge's own API comes in stage C). They include this file and use
 * only these functions, never the account tables. See
 * docs/architecture/tjenesteplattform.md.
 */

declare(strict_types=1);

require_once __DIR__ . '/_konto.php';

/** Bumped when a function below changes in a way callers notice. */
const KONTO_GRENSESNITT_VERSJON = 1;

function konto_versjon(): int
{
    return KONTO_GRENSESNITT_VERSJON;
}

/** The signed-in member as other parts may see them, or null (also when accounts are switched off). */
function konto_innlogget(): ?array
{
    if (konto_konfig() === null) return null;
    $m = konto_medlem();
    return $m === null ? null : ['id' => (int) $m['id'], 'navn' => $m['navn'], 'status' => 'aktiv'];
}

/**
 * Whether member `$id` may use a service (an id in tjenester.json). The
 * server decides; a list in the browser is only for showing.
 */
function konto_har_tilgang(int $id, string $tjeneste): bool
{
    if (konto_konfig() === null) return false;
    $m = konto_en('SELECT * FROM dp_medlemmer WHERE id = ? AND aktiv = 1', [$id]);
    return $m !== null && konto_tilgang($m, $tjeneste);
}
