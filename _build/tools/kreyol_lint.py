#!/usr/bin/env python3
"""Checks Kreyol study data for the mistakes the Nov 6, 2026 review found.
Run: python3 _build/tools/kreyol_lint.py   (kreyol_pages.py also runs it and prints warnings)."""
import json, os, re, sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYS = r'\b(Lendi|Madi|Mèkredi|Jedi|Vandredi|Samdi|Dimanch)\b'


def texts(o, path=''):
    if isinstance(o, str):
        yield path, o
    elif isinstance(o, list):
        for i, x in enumerate(o):
            yield from texts(x, '%s[%d]' % (path, i))
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in ('slug', 'source', 'bsa', 'related', 'date', 'updated'):
                yield from texts(v, path + '.' + k)


def lint():
    out = []
    studies = json.load(open(os.path.join(HERE, 'kreyol-studies.json'), encoding='utf-8'))
    slugs = {s['slug'] for s in studies}
    for s in studies:
        sl = s['slug']
        if len(s.get('seo_title', '')) > 62:
            out.append('%s: title tag is %d characters (keep about 60 or less)' % (sl, len(s['seo_title'])))
        if not 110 <= len(s.get('desc', '')) <= 160:
            out.append('%s: meta description is %d characters (aim for 120 to 155)' % (sl, len(s['desc'])))
        for r in s.get('related', []):
            if r not in slugs:
                out.append('%s: related slug %s does not exist' % (sl, r))
        docs = [('studies', s)]
        f = os.path.join(HERE, 'kreyol-articles', sl + '.json')
        if os.path.exists(f):
            art = json.load(open(f, encoding='utf-8'))
            docs.append(('article', art))
            words = sum(len(t.split()) for _, t in texts(art.get('sections', [])))
            if words < 800:
                out.append('%s: article has only %d words' % (sl, words))
            if not art['sections'] or art['sections'][-1]['h'] != 'Ann priye':
                out.append('%s: last section should be "Ann priye"' % sl)
            for sec in art['sections']:
                for x in sec['p']:
                    if isinstance(x, dict) and 'quote' in x and not x.get('cite'):
                        out.append('%s: a quote block has no reference' % sl)
            body = ' '.join(t for _, t in texts(art['sections']))
            for para in s.get('summary', []):
                for sent in re.split(r'(?<=[.!?])\s+', para):
                    if len(sent) > 60 and sent in body:
                        out.append('%s: summary sentence repeated word for word in the article: %s' % (sl, sent[:60]))
        else:
            out.append('%s: no full article yet (_build/kreyol-articles/%s.json)' % (sl, sl))
        for kind, d in docs:
            for path, t in texts(d):
                where = '%s %s%s' % (sl, kind, path)
                if re.search(r'[–—]', t) or re.search(r'(?<=[A-Za-zÀ-ÿ])-(?=[A-Za-zÀ-ÿ])', t):
                    out.append('%s: hyphen or dash' % where)
                if re.search(r'\d+:\d+ a \d+', t):
                    out.append('%s: verse range with "a", use "rive"' % where)
                if re.search(r'\bChonje\b', t):
                    out.append('%s: use "Sonje", not "Chonje"' % where)
                if re.search(r'\bplent ki\b', t):
                    out.append('%s: "plent" means complaint; for Women 8:26 use "soupi"' % where)
                for m in re.finditer(DAYS, t):
                    pre = t[:m.start()].rstrip(' "')
                    if pre and pre[-1] not in '.!?:' and path not in ('.seo_title', '.title'):
                        out.append('%s: day name "%s" should be lowercase mid sentence' % (where, m.group(0)))
                first = re.split(r'(?<=[.!?])\s', t)[0]
                if '.list[' not in path and re.match(r'^Pa [a-zè]+', first) and not re.match(r'^Pa (gen|ka|bezwen|eseye|kite|fè|janm|t|te|konnen|di|se|bliye|pè|enkyete|kraze|jije|sispann|rete|mete|pran|ale|vin|kwè|tande|wè|tounen|panse)\b', first):
                    out.append('%s: check for a leftover audio script fragment: %s' % (where, t[:50]))
    return out


if __name__ == '__main__':
    w = lint()
    print('\n'.join(w) if w else 'Kreyol lint: no problems found')
    sys.exit(1 if w else 0)
