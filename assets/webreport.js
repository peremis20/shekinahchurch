/* Website visitors report (Google Analytics + Search Console). Shared by the admin Reports page and the view only page /report/. */
(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pday(s){var a=String(s||'').split('-');return new Date(+a[0],+a[1]-1,+a[2]);}
  function nf(n){n=+n||0;return n>=10000?(n/1000).toFixed(1).replace('.0','')+'K':n.toLocaleString();}
  function chg(a,b){a=+a||0;b=+b||0;if(!b)return a?'<small class="up">New</small>':'<small class="flat">No change</small>';var p=Math.round((a-b)/b*100);
    return '<small class="'+(p>0?'up':p<0?'down':'flat')+'">'+(p>0?'Up ':p<0?'Down ':'')+(p?Math.abs(p)+'%':'No change')+' vs previous 4 weeks</small>';}
  function gdate(s){s=String(s);return s.length===8?new Date(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8)):pday(s);}
  var CH=[];
  function drawOne(el){var c=CH[+el.getAttribute('data-ci')];if(!c)return;var W=Math.round(el.clientWidth);if(W<40||el._w===W)return;el._w=W;
    var rows=c.rows,keys=c.keys,colors=c.colors,H=190,L=32,R=6,T=8,B=22,max=1;rows.forEach(function(r){keys.forEach(function(k){max=Math.max(max,+r[k]||0);});});
    var top=Math.max(4,Math.ceil(max/4)*4);if(top>20){var st=Math.pow(10,Math.floor(Math.log10(top/4)));st=[1,2,5,10].map(function(m){return m*st;}).filter(function(v){return v*4>=max;})[0]||st*10;top=st*4;}
    var x=function(i){return L+(W-L-R)*(rows.length<2?0.5:i/(rows.length-1));}, y=function(v){return T+(H-T-B)*(1-(v/top));};
    var g='';for(var t=0;t<=4;t++){var v=top*t/4;g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#E7ECF3"/><text x="'+(L-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+Math.round(v)+'</text>';}
    var nl=Math.max(2,Math.floor((W-L)/72)),every=Math.max(1,Math.ceil(rows.length/nl));
    rows.forEach(function(r,i){if((i%every===0&&i<rows.length-1-every*0.9)||i===rows.length-1)g+='<text x="'+x(i)+'" y="'+(H-6)+'" text-anchor="'+(i===rows.length-1?'end':i===0?'start':'middle')+'">'+gdate(r.date).toLocaleDateString([], {month:'short',day:'numeric'})+'</text>';});
    keys.forEach(function(k,j){g+='<polyline fill="none" stroke="'+colors[j]+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="'+rows.map(function(r,i){return x(i).toFixed(1)+','+y(+r[k]||0).toFixed(1);}).join(' ')+'"/>';});
    el.innerHTML='<svg class="wr-chart" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" font-family="Mulish,system-ui,sans-serif" font-size="11.5" font-weight="600" fill="#6B7487" role="img" aria-label="Daily chart">'+g+'</svg>';}
  function drawAll(){var els=document.querySelectorAll('.wr-cv');for(var i=0;i<els.length;i++){drawOne(els[i]);if(window.ResizeObserver&&!els[i]._ro){els[i]._ro=new ResizeObserver(function(en){en.forEach(function(e){drawOne(e.target);});});els[i]._ro.observe(els[i]);}}}
  function lineChart(rows,keys,colors){if(!rows.length)return '<p class="meta">No daily data yet.</p>';CH.push({rows:rows,keys:keys,colors:colors});return '<div class="wr-cv" data-ci="'+(CH.length-1)+'"></div>';}
  function barRows(rows,label,val,extra){var max=1;rows.forEach(function(r){max=Math.max(max,+r[val]||0);});
    return rows.map(function(r){return '<tr><td class="t wr-bar"><span style="width:'+Math.round((+r[val]||0)/max*100)+'%"></span><b style="font-weight:700">'+esc(label(r))+'</b></td><td class="n"><b>'+nf(r[val])+'</b></td>'+(extra?extra(r):'')+'</tr>';}).join('');}
  var CHAN={'Direct':'Typed the address or a saved link','Organic Search':'Google or Bing search','Organic Social':'Facebook, Instagram and other social','Referral':'A link on another website','AI Assistant':'ChatGPT and other AI assistants','Unassigned':'Other','Email':'Email'};
  var EVN={audio_play:'Kreyòl audio plays',newsletter_signup:'Email sign ups',form_submit:'Forms sent',generate_lead:'Forms sent',file_download:'Downloads',click:'Outbound clicks'};
  window.shkWebReport=function(r){
      CH.length=0;var g=r.ga||{}, sc=r.gsc||{}, a=g.last28||{}, b=g.prev28||{}, sa=sc.last28||{}, sb=sc.prev28||{};
      var h='<div class="panel page"><div class="wr-top"><div class="sec-h">Website visitors, last 4 weeks</div><span class="meta" title="Real visits means people who stayed at least 10 seconds or opened more than one page, so bots and quick bounces are left out. Team visits are not counted.">Real visits leave out bots, quick bounces and team visits.</span></div><div class="wr-k">'+
        '<div class="kpi"><b>'+nf(a.engagedSessions)+'</b><span>Real visits</span>'+chg(a.engagedSessions,b.engagedSessions)+'</div>'+
        '<div class="kpi"><b>'+nf(a.activeUsers)+'</b><span>People who visited</span>'+chg(a.activeUsers,b.activeUsers)+'</div>'+
        '<div class="kpi"><b>'+nf(a.screenPageViews)+'</b><span>Pages viewed</span>'+chg(a.screenPageViews,b.screenPageViews)+'</div>'+
        '<div class="kpi"><b>'+nf(sa.clicks)+'</b><span>Visits from Google search</span>'+chg(sa.clicks,sb.clicks)+'</div>'+
        '<div class="kpi"><b>'+nf(sa.impressions)+'</b><span>Times shown on Google</span>'+chg(sa.impressions,sb.impressions)+'</div>'+
        '<div class="kpi"><b>'+(sa.position?(+sa.position).toFixed(1):'None')+'</b><span>Average place on Google (lower is better)</span></div></div>'+
        '<p class="meta" style="margin:8px 0 0">Last 7 days: '+nf((g.last7||{}).engagedSessions)+' real visits from '+nf((g.last7||{}).activeUsers)+' people. Average visit: '+Math.round((+a.averageSessionDuration||0)/60*10)/10+' minutes.</p></div>';
      var P=function(cls,title,inner){return '<div class="panel page wr-p '+cls+'"><div class="sec-h">'+title+'</div>'+inner+'</div>';};
      var T=function(head,rows){return '<div class="wr-tw"><table class="rtable"><tr>'+head+'</tr>'+rows+'</table></div>';};
      h+='<div class="wr-grid">';
      h+=P('c6','Visits per day, last 90 days','<div class="wr-leg"><span><i style="background:#1F63D8"></i>People who visited</span><span><i style="background:#1F8A3E"></i>Real visits</span></div>'+lineChart(g.daily||[],['activeUsers','engagedSessions'],['#1F63D8','#1F8A3E']));
      h+=P('c6','Google search, last 90 days','<div class="wr-leg"><span><i style="background:#B8892F"></i>Visits from Google</span><span class="wr-note">Google shares these about 2 to 3 days late</span></div>'+((sc.daily||[]).length?lineChart(sc.daily,['clicks'],['#B8892F']):'<p class="meta">'+(sc.error?'Search Console is not connected yet.':'No search data yet.')+'</p>'));
      h+=P('c4','Most viewed pages',T('<th>Page</th><th class="n">Views</th><th class="n">People</th>',barRows((g.pages||[]).slice(0,10),function(p){return (p.pageTitle||p.pagePath).split(' | ')[0];},'screenPageViews',function(p){return '<td class="n">'+nf(p.activeUsers)+'</td>';})));
      h+=P('c4','How people found us',T('<th>Way</th><th class="n">Visits</th><th class="n">Real</th>',barRows(g.sources||[],function(p){return CHAN[p.sessionDefaultChannelGroup]||p.sessionDefaultChannelGroup;},'sessions',function(p){return '<td class="n">'+nf(p.engagedSessions)+'</td>';})));
      h+=P('c4','Where visitors are',T('<th>City</th><th class="n">People</th><th class="n">Real</th>',barRows((g.cities||[]).filter(function(c){return c.city&&c.city!=='(not set)';}).slice(0,10),function(c){return c.city+(c.region?', '+c.region:'');},'activeUsers',function(c){return '<td class="n">'+nf(c.engagedSessions)+'</td>';})));
      h+=P('c6','What people searched on Google',(sc.queries||[]).length?T('<th>Search</th><th class="n">Visits</th><th class="n">Shown</th><th class="n">Place</th>',barRows(sc.queries.slice(0,10),function(q){return q.query;},'clicks',function(q){return '<td class="n">'+nf(q.impressions)+'</td><td class="n">'+q.position+'</td>';})):'<p class="meta">'+(sc.error?'Search Console is not connected yet.':'No search data yet.')+'</p>');
      var pl=(g.plays||[]).filter(function(x){var k=x['customEvent:study'];return k&&k!=='(not set)';}),tt=g.study_titles||{};
      var ev=(g.events||[]).filter(function(e){return EVN[e.eventName];});
      var dev=g.devices||[], dt=dev.reduce(function(t,d){return t+(+d.activeUsers||0);},0)||1;
      var act='<div class="wr-mini">'+ev.map(function(e){return '<div><b>'+nf(e.eventCount)+'</b><span>'+esc(EVN[e.eventName])+'</span></div>';}).join('')+
        dev.map(function(d){return '<div><b>'+Math.round((+d.activeUsers||0)/dt*100)+'%</b><span>On '+esc(d.deviceCategory==='mobile'?'phones':d.deviceCategory==='desktop'?'computers':d.deviceCategory+'s')+'</span></div>';}).join('')+'</div>';
      h+=P(pl.length?'c3':'c6','Actions and devices',act);
      if(pl.length)h+=P('c3','Kreyòl audio plays',T('<th>Study</th><th class="n">Plays</th>',barRows(pl.slice(0,10),function(x){var k=x['customEvent:study'];return tt[k]||k;},'eventCount')));
      h+='</div><p class="meta wr-upd">Website numbers cover the last 4 weeks unless noted. Updated every morning. Last update: '+esc(new Date(r.generated_at).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'.</p>';
      setTimeout(drawAll,0);
      return h;
  };
})();
