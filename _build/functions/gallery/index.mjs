// Shekinah gallery: serves 30 church photos per month, never repeating, from shared church albums.
const ORIGINS = ['https://shekinahsda.org', 'https://www.shekinahsda.org'];
const PER_MONTH = 30;

async function sql(query, params = []) {
  const url = process.env.DATABASE_URL;
  const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname;
  const r = await fetch('https://' + host.replace(/^[^.]+\./, 'api.') + '/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
    body: JSON.stringify({ query, params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('db: ' + (j.message || r.status));
  return j.rows || [];
}
const month = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 7); // Texas time, roughly
function cors(req) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Vary': 'Origin' };
}

async function assign(m) {
  const have = await sql('SELECT count(*)::int AS n FROM gallery_photos WHERE used_month = $1', [m]);
  const need = PER_MONTH - Number(have[0].n);
  if (need <= 0) return 0;
  let free = await sql('SELECT count(*)::int AS n FROM gallery_photos WHERE used_month IS NULL');
  if (Number(free[0].n) < need) {
    // Every photo has been shown once: start a fresh cycle, keeping this month's picks.
    await sql("UPDATE gallery_photos SET used_month = NULL WHERE used_month IS NOT NULL AND used_month <> $1", [m]);
  }
  // Spread picks across albums: random order within each album, then take the earliest ranks.
  await sql(
    "UPDATE gallery_photos SET used_month = $1 WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY album ORDER BY random()) AS rk FROM gallery_photos WHERE used_month IS NULL) t ORDER BY rk, random() LIMIT $2)",
    [m, need]);
  await sql("INSERT INTO automation_status (key, value, updated_at) VALUES ('gallery_last_rotation', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [m + ' picked ' + need]);
  // Running low (under 3 months left): queue one reminder email per month for the welcome mailer to send.
  const left = Number((await sql('SELECT count(*)::int AS n FROM gallery_photos WHERE used_month IS NULL'))[0].n);
  if (left < PER_MONTH * 3) {
    await sql("INSERT INTO automation_status (key, value, updated_at) VALUES ('gallery_alert', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() WHERE automation_status.value NOT LIKE '%' || $2 || '%'", ['pending|' + m + '|' + left, m]);
  }
  return need;
}

export default {
  async fetch(req) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'POST' && req.headers.get('x-neon-trigger-invocation-id')) {
        const n = await assign(month());
        return Response.json({ ok: true, picked: n });
      }
      if (req.method === 'POST' && path === '/upload') {
        const b = JSON.parse(await req.text());
        const tok = await sql("SELECT value FROM automation_status WHERE key = 'gallery_token'");
        if (!tok.length || !b.token || b.token !== tok[0].value) return new Response('no', { status: 403 });
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
        if (!m || !/^[a-z0-9-]{1,60}$/.test(b.name || '')) return new Response('bad', { status: 400 });
        await sql('INSERT INTO site_images (name, mime, b64, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, b64 = EXCLUDED.b64, updated_at = now()', [b.name, m[1], m[2]]);
        return Response.json({ ok: true });
      }
      if (req.method === 'GET' && path.startsWith('/img/')) {
        const name = path.slice(5).replace(/\.(jpe?g|png|webp)$/, '');
        const r = await sql('SELECT mime, b64 FROM site_images WHERE name = $1', [name]);
        if (!r.length) return new Response('Not found', { status: 404 });
        return new Response(Buffer.from(r[0].b64, 'base64'), { headers: { 'Content-Type': r[0].mime, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
      }
      if (req.method === 'POST' && path === '/ingest') {
        const b = JSON.parse(await req.text());
        const tok = await sql("SELECT value FROM automation_status WHERE key = 'gallery_token'");
        if (!tok.length || !b.token || b.token !== tok[0].value) return new Response('no', { status: 403 });
        let added = 0;
        for (const p of (b.photos || []).slice(0, 500)) {
          if (!/^https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_\-]+$/.test(p.u || '')) continue;
          const r = await sql('INSERT INTO gallery_photos (pid, url, w, h, taken_at, album) VALUES ($1,$2,$3,$4,to_timestamp($5/1000.0),$6) ON CONFLICT (pid) DO UPDATE SET url = EXCLUDED.url RETURNING id',
            [String(p.pid), p.u, p.w | 0, p.h | 0, Number(p.ts) || 0, String(p.album || '').slice(0, 200)]);
          if (r.length) added++;
        }
        return Response.json({ ok: true, added });
      }
      if (req.method === 'GET' && (path === '/' || path === '/month')) {
        const m = month();
        let rows = await sql('SELECT url, w, h, album FROM gallery_photos WHERE used_month = $1 ORDER BY id', [m]);
        if (rows.length < PER_MONTH) { await assign(m); rows = await sql('SELECT url, w, h, album FROM gallery_photos WHERE used_month = $1 ORDER BY id', [m]); }
        return new Response(JSON.stringify({ month: m, photos: rows.map(r => ({ src: r.url + '=w1600', thumb: r.url + '=w900', w: +r.w, h: +r.h, album: r.album })) }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...cors(req) } });
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      console.log('gallery error', e.message);
      return Response.json({ ok: false }, { status: 500, headers: cors(req) });
    }
  },
};
