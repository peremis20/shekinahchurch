"""Share pages for RSVP events (Nov 28, 2026).

A shared link like shekinahsda.org/rsvp/e922c7 needs real tags in the HTML (WhatsApp, Facebook, iMessage
do not run JavaScript) to show a banner. For every RSVP event this writes:
  rsvp/<code>/index.html  the normal RSVP page with the event's title, description and banner tags
  rsvp/<code>/share.png   a 1200x630 banner with the event details
Run by .github/workflows/rsvp-pages.yml with the event list from the church API.
Usage: python3 _build/tools/rsvp_pages.py feed.json
"""
import json, os, sys, html, hashlib, shutil, re, datetime as dt
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS = os.path.join(ROOT, '_build', 'fonts')
SITE = 'https://shekinahsda.org'
NAVY, NAVY2, GOLD, CREAM = (19, 41, 75), (11, 27, 54), (226, 184, 92), (250, 246, 238)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def nice_date(d, long=True):
    x = dt.date.fromisoformat(d)
    return x.strftime('%A, %B ') + str(x.day) + x.strftime(', %Y') if long else x.strftime('%a, %b ') + str(x.day)


def nice_time(t):
    if not t:
        return ''
    h, m = map(int, t.split(':'))
    return '%d:%02d %s' % (h % 12 or 12, m, 'AM' if h < 12 else 'PM')


def wrap(draw, text, f, width, lines):
    words, out, cur = text.split(), [], ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if draw.textlength(test, font=f) <= width:
            cur = test
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    if len(out) > lines:
        out = out[:lines]
        while draw.textlength(out[-1] + '...', font=f) > width and ' ' in out[-1]:
            out[-1] = out[-1].rsplit(' ', 1)[0]
        out[-1] += '...'
    return out


def banner(e, path):
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), NAVY)
    d = ImageDraw.Draw(im)
    for y in range(H):  # soft top to bottom shade
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(NAVY[i] * (1 - k) + NAVY2[i] * k) for i in range(3)))
    d.rectangle([0, H - 14, W, H], fill=GOLD)
    logo = Image.open(os.path.join(ROOT, 'assets', 'logo-dark.png')).convert('RGBA')
    lw = 300
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    im.paste(logo, (64, 52), logo)
    # date tile on the right
    x = dt.date.fromisoformat(e['date'])
    tx, ty, tw, th = 900, 150, 236, 252
    d.rounded_rectangle([tx, ty, tx + tw, ty + th], 28, fill=(255, 255, 255))
    d.rounded_rectangle([tx, ty, tx + tw, ty + 74], 28, fill=GOLD)
    d.rectangle([tx, ty + 46, tx + tw, ty + 74], fill=GOLD)
    f = font('Mulish_800ExtraBold.ttf', 40)
    m = x.strftime('%b').upper()
    d.text((tx + tw / 2, ty + 38), m, font=f, fill=NAVY, anchor='mm')
    f = font('Mulish_800ExtraBold.ttf', 118)
    d.text((tx + tw / 2, ty + 74 + (th - 74) / 2 - 6), str(x.day), font=f, fill=NAVY, anchor='mm')
    f = font('Mulish_700Bold.ttf', 26)
    d.text((tx + tw / 2, ty + th + 34), x.strftime('%A'), font=f, fill=(201, 208, 220), anchor='mm')
    # text block
    left, maxw = 64, 790
    f = font('Mulish_800ExtraBold.ttf', 26)
    d.text((left, 196), "YOU'RE INVITED", font=f, fill=GOLD)
    size = 64
    while size > 44:
        ft = font('LibreBaskerville_700Bold.ttf', size)
        lines = wrap(d, e['title'], ft, maxw, 2)
        if len(lines) <= 2 and all(d.textlength(l, font=ft) <= maxw for l in lines):
            break
        size -= 4
    y = 238
    for l in lines:
        d.text((left, y), l, font=ft, fill=(255, 255, 255))
        y += int(size * 1.28)
    y += 14
    f = font('Mulish_700Bold.ttf', 32)
    when = nice_date(e['date']) + ('  |  ' + nice_time(e['time']) if e.get('time') else '')
    d.text((left, y), when, font=f, fill=(233, 238, 246))
    y += 48
    if e.get('location'):
        for l in wrap(d, e['location'], f, maxw, 1):
            d.text((left, y), l, font=f, fill=(201, 208, 220))
        y += 48
    # call to action pill
    f = font('Mulish_800ExtraBold.ttf', 30)
    label = 'Tap to RSVP'
    pw = int(d.textlength(label, font=f)) + 64
    py = max(y + 18, 500)
    py = min(py, H - 14 - 30 - 64)
    d.rounded_rectangle([left, py, left + pw, py + 64], 32, fill=GOLD)
    d.text((left + pw / 2, py + 32), label, font=f, fill=NAVY, anchor='mm')
    im.save(path, 'PNG', optimize=True)


def page(template, e, img_v):
    url = '%s/rsvp/%s/' % (SITE, e['code'])
    title = "You're invited: %s" % e['title']
    when = nice_date(e['date'], long=False) + (' at ' + nice_time(e['time']) if e.get('time') else '')
    desc = when + (', ' + e['location'] if e.get('location') else '') + '. ' + (e.get('description') or '').strip()
    desc = re.sub(r'\s+', ' ', desc).strip()
    if len(desc) > 190:
        desc = desc[:187].rsplit(' ', 1)[0] + '...'
    desc += ' Tap to RSVP.'
    img = '%s/rsvp/%s/share.png?v=%s' % (SITE, e['code'], img_v)
    q = lambda s: html.escape(s, quote=True)
    tags = ('<link rel="canonical" href="%s"><meta property="og:type" content="website"><meta property="og:site_name" content="Shekinah Haitian SDA Church">'
            '<meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:url" content="%s">'
            '<meta property="og:image" content="%s"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            '<meta property="og:image:alt" content="%s"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="%s">'
            '<meta name="twitter:description" content="%s"><meta name="twitter:image" content="%s">') % (
        q(url), q(title), q(desc), q(url), q(img), q(title), q(title), q(desc), q(img))
    out = template.replace('<title>RSVP | Shekinah SDA Church</title>', '<title>%s | Shekinah SDA Church</title>' % q(title), 1)
    out = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % q(desc).replace('\\', '\\\\'), out, count=1)
    # WhatsApp only reads the start of a page, so the preview tags go right after the charset line.
    return out.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + tags, 1)


def main():
    events = json.load(open(sys.argv[1], encoding='utf-8')).get('events', [])
    template = open(os.path.join(ROOT, 'rsvp', 'index.html'), encoding='utf-8').read()
    base = os.path.join(ROOT, 'rsvp')
    keep = set()
    for e in events:
        code = str(e.get('code', '')).lower()
        if not re.fullmatch(r'[a-z0-9]{4,12}', code) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(e.get('date', ''))):
            continue
        keep.add(code)
        d = os.path.join(base, code)
        os.makedirs(d, exist_ok=True)
        sig = json.dumps([e.get(k) for k in ('title', 'date', 'time', 'location')], ensure_ascii=False)
        v = hashlib.sha1(sig.encode()).hexdigest()[:8]
        png, stamp = os.path.join(d, 'share.png'), os.path.join(d, '.banner')
        if not (os.path.isfile(png) and os.path.isfile(stamp) and open(stamp).read() == v):
            banner(e, png)
            open(stamp, 'w').write(v)
        new = page(template, e, v)
        idx = os.path.join(d, 'index.html')
        if not os.path.isfile(idx) or open(idx, encoding='utf-8').read() != new:
            open(idx, 'w', encoding='utf-8').write(new)
    for name in os.listdir(base):  # events deleted in the admin lose their share page
        p = os.path.join(base, name)
        if os.path.isdir(p) and re.fullmatch(r'[a-z0-9]{4,12}', name) and name not in keep:
            shutil.rmtree(p)
    print('rsvp pages:', len(keep))


if __name__ == '__main__':
    main()
