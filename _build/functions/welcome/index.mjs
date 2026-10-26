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
  const F = 'Helvetica,Arial,sans-serif', S = 'Georgia,serif';
  // Bulletproof button: a padded table cell with a link, so it is clickable and looks like a button in every inbox.
  const btn = (href, label, bg, fg, border) => `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:4px 8px 4px 0"><tr><td align="center" bgcolor="${bg}" style="border-radius:10px;background:${bg};${border ? 'border:2px solid ' + border + ';' : ''}"><a href="${href}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:${F};font-size:15px;font-weight:700;line-height:1.2;color:${fg};text-decoration:none;border-radius:10px">${label}</a></td></tr></table>`;
  const time = (t, label) => `<td width="50%" align="center" valign="top" style="padding:16px 8px;background:#FFFFFF;border-radius:12px"><div style="font-family:${S};font-size:26px;font-weight:700;line-height:1.1;color:#13294B;white-space:nowrap">${t}</div><div style="margin-top:6px;font-family:${F};font-size:13px;font-weight:800;letter-spacing:1px;color:#8A6420;text-transform:uppercase">${label}</div></td>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Welcome to the Shekinah family</title></head>
<body style="margin:0;padding:0;background:#FAF6EE;font-family:${F};color:#1B2433">
<div style="display:none;max-height:0;overflow:hidden">We are so glad you are here. Join us this Saturday at 10 AM.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td align="center" style="background:#FFFFFF;padding:26px 28px 20px">
<a href="${SITE}/" target="_blank" style="text-decoration:none"><img src="${SITE}/assets/email/shekinah-logo.png" width="150" alt="Shekinah Haitian Seventh-day Adventist Church" style="display:block;border:0;outline:none;width:150px;height:auto;margin:0 auto"></a>
</td></tr>
<tr><td style="background:#13294B;padding:24px 28px 22px">
<div style="font-family:${F};font-size:12px;font-weight:800;letter-spacing:1.6px;color:#E2B85C">BYENVENI · WELCOME</div>
<h1 style="margin:8px 0 0;font-family:${S};font-size:28px;line-height:1.25;color:#FFFFFF">Welcome to the Shekinah family</h1>
</td></tr>
<tr><td style="padding:0"><a href="${SITE}/plan-your-visit/" target="_blank"><img src="${SITE}/assets/email/church-family.jpg" width="600" alt="Smiling children and adults from the Shekinah church family gathered together" style="display:block;border:0;width:100%;max-width:600px;height:auto"></a></td></tr>
<tr><td style="padding:26px 28px 6px;font-family:${F};font-size:17px;line-height:1.65;color:#2C3443">
<p style="margin:0 0 14px">${hi}</p>
<p style="margin:0 0 14px">We are so glad you are here! Thank you for joining our newsletter. Each week we will send you new Bible answers, words of encouragement, healthy recipes, and news from our church family.</p>
<p style="margin:0 0 6px">Wherever you are on your faith journey, there is a place for you at Shekinah.</p>
</td></tr>
<tr><td style="padding:14px 28px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#13294B;border-radius:16px"><tr><td style="padding:22px 18px 20px">
<div style="font-family:${F};font-size:12px;font-weight:800;letter-spacing:1.6px;color:#E2B85C;text-align:center">JOIN US THIS SATURDAY</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin-top:8px"><tr>${time('10:00 AM', 'Sabbath School')}${time('11:00 AM', 'Divine Worship')}</tr></table>
<p style="margin:10px 0 4px;font-family:${F};font-size:15px;line-height:1.5;color:#FFFFFF;text-align:center"><strong>205 E Carver St, Alvarado, TX 76009</strong><br><span style="color:#C9D0DC">Prayer meeting Wednesday at 7:30 PM · A shared meal after the Sabbath service</span></p>
<div style="text-align:center;margin-top:12px">${btn(SITE + '/plan-your-visit/', 'Plan your visit', '#E2B85C', '#13294B')}${btn('https://www.youtube.com/@SHEKINAHHaitianSDA/streams', 'Watch live', '#13294B', '#FFFFFF', '#E2B85C')}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 28px 26px;font-family:${F};font-size:16px;line-height:1.65;color:#2C3443">
<p style="margin:0 0 18px;font-family:${S};font-size:17px;line-height:1.6;color:#13294B">"The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee." Numbers 6:24 to 25, KJV</p>
<p style="margin:0">With joy and love,<br>Your church family at Shekinah</p>
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #EDE5D3;font-family:${F};font-size:12px;line-height:1.6;color:#6B7280">
You are receiving this because you subscribed at shekinahsda.org. Just reply to this email if you have a question.<br>
Shekinah Haitian Seventh-day Adventist Church · 205 E Carver St, Alvarado, TX 76009<br>
<a href="${u}" target="_blank" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${first ? 'Hi ' + first + ',' : 'Hello and welcome,'}

We are so glad you are here! Thank you for joining our newsletter. Each week we will send you new Bible answers, words of encouragement, healthy recipes, and news from our church family.

Wherever you are on your faith journey, there is a place for you at Shekinah.

JOIN US THIS SATURDAY
10:00 AM Sabbath School
11:00 AM Divine Worship
205 E Carver St, Alvarado, TX 76009
Prayer meeting Wednesday at 7:30 PM. A shared meal after the Sabbath service.
Plan your visit: ${SITE}/plan-your-visit/
Watch live: https://www.youtube.com/@SHEKINAHHaitianSDA/streams

"The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee." Numbers 6:24 to 25, KJV

With joy and love,
Your church family at Shekinah

Unsubscribe: ${u}
Shekinah Haitian Seventh-day Adventist Church, 205 E Carver St, Alvarado, TX 76009`;
  return { subject: 'Welcome to the Shekinah family', html, text, unsub: u };
}

export function bibleEmail(name, language, format) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const hi = first ? `Hi ${esc(first)},` : 'Hello,';
  const F = 'Helvetica,Arial,sans-serif', S = 'Georgia,serif';
  const LANGS = { English: 'English', 'Kreyòl': 'Kreyòl', French: 'French' };
  const FORMATS = { 'In person at church': 'In person at church', 'By phone': 'By phone', 'Online video call': 'Online video call' };
  const pick = [LANGS[language], FORMATS[format]].filter(Boolean).map(esc).join(' &middot; ');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Thank you for your Bible study request</title></head>
<body style="margin:0;padding:0;background:#FAF6EE;font-family:${F};color:#1B2433">
<div style="display:none;max-height:0;overflow:hidden">We received your request, and someone from Shekinah will reach out to you soon.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td align="center" style="background:#FFFFFF;padding:26px 28px 20px">
<a href="${SITE}/" target="_blank" style="text-decoration:none"><img src="${SITE}/assets/email/shekinah-logo.png" width="150" alt="Shekinah Haitian Seventh-day Adventist Church" style="display:block;border:0;outline:none;width:150px;height:auto;margin:0 auto"></a>
</td></tr>
<tr><td style="background:#13294B;padding:24px 28px 22px">
<div style="font-family:${F};font-size:12px;font-weight:800;letter-spacing:1.6px;color:#E2B85C">MÈSI · THANK YOU</div>
<h1 style="margin:8px 0 0;font-family:${S};font-size:27px;line-height:1.25;color:#FFFFFF">We're so glad you reached out</h1>
</td></tr>
<tr><td style="padding:26px 28px 8px;font-family:${F};font-size:17px;line-height:1.65;color:#2C3443">
<p style="margin:0 0 14px">${hi}</p>
<p style="margin:0 0 14px">Thank you for your interest in studying the Bible with us. Your request matters to us, and so do you.</p>
<p style="margin:0 0 14px">Someone from our church family will reach out to you as soon as possible to find a time that works for you. Until then, know that we are praying for you.</p>
</td></tr>
${pick ? `<tr><td style="padding:4px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EDDE;border-radius:12px;border-left:5px solid #E2B85C"><tr><td style="padding:14px 18px;font-family:${F};font-size:15px;line-height:1.5;color:#13294B"><span style="font-size:11px;font-weight:800;letter-spacing:1.2px;color:#8A6420">YOUR REQUEST</span><br><strong>${pick}</strong></td></tr></table></td></tr>` : ''}
<tr><td style="padding:18px 28px 26px;font-family:${F};font-size:16px;line-height:1.65;color:#2C3443">
<p style="margin:0 0 18px;font-family:${S};font-size:17px;line-height:1.6;color:#13294B">"Thy word is a lamp unto my feet, and a light unto my path." Psalm 119:105, KJV</p>
<p style="margin:0">With love,<br>Your church family at Shekinah</p>
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #EDE5D3;font-family:${F};font-size:12px;line-height:1.6;color:#6B7280">
You are receiving this because you requested a free Bible study at shekinahsda.org. Have a question? Just reply to this email.<br>
Shekinah Haitian Seventh-day Adventist Church · 205 E Carver St, Alvarado, TX 76009
</td></tr></table></td></tr></table></body></html>`;
  const text = `${first ? 'Hi ' + first + ',' : 'Hello,'}

Thank you for your interest in studying the Bible with us. Your request matters to us, and so do you.

Someone from our church family will reach out to you as soon as possible to find a time that works for you. Until then, know that we are praying for you.
${pick ? '\nYour request: ' + [LANGS[language], FORMATS[format]].filter(Boolean).join(', ') + '\n' : ''}
"Thy word is a lamp unto my feet, and a light unto my path." Psalm 119:105, KJV

With love,
Your church family at Shekinah

Shekinah Haitian Seventh-day Adventist Church, 205 E Carver St, Alvarado, TX 76009`;
  return { subject: 'Thank you for your Bible study request', html, text };
}

async function sendEmail(row, m, tag) {
  const headers = m.unsub ? { 'List-Unsubscribe': `<${m.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${tag}-${row.id}` },
    body: JSON.stringify({ from: FROM, to: [row.email], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text, headers, tags: [{ name: 'type', value: tag }] }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.text();
  return { ok: r.ok, detail: (r.ok ? body : `${r.status} ${body}`).slice(0, 500) };
}

async function deliver(rows, kind, build) {
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (!EMAIL_RE.test(row.email)) continue;
    let res;
    try { res = await sendEmail(row, build(row), kind); } catch (e) { res = { ok: false, detail: String(e && e.message || e).slice(0, 500) }; }
    await sql`INSERT INTO welcome_log (submission_id, email, status, detail, sent_at, attempts, kind) VALUES (${row.id}, ${row.email}, ${res.ok ? 'sent' : 'failed'}, ${res.detail}, now(), 1, ${kind})
              ON CONFLICT (submission_id) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, sent_at = now(), attempts = welcome_log.attempts + 1`;
    res.ok ? sent++ : failed++;
    console.log(`${kind} ${row.id}: ${res.ok ? 'sent' : 'failed ' + res.detail}`);
  }
  return { checked: rows.length, sent, failed };
}

async function run() {
  if (!process.env.RESEND_API_KEY) { await status('waiting for RESEND_API_KEY'); return { sent: 0, waiting: true }; }
  if (!SECRET || !PUBLIC_URL) { await status('missing UNSUB_SECRET or PUBLIC_URL'); return { sent: 0 }; }
  const news = await sql`
    SELECT DISTINCT ON (lower(s.email)) s.id, s.name, s.email
    FROM submissions s
    WHERE s.kind = 'newsletter' AND coalesce(s.unsubscribed, false) = false
      AND s.email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      AND s.created_at > now() - interval '30 days'
      AND s.email !~* '@(example|test)\\.'
      AND NOT EXISTS (SELECT 1 FROM welcome_log w WHERE lower(w.email) = lower(s.email) AND w.kind = 'welcome' AND (w.status = 'sent' OR w.attempts >= 3))
      AND NOT EXISTS (SELECT 1 FROM submissions u WHERE lower(u.email) = lower(s.email) AND u.unsubscribed = true)
    ORDER BY lower(s.email), s.created_at
    LIMIT ${BATCH}`;
  const a = await deliver(news, 'welcome', (r) => welcomeEmail(r.name, r.email));
  // Bible study requests: one thank you per request, at most one per address per day.
  const since = process.env.BIBLE_SINCE || '2026-10-26T20:45:00Z';
  const bible = await sql`
    SELECT s.id, s.name, s.email, s.details->>'language' AS language, s.details->>'format' AS format
    FROM submissions s
    WHERE s.kind = 'contact' AND s.topic = 'Bible study request'
      AND s.created_at > ${since}::timestamptz AND s.created_at > now() - interval '7 days'
      AND s.email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      AND s.email !~* '@(example|test)\\.'
      AND NOT EXISTS (SELECT 1 FROM welcome_log w WHERE w.submission_id = s.id AND (w.status = 'sent' OR w.attempts >= 3))
      AND NOT EXISTS (SELECT 1 FROM welcome_log w WHERE lower(w.email) = lower(s.email) AND w.kind = 'bible' AND w.status = 'sent' AND w.sent_at > now() - interval '1 day')
    ORDER BY s.created_at
    LIMIT ${BATCH}`;
  const b = await deliver(bible, 'bible', (r) => bibleEmail(r.name, r.language, r.format));
  await status(`welcome: checked ${a.checked}, sent ${a.sent}, failed ${a.failed}; bible study: checked ${b.checked}, sent ${b.sent}, failed ${b.failed}`);
  return { welcome: a, bible: b };
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
