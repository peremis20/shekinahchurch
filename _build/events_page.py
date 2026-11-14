#!/usr/bin/env python3
"""The public Church Events page at /events/ (Jimmy, Nov 11, 2026).

Events are added in the admin Calendar. This page loads them live from the api
(GET /events: only events marked "Show on the website"), so a new event shows up
right away without a rebuild. The footer is the same as the rest of the site.
build.py calls build() every night; it can also be run on its own.
"""
import os
import html as H
import kreyol_pages as K

API = 'https://br-old-sea-b51wuht3-api.compute.c-7.us-east-2.aws.neon.tech'
TITLE = 'Church Events | Shekinah Haitian SDA Church, Alvarado TX'
DESC = ('Upcoming worship services, youth programs, outreach and fellowship events at Shekinah Haitian '
        'Seventh-day Adventist Church in Alvarado, Texas. Everyone is welcome.')

CSS = """
:root{--navy:#13294B;--cream:#FAF6EE;--gold:#B8892F;--line:#EDE5D3;--ink:#3D4554;--green:#0E4A36;--muted:#5B6270}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--ink);font-family:'Mulish',system-ui,sans-serif;font-size:17px;line-height:1.6}
a{color:var(--green)}
.top{position:sticky;top:0;z-index:20;background:#13294B;border-bottom:1px solid #13294B}
.topin{max-width:1240px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:space-between}
.topin img{height:64px;width:auto;display:block}
.topnav{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.topnav a{color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:6px 0;border-bottom:2px solid transparent}
.topnav a:hover{color:#E3B04B}.topnav a.on{color:#E3B04B;border-bottom-color:#E3B04B}
.give{background:var(--green);color:#fff !important;border-radius:40px;padding:11px 20px !important;border:none !important}
.hero{background:linear-gradient(135deg,#13294B,#1E3D6E);color:#fff}
.heroin{max-width:1240px;margin:0 auto;padding:52px 24px 46px}
.kick{font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#E2B85C}
h1{font-family:'Libre Baskerville',serif;font-size:clamp(30px,5vw,46px);line-height:1.2;margin:10px 0 10px}
.hero p{margin:0;max-width:640px;color:#D9DEE8;font-size:18px}
main{max-width:1240px;margin:0 auto;padding:30px 24px 64px}
.tabs{display:flex;gap:8px;margin-bottom:22px}
.tabs button{border:1.5px solid #D9CFB8;background:#fff;border-radius:40px;padding:9px 18px;font:inherit;font-weight:800;font-size:15px;color:var(--navy);cursor:pointer}
.tabs button.on{background:var(--navy);border-color:var(--navy);color:#fff}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
.card{display:flex;gap:16px;border:1px solid var(--line);border-radius:16px;padding:18px;background:#fff;box-shadow:0 6px 20px rgba(19,41,75,.06)}
.date{flex:none;width:68px;border-radius:12px;background:var(--cream);text-align:center;padding:8px 4px;line-height:1.1;align-self:flex-start}
.date small{display:block;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#B23A48}
.date b{display:block;font-family:'Libre Baskerville',serif;font-size:28px;color:var(--navy);margin:2px 0}
.date span{font-size:12px;font-weight:700;color:var(--muted)}
.card h2{font-family:'Libre Baskerville',serif;font-size:19px;color:var(--navy);margin:2px 0 6px;line-height:1.3}
.when{font-weight:700;color:var(--navy);font-size:15px}
.where{font-size:15px;color:var(--muted);margin-top:2px}
.det{font-size:15px;margin:10px 0 0;white-space:pre-wrap}
.cat{display:inline-block;font-size:11.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;border-radius:40px;padding:3px 10px;background:var(--cbg);color:var(--cfg)}
.add{display:inline-block;margin-top:12px;font-size:14px;font-weight:800;text-decoration:none}
.k-Worship{--cbg:#DCE9FF;--cfg:#1F4FA8}.k-Youth{--cbg:#EDE2FA;--cfg:#5E2696}.k-Outreach{--cbg:#DDF3E2;--cfg:#1D6A34}.k-Meeting{--cbg:#FCEFC7;--cfg:#7A5512}.k-Fellowship{--cbg:#FDE7D2;--cfg:#A64E08}.k-Health{--cbg:#D6F3F3;--cfg:#0B6B71}.k-Other{--cbg:#EEF1F5;--cfg:#3D4759}
.mbar{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.mbar h2{font-family:'Libre Baskerville',serif;color:var(--navy);font-size:22px;margin:0;min-width:210px;text-align:center}
.mbar button{width:42px;height:42px;border-radius:10px;border:1.5px solid #D9CFB8;background:#fff;font-size:20px;color:var(--navy);cursor:pointer}
.grid7{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.dow{font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;text-align:center;letter-spacing:.5px}
.day{min-height:104px;border:1px solid var(--line);border-radius:12px;padding:6px;overflow:hidden}
.day.has{cursor:pointer}.day.out{background:#FAF8F3;color:#B0A99A}.day.today{border:2px solid var(--gold)}
.day b{font-size:14px;color:var(--navy)}
.chip{display:block;font-size:12.5px;font-weight:700;border-radius:6px;padding:3px 6px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--cbg);color:var(--cfg);cursor:pointer;border:none;width:100%;text-align:left;font-family:inherit}
.weekg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.wday{min-height:220px;border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px}.wday.today{border:2px solid var(--gold)}
.wh{display:flex;gap:6px;align-items:baseline}.wh small{font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase}.wh b{color:var(--navy)}
.wev{display:block;width:100%;text-align:left;border:none;border-radius:8px;padding:6px 7px;background:var(--cbg);color:var(--cfg);font:inherit;font-size:13px;font-weight:800;line-height:1.3;cursor:pointer;overflow-wrap:anywhere}.wev small{display:block;font-size:11.5px;font-weight:700;opacity:.85}.wn{font-size:12.5px;color:#B0A99A}
.yearg{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.ymon{border:1px solid var(--line);border-radius:12px;padding:10px}
.ymt{border:none;background:none;font:inherit;font-family:'Libre Baskerville',serif;font-weight:700;color:var(--navy);font-size:16px;padding:0 0 8px;cursor:pointer}
.yg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}.yg i{font-style:normal;font-size:11px;font-weight:800;color:var(--muted)}
.yd{border:none;background:none;font:inherit;font-size:13px;border-radius:6px;padding:3px 0;color:var(--ink);cursor:default}.yd.has{background:var(--cbg);color:var(--cfg);font-weight:800;cursor:pointer}.yd.today{outline:2px solid var(--gold)}
.empty{text-align:center;color:var(--muted);padding:44px 16px;border:1.5px dashed #D9CFB8;border-radius:16px;background:var(--cream)}
.visit{margin-top:40px;background:var(--cream);border:1px solid var(--line);border-radius:18px;padding:28px;display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.visit h2{font-family:'Libre Baskerville',serif;color:var(--navy);margin:0 0 4px;font-size:22px}
.visit p{margin:0;color:var(--muted)}
.btn{display:inline-block;background:#E2B85C;color:var(--navy);font-weight:800;border-radius:40px;padding:14px 26px;text-decoration:none}
.pop{position:fixed;inset:0;background:rgba(19,41,75,.55);display:none;align-items:center;justify-content:center;padding:16px;z-index:50}
.pop.show{display:flex}.pop .sheet{max-width:560px;width:100%;position:relative}.pop .sheet .card{box-shadow:0 20px 50px rgba(0,0,0,.3);padding-right:44px}
.pop .x{position:absolute;top:10px;right:12px;border:none;background:none;font-size:26px;color:var(--muted);cursor:pointer}
@media (max-width:760px){.topnav{gap:14px;font-size:14px;width:100%;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}.topnav a{white-space:nowrap}.topin img{height:48px}
 .weekg{grid-template-columns:1fr}.wday{min-height:0}.tabs{flex-wrap:wrap}.list{grid-template-columns:1fr}.day{min-height:58px;padding:4px}.day b{font-size:12px}.chip{font-size:0;height:7px;padding:0;background:var(--cfg)}.grid7{gap:3px}.mbar h2{font-size:18px;min-width:0;flex:1}}
"""

JS = r"""
(function(){
  var API = '%s/events', box = document.getElementById('ev'), tabs = document.getElementById('tabs'), pop = document.getElementById('pop');
  var EV = [], view = 'list', m = new Date(); m.setHours(0,0,0,0);
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pd(s){var a=s.split('-');return new Date(+a[0],+a[1]-1,+a[2]);}
  function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function t12(t){if(!t)return '';var a=t.split(':'),h=+a[0];return ((h+11)%%12+1)+':'+a[1]+' '+(h<12?'AM':'PM');}
  function when(e){var d=pd(e.starts_on), s=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    if(e.ends_on)s+=' to '+pd(e.ends_on).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    return s+(e.start_time?' · '+t12(e.start_time)+(e.end_time?' to '+t12(e.end_time):''):'');}
  function gcal(e){var d=e.starts_on.replace(/-/g,''), end;
    if(e.start_time){var st=d+'T'+e.start_time.replace(':','')+'00', et=(e.ends_on||e.starts_on).replace(/-/g,'')+'T'+(e.end_time||e.start_time).replace(':','')+'00';
      if(!e.end_time){var h=+e.start_time.split(':')[0]+1;et=d+'T'+String(Math.min(h,23)).padStart(2,'0')+e.start_time.split(':')[1]+'00';}
      end=st+'/'+et;}
    else{var x=pd(e.ends_on||e.starts_on);x.setDate(x.getDate()+1);end=d+'/'+ymd(x).replace(/-/g,'');}
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(e.title)+'&dates='+end+'&ctz=America/Chicago&location='+encodeURIComponent(e.location?e.location+', Shekinah SDA Church, 205 E Carver St, Alvarado, TX 76009':'Shekinah SDA Church, 205 E Carver St, Alvarado, TX 76009')+'&details='+encodeURIComponent((e.details||'')+'\n\nhttps://shekinahsda.org/events/');}
  function card(e){var d=pd(e.starts_on), k=esc(e.category||'Other');
    return '<article class="card"><div class="date"><small>'+d.toLocaleDateString('en-US',{month:'short'})+'</small><b>'+d.getDate()+'</b><span>'+d.toLocaleDateString('en-US',{weekday:'short'})+'</span></div>'+
      '<div style="min-width:0"><span class="cat k-'+k+'">'+k+'</span><h2>'+esc(e.title)+'</h2><div class="when">'+esc(when(e))+'</div>'+
      (e.location?'<div class="where">'+esc(e.location)+'</div>':'')+(e.details?'<p class="det">'+esc(e.details)+'</p>':'')+
      '<a class="add" href="'+gcal(e)+'" target="_blank" rel="noopener">+ Add to my calendar</a></div></article>';}
  function list(){var t=ymd(new Date()), up=EV.filter(function(e){return (e.ends_on||e.starts_on)>=t;});
    box.innerHTML=up.length?'<div class="list">'+up.map(card).join('')+'</div>':'<div class="empty">New events are coming soon. In the meantime, you are always welcome every Saturday: Sabbath School at 10:00 AM and worship at 11:00 AM.</div>';}
  function month(){var first=new Date(m.getFullYear(),m.getMonth(),1), start=new Date(first);start.setDate(1-first.getDay());var t=ymd(new Date()), cells=[];
    for(var i=0;i<42;i++){var d=new Date(start);d.setDate(start.getDate()+i);if(i===35&&d.getMonth()!==m.getMonth())break;var k=ymd(d);
      var evs=EV.filter(function(e){return k>=e.starts_on&&k<=(e.ends_on||e.starts_on);});
      cells.push('<div class="day'+(d.getMonth()!==m.getMonth()?' out':'')+(k===t?' today':'')+(evs.length?' has':'')+'" data-day="'+k+'"><b>'+d.getDate()+'</b>'+evs.map(function(e){return '<button class="chip k-'+esc(e.category||'Other')+'" data-id="'+esc(e.id)+'" title="'+esc(e.title)+'">'+esc(e.title)+'</button>';}).join('')+'</div>');}
    box.innerHTML='<div class="mbar"><button data-m="-1" aria-label="Previous month">&#8249;</button><h2>'+m.toLocaleDateString('en-US',{month:'long',year:'numeric'})+'</h2><button data-m="1" aria-label="Next month">&#8250;</button></div>'+
      '<div class="grid7">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(x){return '<div class="dow">'+x+'</div>';}).join('')+cells.join('')+'</div>';}
  function evsOn(k){return EV.filter(function(e){return k>=e.starts_on&&k<=(e.ends_on||e.starts_on);}).sort(function(a,b){return String(a.start_time||'').localeCompare(String(b.start_time||''));});}
  function bar(title,unit){return '<div class="mbar"><button data-m="-1" aria-label="Previous '+unit+'">&#8249;</button><h2>'+title+'</h2><button data-m="1" aria-label="Next '+unit+'">&#8250;</button></div>';}
  function week(){var ws=new Date(m);ws.setDate(m.getDate()-m.getDay());var we=new Date(ws);we.setDate(ws.getDate()+6);var t=ymd(new Date()), cells=[];
    var title=ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' to '+(ws.getMonth()===we.getMonth()?we.getDate():we.toLocaleDateString('en-US',{month:'short',day:'numeric'}))+', '+we.getFullYear();
    for(var i=0;i<7;i++){var d=new Date(ws);d.setDate(ws.getDate()+i);var k=ymd(d), evs=evsOn(k);
      cells.push('<div class="wday'+(k===t?' today':'')+'"><div class="wh"><small>'+d.toLocaleDateString('en-US',{weekday:'short'})+'</small><b>'+d.getDate()+'</b></div>'+
        (evs.length?evs.map(function(e){return '<button class="wev k-'+esc(e.category||'Other')+'" data-id="'+esc(e.id)+'"><small>'+esc(e.start_time&&k===e.starts_on?t12(e.start_time)+(e.end_time?' to '+t12(e.end_time):''):'All day')+'</small>'+esc(e.title)+'</button>';}).join(''):'<span class="wn">No events</span>')+'</div>');}
    box.innerHTML=bar(title,'week')+'<div class="weekg">'+cells.join('')+'</div>';}
  function year(){var y=m.getFullYear(), t=ymd(new Date()), out=[];
    for(var mo=0;mo<12;mo++){var f=new Date(y,mo,1), st=new Date(f);st.setDate(1-f.getDay());var g=['S','M','T','W','T','F','S'].map(function(x){return '<i>'+x+'</i>';});
      for(var q=0;q<42;q++){var d=new Date(st);d.setDate(st.getDate()+q);if(q===35&&d.getMonth()!==mo)break;var k=ymd(d), n=d.getMonth()===mo?evsOn(k):[];
        g.push(d.getMonth()!==mo?'<span></span>':'<button class="yd'+(n.length?' has k-'+esc(n[0].category||'Other'):'')+(k===t?' today':'')+'" data-day="'+k+'"'+(n.length?' title="'+esc(n.map(function(e){return e.title;}).join(', '))+'"':' tabindex="-1"')+'>'+d.getDate()+'</button>');}
      out.push('<div class="ymon"><button class="ymt" data-mon="'+mo+'">'+f.toLocaleDateString('en-US',{month:'long'})+'</button><div class="yg">'+g.join('')+'</div></div>');}
    box.innerHTML=bar(String(y),'year')+'<div class="yearg">'+out.join('')+'</div>';}
  function draw(){tabs.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-v')===view);});({list:list,week:week,month:month,year:year})[view]();}
  tabs.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;view=b.getAttribute('data-v');draw();});
  box.addEventListener('click',function(e){var b=e.target.closest('[data-m]');if(b){var sg=+b.getAttribute('data-m');m=view==='year'?new Date(m.getFullYear()+sg,0,1):view==='week'?new Date(m.getFullYear(),m.getMonth(),m.getDate()+7*sg):new Date(m.getFullYear(),m.getMonth()+sg,1);draw();return;}
    var mt=e.target.closest('[data-mon]');if(mt){m=new Date(m.getFullYear(),+mt.getAttribute('data-mon'),1);view='month';draw();return;}
    var c=e.target.closest('.chip,.wev');if(c){var ev=EV.filter(function(x){return String(x.id)===c.getAttribute('data-id');})[0];if(ev){pop.querySelector('.in').innerHTML=card(ev);pop.classList.add('show');}return;}
    var dy=e.target.closest('.day.has,.yd.has');if(dy){var k=dy.getAttribute('data-day'), evs=EV.filter(function(x){return k>=x.starts_on&&k<=(x.ends_on||x.starts_on);});
      pop.querySelector('.in').innerHTML='<div style="display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow:auto">'+evs.map(card).join('')+'</div>';pop.classList.add('show');}});
  pop.addEventListener('click',function(e){if(e.target===pop||e.target.closest('.x'))pop.classList.remove('show');});
  function ld(evs){try{var s=document.createElement('script');s.type='application/ld+json';
    s.textContent=JSON.stringify(evs.slice(0,20).map(function(e){var o={'@context':'https://schema.org','@type':'Event',name:e.title,startDate:e.starts_on+(e.start_time?'T'+e.start_time+':00-06:00':''),
      eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',eventStatus:'https://schema.org/EventScheduled',
      location:{'@type':'Place',name:'Shekinah Haitian Seventh-day Adventist Church',address:{'@type':'PostalAddress',streetAddress:'205 E Carver St',addressLocality:'Alvarado',addressRegion:'TX',postalCode:'76009',addressCountry:'US'}},
      organizer:{'@type':'Organization',name:'Shekinah Haitian Seventh-day Adventist Church',url:'https://shekinahsda.org/'},isAccessibleForFree:true};
      if(e.ends_on||e.end_time)o.endDate=(e.ends_on||e.starts_on)+(e.end_time?'T'+e.end_time+':00-06:00':'');if(e.details)o.description=e.details;return o;}));
    document.head.appendChild(s);}catch(x){}}
  fetch(API).then(function(r){return r.json();}).then(function(j){EV=(j.events||[]);draw();ld(EV);})
    .catch(function(){box.innerHTML='<div class="empty">We could not load the events right now. Please try again in a moment, or call us at (888) 219-3842.</div>';});
})();
""" % API


def page():
    footer = K.main_footer()
    head = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>%s</title><meta name="description" content="%s"><link rel="canonical" href="%s/events/">'
            '<meta property="og:title" content="Church Events at Shekinah"><meta property="og:description" content="%s">'
            '<meta property="og:url" content="%s/events/"><meta property="og:type" content="website">'
            '<link rel="icon" href="/favicon.ico?v=3" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=3">'
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">%s<style>%s</style></head><body>'
            % (H.escape(TITLE), H.escape(DESC), K.SITE, H.escape(DESC), K.SITE, K.FONTS, CSS))
    top = ('<header class="top"><div class="topin"><a href="/"><img src="/assets/logo-dark.png?v=4" alt="Shekinah Haitian Seventh-day Adventist Church" width="234" height="64"></a>'
           '<nav class="topnav"><a href="/">Home</a><a href="/about/">About</a><a href="/kreyol/">Bible Studies</a><a class="on" href="/events/">Events</a>'
           '<a href="/prayer-request/">Prayer Request</a><a href="/contact/">Contact</a><a class="give" href="/give/">Give</a></nav></div></header>')
    hero = ('<section class="hero"><div class="heroin"><div class="kick">Church Events</div><h1>What is happening at Shekinah</h1>'
            '<p>Worship, youth programs, outreach and fellowship in Alvarado, Texas. Everyone is welcome, and you never need to sign up to worship with us.</p></div></section>')
    main = ('<main><div class="tabs" id="tabs"><button data-v="list" class="on">Upcoming</button><button data-v="week">Week</button><button data-v="month">Month</button><button data-v="year">Year</button></div>'
            '<div id="ev"><div class="empty">Loading events...</div><noscript><div class="empty">Turn on JavaScript to see our events, or call us at (888) 219-3842.</div></noscript></div>'
            '<div class="visit"><div><h2>Visiting for the first time?</h2><p>Every Saturday: Sabbath School at 10:00 AM and worship at 11:00 AM, 205 E Carver St, Alvarado.</p></div>'
            '<a class="btn" href="/plan-your-visit/">Plan your visit</a></div></main>'
            '<div class="pop" id="pop" role="dialog" aria-modal="true"><div class="sheet"><button class="x" aria-label="Close">&times;</button><div class="in"></div></div></div>')
    return head + top + hero + main + footer + '<script>' + JS + '</script></body></html>\n'


def build():
    out = os.path.join(K.OUT, 'events', 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page())
    return out


if __name__ == '__main__':
    print(build())
