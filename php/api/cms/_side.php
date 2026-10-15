<?php
/**
 * Puts published CMS texts into a built page. Pure functions with no
 * database, so a page can always be served even if the CMS is down.
 *
 * The build marks every editable text as an element with
 * data-rediger="<key>" whose content is plain text, or (for paragraphs,
 * data-rediger-type="avsnitt") a run of <p> elements. Only those exact shapes
 * are replaced; anything else is left as built.
 */

declare(strict_types=1);

const CMS_ELEMENT = '~<([a-z][a-z0-9]*)\b([^>]*?\sdata-rediger="([^"]+)"[^>]*)>([^<]*|(?:\s*<p\b[^>]*>[^<]*</p>)+\s*)</\1>~';

function cms_html(string $tekst): string
{
    return htmlspecialchars($tekst, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

/** @param array<string,string> $publisert key → published text */
function cms_sett_inn(string $html, array $publisert): string
{
    if (!$publisert) return $html;
    $ut = preg_replace_callback(CMS_ELEMENT, function (array $m) use ($publisert): string {
        $nokkel = html_entity_decode($m[3], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (!array_key_exists($nokkel, $publisert) || !is_string($publisert[$nokkel])) return $m[0];
        $tekst = $publisert[$nokkel];
        $avsnitt = str_contains($m[2], 'data-rediger-type="avsnitt"');
        if (!$avsnitt) {
            if (str_contains($m[4], '<')) return $m[0];
            return "<{$m[1]}{$m[2]}>" . cms_html($tekst) . "</{$m[1]}>";
        }
        $p = preg_match('~<p\b[^>]*>~', $m[4], $apning) ? $apning[0] : '<p>';
        $deler = array_map(fn($a) => $p . cms_html($a) . '</p>', explode("\n\n", $tekst));
        return "<{$m[1]}{$m[2]}>" . implode('', $deler) . "</{$m[1]}>";
    }, $html);
    return $ut ?? $html;
}

/** The snapshot written on every publish, or nothing if the CMS has never published. */
function cms_les_publisert(string $datamappe): array
{
    $fil = $datamappe . '/publisert.json';
    if (!is_file($fil)) return [];
    $data = json_decode((string) file_get_contents($fil), true);
    return is_array($data) ? $data : [];
}
