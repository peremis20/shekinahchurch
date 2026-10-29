"""Publishing guardrails for shekinahsda.org articles.

Called by add_posts.py before anything is written. Hard failures stop the publish.
Checks, in order:
  1. Duplicate content: same slug without "replace": true, a near identical title,
     overlapping body text, or a primary keyword already owned by another article
     (keyword cannibalization). Owners come from _build/keyword-map.json.
  2. Double fact check: meta["factcheck"] must hold two independent passes, both "pass".
  3. Keyword targeting: primary keyword (keywords[0]) in the title, seoTitle, slug,
     metaDesc and the first 100 words; 5+ secondary keywords; no keyword stuffing.
  4. AEO: "## The short answer" with a 40 to 80 word first paragraph, 4+ question
     headings, a "Questions people ask" style section.
  5. SEO basics: metaDesc 120 to 158 characters, 2+ internal [[link]] cards that point
     at real pages, 4+ [[source]] lines, minimum length per category.
"""
import json, os, re
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(HERE, 'keyword-map.json')
STOP = set('a an and are as at be by can do does for from how i in is it me my of on or our the to what when where who why will with you your la a an nan sou pou yo ak ki se'.split())
MIN_WORDS = {'Bible Answers': 2300, 'Devotional': 1300, 'Health': 1450, 'Recipes': 1200}
STATIC_PAGES = {'/', '/plan-your-visit/', '/kreyol/planifye-vizit/', '/about/', '/ministries/', '/blog/', '/gallery/',
                '/prayer-request/', '/contact/', '/beliefs/', '/resources/', '/give/', '/pastoral-care/', '/membership/',
                '/privacy/', '/bible-study/'}


def norm(t):
    t = re.sub(r"['’]", '', (t or '').lower())
    return [w for w in re.findall(r'[a-z0-9òèé]+', t) if w not in STOP]


def plain_words(body):
    out = []
    for x in body:
        if x.startswith(('[[', '!', '#')):
            continue
        out += re.sub(r'[*_>`]', ' ', x).split()
    return out


def shingles(words, n=6):
    w = [x.lower().strip('.,;:!?"“”()') for x in words]
    return {' '.join(w[i:i + n]) for i in range(max(0, len(w) - n + 1))}


def covers(text, kw, need=0.75):
    """True when most meaningful words of the keyword appear in text."""
    k = norm(kw)
    if not k:
        return True
    t = set(norm(text))
    stem = lambda w: w[:5]
    ts = {stem(w) for w in t}
    hit = sum(1 for w in k if w in t or stem(w) in ts)
    return hit / len(k) >= need


def load_map():
    try:
        return json.load(open(MAP_FILE, encoding='utf-8'))
    except FileNotFoundError:
        return {'owned': {}, 'planned': []}


def save_owner(kw, slug):
    m = load_map()
    m.setdefault('owned', {})[kw.lower().strip()] = slug
    m['planned'] = [p for p in m.get('planned', []) if p.get('keyword', '').lower().strip() != kw.lower().strip()]
    json.dump(m, open(MAP_FILE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def run(meta, body, posts):
    """Return (errors, warnings). posts = existing posts from content-defaults.json."""
    errs, warns = [], []
    slug = meta.get('slug', '')
    others = [p for p in posts if (p.get('slug') or '') != slug]
    exists = len(others) != len(posts)
    if exists and not meta.get('replace'):
        errs.append('slug %r already exists; set "replace": true only if you mean to update that article' % slug)

    # 1. Duplicates
    words = plain_words(body)
    mine = shingles(words)
    t_norm = ' '.join(norm(meta.get('title')))
    for p in others:
        r = SequenceMatcher(None, t_norm, ' '.join(norm(p.get('title')))).ratio()
        if r >= 0.8:
            errs.append('title is %.0f%% similar to existing "%s"' % (r * 100, p['title']))
        theirs = shingles(plain_words(p.get('body') or []))
        if mine and theirs:
            j = len(mine & theirs) / len(mine)
            if j >= 0.12:
                errs.append('%.0f%% of the text repeats "%s"; write it fresh' % (j * 100, p['title']))
            elif j >= 0.05:
                warns.append('%.0f%% of phrases also appear in "%s"' % (j * 100, p['title']))
    kws = meta.get('keywords') or []
    if isinstance(kws, str):
        kws = [k.strip() for k in kws.split(',') if k.strip()]
    primary = kws[0] if kws else ''
    owned = load_map().get('owned', {})
    for kw, owner in owned.items():
        if owner == slug:
            continue
        if primary and (kw == primary.lower().strip() or (covers(kw, primary, 1.0) and covers(primary, kw, 1.0))):
            errs.append('primary keyword "%s" is already targeted by /blog/%s/ (pick a different angle or update that article)' % (primary, owner))
    for p in others:
        pk = (p.get('keywords') or [''])[0]
        if primary and pk and pk.lower().strip() == primary.lower().strip():
            errs.append('primary keyword "%s" already used by "%s"' % (primary, p['title']))

    # 2. Double fact check
    fc = meta.get('factcheck') or []
    passes = [f for f in fc if isinstance(f, dict) and str(f.get('result', '')).lower() == 'pass']
    if len(passes) < 2 or len({f.get('by', '') for f in passes}) < 2:
        errs.append('needs two independent fact checks in "factcheck" (each {by, date, result: "pass", notes}), by two different checkers')

    # 3. Keywords
    if not primary:
        errs.append('keywords missing: first entry is the primary keyword')
    elif len(kws) < 6:
        errs.append('add at least 5 secondary keywords (have %d)' % (len(kws) - 1))
    if primary:
        first100 = ' '.join(words[:100])
        for name, text in (('title', meta.get('title', '')), ('seoTitle', meta.get('seoTitle', '')),
                           ('metaDesc', meta.get('metaDesc', '')), ('first 100 words', first100)):
            if not covers(text, primary):
                errs.append('primary keyword "%s" missing from %s' % (primary, name))
        if not covers(slug.replace('-', ' '), primary, 0.6):
            warns.append('slug does not contain the primary keyword words')
        text_l = ' '.join(words).lower()
        n = text_l.count(primary.lower())
        if words and n * len(primary.split()) / len(words) > 0.025:
            errs.append('primary keyword repeated %d times; that reads as keyword stuffing' % n)
        heads = [x for x in body if x.startswith('#')]
        if not any(covers(h, k, 0.6) for h in heads for k in kws[1:]):
            warns.append('no ## or ### heading uses a secondary keyword')

    # 4. AEO
    try:
        i = next(k for k, x in enumerate(body) if re.match(r'##\s+(The short answer|Repons kout)', x, re.I))
        nxt = next(x for x in body[i + 1:] if not x.startswith(('[[', '!', '#', '>')))
        wc = len(nxt.split())
        if not 40 <= wc <= 80:
            errs.append('"The short answer" first paragraph is %d words; make it 40 to 80' % wc)
    except StopIteration:
        errs.append('missing "## The short answer" section (Kreyòl: "## Repons kout la")')
    qs = [x for x in body if re.match(r'#{2,3}\s+.*\?\s*$', x)]
    if len(qs) < 4:
        errs.append('only %d question headings; need 4 or more for AI answers and FAQ markup' % len(qs))
    if not any(re.match(r'##\s+.*(questions|kesyon)', x, re.I) for x in body):
        warns.append('add a "## Questions people ask" section')

    # 5. SEO basics
    md = meta.get('metaDesc', '')
    if not 120 <= len(md) <= 158:
        errs.append('metaDesc is %d characters; make it 120 to 158' % len(md))
    links = [x for x in body if x.startswith('[[link]]')]
    if len(links) < 2:
        errs.append('add at least 2 [[link]] cards to related articles or pages')
    known = STATIC_PAGES | {'/blog/%s/' % (p.get('slug') or '') for p in posts}
    for l in links:
        href = l.split('|')[-1].strip()
        if href not in known:
            errs.append('internal link points to a page that does not exist: ' + href)
    if sum(1 for x in body if x.startswith('[[source]]')) < 4:
        errs.append('needs 4 or more [[source]] lines')
    need = MIN_WORDS.get(meta.get('cat'), 0)
    if len(words) < need:
        errs.append('only %d words; %s articles need %d or more' % (len(words), meta.get('cat'), need))
    for x in body:
        if x.startswith(('[[', '!', '#', '>')):
            continue
        if len(re.findall(r'[.!?](\s|$)', x)) < 2 and len(x.split()) < 30:
            warns.append('short one sentence paragraph: ' + x[:50])
            break
    return errs, warns
