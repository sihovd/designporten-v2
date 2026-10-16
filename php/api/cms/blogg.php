<?php
/** Public articles and authenticated preview. Only published documents reach visitors. */
declare(strict_types=1);
require_once __DIR__ . '/_kjerne.php';
require_once __DIR__ . '/_studio.php';

function blogg_escape(mixed $v): string { return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function blogg_bilde(?int $id, string $alt, bool $eager = false): string
{
    if (!$id || !($m = cms_medium_rad($id))) return '';
    $m = cms_medium_ut($m);
    return '<figure class="blogg__bilde"><img src="' . blogg_escape($m['src']) . '" srcset="' . blogg_escape($m['srcset'])
        . '" sizes="(max-width: 800px) 100vw, 900px" width="' . $m['bredde'] . '" height="' . $m['hoyde']
        . '" alt="' . blogg_escape($alt) . '" loading="' . ($eager ? 'eager' : 'lazy') . '">'
        . ($m['konsept'] ? '<figcaption>Konseptbilde</figcaption>' : '') . '</figure>';
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') throw new CmsFeil('Feil metode.', 405);
    $base = cms_base(); $rot = dirname(__DIR__, 2);
    $sti = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    $preview = isset($_GET['forhandsvis']);
    $kart = isset($_GET['kart']);
    if ($preview) {
        cms_krev('blogg');
        header('Cache-Control: private, no-store');
        header('X-Robots-Tag: noindex, nofollow, noarchive');
    } else header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    if ($kart) {
        header('Content-Type: application/xml; charset=utf-8');
        $xml = (string) file_get_contents($rot . '/sitemap.xml');
        $nye = '';
        if (cms_konfig() !== null) {
            foreach (cms_alle('SELECT slug, endret FROM cms_innlegg WHERE publisert IS NOT NULL ORDER BY id') as $r) {
                $nye .= '<url><loc>https://designporten.no' . blogg_escape($base . 'blogg/' . $r['slug'] . '/') . '</loc><lastmod>' . substr($r['endret'], 0, 10) . '</lastmod></url>';
            }
        }
        echo str_replace('</urlset>', $nye . '</urlset>', $xml); exit;
    }
    $listesti = $base . 'blogg/';
    if (!$preview && $sti === rtrim($listesti, '/')) { header('Location: ' . $listesti, true, 301); exit; }
    $tittel = 'Blogg og inspirasjon'; $beskrivelse = 'Historier, guider og glimt fra verkstedet hos Designporten.';
    $kanonisk = 'https://designporten.no' . $listesti;
    $innhold = '<header class="blogg__hode"><p class="mono">Fra idé til virkelighet</p><h1>Historier fra verkstedet</h1><p>Inspirasjon, materialer og ideene som blir til noe.</p></header>';
    $artikkel = $preview || $sti !== $listesti;
    if ($artikkel) {
        if ($preview) {
            $r = cms_innlegg_rad((int) $_GET['forhandsvis']);
            $d = json_decode($r['utkast'] ?? $r['publisert'] ?? 'null', true, 64, JSON_THROW_ON_ERROR);
        } else {
            $slug = substr($sti, strlen($listesti));
            if (!str_starts_with($sti, $listesti) || !preg_match('/^([a-z0-9]+(?:-[a-z0-9]+)*)\/$/D', $slug, $m)) throw new CmsFeil('Fant ikke innlegget.', 404);
            $r = cms_konfig() !== null ? cms_en('SELECT * FROM cms_innlegg WHERE slug = ? AND publisert IS NOT NULL', [$m[1]]) : null;
            if (!$r) throw new CmsFeil('Fant ikke innlegget.', 404);
            $d = json_decode($r['publisert'], true, 64, JSON_THROW_ON_ERROR);
        }
        if (!is_array($d)) throw new CmsFeil('Fant ikke innlegget.', 404);
        $tittel = ($d['seoTittel'] ?: $d['tittel']); $beskrivelse = $d['seoBeskrivelse'] ?: $d['ingress'];
        $kanonisk .= $d['slug'] . '/';
        $innhold = ($preview ? '<p class="blogg__preview" role="note">Privat forhåndsvisning. Dette utkastet er ikke offentlig.</p>' : '')
            . '<article><header class="blogg__hode"><a href="' . blogg_escape($listesti) . '">← Alle historier</a><p class="mono">' . blogg_escape($d['kategori'])
            . '</p><h1>' . blogg_escape($d['tittel']) . '</h1><p class="blogg__ingress">' . blogg_escape($d['ingress']) . '</p><p>' . blogg_escape($d['forfatter']) . '</p></header>'
            . blogg_bilde($d['bilde'], $d['alt'], true) . '<div class="blogg__tekst">';
        foreach ($d['blokker'] as $b) {
            if ($b['type'] === 'overskrift') $innhold .= '<h2>' . blogg_escape($b['tekst']) . '</h2>';
            elseif ($b['type'] === 'avsnitt') $innhold .= '<p>' . nl2br(blogg_escape($b['tekst'])) . '</p>';
            elseif ($b['type'] === 'bilde') $innhold .= blogg_bilde($b['medium'], $b['alt']) . '<p class="blogg__bildetekst">' . blogg_escape($b['bildetekst']) . '</p>';
        }
        $innhold .= '<p class="blogg__tags">' . implode(' · ', array_map('blogg_escape', $d['emneknagger'])) . '</p></div></article>';
    } else {
        $side = max(1, min(100000, (int) ($_GET['side'] ?? 1)));
        $offset = ($side - 1) * 20;
        $rader = cms_konfig() !== null ? cms_alle('SELECT * FROM cms_innlegg WHERE publisert IS NOT NULL ORDER BY publisert_tid DESC, id DESC LIMIT 21 OFFSET ' . $offset) : [];
        $harFlere = count($rader) > 20;
        $innhold .= '<div class="blogg__rutenett">';
        foreach (array_slice($rader, 0, 20) as $r) {
            $d = json_decode($r['publisert'], true, 64, JSON_THROW_ON_ERROR);
            $innhold .= '<article class="blogg__kort">' . blogg_bilde($d['bilde'], $d['alt']) . '<p class="mono">' . blogg_escape($d['kategori'])
                . '</p><h2><a href="' . blogg_escape($listesti . $r['slug'] . '/') . '">' . blogg_escape($d['tittel']) . '</a></h2><p>' . blogg_escape($d['ingress']) . '</p></article>';
        }
        if (!$rader) $innhold .= '<p>Ingen historier er publisert ennå. Kom gjerne tilbake.</p>';
        $innhold .= '</div><nav class="blogg__paginering" aria-label="Flere innlegg">';
        if ($side > 1) $innhold .= '<a href="' . blogg_escape($listesti . '?side=' . ($side - 1)) . '">← Nyere innlegg</a>';
        if ($harFlere) $innhold .= '<a href="' . blogg_escape($listesti . '?side=' . ($side + 1)) . '">Eldre innlegg →</a>';
        $innhold .= '</nav>';
        if ($side > 1) $kanonisk .= '?side=' . $side;
    }
    $html = (string) file_get_contents($rot . '/blogg/index.html');
    $html = preg_replace_callback('~<!--CMS-BLOGG-START-->.*?<!--CMS-BLOGG-SLUTT-->~s', fn() => $innhold, $html);
    $html = preg_replace_callback('~<title>.*?</title>~s', fn() => '<title>' . blogg_escape($tittel) . ' – Designporten</title>', $html);
    foreach (['description' => $beskrivelse, 'og:title' => $tittel, 'og:description' => $beskrivelse, 'og:url' => $kanonisk] as $navn => $v) {
        $html = preg_replace_callback('~<meta\s+(?:name|property)="' . preg_quote($navn, '~') . '"\s+content="[^"]*"\s*/?>~', fn() => '<meta ' . (str_starts_with($navn, 'og:') ? 'property' : 'name') . '="' . $navn . '" content="' . blogg_escape($v) . '">', $html);
    }
    $html = preg_replace_callback('~<link\s+rel="canonical"\s+href="[^"]*"\s*/?>~', fn() => $preview ? '' : '<link rel="canonical" href="' . blogg_escape($kanonisk) . '">', $html);
    if ($artikkel && !$preview) {
        $siste = cms_en("SELECT opprettet FROM cms_innlegg_revisjoner WHERE innlegg_id = ? AND handling = 'publiser' ORDER BY id DESC LIMIT 1", [$r['id']]);
        $schema = ['@context' => 'https://schema.org', '@type' => 'BlogPosting', 'headline' => $d['tittel'],
            'description' => $beskrivelse, 'mainEntityOfPage' => $kanonisk, 'datePublished' => $r['publisert_tid'],
            'dateModified' => $siste['opprettet'] ?? $r['publisert_tid']];
        if ($d['forfatter'] !== '') $schema['author'] = ['@type' => 'Person', 'name' => $d['forfatter']];
        if ($d['bilde'] && ($medium = cms_medium_rad($d['bilde']))) {
            $bildeurl = 'https://designporten.no' . cms_medium_ut($medium)['src'];
            $schema['image'] = $bildeurl;
            $html = preg_replace_callback('~<meta\s+property="og:image"\s+content="[^"]*"\s*/?>~', fn() => '<meta property="og:image" content="' . blogg_escape($bildeurl) . '">', $html);
        }
        $html = preg_replace('~<meta\s+property="og:type"\s+content="[^"]*"\s*/?>~', '<meta property="og:type" content="article">', $html);
        $html = str_replace('</head>', '<script type="application/ld+json">' . json_encode($schema, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . '</script></head>', $html);
    }
    header('Content-Type: text/html; charset=utf-8'); echo $html;
} catch (Throwable $e) {
    $status = $e instanceof CmsFeil ? $e->status : 503;
    http_response_code($status); header('Cache-Control: private, no-store'); header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo '<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Designporten</title><h1>'
        . ($status === 404 ? 'Fant ikke innlegget' : ($status === 401 || $status === 403 ? 'Logg inn for å se utkastet' : 'Historiene er midlertidig utilgjengelige'))
        . '</h1><p><a href="' . blogg_escape(cms_base() . ($status === 401 || $status === 403 ? 'cms/' : 'blogg/')) . '">Tilbake</a></p></html>';
    if (!($e instanceof CmsFeil)) error_log('Designporten blogg: ' . $e->getMessage());
}
