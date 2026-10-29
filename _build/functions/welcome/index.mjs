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

// One short template for every form: logo, banner, a few warm sentences, one summary box, a verse, sign off.
const F = 'Helvetica,Arial,sans-serif', S = 'Georgia,serif';
const VISIT_TIMES = 'Sabbath School 10:00 AM · Divine Worship 11:00 AM';
const ADDRESS = '205 E Carver St, Alvarado, TX 76009';
// Use the first name only when the person typed one. Never guess or make up a name.
const firstName = (name) => { const f = String(name || '').trim().split(/\s+/)[0] || ''; return /[@\d]/.test(f) ? '' : f; };

function shortEmail({ subject, preheader, kicker, title, name, paras, boxLabel, boxLines, verse, sign, reason, unsub }) {
  const first = firstName(name);
  const hi = first ? `Hi ${esc(first)},` : 'Hi,';
  const box = boxLines && boxLines.length ? `<tr><td style="padding:4px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EDDE;border-radius:12px;border-left:5px solid #E2B85C"><tr><td style="padding:14px 18px;font-family:${F};font-size:15px;line-height:1.55;color:#13294B"><span style="font-size:11px;font-weight:800;letter-spacing:1.2px;color:#8A6420">${esc(boxLabel)}</span><br><strong>${boxLines.map(esc).join('</strong><br><strong>')}</strong></td></tr></table></td></tr>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FAF6EE;font-family:${F};color:#1B2433">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td align="center" style="background:#FFFFFF;padding:26px 28px 20px">
<a href="${SITE}/" target="_blank" style="text-decoration:none"><img src="${SITE}/assets/email/shekinah-logo.png" width="150" alt="Shekinah Haitian Seventh-day Adventist Church" style="display:block;border:0;outline:none;width:150px;height:auto;margin:0 auto"></a>
</td></tr>
<tr><td style="background:#13294B;padding:24px 28px 22px">
<div style="font-family:${F};font-size:12px;font-weight:800;letter-spacing:1.6px;color:#E2B85C">${esc(kicker)}</div>
<h1 style="margin:8px 0 0;font-family:${S};font-size:27px;line-height:1.25;color:#FFFFFF">${esc(title)}</h1>
</td></tr>
<tr><td style="padding:26px 28px 8px;font-family:${F};font-size:17px;line-height:1.65;color:#2C3443">
<p style="margin:0 0 14px">${hi}</p>
${paras.map((t) => `<p style="margin:0 0 14px">${esc(t)}</p>`).join('\n')}
</td></tr>
${box}
<tr><td style="padding:18px 28px 26px;font-family:${F};font-size:16px;line-height:1.65;color:#2C3443">
<p style="margin:0 0 18px;font-family:${S};font-size:17px;line-height:1.6;color:#13294B">${esc(verse)}</p>
<p style="margin:0">${esc(sign || 'With love,')}<br>Your church family at Shekinah</p>
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #EDE5D3;font-family:${F};font-size:12px;line-height:1.6;color:#6B7280">
You are receiving this because you ${esc(reason)} at shekinahsda.org. Have a question? Just reply to this email.<br>
Shekinah Haitian Seventh-day Adventist Church · ${ADDRESS}${unsub ? `<br><a href="${unsub}" target="_blank" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>` : ''}
</td></tr></table></td></tr></table></body></html>`;
  const text = [hi, ...paras, boxLines && boxLines.length ? boxLabel + ': ' + boxLines.join(', ') : '', verse, (sign || 'With love,') + '\nYour church family at Shekinah',
    unsub ? 'Unsubscribe: ' + unsub : '', 'Shekinah Haitian Seventh-day Adventist Church, ' + ADDRESS].filter(Boolean).join('\n\n');
  return { subject, html, text, unsub };
}

export function welcomeEmail(name, email) {
  return shortEmail({
    subject: 'Welcome to the Shekinah family', preheader: 'Thank you for joining us. We are so glad you are here.',
    kicker: 'BYENVENI · WELCOME', title: 'Welcome to the Shekinah family', name,
    paras: ['Thank you for joining our newsletter. You matter to us, and we are so glad you are here.',
      'Each week we will share Bible answers, words of encouragement, healthy recipes, and news from our church family. We would love to worship with you soon.'],
    boxLabel: 'JOIN US THIS SATURDAY', boxLines: [VISIT_TIMES, ADDRESS],
    verse: '"The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee." Numbers 6:24 to 25, KJV',
    sign: 'With joy and love,', reason: 'subscribed to our newsletter', unsub: unsubUrl(email),
  });
}

const LANGS = { English: 'English', 'Kreyòl': 'Kreyòl', French: 'French' };
const FORMATS = { 'In person at church': 'In person at church', 'By phone': 'By phone', 'Online video call': 'Online video call' };
export function bibleEmail(name, language, format) {
  const pick = [LANGS[language], FORMATS[format]].filter(Boolean).join(' · ');
  return shortEmail({
    subject: 'Thank you for your Bible study request', preheader: 'We received your request, and someone from Shekinah will reach out to you soon.',
    kicker: 'MÈSI · THANK YOU', title: "We're so glad you reached out", name,
    paras: ['Thank you for your interest in studying the Bible with us. Your request matters to us, and so do you.',
      'Someone from our church family will reach out to you as soon as possible to find a time that works for you. Until then, know that we are praying for you.'],
    boxLabel: 'YOUR REQUEST', boxLines: pick ? [pick] : [],
    verse: '"Thy word is a lamp unto my feet, and a light unto my path." Psalm 119:105, KJV',
    reason: 'requested a free Bible study',
  });
}

const TOPICS = ['Planning a visit', 'General question', 'Pastoral visit', 'Bible study', 'Baptism'];
export function contactEmail(name, topic) {
  const t = TOPICS.includes(topic) ? topic : '';
  return shortEmail({
    subject: 'We received your message', preheader: 'Thank you for reaching out. Someone from Shekinah will get back to you soon.',
    kicker: 'MÈSI · THANK YOU', title: 'We received your message', name,
    paras: ['Thank you for reaching out to us. Your message matters to us, and so do you.',
      'Someone from our church family will get back to you as soon as possible. Until then, know that we are praying for you.'],
    boxLabel: 'YOUR MESSAGE', boxLines: t ? [t] : [],
    verse: '"Casting all your care upon him; for he careth for you." 1 Peter 5:7, KJV',
    reason: 'sent us a message',
  });
}

export function membershipEmail(name, transfer, church, location) {
  const out = transfer === 'Transfer out';
  const where = [church, location].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const box = { boxLabel: 'YOUR REQUEST', boxLines: [(out ? 'Transfer out' : 'Transfer in') + (where ? (out ? ' to ' : ' from ') + where : '')], reason: 'requested a membership transfer', name };
  if (out) return shortEmail({ ...box,
    subject: 'We received your transfer request. We will miss you!', preheader: 'Wherever you go, keep the faith and keep in touch.',
    kicker: 'MÈSI · THANK YOU', title: 'We will miss you',
    paras: ['We received your membership transfer request. We are a little sad to see you go, but we understand that life brings new seasons and new places. Thank you for every Sabbath you shared with our church family.',
      'Someone from our church will reach out soon to help send your membership to your new church. Wherever you go, keep the faith, and please keep in touch. You will always have a home at Shekinah.'],
    verse: '"The LORD watch between me and thee, when we are absent one from another." Genesis 31:49, KJV',
  });
  return shortEmail({ ...box,
    subject: 'Welcome to the Shekinah family!', preheader: 'We received your transfer request, and we cannot wait to see you.',
    kicker: 'BYENVENI · WELCOME', title: 'Welcome to the Shekinah family',
    paras: ['We received your membership transfer request, and we are so glad to have you as a new member of our church family. You are important to us, and you belong here.',
      "Someone from our church will reach out soon to help complete your transfer. We can't wait to see you this Sabbath!"],
    verse: '"Behold, how good and how pleasant it is for brethren to dwell together in unity!" Psalm 133:1, KJV',
  });
}

// Pastoral care: the form saves a private prayer row whose message starts with PASTORAL CARE REQUEST.
// The email never repeats the topic or message; it only confirms how they asked to meet.
const MEET = ['In person at church', 'By phone', 'By video call', 'No preference'];
export function pastoralEmail(name, message) {
  const m = /Meet: ([^.]+)\./.exec(String(message || ''));
  const meet = m && MEET.includes(m[1].trim()) ? m[1].trim() : '';
  return shortEmail({
    subject: 'We received your pastoral care request', preheader: 'Thank you for reaching out. Our pastor will be in touch with you personally.',
    kicker: 'MÈSI · THANK YOU', title: 'We received your request', name,
    paras: ['Thank you for reaching out to us. Your request matters to us, and so do you. What you shared will be kept private.',
      'Our pastor or a church leader will reach out to you personally as soon as possible. Until then, know that you are not alone, and we are praying for you.'],
    boxLabel: 'HOW YOU WOULD LIKE TO MEET', boxLines: meet ? [meet] : [],
    verse: '"The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit." Psalm 34:18, KJV',
    reason: 'requested pastoral care',
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function visitEmail(name, date, guests) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  const when = d && !isNaN(d) ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() : '';
  const g = /^(\d|6\+)$/.test(String(guests || '')) ? (guests === '1' ? '1 guest' : guests + ' guests') : '';
  return shortEmail({
    subject: "We can't wait to meet you", preheader: 'Thank you for planning a visit to Shekinah. Here are your Sabbath details.',
    kicker: 'BYENVENI · WELCOME', title: "We can't wait to meet you", name,
    paras: ['Thank you for planning a visit to Shekinah. You are important to us, and we are so glad you are coming.',
      'Someone from our church family will reach out before your visit to answer any questions. Come as you are, and know that a warm seat is waiting for you.'],
    boxLabel: 'YOUR VISIT', boxLines: [[when, g].filter(Boolean).join(' · '), VISIT_TIMES, ADDRESS].filter(Boolean),
    verse: '"I was glad when they said unto me, Let us go into the house of the LORD." Psalm 122:1, KJV',
    reason: 'planned a visit',
  });
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

// Spam guard: never auto reply to link spam, sales pitches, or disposable inboxes.
const SPAM_WORDS = /\b(seo|backlinks?|guest post|link building|first page of google|rank(ing)? your (site|website)|web ?design services|crypto|bitcoin|casino|betting|viagra|cialis|forex|payday loan|lead generation|increase your (traffic|sales)|marketing agency|virtual assistant services)\b/i;
const THROWAWAY = /@(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|yopmail|trashmail|sharklasers|getnada|dispostable|maildrop)\./i;
function looksLikeSpam(row) {
  const text = [row.name, row.topic, row.message].filter(Boolean).join(' ');
  if ((text.match(/https?:\/\/|www\./gi) || []).length >= 2) return true;
  if (/https?:\/\/|www\./i.test(row.name || '')) return true;
  if (THROWAWAY.test(row.email || '')) return true;
  return SPAM_WORDS.test(text);
}

async function deliver(rows, kind, build) {
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (!EMAIL_RE.test(row.email)) continue;
    if (looksLikeSpam(row)) {
      await sql`INSERT INTO welcome_log (submission_id, email, status, detail, sent_at, attempts, kind) VALUES (${row.id}, ${row.email}, 'skipped', 'spam filter', now(), 3, ${kind}) ON CONFLICT (submission_id) DO NOTHING`;
      console.log(`${kind} ${row.id}: skipped by spam filter`);
      continue;
    }
    let res;
    try { res = await sendEmail(row, build(row), kind); } catch (e) { res = { ok: false, detail: String(e && e.message || e).slice(0, 500) }; }
    await sql`INSERT INTO welcome_log (submission_id, email, status, detail, sent_at, attempts, kind) VALUES (${row.id}, ${row.email}, ${res.ok ? 'sent' : 'failed'}, ${res.detail}, now(), 1, ${kind})
              ON CONFLICT (submission_id) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, sent_at = now(), attempts = welcome_log.attempts + 1`;
    res.ok ? sent++ : failed++;
    console.log(`${kind} ${row.id}: ${res.ok ? 'sent' : 'failed ' + res.detail}`);
  }
  return { checked: rows.length, sent, failed };
}

// Gallery running low: the gallery function queues 'gallery_alert' = pending|month|left; email Jimmy once.
async function galleryAlert() {
  const r = await sql`SELECT value FROM automation_status WHERE key = 'gallery_alert'`;
  if (!r.length || !String(r[0].value).startsWith('pending|')) return;
  const [, m, left] = String(r[0].value).split('|');
  const text = 'Hello Jimmy,\n\nThe photo gallery on shekinahsda.org has only ' + left + ' new church photos left, which is less than 3 months of monthly rotation.\n\nPlease add more albums on the church Google Photos and share them with a link, then ask Claude to add the new albums to the website gallery.\n\nShekinah website';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'gallery-low-' + m },
    body: JSON.stringify({ from: FROM, to: ['jimmy@peremis.com'], reply_to: REPLY_TO, subject: 'Please add more albums on the church Google Photos', text }),
  });
  await sql`UPDATE automation_status SET value = ${(res.ok ? 'sent|' : 'failed|') + m + '|' + left + '|' + res.status}, updated_at = now() WHERE key = 'gallery_alert'`;
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
  // Bible study, contact, and visit forms: one thank you per form sent, at most one per address per kind per day.
  const since = process.env.FORMS_SINCE || '2026-10-26T20:55:00Z';
  const forms = await sql`
    SELECT s.id, s.kind, s.topic, s.name, s.email, s.details->>'language' AS language, s.details->>'format' AS format,
           s.details->>'date' AS date, s.details->>'guests' AS guests, s.message AS message, s.details->>'transfer' AS transfer, s.details->>'church' AS church, s.details->>'churchLocation' AS location,
           CASE WHEN s.kind = 'contact' AND s.topic = 'Bible study request' THEN 'bible' WHEN s.kind = 'contact' AND s.topic = 'Membership transfer' THEN 'membership' WHEN s.kind = 'contact' THEN 'contact' WHEN s.kind = 'prayer' THEN 'pastoral' ELSE 'visit' END AS mail
    FROM submissions s
    WHERE (s.kind IN ('contact', 'visit') OR (s.kind = 'prayer' AND s.message LIKE 'PASTORAL CARE REQUEST%' AND s.created_at > '2026-10-27T02:00:00Z'::timestamptz))
      AND s.created_at > ${since}::timestamptz AND s.created_at > now() - interval '7 days'
      AND s.email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      AND s.email !~* '@(example|test)\\.'
      AND NOT EXISTS (SELECT 1 FROM welcome_log w WHERE w.submission_id = s.id AND (w.status = 'sent' OR w.attempts >= 3))
    ORDER BY s.created_at
    LIMIT ${BATCH}`;
  const seen = new Set();
  const due = [];
  for (const r of forms) {
    const key = r.mail + ':' + r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const recent = await sql`SELECT 1 FROM welcome_log WHERE lower(email) = lower(${r.email}) AND kind = ${r.mail} AND status = 'sent' AND sent_at > now() - interval '1 day' LIMIT 1`;
    if (!recent.length) due.push(r);
  }
  const results = {};
  for (const kind of ['bible', 'contact', 'visit', 'membership', 'pastoral']) {
    const build = kind === 'pastoral' ? (r) => pastoralEmail(r.name, r.message) : kind === 'membership' ? (r) => membershipEmail(r.name, r.transfer, r.church, r.location) : kind === 'bible' ? (r) => bibleEmail(r.name, r.language, r.format) : kind === 'contact' ? (r) => contactEmail(r.name, r.topic) : (r) => visitEmail(r.name, r.date, r.guests);
    results[kind] = await deliver(due.filter((r) => r.mail === kind), kind, build);
  }
  try { await galleryAlert(); } catch (e) { console.log('gallery alert error', e.message); }
  const fmt = (k, x) => `${k}: sent ${x.sent}, failed ${x.failed}`;
  await status([fmt('welcome', a), fmt('bible study', results.bible), fmt('contact', results.contact), fmt('visit', results.visit), fmt('membership', results.membership), fmt('pastoral', results.pastoral)].join('; '));
  return { welcome: a, ...results };
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
