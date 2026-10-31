#!/usr/bin/env python3
"""Turn new English articles into NotebookLM podcast episodes (Audio Overviews).

Runs in GitHub Actions (.github/workflows/article-podcast.yml) with the unofficial
notebooklm-py CLI (https://github.com/teng-lin/notebooklm-py, MIT). For each live English
article without an episode it:
  1. adds the article URL as a source in the church NotebookLM notebook,
  2. generates an Audio Overview from that one source only (-s SOURCE_ID),
  3. downloads it, converts it to MP3, saves assets/audio/podcast/<slug>.mp3,
  4. records it in assets/audio/podcast/manifest.json (the site shows a player from it).

Environment:
  NOTEBOOKLM_AUTH_JSON   required secret: contents of storage_state.json from `notebooklm login`
  NOTEBOOKLM_NOTEBOOK    notebook id (the church project notebook)
  MAX_EPISODES           episodes per run (default 2, NotebookLM limits daily audio)
  ONLY_SLUG              optional: make (or remake) just this article
  PODCAST_FORMAT         deep-dive (default), brief, critique or debate
  PODCAST_LENGTH         short, default (default) or long
"""
import json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'podcast')
MANIFEST = os.path.join(OUT, 'manifest.json')
SITE = 'https://shekinahsda.org'
NB = os.environ.get('NOTEBOOKLM_NOTEBOOK', '').strip()

PROMPT = ("Two warm, respectful hosts talk through this one article from Shekinah church in Alvarado, Texas, "
          "for everyday listeners who want to understand the Bible. Stay faithful to what the article says and quote "
          "its King James Bible verses accurately. Do not add new teachings, statistics, stories or claims that are not "
          "in the article, and do not name or label any church denomination; call the church simply Shekinah church. "
          "Keep it encouraging and Christ centered. End by inviting listeners to read the full article and find more "
          "free Bible studies at shekinahsda.org.")


def is_kreyol(p):
    t = p.get('title', '')
    return bool(re.search(r'[òè]', t) or re.search(r'\b(Kisa|Kijan|Bib la|Bondye|pou m)\b', t))


def nlm(*args, timeout=1800):
    cmd = ['notebooklm', *args]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError('%s failed: %s' % (' '.join(args[:2]), (r.stderr or r.stdout)[-800:]))
    return r.stdout


def find_id(out):
    """Pull a source id out of `source add --json` output whatever its exact shape."""
    try:
        data = json.loads(out)
    except ValueError:
        m = re.search(r'\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b', out)
        return m.group(1) if m else None
    stack = [data]
    while stack:
        x = stack.pop()
        if isinstance(x, dict):
            for k in ('source_id', 'id'):
                if isinstance(x.get(k), str) and x[k]:
                    return x[k]
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)
    return None


def main():
    if not os.environ.get('NOTEBOOKLM_AUTH_JSON'):
        print('NOTEBOOKLM_AUTH_JSON secret is not set; nothing to do.')
        return
    if not NB:
        raise SystemExit('NOTEBOOKLM_NOTEBOOK is not set')
    os.makedirs(OUT, exist_ok=True)
    try:
        manifest = json.load(open(MANIFEST, encoding='utf-8'))
    except FileNotFoundError:
        manifest = {}
    posts = json.load(open(os.path.join(ROOT, 'content-defaults.json'), encoding='utf-8'))['posts']
    only = os.environ.get('ONLY_SLUG', '').strip()
    limit = int(os.environ.get('MAX_EPISODES') or 2)
    fmt = os.environ.get('PODCAST_FORMAT') or 'deep-dive'
    length = os.environ.get('PODCAST_LENGTH') or 'default'
    made, failed = [], []
    for p in posts:  # newest first
        slug = p.get('slug')
        if not slug or is_kreyol(p) or (only and slug != only) or (slug in manifest and not only):
            continue
        if len(made) >= limit:
            break
        url = '%s/blog/%s/' % (SITE, slug)
        try:
            out = nlm('source', 'add', url, '-n', NB, '--title', p['title'][:120], '--timeout', '180', '--fallback-fetch', '--json', timeout=400)
            sid = find_id(out)
            if not sid:
                raise RuntimeError('could not read the new source id from: ' + out[:300])
            nlm('generate', 'audio', PROMPT, '-n', NB, '-s', sid, '--format', fmt, '--length', length,
                '--language', 'en', '--wait', '--timeout', '1700', '--retry', '3')
            m4a = os.path.join(OUT, slug + '.m4a')
            nlm('download', 'audio', m4a, '-n', NB, '--latest', timeout=600)
            mp3 = os.path.join(OUT, slug + '.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', m4a, '-codec:a', 'libmp3lame', '-b:a', '96k', mp3], check=True)
            os.remove(m4a)
            manifest[slug] = {'src': 'assets/audio/podcast/%s.mp3' % slug, 'source_id': sid, 'format': fmt,
                              'made': time.strftime('%Y-%m-%d')}
            json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
            made.append(slug)
            print('episode ready: %s (%d KB)' % (slug, os.path.getsize(mp3) // 1024))
        except Exception as e:  # keep going with the next article
            failed.append(slug)
            print('FAILED %s: %s' % (slug, e))
    print('done: %d new episode(s), %d failed' % (len(made), len(failed)))
    if failed and not made:
        sys.exit(1)


if __name__ == '__main__':
    main()
