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
.bar{max-width:880px;margin:0 auto;padding:14px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
.bar a{color:#fff;text-decoration:none;font-weight:700}
.brand{display:flex;align-items:center;gap:10px;font-family:'Libre Baskerville',serif;font-size:17px}
.brand img{width:auto;height:46px;display:block}
nav{display:flex;gap:10px 26px;flex-wrap:wrap;justify-content:center;font-size:15px}
@media (max-width:640px){nav{gap:10px 18px}}
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
.cmds{margin:0 0 18px;padding-left:26px}.cmds li{margin:0 0 6px}.pray{margin:0 0 14px;padding:14px 18px;border:1px solid var(--line);border-radius:12px;background:#fff}.pray strong{display:block;color:var(--navy);margin-bottom:4px}.pray p{margin:0}
.crisis{background:#FFF4E5;border:1px solid #F0C98A;border-radius:12px;padding:14px 16px;margin:0 0 20px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.btn{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;font-weight:800;border-radius:40px;padding:12px 22px}
.btn.alt{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.study-cta{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;font-weight:700;color:var(--navy);margin:16px 0 0}.study-cta .btn{background:#E2B85C;color:var(--navy)}.study-cta .btn:hover{background:#d6a83f}
.listen-box{margin:22px 0 4px;padding:18px 20px;border-radius:14px;background:var(--cream);border:1px solid var(--line)}.listen-box b{color:var(--navy);font-size:17px}.listen-box p{margin:4px 0 12px}
.listen{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.lbtn{display:inline-flex;align-items:center;gap:8px;background:#1DB954;color:#fff;text-decoration:none;font-weight:800;border-radius:40px;padding:10px 18px}.lbtn svg{width:20px;height:20px}.lbtn.cb{background:#F55B23}.lbtn.ap{background:#872EC4}.lbtn.am{background:#25D1DA;color:#0B1B33}.lbtn.alt{background:transparent;color:var(--navy);border:2px solid var(--line)}
.hub-h1{position:relative;padding-bottom:18px;margin-bottom:22px}.hub-h1:after{content:"";position:absolute;left:0;bottom:0;width:132px;height:6px;border-radius:4px;background:#E2B85C}
.hub-lead{font-size:18px;line-height:1.65;max-width:900px}
.pod{display:grid;grid-template-columns:250px 1fr;gap:26px;align-items:center;margin:30px 0 8px;padding:24px;border-radius:24px;background:#F8F1E6;border:1px solid #EFE3CF;box-shadow:0 6px 24px rgba(20,33,61,.06)}
.pod img{width:100%;height:auto;border-radius:18px;display:block;object-fit:cover;aspect-ratio:306/229}
.pod-b{border-left:1px solid #E3D3B6;padding-left:26px}.pod-b h2{font-family:'Libre Baskerville',serif;color:var(--navy);font-size:clamp(22px,3vw,30px);margin:0 0 8px}.pod-b p{margin:0 0 20px;font-size:17px}
.pod-r{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.pod-btn{display:inline-flex;align-items:center;gap:14px;background:#1B2D5A;color:#fff;text-decoration:none;font-weight:800;font-size:18px;border-radius:40px;padding:12px 20px;white-space:nowrap}.pod-btn svg{width:24px;height:24px}.pod-btn b{font-size:20px;margin-left:4px}.pod-btn:hover{background:#13234A}
.pod-i{display:flex;gap:10px;margin-left:auto}.pod-i a{display:block;width:44px;height:44px;border-radius:14px;transition:transform .15s}.pod-i a:hover{transform:translateY(-2px)}.pod-i svg,.pod-i img{width:44px;height:44px;display:block;border-radius:10px}
.hub-h2{margin-top:44px;font-size:clamp(24px,3.4vw,32px)}
.tpills{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0 0;justify-content:flex-start}.tpills button{border:0;cursor:pointer;font:inherit;font-weight:700;font-size:16px;border-radius:40px;padding:12px 26px;background:#F6F0E6;color:var(--navy)}.tpills button span{font-weight:600;margin-left:4px}.tpills button.on{background:#1B2D5A;color:#fff;padding:12px 34px}
.tline{border:0;border-top:1px solid #E6E1D6;margin:24px 0 0}
@media (max-width:760px){.pod{grid-template-columns:1fr;gap:18px;padding:18px}.pod-b{border-left:0;padding-left:0}.pod-i{margin-left:0}.pod-btn{width:100%;justify-content:center}.tpills{gap:10px}.tpills button{padding:10px 18px;font-size:15px}.tpills button.on{padding:10px 22px}}
.fond{margin-top:8px}.fond>h3.theme-h{font-size:26px}.fstep{margin-top:6px}.fstep-n{display:inline-block;background:#E2B85C;color:var(--navy);font-family:Mulish,system-ui,sans-serif;font-weight:900;font-size:13px;letter-spacing:.6px;text-transform:uppercase;border-radius:20px;padding:3px 12px;margin-right:8px;vertical-align:middle}
.card.fcard{position:relative;padding-left:58px}.card .fnum{position:absolute;left:16px;top:18px;width:30px;height:30px;border-radius:50%;background:var(--navy);color:#fff!important;font-weight:900;font-size:14px;display:grid;place-items:center}
.fcard.soon{background:#fff;border-style:dashed;opacity:.85}.fcard.soon .fnum{background:#B9C2D0}.fcard.soon>span:not(.fnum){font-weight:800;color:#8A5A00}
.themes{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 4px}.themes a{background:var(--navy);color:#fff;text-decoration:none;font-weight:800;border-radius:40px;padding:10px 18px}.themes small{opacity:.75;font-weight:700;margin-left:4px}
.theme-h{font-family:'Libre Baskerville',serif;color:var(--navy);font-size:20px;margin:30px 0 4px;scroll-margin-top:16px}.theme-d{margin:0;color:var(--muted,#5D6A80)}
a.tag{text-decoration:none}
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

HEADER = ('<header><div class="bar"><a class="brand" href="/"><img src="/assets/logo-dark.png?v=4" alt="Shekinah Haitian Seventh-day Adventist Church" width="168" height="46"></a>'
          '<nav><a href="/kreyol/">Etid Biblik</a>'
          '<a href="/kreyol/planifye-vizit/">Planifye vizit ou</a><a href="/prayer-request/">Demann priyè</a></nav></div></header>')

FOOTER_SIMPLE = ('<footer><div class="bar"><span>Legliz Advantis Setyèm Jou Ayisyen Shekinah · 205 E Carver St, Alvarado, TX 76009 · '
          'Lekòl Saba 10:00 AM, Sèvis adorasyon 11:00 AM chak Samdi</span><a href="/">shekinahsda.org</a></div></footer>')


def main_footer():
    """The Kreyol pages use the SAME footer as the rest of the site (Jimmy, Nov 10, 2026).
    It is copied from the home page that build.py just rendered, so it stays in step with the main footer."""
    try:
        h = open(os.path.join(OUT, 'index.html'), encoding='utf-8').read()
        a, b = h.find('<div id="ssr">'), h.find('</div>\n<template id="dc-src">')
        body = h[a:b]
        f = body[body.rindex('<footer'):body.rindex('</footer>') + 9]
        f = re.sub(r'\sdata-dc-tpl="\d+"', '', f).replace('src="assets/', 'src="/assets/')
        f = re.sub(r'<span class="scp\w+"([^>]*)>Give</span>', r'<a href="/give/"\1>Give</a>', f)
        f = re.sub(r'\sclass="scp\w+"', '', f)
        if 'foot-grid' not in f or 'Service Times' not in f:
            raise ValueError('unexpected footer')
        src = open(os.path.join(ROOT, 'index.src.html'), encoding='utf-8').read()
        css = ''
        for l in src.split('\n'):  # every footer rule of the main stylesheet, with its media query
            if l.startswith('@media') and 'foot-' in l:
                mq, inner = l[:l.index('{')], l[l.index('{') + 1:l.rindex('}')]
                rules = ''.join('%s{%s}' % r for r in re.findall(r'([^{}]+)\{([^{}]*)\}', inner) if 'foot-' in r[0])
                css += '%s{%s}' % (mq, rules)
        ep = re.search(r"formEndpoint: '([^']+)'", src).group(1)
        js = ('<script>(function(){var w=document.querySelector(".foot-connect");if(!w)return;var b=w.querySelector("button"),i=document.getElementById("nl-email"),hp=document.getElementById("hp-nl1");'
              'if(!b||!i)return;var busy=0;function done(){b.parentNode.outerHTML=\'<span style="font-size:15px;font-weight:700;color:#E2B85C">Thank you! You\\\'re subscribed.</span>\';}'
              'b.addEventListener("click",function(){var e=(i.value||"").trim();if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(e)){alert("Please enter a valid email address.");return;}'
              'if(hp&&hp.value){done();return;}if(busy)return;busy=1;'
              'fetch(%s,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"newsletter",email:e})})'
              '.then(function(r){if(!r.ok)throw 0;if(window.gtag)gtag("event","newsletter_signup");done();})'
              '.catch(function(){alert("Sorry, your message could not be sent. Please try again.");}).then(function(){busy=0;});});})();</script>') % json.dumps(ep)
        return ('<style>footer.site{font-size:16px;margin-top:0;line-height:normal}footer.site a{text-decoration:none}footer.site a[href]:hover{color:#E2B85C !important}footer.site input,footer.site button{font-family:inherit;font-size:15px;cursor:pointer}footer.site input{cursor:text}' + css + '</style>'
                + f.replace('<footer ', '<footer class="site" ', 1) + js)
    except Exception as ex:
        print('main footer not copied, using the simple footer:', ex)
        return FOOTER_SIMPLE


FOOTER = FOOTER_SIMPLE


def head(title, desc, url, ld):
    ga = ('<script async src="https://www.googletagmanager.com/gtag/js?id=%s"></script>'
          '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());var shkIn=false;try{shkIn=localStorage.getItem("shk_internal")==="1"}catch(e){}gtag("config","%s",shkIn?{traffic_type:"internal"}:{});</script>' % (GA, GA))
    return ('<!doctype html><html lang="ht"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>%s</title><meta name="description" content="%s"><link rel="canonical" href="%s"><link rel="alternate" type="application/rss+xml" title="Shekinah Haitian SDA Church (podcast)" href="https://shekinahsda.org/podcast/kreyol.xml">'
            '<meta property="og:type" content="article"><meta property="og:title" content="%s"><meta property="og:description" content="%s">'
            '<meta property="og:url" content="%s"><meta property="og:image" content="%s"><meta property="og:locale" content="ht_HT">'
            '<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.ico?v=3" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=3"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png?v=3"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">%s<style>%s</style>'
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
            out.append(x if isinstance(x, str) else ' '.join(x['list']) if 'list' in x else ' '.join(str(v) for k, v in x.items() if k != 'cite'))
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
                       'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/logo-mark.png?v=4'}},
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
    p.append('<span class="tag">Koute</span><span class="tag">Kreyòl</span>' + (
        '<a class="tag" href="/kreyol/#%s">Tèm: %s</a>' % (s['theme'], e(THEME_NAME[s['theme']])) if s.get('theme') in THEME_NAME else ''))
    p.append('<h1>%s</h1><div class="meta">Etid Biblik Shekinah · %s · %s</div>' % (e(s['title']), e(s['date_ht']), e(s['length'])))
    if s.get('crisis'):
        p.append('<div class="crisis"><strong>Si w ap panse fè tèt ou mal:</strong> Ozetazini, rele oswa voye tèks nan <a href="tel:988">988</a>, a nenpòt ki lè. '
                 'Nan lòt peyi, rele sèvis ijans lan oswa ale nan lopital ki pi pre a. Lavi ou gen anpil valè.</div>')
    p.append('<div class="player"><audio controls preload="metadata" src="%s" aria-label="%s"></audio>'
             '<p>Etid odyo an Kreyòl ak de animatè. Koute l kounye a oswa pataje l ak fanmi ou.</p>%s</div>' % (mp3, e(s['title']), listen_row(True)))
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
                        cite += ', Bib Sen An'
                    p.append('<blockquote class="q"><p>%s</p><cite>%s</cite></blockquote>' % (e(x['quote']), cite))
                elif 'list' in x:
                    p.append('<ol class="cmds">%s</ol>' % ''.join('<li>%s</li>' % e(i) for i in x['list']))
                elif 'prayer' in x:
                    p.append('<div class="pray"><strong>%s</strong><p>%s</p></div>' % (e(x['prayer']), e(x['text'])))
            for f in sec.get('faq', []):
                p.append('<h3>%s</h3><p>%s</p>' % (e(f['q']), e(f['a'])))
        if any(isinstance(x, dict) and 'quote' in x for sec in art['sections'] for x in sec['p']):
            p.append('<p class="pnote">Vèsè ki pa nan blòk sitasyon yo se parafraz an Kreyòl. Li yo nan Bib ou pou w wè kontèks yo.</p>')
        if any(isinstance(x, dict) and x.get('bsa') for sec in art['sections'] for x in sec['p']):
            p.append('<p class="pnote">Sitasyon Bib Sen An: © 2017, 2023 Ron Smith (<a href="https://ebible.org/hatbsa/">ebible.org</a>), '
                     '<a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license">CC BY SA 4.0</a>.</p>')
        p.append('</article>')
    p.append('<h2>Vèsè biblik nan etid la</h2><ul class="verses">%s</ul>' % ''.join('<li>%s</li>' % e(v) for v in s['verses']))
    p.append('<h2>Kesyon pou reflechi ak fanmi ou</h2><ol>%s</ol>' % ''.join('<li>%s</li>' % e(q) for q in s['questions']))
    p.append('<div class="cta"><a class="btn" href="/prayer-request/">Voye yon demann priyè</a>'
             '<a class="btn alt" href="/kreyol/planifye-vizit/">Vin vizite nou yon Samdi</a></div>')
    rel = [o for sl in s.get('related', []) for o in all_s if o['slug'] == sl]
    same = [o for o in all_s if o.get('theme') == s.get('theme') and o['slug'] != s['slug'] and o not in rel]
    others = (rel + same + [o for o in all_s if o['slug'] != s['slug'] and o not in rel and o not in same])[:4]
    p.append('<h2>Lòt etid an Kreyòl</h2><div class="cards">%s</div>' % ''.join(card(o) for o in others))
    p.append('</main>' + FOOTER + PLAY_JS + '</body></html>\n')
    return ''.join(p)


PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'


# Podcast apps where the studies are listed (all four added; was: add Amazon when their links exist; see claude/podcast-links.md)
LISTEN = [('Spotify', 'https://open.spotify.com/show/6wV9OYkZTJ0G3z3FQ3CUUd'),
          ('Apple Podcasts', 'https://podcasts.apple.com/us/podcast/shekinah-haitian-sda-church/id6835701257'),
          ('Castbox', 'https://castbox.fm/channel/id7495794'),
          ('Amazon Music', 'https://music.amazon.com/podcasts/b8293e08-08a6-401f-abd1-1293cbf71c8c')]
FEED_URL = SITE + '/podcast/kreyol.xml'
POD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 2.6 1.4 4.8 3.5 6l.5-1.8A5 5 0 1 1 15 13.2l.5 1.8A7 7 0 0 0 12 2zm0 4a3 3 0 0 0-1.6 5.5l.6-.1h1.9l.6.1A3 3 0 0 0 12 6zm-1.4 7L9.5 21.5c-.1.3.2.5.5.5h4c.3 0 .6-.2.5-.5L13.4 13z"/></svg>'
APP_CLASS = {'Spotify': '', 'Castbox': ' cb', 'Apple Podcasts': ' ap', 'Amazon Music': ' am'}
SPOTIFY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zm4.8 15.15a.66.66 0 0 1-.9.22c-2.47-1.5-5.58-1.85-9.24-1.01a.66.66 0 1 1-.3-1.28c4-.92 7.43-.52 10.22 1.17.31.19.41.6.22.9zm1.28-2.86a.82.82 0 0 1-1.13.27c-2.83-1.74-7.14-2.24-10.48-1.23a.82.82 0 1 1-.48-1.57c3.82-1.16 8.57-.6 11.82 1.4.39.23.51.74.27 1.13zm.11-2.98C14.8 8.8 9.2 8.6 5.97 9.59a.98.98 0 1 1-.57-1.88c3.71-1.13 9.89-.91 13.79 1.4a.98.98 0 0 1-1 1.7z"/></svg>'


def listen_row(compact=False):
    btns = ''.join('<a class="lbtn%s" href="%s" target="_blank" rel="noopener">%s<span>Koute sou %s</span></a>' % (APP_CLASS.get(n, ''), u, SPOTIFY_SVG if n == 'Spotify' else POD_SVG, e(n)) for n, u in LISTEN)
    if compact:
        return '<div class="listen">%s</div>' % btns
    return ('<div class="listen-box"><b>Koute nou nan aplikasyon podcast ou</b><p>Tout etid yo disponib sou %s. Abòne pou w resevwa chak nouvo etid.</p>'
            '<div class="listen">%s</div></div>' % ((', '.join(n for n, _ in LISTEN[:-1]) + ' ak ' + LISTEN[-1][0]) if len(LISTEN) > 1 else LISTEN[0][0], btns))


# Official brand marks: Spotify, Apple Podcasts and Castbox paths from the simple-icons package (v16.38.0, brand colors);
# Amazon Music uses Amazon's own "Listen on Amazon Music" square badge (assets/podcast/amazon-music.png, from podcasters.amazon.com promo kit).
APP_ICON = {
    'Spotify': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1ED760" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>',
    'Apple Podcasts': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#9933CC" d="M5.34 0A5.328 5.328 0 000 5.34v13.32A5.328 5.328 0 005.34 24h13.32A5.328 5.328 0 0024 18.66V5.34A5.328 5.328 0 0018.66 0zm6.525 2.568c2.336 0 4.448.902 6.056 2.587 1.224 1.272 1.912 2.619 2.264 4.392.12.59.12 2.2.007 2.864a8.506 8.506 0 01-3.24 5.296c-.608.46-2.096 1.261-2.336 1.261-.088 0-.096-.091-.056-.46.072-.592.144-.715.48-.856.536-.224 1.448-.874 2.008-1.435a7.644 7.644 0 002.008-3.536c.208-.824.184-2.656-.048-3.504-.728-2.696-2.928-4.792-5.624-5.352-.784-.16-2.208-.16-3 0-2.728.56-4.984 2.76-5.672 5.528-.184.752-.184 2.584 0 3.336.456 1.832 1.64 3.512 3.192 4.512.304.2.672.408.824.472.336.144.408.264.472.856.04.36.03.464-.056.464-.056 0-.464-.176-.896-.384l-.04-.03c-2.472-1.216-4.056-3.274-4.632-6.012-.144-.706-.168-2.392-.03-3.04.36-1.74 1.048-3.1 2.192-4.304 1.648-1.737 3.768-2.656 6.128-2.656zm.134 2.81c.409.004.803.04 1.106.106 2.784.62 4.76 3.408 4.376 6.174-.152 1.114-.536 2.03-1.216 2.88-.336.43-1.152 1.15-1.296 1.15-.023 0-.048-.272-.048-.603v-.605l.416-.496c1.568-1.878 1.456-4.502-.256-6.224-.664-.67-1.432-1.064-2.424-1.246-.64-.118-.776-.118-1.448-.008-1.02.167-1.81.562-2.512 1.256-1.72 1.704-1.832 4.342-.264 6.222l.413.496v.608c0 .336-.027.608-.06.608-.03 0-.264-.16-.512-.36l-.034-.011c-.832-.664-1.568-1.842-1.872-2.997-.184-.698-.184-2.024.008-2.72.504-1.878 1.888-3.335 3.808-4.019.41-.145 1.133-.22 1.814-.211zm-.13 2.99c.31 0 .62.06.844.178.488.253.888.745 1.04 1.259.464 1.578-1.208 2.96-2.72 2.254h-.015c-.712-.331-1.096-.956-1.104-1.77 0-.733.408-1.371 1.112-1.745.224-.117.534-.176.844-.176zm-.011 4.728c.988-.004 1.706.349 1.97.97.198.464.124 1.932-.218 4.302-.232 1.656-.36 2.074-.68 2.356-.44.39-1.064.498-1.656.288h-.003c-.716-.257-.87-.605-1.164-2.644-.341-2.37-.416-3.838-.218-4.302.262-.616.974-.966 1.97-.97z"/></svg>',
    'Castbox': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F55B23" d="M12 0c-.29 0-.58.068-.812.206L2.417 5.392c-.46.272-.804.875-.804 1.408v10.4c0 .533.344 1.135.804 1.407l8.77 5.187c.465.275 1.162.275 1.626 0l8.77-5.187c.46-.272.804-.874.804-1.407V6.8c0-.533-.344-1.136-.804-1.408L12.813.206A1.618 1.618 0 0012 0zm-.85 8.304c.394 0 .714.303.714.676v2.224c0 .207.191.375.427.375s.428-.168.428-.375V9.57c0-.373.32-.675.713-.675.394 0 .712.302.712.675v4.713c0 .374-.318.676-.712.676-.394 0-.713-.302-.713-.676v-1.31c0-.206-.192-.374-.428-.374s-.427.168-.427.374v1.226c0 .374-.32.676-.713.676-.394 0-.713-.302-.713-.676v-1.667c0-.207-.192-.375-.428-.375-.235 0-.427.168-.427.375v3.31c0 .373-.319.676-.712.676-.394 0-.713-.303-.713-.676v-2.427c0-.206-.191-.374-.428-.374-.235 0-.427.168-.427.374v.178a.71.71 0 01-.712.708.71.71 0 01-.713-.708v-2.123a.71.71 0 01.713-.708.71.71 0 01.712.708v.178c0 .206.192.373.427.373.237 0 .428-.167.428-.373v-1.53c0-.374.32-.676.713-.676.393 0 .712.303.712.676v.646c0 .206.192.374.427.374.236 0 .428-.168.428-.374V8.98c0-.373.319-.676.713-.676zm4.562 2.416c.393 0 .713.302.713.676v2.691c0 .374-.32.676-.713.676-.394 0-.712-.303-.712-.676v-2.691c0-.374.319-.676.712-.676zm2.28 1.368c.395 0 .713.303.713.676v.67c0 .374-.318.676-.712.676-.394 0-.713-.302-.713-.675v-.67c0-.374.32-.677.713-.677Z"/></svg>',
    'Amazon Music': '<img src="/assets/podcast/amazon-music.png" alt="" width="48" height="48">',
}
HEADPHONES = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3" y="14" width="5" height="7" rx="2" fill="currentColor"/><rect x="16" y="14" width="5" height="7" rx="2" fill="currentColor"/></svg>'


def pod_card():
    names = [n for n, _ in LISTEN]
    apps = (', '.join(names[:-1]) + ' ak ' + names[-1]) if len(names) > 1 else names[0]
    icons = ''.join('<a href="%s" target="_blank" rel="noopener" aria-label="Koute sou %s" title="Koute sou %s">%s</a>' % (u, e(n), e(n), APP_ICON.get(n, '')) for n, u in LISTEN)
    return ('<section class="pod" aria-label="Podcast"><img src="/assets/kreyol/podcast-bible.webp" alt="Yon Bib louvri ak yon kas pou koute" width="306" height="229" loading="eager">'
            '<div class="pod-b"><h2>Koute etid yo sou podcast</h2><p>Tout etid yo disponib sou %s.</p>'
            '<div class="pod-r"><a class="pod-btn" href="#odyo">%s<span>Koute etid yo</span><b aria-hidden="true">&rarr;</b></a><div class="pod-i">%s</div></div></div></section>') % (apps, HEADPHONES, icons)


TF_JS = ('<script>(function(){var b=document.querySelectorAll("[data-tf]"),g=document.querySelectorAll(".tgrp");'
         'b.forEach(function(x){x.addEventListener("click",function(){var t=x.getAttribute("data-tf");'
         'b.forEach(function(y){y.classList.toggle("on",y===x);});g.forEach(function(s){s.style.display=!t||s.getAttribute("data-t")===t?"":"none";});});});})();</script>')


# Fondasyon series (Jimmy, Nov 16, 2026): one path from not knowing God to baptism and a strong Christian life.
# Each item is a study slug (existing audio) or a title still to record (shown as "Byento").
# Studies listed here show ONLY in Fondasyon on /kreyol/, not again under the themes.
FONDASYON = [
    ('Etap 1', 'Konnen Bondye ak konnen kiyès mwen ye', [
        'Kiyès Bondye ye?', 'eske-tout-relijyon-se-menm', 'kijan-pou-m-komanse-li-bib-la',
        'Kreyasyon an: kijan Bondye kreye moun', 'Kiyès mwen ye e poukisa m la?']),
    ('Etap 2', 'Konprann pwoblèm nan ak repons Bondye', [
        'poukisa-bondye-kite-soufrans-rive', 'eske-jezi-se-bondye', 'Sali pa lagras']),
    ('Etap 3', 'Aksepte Jezi epi batize', [
        'eske-bondye-ka-padone-m', 'Batèm', 'ki-moun-sentespri-a-ye']),
    ('Etap 4', 'Viv kòm yon nouvo kretyen', [
        'kijan-pou-m-priye', 'dis-komandman-bondye-yo', 'kisa-bib-la-di-sou-saba-a', 'kisa-advantis-yo-kwe',
        'Legliz la ak lavi kretyen']),
    ('Etap 5', 'Espwa ak lafwa ki fò', [
        'kisa-ki-rive-le-yon-moun-mouri', 'dezyem-vini-jezi', 'Pwochen etap ou']),
]


def fondasyon_html(by_slug):
    n, parts = 0, []
    for step, name, items in FONDASYON:
        cards = []
        for it in items:
            n += 1
            st = by_slug.get(it)
            if st:
                cards.append(card(st).replace('<div class="card">', '<div class="card fcard"><span class="fnum">%d</span>' % n, 1))
            else:
                cards.append('<div class="card fcard soon"><span class="fnum">%d</span><h3>%s</h3><span>Byento</span>'
                             '<p>Nou ap prepare etid sa a. Li pral disponib byento.</p></div>' % (n, e(it)))
        parts.append('<div class="fstep"><h3 class="theme-h"><span class="fstep-n">%s</span> %s</h3><div class="cards">%s</div></div>'
                     % (e(step), e(name), ''.join(cards)))
    return ''.join(parts)


FOND_SLUGS = {it for _, _, items in FONDASYON for it in items if '-' in it and ' ' not in it}


THEMES = [('gras', 'Gras Bondye', 'Kiyès Bondye ye, Jezi ak Sentespri a, padon ak lagras li ofri nou.'),
          ('verite', 'Verite Bib la', 'Sa Bib la anseye sou lanmò, retou Jezi, Saba a, lalwa Bondye ak pwofesi.'),
          ('lavi', 'Lavi kretyen', 'Lapriyè, li Bib la, espwa, gerizon ak fanmi nan lavi chak jou.')]
THEME_NAME = {k: n for k, n, _ in THEMES}


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
          'hasPart': [{'@type': 'Article', 'headline': s['title'], 'url': SITE + '/kreyol/%s/' % s['slug']} for s in all_s],
          'about': {'@type': 'PodcastSeries', 'name': 'Shekinah Haitian SDA Church', 'url': url, 'webFeed': FEED_URL, 'inLanguage': 'ht',
                    'image': SITE + '/assets/podcast/shekinah-podcast-cover.jpg', 'sameAs': [u for _, u in LISTEN],
                    'author': {'@type': 'Church', 'name': 'Shekinah Haitian Seventh-day Adventist Church', 'url': SITE + '/'}}}
    p = [head(title, desc, url, ld), HEADER, '<main>']
    p.append('<h1 class="hub-h1">Etid Biblik an Kreyòl</h1>')
    p.append('<p class="hub-lead">Etid biblik gratis pou koute an Kreyòl, ak kesyon, ti blag, ak anpil espwa. Chak etid gen yon rezime, vèsè biblik yo, '
             'ak kesyon pou pale ladan yo ak fanmi ou.</p>')
    p.append(pod_card())
    p.append('<h2 id="odyo" class="hub-h2">Etid odyo</h2>')
    by_slug = {x['slug']: x for x in all_s}
    fond_n = sum(1 for x in all_s if x['slug'] in FOND_SLUGS)
    rest = [x for x in all_s if x['slug'] not in FOND_SLUGS]
    p.append('<nav class="tpills" aria-label="Tèm yo"><button type="button" class="on" data-tf="">Tout etid</button>'
             '<button type="button" data-tf="fondasyon">Fondasyon <span>(%d)</span></button>%s</nav><hr class="tline">' % (fond_n, ''.join(
        '<button type="button" data-tf="%s">%s <span>(%d)</span></button>' % (k, e(n), c) for k, n, c in
        ((k, n, sum(1 for x in rest if x.get('theme') == k)) for k, n, _ in THEMES) if c)))
    p.append('<section class="tgrp fond" data-t="fondasyon"><h3 class="theme-h" id="fondasyon">Fondasyon</h3>'
             '<p class="theme-d">Yon chemen etap pa etap: konnen Bondye, aksepte Jezi, batize, epi grandi nan lafwa. '
             'Pou moun ki fèk ap chèche Bondye, ak pou kretyen ki vle yon lafwa ki pi fò. Koute yo nan lòd.</p>%s</section>' % fondasyon_html(by_slug))
    for k, n, d in THEMES:
        sub = [x for x in rest if x.get('theme') == k]
        if sub:
            p.append('<section class="tgrp" data-t="%s"><h3 class="theme-h" id="%s">%s</h3><p class="theme-d">%s</p>' % (k, k, e(n), e(d)))
            p.append('<div class="cards">%s</div></section>' % ''.join(card(x) for x in sub))
    p.append(TF_JS)
    other = [x for x in rest if x.get('theme') not in THEME_NAME]
    if other:
        p.append('<div class="cards">%s</div>' % ''.join(card(x) for x in other))
    arts = kreyol_posts(posts)
    watch = ('<div class="card"><a class="stretch" href="https://www.youtube.com/@SHEKINAHHaitianSDA/streams" target="_blank" rel="noopener"><h3>Sèvis Saba ak mesaj biblik</h3></a>'
             '<span>Videyo sou YouTube</span><p>Gade sèvis adorasyon nou yo ak mesaj biblik yo an Kreyòl, an franse ak an angle.</p><b class="more">Gade videyo yo ↗</b></div>')
    p.append('<h2 id="youtube">YouTube Videos</h2>')
    p.append('<div class="cards">%s%s</div>' % (''.join(read_card(a) for a in arts), watch))
    p.append('<p style="margin-top:22px"><a href="/bible-study/" lang="en"><b>Read our Bible studies in English →</b></a></p>')
    p.append('<p class="study-cta">Ou ta renmen etidye Bib la ak yon moun?<a class="btn" href="/contact/?topic=bible">Mande yon etid pèsonèl</a></p>')
    p.append('<div class="cta"><a class="btn" href="/kreyol/planifye-vizit/">Vin vizite nou yon Samdi</a>'
             '<a class="btn alt" href="/prayer-request/">Voye yon demann priyè</a></div>')
    p.append('</main>' + FOOTER + PLAY_JS + '</body></html>\n')
    return ''.join(p)


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(content)


def build(posts=None):
    global FOOTER
    FOOTER = main_footer()  # read again here: build.py has just rewritten the home page
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
    try:
        import podcast_feed
        print('podcast feed:', podcast_feed.build(), 'episodes')
    except Exception as ex:
        print('podcast feed skipped:', ex)
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
                    elif 'list' in x:
                        out += ['%d. %s' % (i + 1, t) for i, t in enumerate(x['list'])] + ['']
                    elif 'prayer' in x:
                        out += ['**%s:** %s' % (x['prayer'], x['text']), '']
                for q in sec.get('faq', []):
                    out += ['### ' + q['q'], '', q['a'], '']
        out += ['', 'Vèsè: ' + ', '.join(s['verses'])]
    return '\n'.join(out) + '\n'

