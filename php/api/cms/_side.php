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

/**
 * Pictures: an <img data-rediger-bilde="<key>">, the page's preload hint for
 * it (<link data-rediger-bilde-forhand="<key>">) and its «Konseptbilde»
 * label (<span data-konseptmerke="<key>">). Same patterns as
 * scripts/cms-nokler.mjs.
 */
const CMS_BILDE = '~<img\b[^>]*\sdata-rediger-bilde="([^"]+)"[^>]*>~';
const CMS_FORHAND = '~<link\b[^>]*\sdata-rediger-bilde-forhand="([^"]+)"[^>]*>~';
const CMS_KONSEPTMERKE = '~<span\b([^>]*\sdata-konseptmerke="([^"]+)"[^>]*)>~';

function cms_html(string $tekst): string
{
    return htmlspecialchars($tekst, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

/** Attributes of one tag, in order: name → value (null for a bare attribute). */
function cms_attributter(string $tagg): array
{
    preg_match_all('~\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?~', preg_replace('~^<[a-z]+|/?>$~i', '', $tagg), $m, PREG_SET_ORDER);
    $ut = [];
    foreach ($m as $a) $ut[strtolower($a[1])] = isset($a[2]) ? html_entity_decode($a[2], ENT_QUOTES | ENT_HTML5, 'UTF-8') : null;
    return $ut;
}

function cms_tagg(string $navn, array $attr): string
{
    $deler = [];
    foreach ($attr as $k => $v) $deler[] = $v === null ? $k : $k . '="' . cms_html((string) $v) . '"';
    return '<' . $navn . ' ' . implode(' ', $deler) . '>';
}

function cms_er_bilde(mixed $v): bool
{
    return is_array($v) && ($v['type'] ?? '') === 'bilde' && is_string($v['src'] ?? null);
}

/** Replace a picture's attributes with the published one; class, loading, sizes and the rest stay as built. */
function cms_sett_inn_bilder(string $html, array $publisert): string
{
    $hent = fn(string $k) => ($v = $publisert[html_entity_decode($k, ENT_QUOTES | ENT_HTML5, 'UTF-8')] ?? null) && cms_er_bilde($v) ? $v : null;
    $html = preg_replace_callback(CMS_BILDE, function (array $m) use ($hent): string {
        $b = $hent($m[1]);
        if (!$b) return $m[0];
        $a = cms_attributter($m[0]);
        $a['src'] = $b['src'];
        $a['srcset'] = $b['srcset'] ?? null;
        if ($a['srcset'] === null || $a['srcset'] === '') unset($a['srcset']);
        $a['width'] = (string) (int) $b['bredde'];
        $a['height'] = (string) (int) $b['hoyde'];
        $a['alt'] = (string) ($b['alt'] ?? '');
        $a['data-konsept'] = !empty($b['konsept']) ? '1' : '0';
        $stil = '--fokus: ' . ($b['fokus'] ?? '50% 50%') . ';' . (!empty($b['fokusMobil']) ? ' --fokus-mobil: ' . $b['fokusMobil'] . ';' : '');
        if (!preg_match('/^[\d% ;:a-z-]+$/', $stil)) $stil = '';
        $a['style'] = trim(($a['style'] ?? '') . ' ' . $stil);
        return cms_tagg('img', $a);
    }, $html) ?? $html;
    $html = preg_replace_callback(CMS_FORHAND, function (array $m) use ($hent): string {
        $b = $hent($m[1]);
        if (!$b) return $m[0];
        $a = cms_attributter($m[0]);
        $a['href'] = $b['src'];
        if (!empty($b['srcset'])) {
            $a['imagesrcset'] = $b['srcset'];
            $a['imagesizes'] ??= '100vw';
        }
        return cms_tagg('link', $a);
    }, $html) ?? $html;
    return preg_replace_callback(CMS_KONSEPTMERKE, function (array $m) use ($hent): string {
        $b = $hent($m[2]);
        if (!$b) return $m[0];
        $a = cms_attributter($m[0]);
        unset($a['hidden']);
        if (empty($b['konsept'])) $a['hidden'] = null;
        return cms_tagg('span', $a);
    }, $html) ?? $html;
}

/** @param array<string,string|array> $publisert key → published text, or a picture (see cms_skriv_publisert) */
function cms_sett_inn(string $html, array $publisert): string
{
    if (!$publisert) return $html;
    $html = cms_sett_inn_bilder($html, $publisert);
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
