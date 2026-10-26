// Shekinah welcome emails (Neon Function "welcome").
// A schedule trigger POSTs to "/" every 5 minutes. New newsletter subscribers from the
// submissions table get one welcome email through the Resend API, logged in welcome_log.
// GET or POST /unsubscribe?e=<email>&t=<signature> marks the address unsubscribed.
// Env: RESEND_API_KEY (required to send), WELCOME_FROM, WELCOME_REPLY_TO, UNSUB_SECRET,
//      PUBLIC_URL (this function's invocation URL). DATABASE_URL is injected by Neon.
import { createHmac, timingSafeEqual } from 'node:crypto';

// Tiny client for Neon's SQL over HTTP endpoint (same protocol as @neondatabase/serverless).
const DB = process.env.DATABASE_URL || '';
const SQL_URL = DB ? 'https://' + new URL(DB).hostname.replace(/^[^.]+\./, 'api.') + '/sql' : '';
async function sql(strings, ...vals) {
  const query = strings[0] + vals.map((v, i) => '$' + (i + 1) + strings[i + 1]).join('');
  const r = await fetch(SQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
    body: JSON.stringify({ query, params: vals.map((v) => (v == null ? null : String(v))) }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (j.message || ''));
  return j.rows || [];
}
const SITE = 'https://shekinahsda.org';
const FROM = process.env.WELCOME_FROM || 'Shekinah Haitian SDA Church <welcome@shekinahsda.org>';
const REPLY_TO = process.env.WELCOME_REPLY_TO || 'info@shekinahsda.org';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const SECRET = process.env.UNSUB_SECRET || '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH = 20;

const sign = (email) => createHmac('sha256', SECRET).update(email.toLowerCase()).digest('hex').slice(0, 32);
const unsubUrl = (email) => `${PUBLIC_URL}/unsubscribe?e=${encodeURIComponent(email)}&t=${sign(email)}`;
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function status(value) {
  await sql`INSERT INTO automation_status (key, value, updated_at) VALUES ('welcome_last_run', ${new Date().toISOString() + ' ' + value}, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

export function welcomeEmail(name, email) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const hi = first ? `Hi ${esc(first)},` : 'Hello and welcome,';
  const u = unsubUrl(email);
  const btn = (href, label, bg, fg) => `<a href="${href}" style="display:inline-block;margin:6px 8px 6px 0;padding:13px 22px;border-radius:10px;background:${bg};color:${fg};font-weight:700;font-size:15px;text-decoration:none">${label}</a>`;
  const card = (href, kicker, title, text) => `<tr><td style="padding:0 0 12px"><a href="${href}" style="display:block;padding:16px 18px;border-radius:12px;background:#F4EDDE;border-left:5px solid #E2B85C;color:#13294B;text-decoration:none"><span style="display:block;font-size:11px;font-weight:800;letter-spacing:1.2px;color:#8A6420">${kicker}</span><span style="display:block;margin-top:4px;font-family:Georgia,serif;font-size:17px;line-height:1.35">${title}</span><span style="display:block;margin-top:4px;font-size:14px;line-height:1.5;color:#3D4554">${text}</span></a></td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to the Shekinah family</title></head>
<body style="margin:0;padding:0;background:#FAF6EE;font-family:Helvetica,Arial,sans-serif;color:#1B2433">
<div style="display:none;max-height:0;overflow:hidden">Thank you for joining us. Here is what to expect, plus a few places to start.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td align="center" style="background:#FFFFFF;padding:26px 28px 20px">
<a href="${SITE}/" style="text-decoration:none"><img src="${SITE}/assets/email/shekinah-logo.png" width="170" height="176" alt="Shekinah Haitian Seventh-day Adventist Church" style="display:block;border:0;outline:none;width:170px;height:auto;margin:0 auto"></a>
</td></tr>
<tr><td style="background:#13294B;padding:26px 28px 24px;text-align:left">
<div style="font-size:12px;font-weight:800;letter-spacing:1.6px;color:#E2B85C">BYENVENI · WELCOME</div>
<h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:28px;line-height:1.25;color:#FFFFFF">Welcome to the Shekinah family</h1>
</td></tr>
<tr><td style="padding:28px 28px 8px;font-size:16px;line-height:1.7;color:#2C3443">
<p style="margin:0 0 16px">${hi}</p>
<p style="margin:0 0 16px">Thank you for joining the Shekinah Haitian Seventh-day Adventist Church newsletter. We are so glad you are here. Whether you found us while searching for answers from the Bible, a word of encouragement, or a healthy plant based recipe, we pray that what we share will bless you and your family.</p>
<p style="margin:0 0 16px">Each week we publish a new Bible answer, a devotional, a health article, and a recipe on our website. As a subscriber you will hear about new articles and news from our church family. We will never sell or share your email address.</p>
<h2 style="margin:24px 0 12px;font-family:Georgia,serif;font-size:20px;color:#13294B">A few good places to start</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${card(SITE + '/blog/', 'READ', 'Bible answers, devotionals, health, and recipes', 'Clear, Scripture centered articles for everyday life.')}
${card(SITE + '/bible-study/', 'GO DEEPER', 'Request a free Bible study', 'Study with us in Kreyòl, French, or English, at church, by phone, or online.')}
${card(SITE + '/prayer-request/', 'WE WILL PRAY WITH YOU', 'Send a prayer request', 'Share what is on your heart. You can keep your request private.')}
</table>
<h2 style="margin:24px 0 8px;font-family:Georgia,serif;font-size:20px;color:#13294B">Worship with us this Sabbath</h2>
<p style="margin:0 0 6px">Sabbath School begins Saturday at 10:00 AM, and our Divine Worship Service begins at 11:00 AM. Our prayer meeting is Wednesday at 7:30 PM. Our church family shares a meal after the Sabbath service, and you are welcome at the table.</p>
<p style="margin:0 0 14px"><strong>205 E Carver St, Alvarado, TX 76009</strong></p>
<div style="margin:0 0 8px">${btn(SITE + '/plan-your-visit/', 'Plan your visit', '#E2B85C', '#13294B')}${btn('https://www.youtube.com/@SHEKINAHHaitianSDA/streams', 'Watch worship live', '#13294B', '#FFFFFF')}</div>
<p style="margin:22px 0 4px;font-family:Georgia,serif;font-size:17px;line-height:1.6;color:#13294B">"The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee." Numbers 6:24 to 25, KJV</p>
<p style="margin:22px 0 0">With joy and love,<br>Your church family at Shekinah</p>
</td></tr>
<tr><td style="padding:20px 28px 28px;font-size:12px;line-height:1.6;color:#6B7280">
You are receiving this because you subscribed at shekinahsda.org. Just reply to this email if you have a question.<br>
Shekinah Haitian Seventh-day Adventist Church · 205 E Carver St, Alvarado, TX 76009<br>
<a href="${u}" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${first ? 'Hi ' + first + ',' : 'Hello and welcome,'}

Thank you for joining the Shekinah Haitian Seventh-day Adventist Church newsletter. We are so glad you are here. Whether you found us while searching for answers from the Bible, a word of encouragement, or a healthy plant based recipe, we pray that what we share will bless you and your family.

Each week we publish a new Bible answer, a devotional, a health article, and a recipe on our website. As a subscriber you will hear about new articles and news from our church family. We will never sell or share your email address.

A few good places to start:
Read our articles: ${SITE}/blog/
Request a free Bible study: ${SITE}/bible-study/
Send a prayer request: ${SITE}/prayer-request/

Worship with us this Sabbath: Sabbath School Saturday 10:00 AM, Divine Worship Service 11:00 AM, prayer meeting Wednesday 7:30 PM. Our church family shares a meal after the Sabbath service.
205 E Carver St, Alvarado, TX 76009
Plan your visit: ${SITE}/plan-your-visit/
Watch worship live: https://www.youtube.com/@SHEKINAHHaitianSDA/streams

"The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee." Numbers 6:24 to 25, KJV

With joy and love,
Your church family at Shekinah

Unsubscribe: ${u}
Shekinah Haitian Seventh-day Adventist Church, 205 E Carver St, Alvarado, TX 76009`;
  return { subject: 'Welcome to the Shekinah family', html, text, unsub: u };
}

async function sendOne(row) {
  const m = welcomeEmail(row.name, row.email);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `welcome-${row.id}` },
    body: JSON.stringify({
      from: FROM, to: [row.email], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
      headers: { 'List-Unsubscribe': `<${m.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'type', value: 'welcome' }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.text();
  return { ok: r.ok, detail: (r.ok ? body : `${r.status} ${body}`).slice(0, 500) };
}

async function run() {
  if (!process.env.RESEND_API_KEY) { await status('waiting for RESEND_API_KEY'); return { sent: 0, waiting: true }; }
  if (!SECRET || !PUBLIC_URL) { await status('missing UNSUB_SECRET or PUBLIC_URL'); return { sent: 0 }; }
  const rows = await sql`
    SELECT DISTINCT ON (lower(s.email)) s.id, s.name, s.email
    FROM submissions s
    WHERE s.kind = 'newsletter' AND coalesce(s.unsubscribed, false) = false
      AND s.email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      AND s.created_at > now() - interval '30 days'
      AND s.email !~* '@(example|test)\\.'
      AND NOT EXISTS (SELECT 1 FROM welcome_log w WHERE lower(w.email) = lower(s.email) AND (w.status = 'sent' OR w.attempts >= 3))
      AND NOT EXISTS (SELECT 1 FROM submissions u WHERE lower(u.email) = lower(s.email) AND u.unsubscribed = true)
    ORDER BY lower(s.email), s.created_at
    LIMIT ${BATCH}`;
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (!EMAIL_RE.test(row.email)) continue;
    let res;
    try { res = await sendOne(row); } catch (e) { res = { ok: false, detail: String(e && e.message || e).slice(0, 500) }; }
    await sql`INSERT INTO welcome_log (submission_id, email, status, detail, sent_at, attempts) VALUES (${row.id}, ${row.email}, ${res.ok ? 'sent' : 'failed'}, ${res.detail}, now(), 1)
              ON CONFLICT (submission_id) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, sent_at = now(), attempts = welcome_log.attempts + 1`;
    res.ok ? sent++ : failed++;
    console.log(`welcome ${row.id}: ${res.ok ? 'sent' : 'failed ' + res.detail}`);
  }
  await status(`checked ${rows.length}, sent ${sent}, failed ${failed}`);
  return { checked: rows.length, sent, failed };
}

function page(title, msg) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#FAF6EE;font-family:Helvetica,Arial,sans-serif;color:#13294B"><div style="max-width:560px;margin:60px auto;padding:32px;background:#fff;border-radius:16px"><h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 12px">${title}</h1><p style="font-size:16px;line-height:1.6;color:#2C3443">${msg}</p><p><a href="${SITE}/" style="color:#13294B;font-weight:700">Back to shekinahsda.org</a></p></div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function unsubscribe(url) {
  const e = url.searchParams.get('e') || '', t = url.searchParams.get('t') || '';
  const ok = SECRET && e && t.length === 32 && timingSafeEqual(Buffer.from(t), Buffer.from(sign(e)));
  if (!ok) return page('Link not valid', 'This unsubscribe link is not valid. Reply to any of our emails and we will remove you right away.');
  await sql`UPDATE submissions SET unsubscribed = true, updated_at = now() WHERE lower(email) = lower(${e}) AND kind = 'newsletter'`;
  return page('You are unsubscribed', 'You will not receive more newsletter emails from Shekinah. You are always welcome to worship with us, and you can subscribe again anytime on our website.');
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.replace(/\/$/, '') === '/unsubscribe') return unsubscribe(url);
    if (req.method === 'POST' && url.pathname === '/') {
      if (!req.headers.get('x-neon-trigger-invocation-id')) return Response.json({ error: 'not a trigger call' }, { status: 403 });
      try { return Response.json(await run()); }
      catch (e) { console.error(e); try { await status('error ' + String(e.message || e).slice(0, 200)); } catch {} return Response.json({ error: 'failed' }, { status: 500 }); }
    }
    return Response.json({ ok: true, service: 'shekinah welcome emails' });
  },
};
