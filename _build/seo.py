"""Search and AI crawler helpers shared by build.py and add_posts.py.

Everything here is generated from the article itself (title, body blocks, dates, photos),
so every existing and future post gets the same structured data without extra work:
  BlogPosting (ISO dates, image, section, word count), BreadcrumbList,
  FAQPage from the article's own question headings, Recipe for recipe posts,
  per article Open Graph and Twitter tags, sitemap lastmod, llms.txt and llms-full.txt.
"""
import datetime as DT, html as H, json, re

SITE = 'https://shekinahsda.org'
ORG = 'Shekinah Haitian Seventh-day Adventist Church'
LOGO = SITE + '/assets/logo-mark.png'
MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def iso_date(s):
    """'Oct 26, 2026' or 'October 26, 2026' or '2026-10-26' -> '2026-10-26' ('' if unknown)."""
    s = (s or '').strip()
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return m.group(0)
    m = re.match(r'([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})', s)
    if m and m.group(1).lower() in MONTHS:
        return '%s-%02d-%02d' % (m.group(3), MONTHS[m.group(1).lower()], int(m.group(2)))
    return ''


def img_url(pid, w=1200):
    return 'https://images.unsplash.com/photo-%s?auto=format&fit=crop&w=%d&q=80' % (pid, w) if pid else SITE + '/assets/church/church-01.jpg'


def plain(t):
    """Strip the light markdown used in post bodies."""
    t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t or '')
    t = re.sub(r'[*_`]+', '', t)
    return re.sub(r'\s+', ' ', t).strip()


def is_text(b):
    return not b.startswith(('#', '[[', '!', '>'))


def word_count(body):
    return sum(len(plain(x).split()) for x in body if is_text(x) or x.startswith('>'))


def faqs(p, limit=10):
    """Question headings in the article plus the paragraph(s) that answer them."""
    body, out, seen = p.get('body') or [], [], set()

    def answer_after(i):
        parts = []
        for x in body[i + 1:]:
            if x.startswith('#'):
                break
            if is_text(x):
                parts.append(plain(x))
                if len(' '.join(parts)) > 280 or len(parts) == 2:
                    break
        return ' '.join(parts)

    title = plain(p.get('title', ''))
    for i, x in enumerate(body):
        h = re.match(r'#{2,3}\s+(.*)', x)
        if not h:
            continue
        q = plain(h.group(1))
        if q.lower().startswith('the short answer') and title.endswith('?'):
            q = title.split(':')[0] if title.split(':')[0].endswith('?') else title
        elif not q.endswith('?'):
            continue
        a = answer_after(i)
        if a and q.lower() not in seen:
            seen.add(q.lower())
            out.append((q, a))
        if len(out) >= limit:
            break
    return out


def _dur(v):
    """'1 hour 15 min' -> 'PT1H15M' ('' if not a time)."""
    v = (v or '').lower()
    h = re.search(r'(\d+)\s*(h|hour)', v)
    m = re.search(r'(\d+)\s*(m|min)', v)
    if not (h or m):
        return ''
    return 'PT' + ('%dH' % int(h.group(1)) if h else '') + ('%dM' % int(m.group(1)) if m else '')


def recipe(p, url, image):
    body = p.get('body') or []
    try:
        start = body.index('[[table]] Ingredient | Amount')
    except ValueError:
        return None
    ings = []
    for x in body[start + 1:]:
        if not x.startswith('[[table]]'):
            break
        cells = [c.strip() for c in x[9:].split('|')]
        if len(cells) >= 2:
            ings.append(plain('%s %s' % (cells[1], cells[0])) if not cells[1].lower().startswith('to taste') else plain(cells[0] + ', to taste'))
    steps = []
    for x in body[start:]:
        if x.startswith('[[steps]]'):
            for st in x[9:].split('||'):
                t, _, d = st.partition('|')
                if t.strip():
                    steps.append({'@type': 'HowToStep', 'name': plain(t), 'text': plain(d or t)})
            break
    if not ings:
        return None
    r = {'@context': 'https://schema.org', '@type': 'Recipe', 'name': plain(p['title'].split(':')[0]),
         'description': p.get('metaDesc') or p.get('excerpt', ''), 'image': [image],
         'author': {'@type': 'Person', 'name': p.get('author', ORG)}, 'datePublished': iso_date(p.get('date')),
         'recipeIngredient': ings, 'suitableForDiet': 'https://schema.org/VeganDiet', 'url': url,
         'keywords': 'plant based, vegan, Adventist, ' + p['title'].split(':')[0]}
    if steps:
        r['recipeInstructions'] = steps
    if re.search(r'Haiti|Kreyòl|epis|joumou|pikliz|legim|diri ak pwa', ' '.join(body), re.I):
        r['recipeCuisine'] = 'Haitian'
    for x in body:
        if x.startswith('[[stats]]'):
            for tile in x[9:].split('||'):
                v, _, label = tile.partition('|')
                label, v = label.strip().lower(), v.strip()
                if label.startswith('prep') and _dur(v):
                    r['prepTime'] = _dur(v)
                elif label.startswith('cook') and _dur(v):
                    r['cookTime'] = _dur(v)
                elif label.startswith('total') and _dur(v):
                    r['totalTime'] = _dur(v)
                elif label.startswith(('makes', 'serves', 'servings', 'yield')):
                    r['recipeYield'] = v
            break
    return r


def post_schemas(p, url, img_id, modified=None):
    image = img_url(img_id)
    pub = iso_date(p.get('date'))
    org = {'@type': 'Organization', 'name': ORG, 'url': SITE, 'logo': {'@type': 'ImageObject', 'url': LOGO}}
    art = {'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': plain(p['title'])[:110],
           'description': p.get('metaDesc') or p.get('excerpt', ''), 'image': [image],
           'author': {'@type': 'Person', 'name': p.get('author', ORG)}, 'publisher': org,
           'datePublished': pub, 'dateModified': iso_date(p.get('updated')) or modified or pub,
           'mainEntityOfPage': {'@type': 'WebPage', '@id': url}, 'url': url, 'inLanguage': 'en-US',
           'articleSection': p.get('cat', ''), 'wordCount': word_count(p.get('body') or []),
           'isPartOf': {'@type': 'Blog', 'name': 'Shekinah Blog', 'url': SITE + '/blog/'},
           'about': {'@type': 'Thing', 'name': p.get('cat', '')}}
    if p.get('keywords'):
        art['keywords'] = p['keywords'] if isinstance(p['keywords'], str) else ', '.join(p['keywords'])
    out = [art, {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': SITE + '/blog/'},
        {'@type': 'ListItem', 'position': 3, 'name': plain(p['title']), 'item': url}]}]
    qa = faqs(p)
    if len(qa) >= 2:
        out.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in qa]})
    if p.get('cat') == 'Recipes':
        r = recipe(p, url, image)
        if r:
            out.append(r)
    return out


def ld_tags(objs):
    return '\n'.join('<script type="application/ld+json">%s</script>' % json.dumps(o, ensure_ascii=False).replace('</', '<\\/') for o in objs)


def post_meta_tags(p, url, img_id, alt=None):
    """Extra social and article tags for a post page (og:image etc. are replaced by the caller)."""
    e = lambda v: H.escape(v or '', quote=True)
    pub = iso_date(p.get('date'))
    tags = ['<meta property="og:image:alt" content="%s">' % e(alt or plain(p['title'])),
            '<meta property="og:image:width" content="1200">',
            '<meta property="article:section" content="%s">' % e(p.get('cat')),
            '<meta property="article:author" content="%s">' % e(p.get('author')),
            '<meta name="author" content="%s">' % e(p.get('author')),
            '<meta name="twitter:title" content="%s">' % e(plain(p['title'])),
            '<meta name="twitter:description" content="%s">' % e(p.get('metaDesc') or p.get('excerpt')),
            '<meta name="twitter:image" content="%s">' % e(img_url(img_id)),
            '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">']
    if pub:
        tags.insert(1, '<meta property="article:published_time" content="%s">' % pub)
    return '\n'.join(tags)


def next_weekday(today, weekday):
    return today + DT.timedelta(days=(weekday - today.weekday()) % 7)


def refresh_church_events(ld_html, today=None):
    """Keep the Church schema's next Sabbath dates in the future (they were hard coded)."""
    today = today or DT.date.today()
    sat = next_weekday(today, 5).isoformat()
    return re.sub(r'"startDate":"\d{4}-\d{2}-\d{2}T', '"startDate":"%sT' % sat, ld_html)


def sitemap(pages, posts, today=None):
    """pages: [(url, priority)], posts: [(url, date_str)]"""
    today = (today or DT.date.today()).isoformat()
    rows = ['  <url><loc>%s</loc><priority>%s</priority></url>' % (u, pr) for u, pr in pages]
    rows += ['  <url><loc>%s</loc><lastmod>%s</lastmod><priority>0.7</priority></url>' % (u, iso_date(d) or today) for u, d in posts]
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(rows) + '\n</urlset>\n'


FACTS = """Shekinah Haitian Seventh-day Adventist Church is a Haitian Seventh-day Adventist congregation at 205 E Carver St, Alvarado, Texas 76009, serving Johnson County and the Dallas Fort Worth area (Burleson, Mansfield, Cleburne, Fort Worth).

- Sabbath School: Saturday 10:00 AM
- Divine Worship Service: Saturday 11:00 AM
- Prayer meeting: online on Zoom, Tuesday and Wednesday 7:30 PM Central (Meeting ID 818 9375 1524, passcode 123)
- Worship languages: Haitian Creole (Kreyòl), French, and English
- The church family shares a meal after the Sabbath service
- Live worship: https://www.youtube.com/@SHEKINAHHaitianSDA
- Email: info@shekinahsda.org
- Phone: (888) 219-3842
- Beliefs: the 28 Fundamental Beliefs of the Seventh-day Adventist Church (https://www.adventist.org/beliefs/)"""


def llms_txt(pages, posts):
    """pages: [(title, url, desc)], posts: list of post dicts with '_url'."""
    out = ['# Shekinah Haitian Seventh-day Adventist Church', '',
           '> A welcoming Haitian Seventh-day Adventist church in Alvarado, Texas, with Bible centered articles on Bible questions, devotionals, Christian health, and plant based Haitian recipes. Doctrinal articles follow the official Seventh-day Adventist Fundamental Beliefs and quote the King James Version.',
           '', FACTS, '', '## Key pages', '']
    out += ['- [%s](%s): %s' % (t, u, d) for t, u, d in pages]
    for cat in ('Bible Answers', 'Devotional', 'Health', 'Recipes'):
        ps = [p for p in posts if p.get('cat') == cat]
        if ps:
            out += ['', '## %s' % cat, '']
            out += ['- [%s](%s): %s' % (plain(p['title']), p['_url'], plain(p.get('metaDesc') or p.get('excerpt', ''))) for p in ps]
    out += ['', '## Optional', '', '- [Full text of every article](%s/llms-full.txt): all blog articles in plain markdown for AI tools' % SITE, '- [Sitemap](%s/sitemap.xml)' % SITE, '']
    return '\n'.join(out)


def block_md(x):
    if x.startswith('[[source]]'):
        t, _, u = x[10:].partition('|')
        return '- Source: [%s](%s)' % (t.strip(), u.strip())
    if x.startswith('[[link]]'):
        t, _, u = x[8:].partition('|')
        return 'Related: [%s](%s%s)' % (t.strip(), SITE, u.strip())
    if x.startswith('[[table]]'):
        return '| ' + ' | '.join(c.strip() for c in x[9:].split('|')) + ' |'
    if x.startswith('[[time]]'):
        return '- ' + ': '.join(c.strip() for c in x[8:].split('|'))
    m = re.match(r'\[\[(stats|callout|steps)\]\]\s*(.*)', x)
    if m:
        items = [i.strip() for i in m.group(2).split('||')]
        if m.group(1) == 'callout':
            return '**%s**\n' % items[0] + '\n'.join('- ' + i for i in items[1:])
        return '\n'.join('- ' + ' : '.join(c.strip() for c in i.split('|')) for i in items)
    if x.startswith('[[week]]'):
        return ''
    if x.startswith('!['):
        return ''
    return x


def llms_full(posts):
    out = ['# Shekinah Haitian Seventh-day Adventist Church: full blog text', '', FACTS, '']
    for p in posts:
        out += ['', '---', '', '# %s' % plain(p['title']), '',
                'URL: %s' % p['_url'], 'Category: %s' % p.get('cat', ''), 'Author: %s' % p.get('author', ''),
                'Published: %s' % (iso_date(p.get('date')) or p.get('date', '')), '', plain(p.get('excerpt', '')), '']
        prev_table = False
        for x in p.get('body') or []:
            md = block_md(x)
            if not md:
                continue
            is_table = x.startswith('[[table]]')
            if is_table and not prev_table:
                out.append('')
                out.append(md)
                out.append('|' + ' --- |' * (md.count('|') - 1))
            elif is_table:
                out.append(md)
            else:
                out += ['', md]
            prev_table = is_table
        if p.get('verse'):
            out += ['', '> ' + p['verse']]
    return '\n'.join(out) + '\n'
