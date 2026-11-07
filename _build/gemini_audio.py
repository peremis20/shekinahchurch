#!/usr/bin/env python3
"""Make a two host Haitian Creole Bible study audio in the cloud with the Gemini API (no NotebookLM, no computer).

Step 1: a Gemini text model turns a Kreyol script into a warm two host dialogue (Jan and Mari).
Step 2: Gemini text to speech reads the dialogue with two voices, in chunks under the size limit.
Step 3: ffmpeg joins the chunks into one 64k mono MP3.

Usage: GEMINI_API_KEY=... python3 _build/gemini_audio.py SCRIPT.txt OUT.mp3 [--minutes 2]
The key comes from a GitHub secret; never print it or commit it.
"""
import base64, json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error

API = 'https://generativelanguage.googleapis.com/v1beta'
KEY = os.environ.get('GEMINI_API_KEY', '')
HOSTS = ('Jan', 'Mari')
VOICES = {'Jan': os.environ.get('VOICE_JAN', 'Puck'), 'Mari': os.environ.get('VOICE_MARI', 'Kore')}


def call(path, body=None, method=None, tries=4):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return json.loads(r.read())
        except (TimeoutError, OSError) as e:
            if isinstance(e, urllib.error.HTTPError):
                msg = e.read().decode()[:400]
                if e.code in (429, 500, 503) and i < tries - 1:
                    time.sleep(20 * (i + 1)); continue
                raise SystemExit('Gemini API error %s on %s: %s' % (e.code, path.split('?')[0], msg))
            elif i < tries - 1:
                print('slow response, retrying (%s)' % type(e).__name__); time.sleep(10); continue
            else:
                raise SystemExit('Gemini API did not answer in time on %s' % path.split('?')[0])
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            if e.code in (429, 500, 503) and i < tries - 1:
                time.sleep(20 * (i + 1)); continue
            raise SystemExit('Gemini API error %s on %s: %s' % (e.code, path.split('?')[0], msg))


def pick_models():
    names = [m['name'] for m in call('/models?pageSize=200').get('models', [])
             if 'generateContent' in m.get('supportedGenerationMethods', [])]
    tts = [n for n in names if 'tts' in n]
    text = [n for n in names if 'tts' not in n and 'flash' in n and 'image' not in n and 'live' not in n and 'audio' not in n]
    def rank(n):  # newest version first, prefer pro for TTS quality when asked
        v = re.findall(r'(\d+(?:\.\d+)?)', n)
        return (float(v[0]) if v else 0, 'pro' in n if os.environ.get('TTS_PRO') else 'flash' in n)
    tts.sort(key=rank, reverse=True); text.sort(key=rank, reverse=True)
    t = os.environ.get('TTS_MODEL') or (tts[0] if tts else None)
    fast = [n for n in text if 'lite' not in n and ('preview' not in n and 'exp' not in n)]
    x = os.environ.get('TEXT_MODEL') or (fast[0] if fast else (text[0] if text else None))
    if not t or not x:
        raise SystemExit('No usable models found. TTS: %s TEXT: %s' % (tts[:5], text[:5]))
    print('text models available:', text[:6])
    print('text model:', x, '| tts model:', t, '| other tts:', tts[:6])
    return x, t


def dialogue(model, script, minutes):
    words = int(minutes * 140)
    prompt = (
        'Ou se yon ekriven pou yon emisyon etid biblik an Kreyòl ayisyen, "Etid Biblik Shekinah". '
        'Ekri yon konvèsasyon natirèl ant de animatè, Jan (gason) ak Mari (fanm), ki baze SÈLMAN sou tèks ki anba a. '
        'Règ: Kreyòl ayisyen natirèl jan moun pale lakay; cho, kè kontan, respè; poze kesyon pou moun k ap koute a; '
        'yon ti blag lejè sèlman si tèks la genyen youn; pa ajoute okenn nouvo enfòmasyon, vèsè, oswa istwa; '
        'pa nonmen okenn legliz oswa denominasyon; vèsè biblik yo dwe rete egzak jan tèks la di yo. '
        'Kòmanse ak "Byenveni nan Etid Biblik Shekinah!". Fini ak yon ti benediksyon kout. '
        'Longè: anviwon %d mo. Fòma: chak liy kòmanse ak "Jan:" oswa "Mari:", san lòt bagay.\n\nTÈKS:\n%s' % (words, script))
    r = call('/%s:generateContent' % model, {'contents': [{'parts': [{'text': prompt}]}],
                                             'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 12000}})
    text = ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts'])
    lines = [l.strip() for l in text.splitlines() if re.match(r'^(Jan|Mari)\s*:', l.strip())]
    if len(lines) < 4:
        raise SystemExit('Dialogue came back in the wrong format:\n' + text[:800])
    return lines


def chunks(lines, limit=3200):
    cur, size = [], 0
    for l in lines:
        b = len(l.encode())
        if cur and size + b > limit:
            yield cur; cur, size = [], 0
        cur.append(l); size += b + 1
    if cur:
        yield cur


def speak(model, lines, wav):
    body = {
        'contents': [{'parts': [{'text': 'Li konvèsasyon sa a an Kreyòl ayisyen (Haitian Creole, ht-HT), ak yon ton cho, natirèl, '
                                         'tankou de zanmi k ap fè yon emisyon radyo kretyen. Jan se yon gason, Mari se yon fanm.\n\n' + '\n'.join(lines)}]}],
        'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'multiSpeakerVoiceConfig': {'speakerVoiceConfigs': [
            {'speaker': h, 'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': VOICES[h]}}} for h in HOSTS]}}}}
    r = call('/%s:generateContent' % model, body)
    part = r['candidates'][0]['content']['parts'][0]['inlineData']
    pcm = base64.b64decode(part['data'])
    rate = int(re.search(r'rate=(\d+)', part.get('mimeType', '') + ' rate=24000').group(1))
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', '-', wav], input=pcm)


def main():
    if not KEY:
        raise SystemExit('GEMINI_API_KEY is not set (add it as a GitHub secret).')
    src, out = sys.argv[1], sys.argv[2]
    minutes = float(sys.argv[sys.argv.index('--minutes') + 1]) if '--minutes' in sys.argv else 20
    script = open(src, encoding='utf-8').read()
    text_model, tts_model = pick_models()
    lines = dialogue(text_model, script, minutes)
    open(os.path.splitext(out)[0] + '.dialogue.txt', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for i, c in enumerate(chunks(lines)):
            w = os.path.join(tmp, 'p%03d.wav' % i); speak(tts_model, c, w); parts.append(w)
            print('spoke part', i + 1)
        lst = os.path.join(tmp, 'list.txt')
        open(lst, 'w').write(''.join("file '%s'\n" % p for p in parts))
        subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                               '-ac', '1', '-b:a', '64k', '-metadata', 'artist=Etid Biblik Shekinah', out])
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).decode())
    print('done: %s, %.1f minutes, models %s and %s' % (out, dur / 60, text_model, tts_model))


if __name__ == '__main__':
    main()
