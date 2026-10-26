#!/usr/bin/env python3
"""Pre-render the Shekinah site so search engines see real HTML on every page.

Reads src/index.html (the app template) and writes into github-upload/:
  index.html                     home
  <route>/index.html             about, ministries, blog, gallery, prayer-request,
                                 contact, plan-your-visit, beliefs, bible-study
  blog/<post-slug>/index.html    one page per blog post
  404.html                       app shell for any other path (e.g. new posts)
  sitemap.xml, robots.txt
"""
import json, os, re, subprocess, shutil, sys, urllib.request, html as H

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import seo as SEO  # noqa: E402
# Local layout: src/index.html -> github-upload/.  In the GitHub repo: _build/index.src.html -> repo root.
if os.path.exists(os.path.join(ROOT, 'index.src.html')):
    SRC = os.path.join(ROOT, 'index.src.html')
    OUT = os.path.dirname(ROOT)
else:
    SRC = os.path.join(ROOT, 'src', 'index.html')
    OUT = os.path.join(ROOT, 'github-upload')
STAGE = os.environ.get('PRERENDER_DIR', '/tmp/claude-0/prerender')
CONTENT_URL = 'https://br-old-sea-b51wuht3-shekinah.compute.c-7.us-east-2.aws.neon.tech/content'
SITE = 'https://shekinahsda.org'
NAME = 'Shekinah Haitian SDA Church'

PAGES = {
  'home': ('/', 'Haitian Seventh-day Adventist Church, Alvarado TX | Shekinah',
           'Shekinah is a Haitian Seventh-day Adventist church in Alvarado, TX. Join us every Saturday at 10 AM for Sabbath worship in Kreyòl, French, and English.',
           'Shekinah Haitian Seventh-day Adventist Church in Alvarado, TX'),
  'visit': ('/plan-your-visit/', 'Plan Your Visit | Shekinah Haitian SDA Church, Alvarado TX',
            'First time visiting a church in Alvarado, TX? See Sabbath service times, what to expect, and kids at Shekinah, with worship in Kreyòl, French, and English.',
            'Plan Your First Visit to Shekinah Haitian SDA Church'),
  'about': ('/about/', 'About Us | Shekinah Haitian SDA Church in Alvarado, TX',
            'Meet Shekinah Haitian Seventh-day Adventist Church in Alvarado, Texas: our story, our pastor, and the church family that welcomes you every Sabbath.',
            'About Shekinah Haitian Seventh-day Adventist Church'),
  'ministries': ('/ministries/', 'Ministries | Shekinah Haitian SDA Church in Alvarado, TX',
                 'Children, youth, women, music, evangelism, and community service ministries at Shekinah Haitian Seventh-day Adventist Church in Alvarado, Texas.',
                 'Ministries at Shekinah Haitian SDA Church'),
  'blog': ('/blog/', 'Blog | Shekinah Haitian SDA Church',
           'Bible answers, devotionals, health tips, and recipes from Shekinah Haitian Seventh-day Adventist Church in Alvarado, Texas.',
           'Blog from Shekinah Haitian SDA Church'),
  'gallery': ('/gallery/', 'Photo Gallery | Shekinah Haitian SDA Church',
              'Photos of worship, youth, outreach, and fellowship at Shekinah Haitian Seventh-day Adventist Church in Alvarado, Texas.',
              'Photo Gallery of Shekinah Haitian SDA Church'),
  'prayer': ('/prayer-request/', 'Prayer Request | Shekinah Haitian SDA Church',
             'Share a prayer request with the prayer team at Shekinah Haitian Seventh-day Adventist Church. You can stay anonymous or keep your request private.',
             'Send a Prayer Request to Shekinah'),
  'contact': ('/contact/', 'Contact Us | Shekinah Haitian SDA Church in Alvarado, TX',
              'Contact Shekinah Haitian Seventh-day Adventist Church at 205 E Carver St, Alvarado, TX 76009. Questions, pastoral visits, Bible studies, and more.',
              'Contact Shekinah Haitian SDA Church'),
  'beliefs': ('/beliefs/', 'What Seventh-day Adventists Believe | Shekinah SDA Church',
              'Learn what Seventh-day Adventists believe: the Bible, salvation by grace, the Sabbath, baptism, and the hope of Jesus’ return, from Shekinah in Alvarado, TX.',
              'What Seventh-day Adventists Believe'),
  'resources': ('/resources/', 'Free Help and Community Resources | Shekinah SDA Church',
            'Free help for food, rent, utilities, health care, legal aid, and crisis support near Alvarado and Fort Worth, plus tools to find help in any state.',
            'Community Resources and Free Help'),
  'give': ('/give/', 'Give | Shekinah Haitian SDA Church in Alvarado, TX',
           'Give tithe and offerings to Shekinah Haitian SDA Church in Alvarado, TX through Adventist Giving, Cash App, Zelle, by mail, or in person.',
           'Give to Shekinah Haitian SDA Church'),
  'membership': ('/membership/', 'Membership Transfers | Shekinah Haitian SDA Church',
                 'Transfer your Seventh-day Adventist membership to or from Shekinah Haitian SDA Church in Alvarado, TX with one short request form.',
                 'Membership Transfers at Shekinah Haitian SDA Church'),
  'bible': ('/bible-study/', 'Free Bible Study in Alvarado, TX | Shekinah Haitian SDA',
            'Request a free Bible study in Kreyòl, French, or English with Shekinah Haitian Seventh-day Adventist Church. Meet at church in Alvarado, by phone, or online.',
            'Free Bible Study with Shekinah Haitian SDA Church'),
}


def slugify(s):
    s = (s or '').lower()
    s = re.sub(r"['’]", '', s)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s[:70]


def seo(key):
    path, title, desc, og = PAGES[key]
    return {'title': title, 'desc': desc, 'url': SITE + path, 'ogTitle': og}


src = open(SRC, encoding='utf-8').read()
POSTS = json.load(open(os.path.join(OUT, 'content-defaults.json'), encoding='utf-8'))['posts']
# Live content saved from the admin (posts, sermons, ministries) wins over the defaults.
try:
    LIVE = json.loads(urllib.request.urlopen(CONTENT_URL, timeout=20).read().decode('utf-8'))
    if not isinstance(LIVE, dict):
        LIVE = {}
except Exception as e:
    if os.environ.get('REQUIRE_LIVE'):
        raise SystemExit('could not load live content, stopping so nothing is lost: %s' % e)
    print('live content not loaded, using defaults:', e)
    LIVE = {}
if isinstance(LIVE.get('posts'), list) and LIVE['posts']:
    POSTS = LIVE['posts']
for p in POSTS:
    p['_slug'] = p.get('slug') or slugify(p['title']) or p['id']

# ---- 1. Pull SEO tags out of the <helmet> block; they go into the real <head> per page ----
hs, he = src.index('<helmet>'), src.index('</helmet>')
helmet = src[hs:he]
ld = re.findall(r'<script type="application/ld\+json">.*?</script>', helmet, re.S)
for pat in [r'<title>.*?</title>\n?', r'<meta name="description"[^>]*>\n?', r'<meta name="keywords"[^>]*>\n?',
            r'<meta property="og:[^"]*"[^>]*>\n?', r'<script type="application/ld\+json">.*?</script>\n?']:
    helmet = re.sub(pat, '', helmet, flags=re.S)
template_src = (src[:hs] + helmet + src[he:]).replace('<html>', '<html lang="en">', 1)
ld = [SEO.refresh_church_events(x) for x in ld]
SITE_FAQ = [x for x in ld if '"FAQPage"' in x]
ld = [x for x in ld if '"FAQPage"' not in x]
try:  # The Plan Your Visit page shows these questions, so its FAQ markup matches what visitors see.
    _vt = json.loads(re.search(r'const VT = (\{.*?\});\n', src, re.S).group(1))['en']['faqs']
    SITE_FAQ = [SEO.ld_tags([{'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in _vt]}])]
except Exception as e:
    print('visit FAQ not found, keeping site FAQ:', e)
POST_IMG = json.loads(re.search(r'const POST_IMG = (\{.*?\});', src).group(1))
SEO_PAGES_JS = json.dumps({k: seo(k) for k in PAGES}, ensure_ascii=False)


def head_block(s, extra_ld=None, noindex=False, key=None, post=None):
    parts = ['<base href="/">',
             '<title>%s</title>' % H.escape(s['title']),
             '<meta name="description" content="%s">' % H.escape(s['desc'], quote=True)]
    if noindex:
        parts.append('<meta name="robots" content="noindex">')
    else:
        parts.append('<link rel="canonical" href="%s">' % s['url'])
    parts += [
        '<meta property="og:type" content="%s">' % ('article' if extra_ld else 'website'),
        '<meta property="og:site_name" content="%s">' % NAME,
        '<meta property="og:url" content="%s">' % s['url'],
        '<meta property="og:title" content="%s">' % H.escape(s['ogTitle'], quote=True),
        '<meta property="og:description" content="%s">' % H.escape(s['desc'], quote=True),
        '<meta property="og:image" content="%s">' % (SEO.img_url(POST_IMG.get(post['id'])) if post else SITE + '/assets/church/church-01.jpg'),
        '<meta name="twitter:card" content="summary_large_image">',
    ] + ([SEO.post_meta_tags(post, s['url'], POST_IMG.get(post['id']))] if post else []) + [
        '<link rel="icon" href="/assets/logo-mark.png">',
        '<style>x-dc{display:none!important}#ssr .ssr-slot{display:block}</style>',
        '<script>window.__SEO_PAGES=%s;window.__SEO_HOME=window.__SEO_PAGES.home;window.__SEO_VISIT=window.__SEO_PAGES.visit;</script>' % SEO_PAGES_JS,
    ] + ld + (SITE_FAQ if key == 'visit' else []) + ([extra_ld] if extra_ld else [])
    return '\n'.join(parts) + '\n'


def assemble(s, ssr_html, extra_ld=None, noindex=False, key=None, post=None):
    h = template_src
    anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    assert h.count(anchor) == 1
    h = h.replace(anchor, anchor + head_block(s, extra_ld, noindex, key, post))
    xs, xe = h.index('<x-dc>'), h.index('</x-dc>') + len('</x-dc>')
    boot = ('<script>(function(){var t=document.getElementById("dc-src");if(t)t.replaceWith(t.content);'
            'var o=new MutationObserver(function(){var r=document.getElementById("dc-root");'
            'if(r&&r.childElementCount){var s=document.getElementById("ssr");if(s)s.remove();o.disconnect();}});'
            'o.observe(document.documentElement,{childList:true,subtree:true});})();</script>')
    ssr = '<div id="ssr">' + ssr_html + '</div>\n' if ssr_html else ''
    return h[:xs] + ssr + '<template id="dc-src">' + h[xs:xe] + '</template>' + boot + h[xe:]


def clean_ssr(markup):
    m = re.sub(r'<script\b.*?</script>', '', markup, flags=re.S)
    m = re.sub(r'<image-slot\b[^>]*>.*?</image-slot>', '<div class="ssr-slot" aria-hidden="true"></div>', m, flags=re.S)
    m = re.sub(r'<image-slot\b[^>]*/?>', '<div class="ssr-slot" aria-hidden="true"></div>', m)
    m = re.sub(r'\sdata-edit-ctl(="")?', ' hidden', m)
    return m


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(content)


# ---- 2. Render every route with a headless browser ----
routes = [(k, PAGES[k][0]) for k in PAGES] + [('post:' + p['_slug'], '/blog/%s/' % p['_slug']) for p in POSTS]
stage = STAGE
if os.path.exists(stage):
    shutil.rmtree(stage)
os.makedirs(stage)
for f in os.listdir(OUT):
    pth = os.path.join(OUT, f)
    if os.path.isfile(pth) and f not in ('index.html', '404.html') and not f.startswith('.'):
        shutil.copy(pth, stage)
shutil.copytree(os.path.join(OUT, 'assets'), os.path.join(stage, 'assets'))
anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
open(os.path.join(stage, 'app.html'), 'w', encoding='utf-8').write(src.replace(anchor, anchor + '<base href="/">\n'))
json.dump(routes, open(os.path.join(stage, 'routes.json'), 'w'))
json.dump(LIVE, open(os.path.join(stage, 'content.json'), 'w'))
render = subprocess.run(['node', os.path.join(ROOT, 'render.js')], capture_output=True, text=True, timeout=600)
if render.returncode != 0:
    raise SystemExit(render.stdout[-3000:] + render.stderr[-3000:])
snaps = json.load(open(os.path.join(stage, 'snaps.json'), encoding='utf-8'))

# ---- 3. Write pages ----
for key, path in routes:
    html = clean_ssr(snaps[key])
    if os.environ.get('KEEP_SSR_PAGES') and not key.startswith('post:') and key != 'blog':
        # Manual runs without the live admin content: keep the page body that the last nightly build rendered.
        old = os.path.join(OUT, path.lstrip('/') + 'index.html')
        if os.path.exists(old):
            o = open(old, encoding='utf-8').read()
            a, b = o.find('<div id="ssr">'), o.find('</div>\n<template id="dc-src">')
            if a >= 0 and b > a:
                html = o[a + len('<div id="ssr">'):b]
    if key.startswith('post:'):
        p = next(x for x in POSTS if 'post:' + x['_slug'] == key)
        s = {'title': p.get('seoTitle') or '%s | %s' % (p['title'], NAME), 'desc': p.get('metaDesc') or p.get('excerpt') or PAGES['blog'][2],
             'url': SITE + path, 'ogTitle': p['title']}
        extra = SEO.ld_tags(SEO.post_schemas(p, SITE + path, POST_IMG.get(p['id'])))
        page = assemble(s, html, extra, post=p)
    else:
        page = assemble(seo(key), html, key=key)
    write(path.lstrip('/') + 'index.html', page)

write('404.html', assemble(seo('home'), '', noindex=True))

write('sitemap.xml', SEO.sitemap([(SITE + PAGES[k][0], '1.0' if k == 'home' else '0.8') for k in PAGES],
                                 [(SITE + '/blog/%s/' % p['_slug'], p.get('date')) for p in POSTS]))
for p in POSTS:
    p['_url'] = SITE + '/blog/%s/' % p['_slug']
write('llms.txt', SEO.llms_txt([(PAGES[k][3], SITE + PAGES[k][0], PAGES[k][2]) for k in PAGES], POSTS))
write('llms-full.txt', SEO.llms_full(POSTS))
# Old URLs from the previous website that Google still has. Each gets a tiny page that
# sends visitors and Google to the matching new page (meta refresh 0 acts like a 301).
LEGACY = {
  'about-us.html': '/about/', 'contact-us.html': '/contact/', 'oursponsers.html': '/',
  'church-event.html': '/blog/', 'event/blogs.html': '/blog/',
  'public.html': '/', 'public/index.html': '/', 'ministry/index.html': '/ministries/',
  'event/index.html': '/blog/', 'public/ministry/index.html': '/ministries/', 'public/event/index.html': '/blog/', 'public/prayer-request.html': '/prayer-request/',
  'public/church-event.html': '/blog/', 'public/event/blogs.html': '/blog/',
  'public/contact-us.html': '/contact/', 'public/about-us.html': '/about/',
}
for i in range(1, 9):
    LEGACY['ministry/%d.html' % i] = '/ministries/'
    LEGACY['public/ministry/%d.html' % i] = '/ministries/'
for rel, to in LEGACY.items():
    u = SITE + to
    write(rel, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Moved | %s</title>'
               '<link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s">'
               '<script>location.replace("%s")</script></head><body><p>This page has moved to '
               '<a href="%s">%s</a>.</p></body></html>\n' % (NAME, u, u, to, u, u))

write('robots.txt', 'User-agent: *\nDisallow: /admin.html\nAllow: /\n\n# Search engines and AI assistants are welcome to read and cite our articles.\n# A plain text guide for AI tools is at %s/llms.txt\n\nSitemap: %s/sitemap.xml\n' % (SITE, SITE))
print('built', len(routes), 'pages')
