#!/usr/bin/env python3
"""Build /7-days-of-hope/: the free devotional people get when they join the email list (Jimmy, Nov 23, 2026).

Uses the same head, styles and main footer as the Kreyol pages, with an English header.
Run from anywhere: python3 _build/hope_page.py
"""
import json, os, re
import kreyol_pages as K

SLUG = '7-days-of-hope'
URL = K.SITE + '/' + SLUG + '/'
TITLE = '7 Days of Hope: A Free Devotional | Shekinah SDA Church'
DESC = 'Seven short devotionals for hard days: a Bible promise, a few honest words and one small step for each day of the week. Free from Shekinah Church.'

DAYS = [
    ('You are not forgotten',
     '"Can a woman forget her sucking child, that she should not have compassion on the son of her womb? yea, they may forget, yet will I not forget thee. Behold, I have graven thee upon the palms of my hands." Isaiah 49:15 to 16',
     ['Some seasons make you feel invisible. The calls stop coming, the prayers feel unanswered, and it seems like nobody notices what you are carrying.',
      'God answers that feeling with one of the most tender pictures in the Bible. A mother could sooner forget her newborn baby than God could forget you. Your name is not written on a sticky note that can fall off. It is engraved on His hands.'],
     'Write your name on a small card and put it somewhere you will see it. Each time you see it, say: "God has not forgotten me."'),
    ('Peace in the storm',
     '"And he arose, and rebuked the wind, and said unto the sea, Peace, be still. And the wind ceased, and there was a great calm." Mark 4:39',
     ['The disciples were experienced fishermen, and they still thought they were going to drown. Storms can frighten even strong people.',
      'Notice that Jesus was in the boat the whole time. The storm did not mean He had left them. With three words He brought a great calm. The same Jesus is in your boat today, and He still speaks peace.'],
     'Name your storm out loud to God in one sentence. Then sit quietly for one minute and pray: "Lord, speak peace."'),
    ('Strength for today',
     '"Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." Isaiah 41:10',
     ['You do not need strength for the whole year today. You only need strength for today.',
      'Count the promises in this one verse: I am with you, I am your God, I will strengthen you, I will help you, I will hold you up. That is five promises for one tired heart. God does not ask you to be strong. He promises to be your strength.'],
     'Choose the one task that worries you most today and ask God for help with that one thing.'),
    ('When you feel weak',
     '"And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness." 2 Corinthians 12:9',
     ['Paul asked God three times to take away something that was hurting him. God did not take it away. Instead, He gave Paul something better: enough grace for every single day.',
      'Weakness is not the end of your story. It is often the place where God does His best work. When you have nothing left, His grace is still more than enough.'],
     'Tell one trusted person where you feel weak right now, and ask them to pray for you this week.'),
    ('Let go of worry',
     '"Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus." Philippians 4:6 to 7',
     ['"Be careful for nothing" means do not be anxious about anything. Paul wrote these words from a prison cell, so he knew what it was to have real reasons to worry.',
      'His answer is simple: turn every worry into a prayer, and add a thank you. You may not understand how, but God promises a peace that guards your heart and mind like a soldier at the door.'],
     'Make two short lists: three things you are worried about, and three things you are thankful for. Pray over both.'),
    ('A day to rest',
     '"Remember the sabbath day, to keep it holy." Exodus 20:8',
     ['God knew we would be tempted to work without stopping, so He built a rest into every week. From Friday sunset to Saturday sunset, the Sabbath is a 24 hour gift: no deadlines, no pressure, just time with God and the people you love.',
      'Rest is not laziness. It is trust. When you stop for a day, you are saying: "God, the world is in Your hands, not mine."'],
     'Plan one restful thing for this Sabbath: a walk in nature, a meal with family, or worship with a church family.'),
    ('Hope that lasts',
     '"And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away." Revelation 21:4',
     ['Every hard day in this world has an expiration date. Jesus promised to come back, and when He does, He will personally wipe away every tear.',
      'That is not wishful thinking. It is the promise of the same Jesus who rose from the grave. Whatever you are facing today is real, but it is not forever. The best is still ahead.'],
     'Share one verse from this week with someone who needs hope. Hope grows when we give it away.'),
]


def page():
    body = []
    body.append('<main><section class="hope-hero"><div class="wrap"><span class="hope-kick">Free devotional</span>'
                '<h1>7 Days of Hope</h1><p>One Bible promise, a few honest words and one small step for each day of the week. '
                'Read one a day, or all of them at once. Bible verses from the King James Version.</p></div></section>'
                '<section class="wrap hope-days">')
    for i, (t, verse, paras, step) in enumerate(DAYS, 1):
        body.append('<article class="hope-day" id="day-%d"><span class="hope-n">Day %d</span><h2>%s</h2>'
                    '<blockquote>%s</blockquote>%s<p class="hope-step"><b>Today\'s step:</b> %s</p></article>'
                    % (i, i, K.e(t), K.e(verse), ''.join('<p>%s</p>' % K.e(p) for p in paras), K.e(step)))
    body.append('<article class="hope-day hope-pray"><h2>A prayer for this week</h2><p>Lord, thank You that You have not forgotten me. '
                'Speak peace to my storms, give me strength for today and grace for my weak places. Teach me to trust You with my worries '
                'and to rest in You. Fill me with the hope of Your soon return. In Jesus\' name, Amen.</p></article>')
    body.append('<section class="hope-next"><h2>Your next step</h2><div class="hope-grid">'
                '<a href="/prayer-request/"><b>Ask us to pray for you</b><span>Every request is read with care.</span></a>'
                '<a href="/bible-study/"><b>Start a free Bible study</b><span>At your own pace, with a real person.</span></a>'
                '<a href="/plan-your-visit/"><b>Visit us this Sabbath</b><span>Sabbath School 10:00 AM, Divine Worship 11:30 AM.</span></a>'
                '<a href="/kreyol/"><b>Listen in Kreyòl</b><span>Free Bible study audios in Haitian Creole.</span></a>'
                '</div></section></section></main>')
    return ''.join(body)


CSS = ('.hope-hero{background:#13294B;color:#fff;padding:48px 0 42px;border-radius:18px;max-width:760px;margin:0 auto}.hope-hero .wrap{padding:0 32px}.hope-days{max-width:760px;margin:0 auto;padding:0}'
       '.hope-kick{display:inline-block;background:#E2B85C;color:#13294B;font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:5px 12px}'
       '.hope-hero h1{font-family:"Libre Baskerville",Georgia,serif;font-size:clamp(32px,6vw,46px);margin:14px 0 10px;color:#fff}.hope-hero p{font-size:18px;line-height:1.6;color:#DCE3EE;margin:0}'
       '.hope-days{padding-top:24px;padding-bottom:40px}.hope-day{background:#fff;border:1px solid #EDE5D3;border-radius:16px;padding:24px 24px 18px;margin:0 0 18px}'
       '.hope-n{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A6420}.hope-day h2{font-family:"Libre Baskerville",Georgia,serif;font-size:24px;color:#13294B;margin:6px 0 12px}'
       '.hope-day blockquote{margin:0 0 14px;background:#FBF6EA;border-left:4px solid #D9A72B;border-radius:10px;padding:14px 18px;font-family:Georgia,serif;font-style:italic;font-size:17px;line-height:1.55;color:#13294B}'
       '.hope-day p{font-size:17px;line-height:1.7;color:#3D4554;margin:0 0 12px}.hope-step{background:#F4F7FB;border-radius:10px;padding:12px 16px}.hope-step b{color:#13294B}'
       '.hope-next h2{font-family:"Libre Baskerville",Georgia,serif;color:#13294B;font-size:24px;margin:28px 0 14px}.hope-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}'
       '@media(max-width:600px){.hope-hero .wrap{padding:0 22px}.hope-day{padding:18px 16px 12px}.hope-day blockquote{padding:12px 14px}}'
       '.hope-grid a{display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #EDE5D3;border-radius:14px;padding:16px;text-decoration:none;color:#13294B}.hope-grid a:hover{border-color:#13294B}.hope-grid span{color:#5B6270;font-size:15px}')

HEADER_EN = ('<header><div class="bar"><a class="brand" href="/"><img src="/assets/logo-dark.png?v=4" alt="Shekinah Haitian Seventh-day Adventist Church" width="168" height="46"></a>'
             '<nav><a href="/bible-study/">Bible Study</a><a href="/plan-your-visit/">Plan Your Visit</a><a href="/prayer-request/">Prayer</a></nav></div></header>')


def build():
    ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': '7 Days of Hope', 'description': DESC, 'url': URL, 'inLanguage': 'en',
          'author': {'@type': 'Organization', 'name': 'Shekinah Haitian Seventh-day Adventist Church'},
          'publisher': {'@type': 'Organization', 'name': 'Shekinah Haitian Seventh-day Adventist Church', 'url': K.SITE + '/'}}
    h = K.head(TITLE, DESC, URL, ld).replace('<html lang="ht">', '<html lang="en">', 1).replace('content="ht_HT"', 'content="en_US"', 1)
    h = h.replace(K.IMG, K.SITE + '/assets/share/shekinah-share.jpg') if os.path.exists(os.path.join(K.OUT, 'assets/share/shekinah-share.jpg')) else h
    html = h.replace('</head>', '<style>' + CSS + '</style></head>', 1) + HEADER_EN + page() + K.main_footer() + '</body></html>'
    os.makedirs(os.path.join(K.OUT, SLUG), exist_ok=True)
    open(os.path.join(K.OUT, SLUG, 'index.html'), 'w', encoding='utf-8').write(html)
    return URL


if __name__ == '__main__':
    print(build())
