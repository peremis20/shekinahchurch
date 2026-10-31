#!/usr/bin/env python3
"""Make natural article narration with ElevenLabs.

Runs in GitHub Actions (.github/workflows/article-audio.yml), never in the browser.
For every English blog post without narration it writes assets/audio/posts/<slug>.mp3
and lists it in assets/audio/posts/manifest.json, which the site reads to show a player.

Environment:
  ELEVENLABS_API_KEY   required (GitHub repository secret)
  ELEVENLABS_VOICE     optional voice name or voice id (default "Brian")
  ELEVENLABS_MODEL     optional (default eleven_multilingual_v2)
  MAX_CHARS            optional character budget per run (default 120000) to protect the plan quota
  ONLY_SLUG            optional: narrate just this slug (re-generates it)
"""
import json, os, re, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'posts')
MANIFEST = os.path.join(OUT, 'manifest.json')
KEY = os.environ.get('ELEVENLABS_API_KEY', '').strip()
API = 'https://api.elevenlabs.io/v1'


def is_kreyol(p):
    t = p.get('title', '')
    return bool(re.search(r'[òè]', t) or re.search(r'\b(Kisa|Kijan|Bib la|Bondye|pou m)\b', t))


def api(path, body=None, accept='application/json'):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': accept})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode('utf-8', 'replace')
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(10 * (attempt + 1)); continue
            raise SystemExit('ElevenLabs error %s on %s: %s' % (e.code, path, msg))


def voice_id():
    want = os.environ.get('ELEVENLABS_VOICE', 'Brian').strip()
    if re.fullmatch(r'[A-Za-z0-9]{20}', want):
        return want
    voices = json.loads(api('/voices')).get('voices', [])
    for v in voices:
        if v.get('name', '').lower().startswith(want.lower()):
            return v['voice_id']
    if not voices:
        raise SystemExit('No ElevenLabs voices available on this account')
    print('voice %r not found, using %s' % (want, voices[0].get('name')))
    return voices[0]['voice_id']


def clean(x):
    x = re.sub(r'\*\*|__|`', '', x)
    x = re.sub(r'(?<!\w)[*_](.+?)[*_](?!\w)', r'\1', x)
    x = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', x)
    return x.strip()


def script(p):
    parts = [p['title'] + '.', 'By ' + p.get('author', 'Shekinah') + '.']
    for b in p.get('body') or []:
        if b.startswith('[[source]]') or b.startswith('!['):
            continue
        if b.startswith('[[callout]]'):
            bits = [s.strip() for s in b[len('[[callout]]'):].split('||')]
            parts.append(bits[0] + '. ' + ' '.join(s.rstrip('.') + '.' for s in bits[1:]))
            continue
        if b.startswith('[[steps]]'):
            for st in b[len('[[steps]]'):].split('||'):
                a = [s.strip() for s in st.split('|')]
                parts.append('. '.join(x for x in a if x) + '.')
            continue
        if b.startswith('[['):
            continue  # stats, tables, timelines and link cards are visual only
        m = re.match(r'#{2,3}\s+(.*)', b)
        if m:
            h = clean(m.group(1))
            parts.append(h if h.endswith(('?', '.', '!')) else h + '.')
            continue
        if b.startswith('>'):
            b = b.lstrip('> ').strip()
        parts.append(clean(b))
    parts.append('Thank you for listening. You are always welcome at Shekinah church in Alvarado, Texas.')
    return '\n\n'.join(x for x in parts if x)


def chunks(text, size=3800):
    out, cur = [], ''
    for para in text.split('\n\n'):
        if len(cur) + len(para) + 2 > size and cur:
            out.append(cur); cur = ''
        while len(para) > size:
            cut = para.rfind('. ', 0, size) + 1 or size
            out.append(para[:cut]); para = para[cut:].strip()
        cur = (cur + '\n\n' + para) if cur else para
    if cur:
        out.append(cur)
    return out


def main():
    if not KEY:
        print('ELEVENLABS_API_KEY is not set; nothing to do.')
        return
    os.makedirs(OUT, exist_ok=True)
    try:
        manifest = json.load(open(MANIFEST, encoding='utf-8'))
    except FileNotFoundError:
        manifest = {}
    posts = json.load(open(os.path.join(ROOT, 'content-defaults.json'), encoding='utf-8'))['posts']
    only = os.environ.get('ONLY_SLUG', '').strip()
    budget = int(os.environ.get('MAX_CHARS', '120000'))
    model = os.environ.get('ELEVENLABS_MODEL', 'eleven_multilingual_v2')
    vid = None
    made = []
    for p in posts:
        slug = p.get('slug')
        if not slug or is_kreyol(p):
            continue
        if only and slug != only:
            continue
        if slug in manifest and not only:
            continue
        text = script(p)
        if len(text) > budget:
            print('budget left (%d) is too small for %s (%d chars); stopping for this run' % (budget, slug, len(text)))
            break
        vid = vid or voice_id()
        parts = chunks(text)
        audio = b''
        for i, c in enumerate(parts):
            body = {'text': c, 'model_id': model, 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.15, 'use_speaker_boost': True}}
            if i > 0:
                body['previous_text'] = parts[i - 1][-500:]
            if i + 1 < len(parts):
                body['next_text'] = parts[i + 1][:500]
            audio += api('/text-to-speech/%s?output_format=mp3_44100_128' % vid, body, accept='audio/mpeg')
        open(os.path.join(OUT, slug + '.mp3'), 'wb').write(audio)
        manifest[slug] = {'src': 'assets/audio/posts/%s.mp3' % slug, 'chars': len(text), 'voice': os.environ.get('ELEVENLABS_VOICE', 'Brian'), 'made': time.strftime('%Y-%m-%d')}
        budget -= len(text)
        made.append(slug)
        print('narrated %s (%d chars, %d KB)' % (slug, len(text), len(audio) // 1024))
    json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('done: %d new narration file(s)' % len(made))


if __name__ == '__main__':
    main()
