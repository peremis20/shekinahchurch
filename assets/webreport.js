/* Website visitors report (Google Analytics + Search Console). Shared by the admin Reports page and the view only page /report/. */
(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pday(s){var a=String(s||'').split('-');return new Date(+a[0],+a[1]-1,+a[2]);}
  function nf(n){n=+n||0;return n>=10000?(n/1000).toFixed(1).replace('.0','')+'K':n.toLocaleString();}
  function chg(a,b){a=+a||0;b=+b||0;if(!b)return a?'<small class="up">New</small>':'<small class="flat">No change</small>';var p=Math.round((a-b)/b*100);
    return '<small class="'+(p>0?'up':p<0?'down':'flat')+'">'+(p>0?'Up ':p<0?'Down ':'')+(p?Math.abs(p)+'%':'No change')+' vs previous 4 weeks</small>';}
  function gdate(s){s=String(s);return s.length===8?new Date(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8)):pday(s);}
  function lineChart(rows,keys,colors){if(!rows.length)return '<p class="meta">No daily data yet.</p>';
    var W=900,H=230,L=36,R=10,T=12,B=28,max=1;rows.forEach(function(r){keys.forEach(function(k){max=Math.max(max,+r[k]||0);});});
    var top=Math.max(4,Math.ceil(max/4)*4), nt=4;if(top>20){var st=Math.pow(10,Math.floor(Math.log10(top/4)));st=[1,2,5,10].map(function(m){return m*st;}).filter(function(v){return v*4>=max;})[0]||st*10;top=st*4;}
    var x=function(i){return L+(W-L-R)*(rows.length<2?0.5:i/(rows.length-1));}, y=function(v){return T+(H-T-B)*(1-(v/top));};
    var g='';for(var t=0;t<=4;t++){var v=top*t/4;g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#E7ECF3"/><text x="'+(L-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+Math.round(v)+'</text>';}
    var every=Math.max(1,Math.ceil(rows.length/8));rows.forEach(function(r,i){if((i%every===0&&i<rows.length-1-every*0.6)||i===rows.length-1)g+='<text x="'+x(i)+'" y="'+(H-8)+'" text-anchor="'+(i===rows.length-1?'end':i===0?'start':'middle')+'">'+gdate(r.date).toLocaleDateString([], {month:'short',day:'numeric'})+'</text>';});
    keys.forEach(function(k,j){g+='<polyline fill="none" stroke="'+colors[j]+'" stroke-width="2.5" stroke-linejoin="round" points="'+rows.map(function(r,i){return x(i).toFixed(1)+','+y(+r[k]||0).toFixed(1);}).join(' ')+'"/>';});
    return '<svg class="wr-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Daily chart">'+g+'</svg>';}
  function barRows(rows,label,val,extra){var max=1;rows.forEach(function(r){max=Math.max(max,+r[val]||0);});
    return rows.map(function(r){return '<tr><td class="t wr-bar"><span style="width:'+Math.round((+r[val]||0)/max*100)+'%"></span><b style="font-weight:700">'+esc(label(r))+'</b></td><td class="n"><b>'+nf(r[val])+'</b></td>'+(extra?extra(r):'')+'</tr>';}).join('');}
  var CHAN={'Direct':'Typed the address or a saved link','Organic Search':'Google or Bing search','Organic Social':'Facebook, Instagram and other social','Referral':'A link on another website','AI Assistant':'ChatGPT and other AI assistants','Unassigned':'Other','Email':'Email'};
  var EVN={audio_play:'Kreyòl audio plays',newsletter_signup:'Email sign ups',form_submit:'Forms sent',generate_lead:'Forms sent',file_download:'Downloads',click:'Outbound clicks'};
  window.shkWebReport=function(r){
      var g=r.ga||{}, sc=r.gsc||{}, a=g.last28||{}, b=g.prev28||{}, sa=sc.last28||{}, sb=sc.prev28||{};
      var h='<div class="panel page"><div class="sec-h" style="margin-bottom:4px">Website visitors, last 4 weeks</div><p class="meta" style="margin:0 0 12px">From Google Analytics and Google Search Console. Real visits means people who stayed at least 10 seconds or opened more than one page, so bots and quick bounces are left out. Team visits are not counted.</p><div class="wr-k">'+
        '<div class="kpi"><b>'+nf(a.engagedSessions)+'</b><span>Real visits</span>'+chg(a.engagedSessions,b.engagedSessions)+'</div>'+
        '<div class="kpi"><b>'+nf(a.activeUsers)+'</b><span>People who visited</span>'+chg(a.activeUsers,b.activeUsers)+'</div>'+
        '<div class="kpi"><b>'+nf(a.screenPageViews)+'</b><span>Pages viewed</span>'+chg(a.screenPageViews,b.screenPageViews)+'</div>'+
        '<div class="kpi"><b>'+nf(sa.clicks)+'</b><span>Visits from Google search</span>'+chg(sa.clicks,sb.clicks)+'</div>'+
        '<div class="kpi"><b>'+nf(sa.impressions)+'</b><span>Times shown on Google</span>'+chg(sa.impressions,sb.impressions)+'</div>'+
        '<div class="kpi"><b>'+(sa.position?(+sa.position).toFixed(1):'None')+'</b><span>Average place on Google (lower is better)</span></div></div>'+
        '<p class="meta">Last 7 days: '+nf((g.last7||{}).engagedSessions)+' real visits from '+nf((g.last7||{}).activeUsers)+' people. Average visit: '+Math.round((+a.averageSessionDuration||0)/60*10)/10+' minutes.</p></div>';
      h+='<div class="panel page"><div class="sec-h" style="margin-bottom:4px">Visits per day, last 90 days</div><div class="wr-leg"><span><i style="background:#1F63D8"></i>People who visited</span><span><i style="background:#1F8A3E"></i>Real visits</span></div>'+lineChart(g.daily||[],['activeUsers','engagedSessions'],['#1F63D8','#1F8A3E'])+'</div>';
      if((sc.daily||[]).length)h+='<div class="panel page"><div class="sec-h" style="margin-bottom:4px">Google search, last 90 days</div><div class="wr-leg"><span><i style="background:#B8892F"></i>Visits from Google</span></div>'+lineChart(sc.daily,['clicks'],['#B8892F'])+'<p class="meta">Google shares search numbers with a delay of about 2 to 3 days.</p></div>';
      h+='<div class="wr-2"><div class="panel page"><div class="sec-h" style="margin-bottom:8px">Most viewed pages</div><div style="overflow-x:auto"><table class="rtable"><tr><th>Page</th><th class="n">Views</th><th class="n">People</th></tr>'+
        barRows((g.pages||[]).slice(0,12),function(p){return (p.pageTitle||p.pagePath).split(' | ')[0];},'screenPageViews',function(p){return '<td class="n">'+nf(p.activeUsers)+'</td>';})+'</table></div></div>'+
        '<div class="panel page"><div class="sec-h" style="margin-bottom:8px">How people found us</div><div style="overflow-x:auto"><table class="rtable"><tr><th>Way</th><th class="n">Visits</th><th class="n">Real</th></tr>'+
        barRows(g.sources||[],function(p){return CHAN[p.sessionDefaultChannelGroup]||p.sessionDefaultChannelGroup;},'sessions',function(p){return '<td class="n">'+nf(p.engagedSessions)+'</td>';})+'</table></div></div></div>';
      h+='<div class="wr-2"><div class="panel page"><div class="sec-h" style="margin-bottom:8px">What people searched on Google</div>'+((sc.queries||[]).length?'<div style="overflow-x:auto"><table class="rtable"><tr><th>Search</th><th class="n">Visits</th><th class="n">Shown</th><th class="n">Place</th></tr>'+
        barRows(sc.queries.slice(0,15),function(q){return q.query;},'clicks',function(q){return '<td class="n">'+nf(q.impressions)+'</td><td class="n">'+q.position+'</td>';})+'</table></div>':'<p class="meta">'+(sc.error?'Search Console is not connected yet.':'No search data yet.')+'</p>')+'</div>'+
        '<div class="panel page"><div class="sec-h" style="margin-bottom:8px">Where visitors are</div><div style="overflow-x:auto"><table class="rtable"><tr><th>City</th><th class="n">People</th><th class="n">Real visits</th></tr>'+
        barRows((g.cities||[]).filter(function(c){return c.city&&c.city!=='(not set)';}).slice(0,10),function(c){return c.city+(c.region?', '+c.region:'');},'activeUsers',function(c){return '<td class="n">'+nf(c.engagedSessions)+'</td>';})+'</table></div></div></div>';
      var ev=(g.events||[]).filter(function(e){return EVN[e.eventName];});
      var dev=g.devices||[], dt=dev.reduce(function(t,d){return t+(+d.activeUsers||0);},0)||1;
      h+='<div class="panel page"><div class="sec-h" style="margin-bottom:10px">Actions and devices, last 4 weeks</div><div class="wr-k">'+
        ev.map(function(e){return '<div class="kpi"><b>'+nf(e.eventCount)+'</b><span>'+esc(EVN[e.eventName])+'</span></div>';}).join('')+
        dev.map(function(d){return '<div class="kpi"><b>'+Math.round((+d.activeUsers||0)/dt*100)+'%</b><span>On '+esc(d.deviceCategory==='mobile'?'phones':d.deviceCategory==='desktop'?'computers':d.deviceCategory+'s')+'</span></div>';}).join('')+'</div>'+
        '<p class="meta">Updated every morning. Last update: '+esc(new Date(r.generated_at).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'.</p></div>';
      return h;
  };
})();
