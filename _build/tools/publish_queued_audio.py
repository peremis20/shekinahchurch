#!/usr/bin/env python3
"""Cloud publisher for Kreyol audio studies (runs in GitHub Actions, no computer needed).

A Claude task queues a study by committing _build/audio-queue/<slug>/ with:
  job.json      {"slug", "title", "date_ht", "desc"}   (desc: one Kreyol sentence, no URLs)
  dialogue.txt  the two host conversation, one line per turn, each starting "Jan:" or "Mari:"
and, in the same commit, the study entry in _build/kreyol-studies.json (length may be "") and
_build/kreyol-articles/<slug>.json.

This script then, for every queued job without done.json:
  1. makes the MP3 with Gemini voices (calm style, the voice Jimmy chose on Nov 6, 2026)
  2. runs publish_audio.py (64k mono MP3 in assets/audio/bible-study/, Bible Study card, BS_AUDIO entry)
  3. writes the minutes into kreyol-studies.json, rebuilds the /kreyol/ pages, adds the URL to sitemap.xml
  4. writes done.json
Run from the repo root: python3 _build/tools/publish_queued_audio.py
"""
import datetime, json, os, re, subprocess, sys

ROOT = os.getcwd()
Q = os.path.join(ROOT, '_build', 'audio-queue')
STUDIES = os.path.join(ROOT, '_build', 'kreyol-studies.json')
ENV = dict(os.environ, TTS_MODEL=os.environ.get('TTS_MODEL', 'models/gemini-3.1-flash-tts-preview'),
           TTS_FORMAT=os.environ.get('TTS_FORMAT', 'classic'))


def run(cmd):
    print('$', ' '.join(cmd[:3]), '...', flush=True)
    return subprocess.run(cmd, check=True, env=ENV, capture_output=True, text=True).stdout


def main():
    if not os.path.isdir(Q):
        print('no queue'); return
    done_any = False
    for slug in sorted(os.listdir(Q)):
        d = os.path.join(Q, slug)
        if not os.path.isfile(os.path.join(d, 'job.json')) or os.path.exists(os.path.join(d, 'done.json')):
            continue
        job = json.load(open(os.path.join(d, 'job.json'), encoding='utf-8'))
        assert job['slug'] == slug, 'job.json slug must match its folder'
        studies = json.load(open(STUDIES, encoding='utf-8'))
        if not any(s['slug'] == slug for s in studies):
            sys.exit('%s: add its entry to _build/kreyol-studies.json in the same commit' % slug)
        tmp = os.path.join('/tmp', slug + '.mp3')
        out = run(['python3', '_build/gemini_audio.py', os.path.join(d, 'dialogue.txt'), tmp, '--dialogue'])
        print(out[-600:])
        pub = run(['python3', '_build/tools/publish_audio.py', tmp, slug, job['title'], job['date_ht'], job['desc']])
        length = pub.strip().split(' ', 1)[1] if ' ' in pub.strip() else ''
        print('published', slug, length)
        for s in studies:
            if s['slug'] == slug:
                s['length'] = length
        json.dump(studies, open(STUDIES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(run(['python3', '_build/kreyol_pages.py']))
        sm = open('sitemap.xml', encoding='utf-8').read()
        url = 'https://shekinahsda.org/kreyol/%s/' % slug
        if url not in sm:
            today = datetime.date.today().isoformat()
            sm = sm.replace('</urlset>', '  <url><loc>%s</loc><lastmod>%s</lastmod><priority>0.7</priority></url>\n</urlset>' % (url, today))
            open('sitemap.xml', 'w', encoding='utf-8').write(sm)
        json.dump({'mp3': '/assets/audio/bible-study/%s.mp3' % slug, 'length': length,
                   'finished': datetime.datetime.now(datetime.timezone.utc).isoformat()},
                  open(os.path.join(d, 'done.json'), 'w'), indent=1)
        done_any = True
    print('nothing queued' if not done_any else 'all queued audio published')


if __name__ == '__main__':
    main()
