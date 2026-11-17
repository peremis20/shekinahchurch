#!/usr/bin/env python3
"""Podcast RSS feed for the Kreyol audio Bible studies.

Writes podcast/kreyol.xml from _build/kreyol-studies.json (one episode per study, newest first).
Called by kreyol_pages.build(), so the nightly rebuild and every publish keep it current.
Submit https://shekinahsda.org/podcast/kreyol.xml to Spotify, Apple Podcasts, YouTube Music, Amazon.
"""
import json, os
from datetime import datetime
from email.utils import format_datetime
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://shekinahsda.org'
FEED = SITE + '/podcast/kreyol.xml'
COVER = SITE + '/assets/podcast/shekinah-podcast-cover.jpg'
CT = ZoneInfo('America/Chicago')

TITLE = 'Shekinah Haitian SDA Church'
AUTHOR = 'Shekinah Haitian SDA Church'
EMAIL = 'info@shekinahsda.org'
DESC = ('Etid biblik an Kreyòl ayisyen pou chak fanmi ayisyen. Chak epizòd reponn yon kesyon moun ap poze sou Bib la ak '
        'Pawòl Bondye: Saba a, lapriyè, lanmò, lanfè, Sentespri a, Dis Kòmandman yo, retou Jezi, padon, gerizon ak plis ankò. '
        'Ansèyman klè, cho e senp, ak vèsè Bib la an Kreyòl. Shekinah Haitian SDA Church (Legliz Advantis Setyèm Jou Shekinah), Alvarado, Texas. '
        'Atik konplè ak vèsè yo: shekinahsda.org/kreyol')
KEYWORDS = 'Bib, Bib la, etid biblik, Kreyòl, Kreyol, ayisyen, Haitian Creole, Haiti, Bondye, Jezi, lapriyè, Saba, predikasyon, Advantis, Adventist'


def e(s):
    return escape(str(s or ''), {'"': '&quot;'})


def hms(sec):
    sec = int(sec)
    return '%d:%02d:%02d' % (sec // 3600, sec % 3600 // 60, sec % 60)


def build():
    studies = json.load(open(os.path.join(ROOT, '_build', 'kreyol-studies.json'), encoding='utf-8'))
    studies = sorted(studies, key=lambda s: s['date'], reverse=True)
    items = []
    n = len(studies)
    for i, s in enumerate(studies):
        mp3 = os.path.join(ROOT, 'assets', 'audio', 'bible-study', s['slug'] + '.mp3')
        if not os.path.exists(mp3):
            continue
        size = os.path.getsize(mp3)
        secs = size * 8 / 64000  # files are 64 kbps mono
        when = datetime.strptime(s['date'], '%Y-%m-%d').replace(hour=19, minute=10, tzinfo=CT)
        page = '%s/kreyol/%s/' % (SITE, s['slug'])
        summary = ' '.join(s.get('summary') or [s.get('desc', '')])
        theme = {'gras': 'Gras Bondye', 'verite': 'Verite Bib la', 'lavi': 'Lavi kretyen'}.get(s.get('theme'))
        if theme:
            summary = 'Tèm: %s. %s' % (theme, summary)
        body = '<p>%s</p><p>Atik konplè, vèsè ak kesyon pou etidye: <a href="%s">%s</a></p>' % (e(summary), page, page)
        items.append('''    <item>
      <title>%s</title>
      <description><![CDATA[%s]]></description>
      <itunes:summary>%s</itunes:summary>
      <link>%s</link>
      <guid isPermaLink="false">shekinah-kreyol-%s</guid>
      <pubDate>%s</pubDate>
      <enclosure url="%s/assets/audio/bible-study/%s.mp3" length="%d" type="audio/mpeg"/>
      <itunes:duration>%s</itunes:duration>
      <itunes:episode>%d</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      <itunes:image href="%s"/>
    </item>''' % (e(s['title']), body.replace(']]>', ''), e(summary), page, s['slug'], format_datetime(when),
                  SITE, s['slug'], size, hms(secs), n - i, COVER))
    last = format_datetime(datetime.strptime(studies[0]['date'], '%Y-%m-%d').replace(hour=19, minute=10, tzinfo=CT)) if studies else ''
    xml = '''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>%s</title>
    <link>%s/kreyol/</link>
    <atom:link href="%s" rel="self" type="application/rss+xml"/>
    <language>ht</language>
    <copyright>© Shekinah Haitian Seventh-day Adventist Church</copyright>
    <description>%s</description>
    <itunes:summary>%s</itunes:summary>
    <itunes:author>%s</itunes:author>
    <itunes:owner><itunes:name>%s</itunes:name><itunes:email>%s</itunes:email></itunes:owner>
    <itunes:image href="%s"/>
    <image><url>%s</url><title>%s</title><link>%s/kreyol/</link></image>
    <itunes:category text="Religion &amp; Spirituality"><itunes:category text="Christianity"/></itunes:category>
    <itunes:keywords>%s</itunes:keywords>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <lastBuildDate>%s</lastBuildDate>
%s
  </channel>
</rss>
''' % (e(TITLE), SITE, FEED, e(DESC), e(DESC), e(AUTHOR), e(AUTHOR), EMAIL, COVER, COVER, e(TITLE), SITE, e(KEYWORDS), last, '\n'.join(items))
    out = os.path.join(ROOT, 'podcast', 'kreyol.xml')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    old = open(out, encoding='utf-8').read() if os.path.exists(out) else ''
    if old != xml:
        open(out, 'w', encoding='utf-8').write(xml)
    return len(items)


if __name__ == '__main__':
    print('podcast feed:', build(), 'episodes')
