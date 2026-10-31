#!/usr/bin/env python3
"""Make natural article narration.

Default engine: Kokoro (free, open source, Apache 2.0, runs on the GitHub runner, no key or limits).
Optional engine: ElevenLabs (set TTS_ENGINE=elevenlabs and the ELEVENLABS_API_KEY secret).
Runs in GitHub Actions (.github/workflows/article-audio.yml), never in the browser.
For every English blog post without narration it writes assets/audio/posts/<slug>.mp3
and lists it in assets/audio/posts/manifest.json, which the site reads to show a player.

Environment:
  TTS_ENGINE           kokoro (default) or elevenlabs
  KOKORO_VOICE         Kokoro voice (default af_heart; others: af_bella, am_michael, am_fenrir, bf_emma, bm_george)
  MAX_ARTICLES         Kokoro: articles per run (default 8)
  ELEVENLABS_API_KEY   ElevenLabs only (GitHub repository secret)
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
ENGINE = os.environ.get('TTS_ENGINE', 'kokoro').strip().lower() or 'kokoro'
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


_kp = None


def kokoro_mp3(text, path):
    """Narrate with Kokoro and save a mono MP3."""
    global _kp
    import numpy as np, soundfile as sf, subprocess, tempfile
    from kokoro import KPipeline
    if _kp is None:
        _kp = KPipeline(lang_code='a')
    voice = os.environ.get('KOKORO_VOICE', 'af_heart').strip() or 'af_heart'
    pause = np.zeros(int(24000 * 0.45), dtype=np.float32)
    pieces = []
    for para in text.split('\n\n'):
        para = para.strip()
        if not para:
            continue
        for _, _, audio in _kp(para, voice=voice, speed=0.98):
            if audio is not None:
                pieces.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        pieces.append(pause)
    wav = tempfile.mktemp(suffix='.wav')
    sf.write(wav, np.concatenate(pieces), 24000)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', path], check=True)
    os.remove(wav)
    return os.path.getsize(path)


def main():
    if ENGINE == 'elevenlabs' and not KEY:
        print('ELEVENLABS_API_KEY is not set; nothing to do.')
        return
    max_articles = int(os.environ.get('MAX_ARTICLES', '8'))
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
        if ENGINE != 'elevenlabs':
            if len(made) >= max_articles:
                print('reached %d articles for this run; the rest go next run' % max_articles)
                break
            size = kokoro_mp3(text, os.path.join(OUT, slug + '.mp3'))
            manifest[slug] = {'src': 'assets/audio/posts/%s.mp3' % slug, 'chars': len(text), 'engine': 'kokoro', 'voice': os.environ.get('KOKORO_VOICE', 'af_heart') or 'af_heart', 'made': time.strftime('%Y-%m-%d')}
            made.append(slug)
            json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
            print('narrated %s (%d chars, %d KB)' % (slug, len(text), size // 1024))
            continue
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
        manifest[slug] = {'src': 'assets/audio/posts/%s.mp3' % slug, 'chars': len(text), 'engine': 'elevenlabs', 'voice': os.environ.get('ELEVENLABS_VOICE', 'Brian'), 'made': time.strftime('%Y-%m-%d')}
        budget -= len(text)
        made.append(slug)
        print('narrated %s (%d chars, %d KB)' % (slug, len(text), len(audio) // 1024))
    json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('done: %d new narration file(s)' % len(made))


if __name__ == '__main__':
    main()
