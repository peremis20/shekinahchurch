#!/usr/bin/env python3
"""Build one Kreyòl page per Bible study audio, plus a hub page.

Reads _build/kreyol-studies.json and writes:
  kreyol/etid/index.html            hub listing every Kreyòl audio study
  kreyol/<slug>/index.html     one page per study (player, summary, points, verses, questions)
Also exposes sitemap_rows() so build.py keeps these URLs in sitemap.xml.

Run from anywhere: python3 _build/kreyol_pages.py
"""
import json, os, re, html as H

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(ROOT)
SITE = 'https://shekinahsda.org'
DATA = os.path.join(ROOT, 'kreyol-studies.json')
GA = 'G-DBRNW7DHZH'
IMG = SITE + '/assets/church/church-01.jpg'


def load():
    return json.load(open(DATA, encoding='utf-8'))


def kreyol_posts(posts=None):
    """Kreyol blog articles (not merged into a study) so the hub can list them. /kreyol/ is the one home for Kreyol content."""
    if posts is None:
        try:
            posts = json.load(open(os.path.join(OUT, 'content-defaults.json'), encoding='utf-8')).get('posts', [])
        except Exception:
            posts = []
    studies = {s['slug'] for s in load()}
    out = []
    for p in posts:
        t = p.get('title') or ''
        slug = p.get('_slug') or p.get('slug') or p.get('id')
        is_ht = p.get('lang') == 'ht' or re.search('[òè]', t) or re.search(r'\b(Kisa|Kijan|Bib la|Bondye|pou m)\b', t)
        if is_ht and slug and slug not in studies:
            out.append({'slug': slug, 'title': t, 'excerpt': p.get('excerpt') or p.get('metaDesc') or ''})
    return out


def read_card(p):
    return ('<div class="card"><a class="stretch" href="/blog/%s/"><h3>%s</h3></a><span>Atik pou li</span><p>%s</p><b class="more">Li atik la →</b></div>'
            % (p['slug'], e(p['title']), e(p['excerpt'])))


def sitemap_rows():
    rows = [(SITE + '/kreyol/', None)]
    rows += [(SITE + '/kreyol/%s/' % s['slug'], s.get('updated', s['date'])) for s in load()]
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
.body h2{margin-top:34px}.body p{margin:0 0 14px}.body h3{font-size:18px;color:var(--navy);margin:22px 0 6px}
.q{margin:6px 0 18px;padding:16px 20px;border-left:4px solid var(--gold);background:var(--cream);border-radius:0 12px 12px 0}.q p{margin:0 0 8px;font-size:17px;font-style:italic}.q cite{font-size:13px;color:#5d6a80;font-style:normal}
.pnote{font-size:14px;color:#5d6a80;margin-top:20px}.q a{color:inherit}
.pray{margin:0 0 14px;padding:14px 18px;border:1px solid var(--line);border-radius:12px;background:#fff}.pray strong{display:block;color:var(--navy);margin-bottom:4px}.pray p{margin:0}
.crisis{background:#FFF4E5;border:1px solid #F0C98A;border-radius:12px;padding:14px 16px;margin:0 0 20px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.btn{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;font-weight:800;border-radius:40px;padding:12px 22px}
.btn.alt{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:16px;margin-top:20px}
.card{display:flex;flex-direction:column;gap:8px;padding:18px;border-radius:14px;background:var(--cream);border:1px solid var(--line);text-decoration:none;color:inherit}
.card h3{margin:0;font-family:'Libre Baskerville',serif;color:var(--navy);font-size:17px;line-height:1.35}
.card span{font-size:13px;font-weight:700;color:var(--gold)}
.card p{margin:0;font-size:15px}
.card b.more{margin-top:auto;color:#0E4A36;font-size:15px}
.card{position:relative}
.card a.stretch{color:inherit;text-decoration:none}.card a.stretch:after{content:"";position:absolute;inset:0;border-radius:14px}
.card a.stretch:focus-visible{outline:none}.card:has(a.stretch:focus-visible){outline:3px solid var(--gold);outline-offset:2px}
.card:hover{border-color:var(--gold)}
.play{position:relative;z-index:2;display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:10px}
.play button{flex:none;width:46px;height:46px;border-radius:50%;border:0;background:var(--navy);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 12px rgba(19,41,75,.25);transition:transform .15s}
.play button:hover{transform:scale(1.06)}
.play button svg{width:20px;height:20px;fill:currentColor}
.play b{font-size:15px;color:var(--navy);line-height:1.2}
.play small{display:block;font-size:13px;color:#5d6a80;font-weight:600}
.play .prog{display:block;height:4px;border-radius:4px;background:var(--line);margin-top:6px;overflow:hidden;width:140px;padding:0}
.play .prog i{display:block;height:100%;width:0;background:var(--gold)}
footer{background:var(--navy);color:#cfd6e3;font-size:14px}
footer .bar{padding:22px 20px}footer a{color:#fff}
"""

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Mulish:wght@400;600;700;800&display=swap" rel="stylesheet">')

HEADER = ('<header><div class="bar"><a class="brand" href="/"><img src="/assets/logo-mark-light.png" alt="" width="36" height="36">Shekinah</a>'
          '<nav><a href="/kreyol/">Etid Biblik</a>'
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


ART_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kreyol-articles')


def load_article(slug):
    f = os.path.join(ART_DIR, slug + '.json')
    if not os.path.exists(f):
        return None
    d = json.load(open(f, encoding='utf-8'))
    return d if d.get('sections') else None


def article_words(art):
    out = []
    for sec in art['sections']:
        out.append(sec['h'])
        for x in sec['p']:
            out.append(x if isinstance(x, str) else ' '.join(str(v) for k, v in x.items() if k != 'cite'))
        for f in sec.get('faq', []):
            out += [f['q'], f['a']]
    return len(' '.join(out).split())


def study_page(s, all_s):
    url = SITE + '/kreyol/%s/' % s['slug']
    mp3 = '/assets/audio/bible-study/%s.mp3' % s['slug']
    audio = {'@type': 'AudioObject', 'name': s['title'], 'description': s['desc'], 'contentUrl': SITE + mp3,
             'encodingFormat': 'audio/mpeg', 'inLanguage': 'ht', 'uploadDate': s['date']}
    if iso_minutes(s['length']):
        audio['duration'] = iso_minutes(s['length'])
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': s['title'], 'description': s['desc'], 'inLanguage': 'ht',
         'datePublished': s['date'], 'dateModified': s.get('updated', s['date']), 'url': url, 'mainEntityOfPage': url, 'image': IMG,
         'author': {'@type': 'Organization', 'name': 'Etid Biblik Shekinah'},
         'publisher': {'@type': 'Organization', 'name': 'Shekinah Haitian Seventh-day Adventist Church', 'url': SITE,
                       'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/logo-mark.png'}},
         'audio': audio, **({'wordCount': article_words(load_article(s['slug']))} if load_article(s['slug']) else {})},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Akèy', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Etid Biblik an Kreyòl', 'item': SITE + '/kreyol/'},
            {'@type': 'ListItem', 'position': 3, 'name': s['title'], 'item': url}]}]}
    faqs = [f for sec in (load_article(s['slug']) or {}).get('sections', []) for f in sec.get('faq', [])]
    if faqs:
        ld['@graph'].append({'@type': 'FAQPage', 'inLanguage': 'ht', 'mainEntity': [
            {'@type': 'Question', 'name': f['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': f['a']}} for f in faqs]})
    p = [head(s['seo_title'], s['desc'], url, ld), HEADER, '<main>']
    p.append('<div class="crumbs"><a href="/">Akèy</a> › <a href="/kreyol/">Etid Biblik an Kreyòl</a></div>')
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
    art = load_article(s['slug'])
    if art:
        p.append('<article class="body">')
        for sec in art['sections']:
            p.append('<h2>%s</h2>' % e(sec['h']))
            for x in sec['p']:
                if isinstance(x, str):
                    p.append('<p>%s</p>' % e(x))
                elif 'quote' in x:
                    cite = e(x.get('cite', ''))
                    if x.get('bsa'):
                        cite += (', Bib Sen An, © 2017, 2023 Ron Smith (<a href="https://ebible.org/hatbsa/">ebible.org</a>), lisans '
                                 '<a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license">Creative Commons Attribution ShareAlike 4.0</a>')
                    p.append('<blockquote class="q"><p>%s</p><cite>%s</cite></blockquote>' % (e(x['quote']), cite))
                elif 'prayer' in x:
                    p.append('<div class="pray"><strong>%s</strong><p>%s</p></div>' % (e(x['prayer']), e(x['text'])))
            for f in sec.get('faq', []):
                p.append('<h3>%s</h3><p>%s</p>' % (e(f['q']), e(f['a'])))
        if any(isinstance(x, dict) and 'quote' in x for sec in art['sections'] for x in sec['p']):
            p.append('<p class="pnote">Vèsè ki pa nan blòk sitasyon yo se parafraz an Kreyòl. Li yo nan Bib ou pou w wè kontèks yo.</p>')
        p.append('</article>')
    p.append('<h2>Vèsè biblik nan etid la</h2><ul class="verses">%s</ul>' % ''.join('<li>%s</li>' % e(v) for v in s['verses']))
    p.append('<h2>Kesyon pou reflechi ak fanmi ou</h2><ol>%s</ol>' % ''.join('<li>%s</li>' % e(q) for q in s['questions']))
    p.append('<div class="cta"><a class="btn" href="/prayer-request/">Voye yon demann priyè</a>'
             '<a class="btn alt" href="/kreyol/planifye-vizit/">Vin vizite nou yon Samdi</a></div>')
    rel = [o for sl in s.get('related', []) for o in all_s if o['slug'] == sl]
    others = (rel + [o for o in all_s if o['slug'] != s['slug'] and o not in rel])[:4]
    p.append('<h2>Lòt etid an Kreyòl</h2><div class="cards">%s</div>' % ''.join(card(o) for o in others))
    p.append('</main>' + FOOTER + PLAY_JS + '</body></html>\n')
    return ''.join(p)


PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'


def card(s):
    mp3 = '/assets/audio/bible-study/%s.mp3' % s['slug']
    return ('<div class="card"><a class="stretch" href="/kreyol/%s/"><h3>%s</h3></a><span>%s · %s</span><p>%s</p>'
            '<div class="play"><button type="button" data-src="%s" data-slug="%s" aria-label="Koute: %s">%s</button>'
            '<div><b>Koute etid la</b><small data-l="%s">Odyo · %s</small><span class="prog"><i></i></span></div></div></div>'
            % (s['slug'], e(s['title']), e(s['date_ht']), e(s['length']), e(s['summary'][0][:170].rsplit(' ', 1)[0] + '…'),
               mp3, s['slug'], e(s['title']), PLAY_ICON, e(s['length']), e(s['length'])))


PLAY_JS = ('<script>(function(){var a=new Audio(),cur=null,P=%s,S=%s;a.preload="none";'
           'function t(x){x=Math.floor(x||0);return Math.floor(x/60)+":"+("0"+x%%60).slice(-2);}'
           'function ui(b,on){b.innerHTML=on?S:P;b.setAttribute("aria-pressed",on?"true":"false");var c=b.closest(".play");c.querySelector("b").textContent=on?"Ap jwe kounye a":"Koute etid la";}'
           'document.addEventListener("click",function(e){var b=e.target.closest(".play button");if(!b)return;e.preventDefault();'
           'if(cur===b){if(a.paused){a.play();ui(b,1);}else{a.pause();ui(b,0);}return;}'
           'if(cur){ui(cur,0);}cur=b;a.src=b.getAttribute("data-src");a.play();ui(b,1);'
           'if(window.gtag)gtag("event","audio_play",{study:b.getAttribute("data-slug"),place:"card"});});'
           'a.addEventListener("timeupdate",function(){if(!cur)return;var c=cur.closest(".play");'
           'c.querySelector(".prog i").style.width=(a.duration?100*a.currentTime/a.duration:0)+"%%";'
           'c.querySelector("small").textContent=t(a.currentTime)+(a.duration?" / "+t(a.duration):"");});'
           'a.addEventListener("ended",function(){if(cur){ui(cur,0);var c=cur.closest(".play");c.querySelector("small").textContent="Odyo · "+c.querySelector("small").getAttribute("data-l");}});'
           '})();</script>') % (json.dumps(PLAY_ICON), json.dumps(PAUSE_ICON))


def hub(all_s, posts=None):
    url = SITE + '/kreyol/'
    title = 'Etid Biblik an Kreyòl: odyo gratis | Legliz Shekinah'
    desc = 'Etid biblik gratis an Kreyòl ayisyen pou koute: Saba a, lanmò ak rezirèksyon, dezyèm vini Jezi, lapriyè, padon, gerizon ak plis ankò.'
    ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Etid Biblik an Kreyòl', 'description': desc,
          'inLanguage': 'ht', 'url': url,
          'hasPart': [{'@type': 'Article', 'headline': s['title'], 'url': SITE + '/kreyol/%s/' % s['slug']} for s in all_s]}
    p = [head(title, desc, url, ld), HEADER, '<main>']
    p.append('<h1>Etid Biblik an Kreyòl</h1>')
    p.append('<p>Etid biblik gratis pou koute an Kreyòl, ak kesyon, ti blag, ak anpil espwa. Chak etid gen yon rezime, vèsè biblik yo, '
             'ak kesyon pou pale ladan yo ak fanmi ou. Si ou vle etidye ak yon moun, <a href="/bible-study/">mande yon etid pèsonèl</a>.</p>')
    p.append('<h2 id="odyo">Etid odyo</h2>')
    p.append('<div class="cards">%s</div>' % ''.join(card(s) for s in all_s))
    arts = kreyol_posts(posts)
    watch = ('<div class="card"><a class="stretch" href="https://www.youtube.com/@SHEKINAHHaitianSDA/streams" target="_blank" rel="noopener"><h3>Sèvis Saba ak mesaj biblik</h3></a>'
             '<span>Videyo sou YouTube</span><p>Gade sèvis adorasyon nou yo ak mesaj biblik yo an Kreyòl, an franse ak an angle.</p><b class="more">Gade videyo yo ↗</b></div>')
    p.append('<h2 id="li-ak-gade">Li ak gade</h2>')
    p.append('<div class="cards">%s%s</div>' % (''.join(read_card(a) for a in arts), watch))
    p.append('<p style="margin-top:22px"><a href="/bible-study/" lang="en"><b>Read our Bible studies in English →</b></a></p>')
    p.append('<div class="cta"><a class="btn" href="/kreyol/planifye-vizit/">Vin vizite nou yon Samdi</a>'
             '<a class="btn alt" href="/prayer-request/">Voye yon demann priyè</a></div>')
    p.append('</main>' + FOOTER + PLAY_JS + '</body></html>\n')
    return ''.join(p)


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(content)


def build(posts=None):
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('kreyol_lint', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools', 'kreyol_lint.py'))
        lint = importlib.util.module_from_spec(spec); spec.loader.exec_module(lint)
        for w in lint.lint():
            print('KREYOL LINT:', w)
    except Exception as ex:
        print('kreyol lint skipped:', ex)
    all_s = sorted(load(), key=lambda s: s['date'], reverse=True)
    for s in all_s:
        write('kreyol/%s/index.html' % s['slug'], study_page(s, all_s))
    write('kreyol/index.html', hub(all_s, posts))
    for slug in [''] + [x['slug'] + '/' for x in all_s]:
        to = '/kreyol/' + slug
        write('kreyol/etid/%sindex.html' % slug, '<!doctype html><html lang="ht"><head><meta charset="utf-8"><title>Etid Biblik Shekinah</title>'
              '<link rel="canonical" href="%s%s"><meta http-equiv="refresh" content="0; url=%s"><script>location.replace("%s")</script>'
              '</head><body><a href="%s">%s%s</a></body></html>\n' % (SITE, to, to, to, to, SITE, to))
    return len(all_s)


if __name__ == '__main__':
    print('built', build(), 'kreyol study pages')


def llms_section():
    """Markdown list of the Kreyol studies for llms.txt (AI assistants)."""
    out = ['', '## Etid Biblik an Kreyòl (Haitian Creole Bible studies: audio plus full article)', '',
           '- [Etid Biblik an Kreyòl](%s/kreyol/): all Haitian Creole audio Bible studies with summaries, articles and Bible verses' % SITE]
    for s in sorted(load(), key=lambda s: s['date'], reverse=True):
        out.append('- [%s](%s/kreyol/%s/): %s' % (s['title'], SITE, s['slug'], s['desc']))
    return '\n'.join(out) + '\n'


def llms_full_section():
    """Full text of every Kreyol study for llms-full.txt."""
    out = []
    for s in sorted(load(), key=lambda s: s['date'], reverse=True):
        out += ['', '---', '', '# %s' % s['title'], '', 'URL: %s/kreyol/%s/' % (SITE, s['slug']),
                'Language: Haitian Creole (ht)', 'Audio: %s/assets/audio/bible-study/%s.mp3 (%s)' % (SITE, s['slug'], s['length']),
                'Published: %s' % s['date'] + ('  Updated: %s' % s['updated'] if s.get('updated') else ''), '']
        out += s['summary']
        out += ['', '## Sa w ap aprann', ''] + ['- ' + x for x in s['points']]
        art = load_article(s['slug'])
        if art:
            for sec in art['sections']:
                out += ['', '## ' + sec['h'], '']
                for x in sec['p']:
                    if isinstance(x, str):
                        out += [x, '']
                    elif 'quote' in x:
                        out += ['> ' + x['quote'], '> (' + x.get('cite', '') + (', Bib Sen An, CC BY SA 4.0' if x.get('bsa') else '') + ')', '']
                    elif 'prayer' in x:
                        out += ['**%s:** %s' % (x['prayer'], x['text']), '']
                for q in sec.get('faq', []):
                    out += ['### ' + q['q'], '', q['a'], '']
        out += ['', 'Vèsè: ' + ', '.join(s['verses'])]
    return '\n'.join(out) + '\n'

