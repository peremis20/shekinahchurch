#!/usr/bin/env python3
"""Publish a Kreyol study that was prepared ahead of time (spaced out so studies go live on different days).

_build/pending/<slug>/ holds entry.json (kreyol-studies.json entry), article.json and audio.mp3 (NotebookLM audio).
Usage from the repo root:  python3 _build/tools/publish_pending.py <slug> [YYYY-MM-DD]
The date (default: today in Central time) becomes the study's publish date.
Then: git add -A, commit, push. The pending folder is removed after publishing.
"""
import datetime, json, os, shutil, subprocess, sys

MONTHS = ['janvye', 'fevriye', 'mas', 'avril', 'me', 'jen', 'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm']
slug = sys.argv[1]
if len(sys.argv) > 2:
    day = datetime.date.fromisoformat(sys.argv[2])
else:
    day = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).date()
iso, ht = day.isoformat(), '%d %s %d' % (day.day, MONTHS[day.month - 1], day.year)
P = os.path.join('_build', 'pending', slug)
STUDIES = os.path.join('_build', 'kreyol-studies.json')
entry = json.load(open(os.path.join(P, 'entry.json'), encoding='utf-8'))
assert entry['slug'] == slug
studies = json.load(open(STUDIES, encoding='utf-8'))
if any(s['slug'] == slug for s in studies):
    sys.exit('%s is already published' % slug)
out = subprocess.run(['python3', '_build/tools/publish_audio.py', os.path.join(P, 'audio.mp3'), slug, entry['title'], ht, entry['desc']],
                     check=True, capture_output=True, text=True).stdout.strip()
length = out.split(' ', 1)[1] if ' ' in out else ''
entry.update(date=iso, date_ht=ht, updated=iso, length=length)
studies.insert(0, entry)
json.dump(studies, open(STUDIES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
shutil.copy(os.path.join(P, 'article.json'), os.path.join('_build', 'kreyol-articles', slug + '.json'))
print(subprocess.run(['python3', '_build/kreyol_pages.py'], check=True, capture_output=True, text=True).stdout)
sm = open('sitemap.xml', encoding='utf-8').read()
url = 'https://shekinahsda.org/kreyol/%s/' % slug
if url not in sm:
    sm = sm.replace('</urlset>', '  <url><loc>%s</loc><lastmod>%s</lastmod><priority>0.7</priority></url>\n</urlset>' % (url, iso))
    open('sitemap.xml', 'w', encoding='utf-8').write(sm)
shutil.rmtree(P)
print('published', slug, ht, length)
