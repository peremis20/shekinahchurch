// Renders each route of the Shekinah app with Playwright and writes snaps.json {key: html}.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.env.PRERENDER_DIR || '/tmp/claude-0/prerender';
const RX = process.env.RX_MODULES || '/tmp/claude-0/rx/node_modules';
const CONTENT = fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, p);
  if (p.endsWith('/') || !fs.existsSync(f)) f = path.join(ROOT, 'app.html'); // SPA fallback
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
(async () => {
  await new Promise((r) => srv.listen(8790, r));
  const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'routes.json'), 'utf8'));
  const b = await chromium.launch();
  const out = {};
  for (const [key, url] of routes) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.route('https://unpkg.com/react@18.3.1/**', (r) => r.fulfill({ path: RX + '/react/umd/react.production.min.js', contentType: 'text/javascript' }));
    await p.route('https://unpkg.com/react-dom@18.3.1/**', (r) => r.fulfill({ path: RX + '/react-dom/umd/react-dom.production.min.js', contentType: 'text/javascript' }));
    await p.route('**/br-old-sea-*/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: /\/content(\?|$)/.test(r.request().url()) ? CONTENT : '{}' }));
    await p.route(/fonts\.(googleapis|gstatic)\.com|images\.unsplash\.com/, (r) => r.abort());
    await p.goto('http://localhost:8790' + url);
    await p.waitForFunction(() => { const r = document.getElementById('dc-root'); return r && r.innerText.length > 300; }, null, { timeout: 30000 });
    await p.waitForTimeout(900);
    const got = await p.evaluate(() => ({ html: document.getElementById('dc-root').innerHTML, path: location.pathname, h1: (document.querySelector('#dc-root h1') || {}).innerText || '' }));
    if (got.path !== url) throw new Error('route ' + url + ' ended at ' + got.path);
    out[key] = got.html;
    process.stderr.write(key + ' -> ' + got.h1.replace(/\n/g, ' ').slice(0, 70) + '\n');
    await p.close();
  }
  await b.close();
  srv.close();
  fs.writeFileSync(path.join(ROOT, 'snaps.json'), JSON.stringify(out));
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
