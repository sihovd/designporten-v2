<?php
/**
 * Who may use the account module's admin actions: the CMS's administrators,
 * signed in to the CMS. This is the one place the account module talks to
 * the CMS, and only when an administrator calls. Without the CMS (not
 * installed, or not switched on) there is no admin here, and a member is
 * never one: members and CMS users are different people (docs/konto.md).
 */

declare(strict_types=1);

function konto_cms_finnes(): bool
{
    $kjerne = dirname(__DIR__) . '/cms/_kjerne.php';
    if (!is_file($kjerne)) return false;
    require_once $kjerne;
    return cms_konfig() !== null;
}

/** The signed-in CMS administrator, or a KontoFeil (401/403, or 503 without the CMS). */
function konto_krev_admin(): array
{
    if (!konto_cms_finnes()) throw new KontoFeil('Administrasjon av kontoer krever at CMS-et er slått på.', 503);
    try {
        return cms_krev('admin');
    } catch (CmsFeil $f) {
        throw new KontoFeil($f->getMessage(), $f->status);
    }
}

/** An entry in the CMS's audit log, when the CMS keeps one. */
function konto_admin_logg(array $aktor, string $handling, string $mal): void
{
    if (function_exists('cms_logg')) cms_logg($aktor, $handling, $mal, null, null);
}
