#!/usr/bin/env python3
"""Add finished blog articles to the site.

Usage: python3 _build/add_posts.py <folder>
The folder holds one <slug>.md (article body in the house format, see ARTICLE_SPEC.md)
and one <slug>.json per article with keys: cat, title, slug, author, date, seoTitle,
metaDesc, excerpt, verse, keywords [primary, secondary...], factcheck [two passes], featured {id,name,username,alt},
images [{id,name,username,alt}, ...], and "replace": true only when updating an existing slug.
Every article must pass _build/guardrails.py (duplicates, double fact check, keywords, AEO, SEO).
New posts get the next free id (p16, p17 ...) and go to the top of the blog, newest first.
An article whose slug already exists replaces that post in place (same id, same URL).
Updates content-defaults.json, the POSTS list, photo credits and featured photos in every
built page, creates blog/<slug>/index.html for new posts, and adds them to sitemap.xml.
The nightly rebuild later replaces the new pages with fully pre-rendered HTML.
"""
import json, re, sys, os, glob, subprocess, html as H
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seo as SEO  # noqa: E402
import guardrails as GR  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SITE = 'https://shekinahsda.org'
VALID_CATS = {'Bible Answers', 'Devotional', 'Health', 'Recipes'}


def slugify(t):
    return re.sub(r'[^a-z0-9]+', '-', re.sub(r"['’]", '', (t or '').lower())).strip('-')[:70]


def body(path):
    out = []
    for b in re.split(r'\n\s*\n', open(path, encoding='utf-8').read().strip()):
        lines = [l.strip() for l in b.splitlines() if l.strip()]
        if len(lines) > 1 and all(l.startswith(('[[', '![')) for l in lines):
            out += lines
        else:
            out.append(' '.join(lines))
    return out


def read_time(b):
    words = sum(len(x.split()) for x in b if not x.startswith(('[[', '!')))
    return '%d min read' % max(1, round(words / 230))


def check(meta, b, path):
    errs = []
    for k in ('cat', 'title', 'slug', 'author', 'date', 'seoTitle', 'metaDesc', 'excerpt', 'verse', 'featured', 'images'):
        if not meta.get(k):
            errs.append('missing ' + k)
    if meta.get('cat') not in VALID_CATS:
        errs.append('bad category %r' % meta.get('cat'))
    if len(meta.get('seoTitle', '')) > 60:
        errs.append('seoTitle over 60 characters')
    for im in [meta.get('featured') or {}] + (meta.get('images') or []):
        if not re.fullmatch(r'\d{10,13}-[0-9a-f]{12}', im.get('id', '')):
            errs.append('bad Unsplash id %r' % im.get('id'))
    for p in b:
        if p.startswith(('#', '[[', '!', '>')):
            continue
        t = re.sub(r'https?://\S+', '', p).replace('Seventh-day', '')
        if re.search(r'[-–—]', t):
            errs.append('hyphen or dash in: ' + p[:60])
    if not any(x.startswith('[[link]]') for x in b):
        errs.append('needs a [[link]] card to a related article')
    if not any(x.startswith('[[source]]') for x in b):
        errs.append('needs [[source]] lines')
    if meta.get('cat') == 'Recipes' and '[[table]] Ingredient | Amount' not in b:
        errs.append('recipe needs a "[[table]] Ingredient | Amount" table')
    n = len(SEO.faqs({'title': meta.get('title', ''), 'body': b}))
    if n < 3:
        print('note: %s has only %d question headings; aim for 4 or more for AI answers' % (os.path.basename(path), n))
    if errs:
        raise SystemExit('%s:\n  ' % path + '\n  '.join(errs))


def main(folder):
    d = json.load(open('content-defaults.json', encoding='utf-8'))
    posts = d['posts']
    by_slug = {(p.get('slug') or slugify(p['title'])): p for p in posts}
    nums = [int(p['id'][1:]) for p in posts if re.fullmatch(r'p\d+', p['id'])]
    next_id = max(nums or [0]) + 1
    credits, feat, added, replaced = {}, {}, [], []
    for jf in sorted(glob.glob(os.path.join(folder, '*.json'))):
        meta = json.load(open(jf, encoding='utf-8'))
        md = jf[:-5] + '.md'
        b = body(md)
        check(meta, b, md)
        g_err, g_warn = GR.run(meta, b, posts)
        for w in g_warn:
            print('warning (%s): %s' % (os.path.basename(md), w))
        if g_err:
            raise SystemExit('%s failed the publishing guardrails:\n  ' % md + '\n  '.join(g_err))
        sl = meta['slug']
        p = {'id': None, 'slug': sl, 'cat': meta['cat'], 'title': meta['title'], 'date': meta['date'],
             'author': meta['author'], 'read': read_time(b), 'seoTitle': meta['seoTitle'],
             'metaDesc': meta['metaDesc'], 'excerpt': meta['excerpt'], 'body': b, 'verse': meta['verse']}
        if meta.get('keywords'):
            p['keywords'] = meta['keywords'] if isinstance(meta['keywords'], list) else [k.strip() for k in str(meta['keywords']).split(',') if k.strip()]
        if sl in by_slug:
            p['id'] = by_slug[sl]['id']
            posts[posts.index(by_slug[sl])] = p
            replaced.append(p)
        else:
            p['id'] = 'p%d' % next_id
            next_id += 1
            added.append(p)
        for im in [meta['featured']] + meta['images']:
            credits[im['id']] = [im['name'], im['username']]
        feat[p['id']] = meta['featured']['id']
    posts[:0] = added
    for p in added + replaced:
        if p.get('keywords'):
            GR.save_owner(p['keywords'][0], p['slug'])
    d['posts'] = posts
    json.dump(d, open('content-defaults.json', 'w', encoding='utf-8'), ensure_ascii=False)
    posts_js = ''.join('  ' + json.dumps(p, ensure_ascii=False) + ',\n' for p in posts)
    files = ['_build/index.src.html'] + [l for l in subprocess.check_output(['git', 'ls-files', '*.html']).decode().split() if not l.startswith('_build')]
    for f in files:
        s = open(f, encoding='utf-8').read()
        if 'let POSTS = [' not in s:
            continue
        a = s.index('let POSTS = [\n') + len('let POSTS = [\n')
        e = s.index('\n];', a) + 1
        s = s[:a] + posts_js + s[e:]
        m = re.search(r'const CREDITS = (\{.*?\});', s)
        c = json.loads(m.group(1)); c.update(credits)
        s = s[:m.start(1)] + json.dumps(c, ensure_ascii=False) + s[m.end(1):]
        m = re.search(r'const POST_IMG = (\{.*?\});', s)
        pi = json.loads(m.group(1)); pi.update(feat)
        s = s[:m.start(1)] + json.dumps(pi, ensure_ascii=False) + s[m.end(1):]
        open(f, 'w', encoding='utf-8').write(s)
    shell = open('404.html', encoding='utf-8').read()
    sm = open('sitemap.xml', encoding='utf-8').read()
    for p in added:
        url = SITE + '/blog/%s/' % p['slug']
        s = shell
        s = re.sub(r'<title>.*?</title>', '<title>%s</title>' % H.escape(p['seoTitle']), s, count=1, flags=re.S)
        s = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % H.escape(p['metaDesc'], quote=True), s, count=1)
        s = s.replace('<meta name="robots" content="noindex">', '<link rel="canonical" href="%s">' % url, 1)
        for k, v in (('og:type', 'article'), ('og:url', url), ('og:title', p['title']), ('og:description', p['metaDesc'])):
            s = re.sub(r'<meta property="%s" content="[^"]*">' % k, '<meta property="%s" content="%s">' % (k, H.escape(v, quote=True)), s, count=1)
        img = feat.get(p['id'])
        s = re.sub(r'<meta property="og:image" content="[^"]*">', '<meta property="og:image" content="%s">' % H.escape(SEO.img_url(img), quote=True), s, count=1)
        s = re.sub(r'<script type="application/ld\+json">\{"@context":"https://schema.org","@type":"FAQPage".*?</script>\n?', '', s, flags=re.S)
        anchor = '<meta name="twitter:card" content="summary_large_image">'
        s = s.replace(anchor, anchor + '\n' + SEO.post_meta_tags(p, url, img) + '\n' + SEO.ld_tags(SEO.post_schemas(p, url, img)), 1)
        os.makedirs('blog/' + p['slug'], exist_ok=True)
        open('blog/%s/index.html' % p['slug'], 'w', encoding='utf-8').write(s)
        if url not in sm:
            sm = sm.replace('</urlset>', '  <url><loc>%s</loc><lastmod>%s</lastmod><priority>0.7</priority></url>\n</urlset>' % (url, SEO.iso_date(p['date'])))
    open('sitemap.xml', 'w', encoding='utf-8').write(sm)
    for p in added:
        print('added', p['id'], p['cat'], p['slug'])
    for p in replaced:
        print('replaced', p['id'], p['cat'], p['slug'])


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
