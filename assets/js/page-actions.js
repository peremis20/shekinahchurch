/* Like and Share buttons for Kreyol studies and blog posts (Nov 17, 2026).
   Kreyol study pages have <div class="pact"></div> placeholders.
   Blog posts are rendered by the site app, so the row is added after the byline and before "Next steps". */
(function () {
  var API = 'https://br-old-sea-b51wuht3-api.compute.c-7.us-east-2.aws.neon.tech/likes';
  var SHOW_COUNT_FROM = 5;
  var css = '.pact{display:flex;gap:10px;align-items:center;margin:14px 0;position:relative}'
    + '.pact button{display:inline-flex;align-items:center;gap:8px;border:1px solid #E3DAC6;background:#fff;color:#13294B;border-radius:40px;padding:9px 16px;font:700 15px/1 Mulish,system-ui,sans-serif;cursor:pointer}'
    + '.pact button:hover{border-color:#13294B}.pact svg{width:20px;height:20px;flex:0 0 auto}'
    + '.pact .lk.on{color:#C0392B;border-color:#E9B4AE;background:#FDF1EF}.pact .lk.on svg path{fill:#C0392B;stroke:#C0392B}'
    + '.pact .lk.pop svg{animation:pactpop .35s ease}@keyframes pactpop{50%{transform:scale(1.35)}}'
    + '.pact .menu{position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:#fff;border:1px solid #E3DAC6;border-radius:14px;box-shadow:0 8px 24px rgba(19,41,75,.15);padding:6px;display:none;min-width:200px}'
    + '.pact .menu.open{display:block}.pact .menu a,.pact .menu button{display:flex;width:100%;border:0;border-radius:10px;padding:10px 12px;background:none;color:#13294B;font:700 15px Mulish,system-ui,sans-serif;text-decoration:none;cursor:pointer}'
    + '.pact .menu a:hover,.pact .menu button:hover{background:#F4EDDE}';
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  var SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="19" r="3" fill="currentColor"/><path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4" stroke="currentColor" stroke-width="2"/></svg>';
  function ht() { return (document.documentElement.lang || '').slice(0, 2) === 'ht' || location.pathname.indexOf('/kreyol/') === 0; }
  function T(k) {
    var w = ht() ? { like: 'Mwen renmen l', liked: 'Ou renmen l', share: 'Pataje', copy: 'Kopye lyen an', copied: 'Lyen an kopye!' }
                 : { like: 'Like', liked: 'Liked', share: 'Share', copy: 'Copy link', copied: 'Link copied!' };
    return w[k];
  }
  function page() { var p = location.pathname; return p.charAt(p.length - 1) === '/' ? p : p + '/'; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var counts = {};
  function paint(row) {
    var b = row.querySelector('.lk'); if (!b) return;
    var on = store('shk_like:' + page()) === '1', n = counts[page()];
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.querySelector('span').textContent = (on ? T('liked') : T('like')) + (n >= SHOW_COUNT_FROM ? ' · ' + n : '');
  }
  function paintAll() { document.querySelectorAll('.pact').forEach(paint); }
  function load() {
    var p = page(); if (counts[p] !== undefined) return paintAll();
    fetch(API + '?p=' + encodeURIComponent(p)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) { document.querySelectorAll('.pact .lk').forEach(function (b) { b.remove(); }); return; } // server not ready: hide the heart
      counts[p] = j.n; paintAll();
    }).catch(function () {});
  }
  function fill(row) {
    if (row.getAttribute('data-ready')) return; row.setAttribute('data-ready', '1');
    row.innerHTML = '<button type="button" class="lk" aria-pressed="false">' + HEART + '<span></span></button>'
      + '<button type="button" class="sh" aria-haspopup="true">' + SHARE + '<span>' + T('share') + '</span></button><div class="menu" role="menu"></div>';
    paint(row);
    row.querySelector('.lk').addEventListener('click', function () {
      var p = page(), on = store('shk_like:' + p) !== '1', b = this;
      store('shk_like:' + p, on ? '1' : '0');
      if (counts[p] !== undefined) counts[p] = Math.max(0, counts[p] + (on ? 1 : -1));
      b.classList.remove('pop'); void b.offsetWidth; if (on) b.classList.add('pop'); paintAll();
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: p, on: on }) })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) { counts[p] = j.n; paintAll(); } }).catch(function () {});
      if (window.gtag) gtag('event', on ? 'like' : 'unlike', { page_path: p });
    });
    row.querySelector('.sh').addEventListener('click', function (ev) {
      ev.stopPropagation();
      var url = location.origin + page(), title = document.title.split(' | ')[0];
      if (window.gtag) gtag('event', 'share', { method: navigator.share ? 'device' : 'menu', page_path: page() });
      if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
      var m = row.querySelector('.menu'), u = encodeURIComponent(url), t = encodeURIComponent(title + ' ' + url);
      m.innerHTML = '<a role="menuitem" target="_blank" rel="noopener" href="https://wa.me/?text=' + t + '">WhatsApp</a>'
        + '<a role="menuitem" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '">Facebook</a>'
        + '<a role="menuitem" href="mailto:?subject=' + encodeURIComponent(title) + '&body=' + u + '">Email</a>'
        + '<button type="button" role="menuitem" class="cp">' + T('copy') + '</button>';
      m.classList.toggle('open');
      m.querySelector('.cp').addEventListener('click', function () {
        var c = this; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { c.textContent = T('copied'); }, function () { prompt('', url); });
      });
    });
  }
  document.addEventListener('click', function () { document.querySelectorAll('.pact .menu.open').forEach(function (m) { m.classList.remove('open'); }); });
  function blogRows() {
    if (!/^\/blog\/[a-z0-9-]+\/?$/.test(location.pathname)) return;
    var art = document.querySelector('article'), h1 = art && art.querySelector('h1');
    if (!h1) return;
    var by = h1.nextElementSibling;
    if (by && !(by.nextElementSibling && by.nextElementSibling.classList.contains('pact'))) {
      var top = document.createElement('div'); top.className = 'pact'; by.parentNode.insertBefore(top, by.nextElementSibling);
    }
    var nav = art.querySelector('nav[aria-label="Next steps"]');
    if (nav && !(nav.previousElementSibling && nav.previousElementSibling.classList.contains('pact'))) {
      var end = document.createElement('div'); end.className = 'pact'; nav.parentNode.insertBefore(end, nav);
    }
  }
  var last = '';
  function run() {
    blogRows();
    var rows = document.querySelectorAll('.pact'); if (!rows.length) return;
    rows.forEach(fill);
    if (last !== page()) { last = page(); paintAll(); load(); }
  }
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  run();
  new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 150); }).observe(document.body, { childList: true, subtree: true });
})();
