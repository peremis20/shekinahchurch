#!/usr/bin/env python3
"""Build one Kreyòl page per Bible study audio, plus a hub page.

Reads _build/kreyol-studies.json and writes:
  kreyol/etid/index.html            hub listing every Kreyòl audio study
  kreyol/etid/<slug>/index.html     one page per study (player, summary, points, verses, questions)
Also exposes sitemap_rows() so build.py keeps these URLs in sitemap.xml.

Run from anywhere: python3 _build/kreyol_pages.py
"""
import json, os, html as H

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(ROOT)
SITE = 'https://shekinahsda.org'
DATA = os.path.join(ROOT, 'kreyol-studies.json')
GA = 'G-DBRNW7DHZH'
IMG = SITE + '/assets/church/church-01.jpg'


def load():
    return json.load(open(DATA, encoding='utf-8'))


def sitemap_rows():
    rows = [(SITE + '/kreyol/etid/', None)]
    rows += [(SITE + '/kreyol/etid/%s/' % s['slug'], s['date']) for s in load()]
    return rows


def e(t):
    return H.escape(t, quote=True)


CSS = """
:root{--navy:#13294B;--cream:#FAF6EE;--gold:#8A6420;--sand:#F3E3BC;--line:#EDE5D3;--ink:#3D4554;--green:#0E4A36}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--ink);font-family:'Mulish',system-ui,sans-serif;font-size:17px;line-height:1.65}
a{color:var(--green)}
header{background:var(--navy);color:#fff}
.bar{max-width:880px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.bar a{color:#fff;text-decoration:none;font-weight:700}
.brand{display:flex;align-items:center;gap:10px;font-family:'Libre Baskerville',serif;font-size:17px}
.brand img{width:36px;height:36px}
nav{display:flex;gap:16px;flex-wrap:wrap;font-size:15px}
main{max-width:880px;margin:0 auto;padding:28px 20px 56px}
.crumbs{font-size:14px;color:#5B6270;margin-bottom:14px}.crumbs a{color:#5B6270}
h1{font-family:'Libre Baskerville',serif;color:var(--navy);font-size:clamp(26px,4.5vw,36px);line-height:1.25;margin:0 0 10px}
h2{font-family:'Libre Baskerville',serif;color:var(--navy);font-size:22px;margin:34px 0 10px}
.meta{font-weight:700;color:var(--gold);font-size:15px;margin-bottom:18px}
.tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--navy);background:var(--sand);border-radius:40px;padding:4px 10px;margin-right:6px}
.player{background:var(--cream);border:1px solid var(--line);border-radius:14px;padding:18px;margin:8px 0 22px}
.player audio{width:100%}
.player p{margin:8px 0 0;font-size:14px;color:#5B6270}
ul,ol{padding-left:22px}li{margin:6px 0}
.verses{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.verses li{margin:0;background:var(--cream);border:1px solid var(--line);border-radius:40px;padding:4px 12px;font-size:15px}
.crisis{background:#FFF4E5;border:1px solid #F0C98A;border-radius:12px;padding:14px 16px;margin:0 0 20px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.btn{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;font-weight:800;border-radius:40px;padding:12px 22px}
.btn.alt{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:16px;margin-top:20px}
.card{display:flex;flex-direction:column;gap:8px;padding:18px;border-radius:14px;background:var(--cream);border:1px solid var(--line);text-decoration:none;color:inherit}
.card h3{margin:0;font-family:'Libre Baskerville',serif;color:var(--navy);font-size:17px;line-height:1.35}
.card span{font-size:13px;font-weight:700;color:var(--gold)}
.card p{margin:0;font-size:15px}
footer{background:var(--navy);color:#cfd6e3;font-size:14px}
footer .bar{padding:22px 20px}footer a{color:#fff}
"""

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Mulish:wght@400;600;700;800&display=swap" rel="stylesheet">')

HEADER = ('<header><div class="bar"><a class="brand" href="/"><img src="/assets/logo-mark-light.png" alt="" width="36" height="36">Shekinah</a>'
          '<nav><a href="/kreyol/etid/">Etid Biblik</a><a href="/bible-study/">Bible Study</a>'
          '<a href="/kreyol/planifye-vizit/">Planifye vizit ou</a><a href="/prayer-request/">Demann priyè</a></nav></div></header>')

FOOTER = ('<footer><div class="bar"><span>Legliz Advantis Setyèm Jou Ayisyen Shekinah · 205 E Carver St, Alvarado, TX 76009 · '
          'Lekòl Saba 10:00 AM, Sèvis adorasyon 11:00 AM chak Samdi</span><a href="/">shekinahsda.org</a></div></footer>')


def head(title, desc, url, ld):
    ga = ('<script async src="https://www.googletagmanager.com/gtag/js?id=%s"></script>'
          '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","%s");</script>' % (GA, GA))
    return ('<!doctype html><html lang="ht"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>%s</title><meta name="description" content="%s"><link rel="canonical" href="%s">'
            '<meta property="og:type" content="article"><meta property="og:title" content="%s"><meta property="og:description" content="%s">'
            '<meta property="og:url" content="%s"><meta property="og:image" content="%s"><meta property="og:locale" content="ht_HT">'
            '<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/logo-mark.png">%s<style>%s</style>'
            '<script type="application/ld+json">%s</script>%s</head><body>'
            % (e(title), e(desc), url, e(title), e(desc), url, IMG, FONTS, CSS, json.dumps(ld, ensure_ascii=False), ga))


def iso_minutes(length):
    try:
        return 'PT%dM' % int(length.split()[0])
    except Exception:
        return None


def study_page(s, all_s):
    url = SITE + '/kreyol/etid/%s/' % s['slug']
    mp3 = '/assets/audio/bible-study/%s.mp3' % s['slug']
    audio = {'@type': 'AudioObject', 'name': s['title'], 'description': s['desc'], 'contentUrl': SITE + mp3,
             'encodingFormat': 'audio/mpeg', 'inLanguage': 'ht', 'uploadDate': s['date']}
    if iso_minutes(s['length']):
        audio['duration'] = iso_minutes(s['length'])
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': s['title'], 'description': s['desc'], 'inLanguage': 'ht',
         'datePublished': s['date'], 'url': url, 'mainEntityOfPage': url, 'image': IMG,
         'author': {'@type': 'Organization', 'name': 'Etid Biblik Shekinah'},
         'publisher': {'@type': 'Organization', 'name': 'Shekinah Haitian Seventh-day Adventist Church', 'url': SITE,
                       'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/logo-mark.png'}},
         'audio': audio},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Akèy', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Etid Biblik an Kreyòl', 'item': SITE + '/kreyol/etid/'},
            {'@type': 'ListItem', 'position': 3, 'name': s['title'], 'item': url}]}]}
    p = [head(s['seo_title'], s['desc'], url, ld), HEADER, '<main>']
    p.append('<div class="crumbs"><a href="/">Akèy</a> › <a href="/kreyol/etid/">Etid Biblik an Kreyòl</a></div>')
    p.append('<span class="tag">Koute</span><span class="tag">Kreyòl</span>')
    p.append('<h1>%s</h1><div class="meta">Etid Biblik Shekinah · %s · %s</div>' % (e(s['title']), e(s['date_ht']), e(s['length'])))
    if s.get('crisis'):
        p.append('<div class="crisis"><strong>Si w ap panse fè tèt ou mal:</strong> Ozetazini, rele oswa voye tèks nan <a href="tel:988">988</a>, a nenpòt ki lè. '
                 'Nan lòt peyi, rele sèvis ijans lan oswa ale nan lopital ki pi pre a. Lavi ou gen anpil valè.</div>')
    p.append('<div class="player"><audio controls preload="metadata" src="%s" aria-label="%s"></audio>'
             '<p>Etid odyo an Kreyòl ak de animatè. Koute l kounye a oswa pataje l ak fanmi ou.</p></div>' % (mp3, e(s['title'])))
    for para in s['summary']:
        p.append('<p>%s</p>' % e(para))
    p.append('<h2>Sa w ap aprann</h2><ul>%s</ul>' % ''.join('<li>%s</li>' % e(x) for x in s['points']))
    p.append('<h2>Vèsè biblik nan etid la</h2><ul class="verses">%s</ul>' % ''.join('<li>%s</li>' % e(v) for v in s['verses']))
    p.append('<h2>Kesyon pou reflechi ak fanmi ou</h2><ol>%s</ol>' % ''.join('<li>%s</li>' % e(q) for q in s['questions']))
    p.append('<div class="cta"><a class="btn" href="/prayer-request/">Voye yon demann priyè</a>'
             '<a class="btn alt" href="/kreyol/planifye-vizit/">Vin vizite nou yon Samdi</a></div>')
    others = [o for o in all_s if o['slug'] != s['slug']][:4]
    p.append('<h2>Lòt etid an Kreyòl</h2><div class="cards">%s</div>' % ''.join(card(o) for o in others))
    p.append('</main>' + FOOTER + '</body></html>\n')
    return ''.join(p)


def card(s):
    return ('<a class="card" href="/kreyol/etid/%s/"><h3>%s</h3><span>%s · %s</span><p>%s</p></a>'
            % (s['slug'], e(s['title']), e(s['date_ht']), e(s['length']), e(s['summary'][0][:170].rsplit(' ', 1)[0] + '…')))


def hub(all_s):
    url = SITE + '/kreyol/etid/'
    title = 'Etid Biblik an Kreyòl: odyo gratis | Legliz Shekinah'
    desc = 'Etid biblik gratis an Kreyòl ayisyen pou koute: Saba a, lanmò ak rezirèksyon, dezyèm vini Jezi, lapriyè, padon, gerizon ak plis ankò.'
    ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Etid Biblik an Kreyòl', 'description': desc,
          'inLanguage': 'ht', 'url': url,
          'hasPart': [{'@type': 'Article', 'headline': s['title'], 'url': SITE + '/kreyol/etid/%s/' % s['slug']} for s in all_s]}
    p = [head(title, desc, url, ld), HEADER, '<main>']
    p.append('<h1>Etid Biblik an Kreyòl</h1>')
    p.append('<p>Etid biblik gratis pou koute an Kreyòl, ak kesyon, ti blag, ak anpil espwa. Chak etid gen yon rezime, vèsè biblik yo, '
             'ak kesyon pou pale ladan yo ak fanmi ou. Si ou vle etidye ak yon moun, <a href="/bible-study/">mande yon etid pèsonèl</a>.</p>')
    p.append('<div class="cards">%s</div>' % ''.join(card(s) for s in all_s))
    p.append('<div class="cta"><a class="btn" href="/kreyol/planifye-vizit/">Vin vizite nou yon Samdi</a>'
             '<a class="btn alt" href="/prayer-request/">Voye yon demann priyè</a></div>')
    p.append('</main>' + FOOTER + '</body></html>\n')
    return ''.join(p)


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(content)


def build():
    all_s = sorted(load(), key=lambda s: s['date'], reverse=True)
    for s in all_s:
        write('kreyol/etid/%s/index.html' % s['slug'], study_page(s, all_s))
    write('kreyol/etid/index.html', hub(all_s))
    return len(all_s)


if __name__ == '__main__':
    print('built', build(), 'kreyol study pages')
