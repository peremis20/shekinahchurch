// Shekinah church API (Neon Function "api"). Rebuilt Nov 2026 with per person permissions.
// It replaces the old "shekinah" function (source lost) and the "members" function.
// Public:  POST /submit, GET /content
// Sign in: POST /admin/login/start, POST /admin/login/verify, GET /admin/check, POST /admin/logout
// Admin:   /admin/list, update, assign, reply, create, edit, delete, subscribers, broadcast,
//          content, content/save, admins, admins/add, admins/update, admins/remove
// Members: GET /members, POST /members/save, POST /members/delete
// Every permission is checked HERE, on the server. The admin screen only hides what a person cannot use.
// Mail goes through the "welcome" function (POST /send), which holds the Resend key. The two functions
// share a secret kept in automation_status (key mail_relay_key). DATABASE_URL is injected by Neon.
import { createHash, randomBytes, randomInt } from 'node:crypto';

const DB = process.env.DATABASE_URL || '';
const SQL_URL = process.env.SQL_URL || (DB ? 'https://' + new URL(DB).hostname.replace(/^[^.]+\./, 'api.') + '/sql' : '');
const MAIL_URL = (process.env.MAIL_URL || 'https://br-old-sea-b51wuht3-welcome.compute.c-7.us-east-2.aws.neon.tech').replace(/\/$/, '');
const SITE = 'https://shekinahsda.org';
const ORIGINS = [SITE, 'https://www.shekinahsda.org'];
const STAFF_INBOX = process.env.STAFF_INBOX || 'info@shekinahsda.org';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- database (Neon SQL over HTTP) ----------
async function q(query, params = []) {
  const r = await fetch(SQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
    body: JSON.stringify({ query, params: params.map((v) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v))) }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (j.message || ''));
  return j.rows || [];
}
// Rows as real JSON (booleans, numbers and jsonb keep their types).
async function rows(query, params = []) {
  const r = await q(`SELECT coalesce(json_agg(t), '[]'::json) AS j FROM (${query}) t`, params);
  const j = r[0] ? r[0].j : '[]';
  return typeof j === 'string' ? JSON.parse(j) : j;
}
const one = async (query, params) => (await rows(query, params))[0] || null;
// One INSERT or UPDATE with RETURNING, read back as real JSON. `pick` chooses the columns to return.
async function wrote(stmt, params = [], pick = '*') {
  const r = await q(`WITH x AS (${stmt}) SELECT coalesce(json_agg(t), '[]'::json) AS j FROM (SELECT ${pick} FROM x) t`, params);
  const j = r[0] ? r[0].j : '[]';
  return (typeof j === 'string' ? JSON.parse(j) : j)[0] || null;
}

// ---------- permissions ----------
// A person has a "title" (a preset) and optional per person overrides in admins.perms.
// admins.role stays one of admin | staff | volunteer for older code; the title is what the Team page shows.
export const AREAS = ['prayer', 'visit', 'contact', 'bible', 'transfer', 'newsletter'];
export const PERMS = ['messages_manage', 'messages_delete', 'members_view', 'members_edit', 'members_delete', 'site_edit', 'email_list', 'team_manage', 'calendar_edit'];
const ALL = Object.fromEntries(PERMS.map((p) => [p, true]));
const NONE = Object.fromEntries(PERMS.map((p) => [p, false]));
export const TITLES = {
  admin:     { label: 'Admin',           role: 'admin',     perms: { ...ALL }, areas: AREAS },
  pastor:    { label: 'Pastor',          role: 'staff',     perms: { ...NONE, messages_manage: true, members_view: true, members_edit: true, site_edit: true, calendar_edit: true }, areas: AREAS },
  elder:     { label: 'Elder',           role: 'volunteer', perms: { ...NONE, messages_manage: true, members_view: true }, areas: ['prayer', 'visit', 'contact', 'bible'] },
  clerk:     { label: 'Church clerk',    role: 'volunteer', perms: { ...NONE, messages_manage: true, members_view: true, members_edit: true }, areas: ['transfer'] },
  staff:     { label: 'Staff',           role: 'staff',     perms: { ...NONE, messages_manage: true, members_view: true, members_edit: true, site_edit: true, calendar_edit: true }, areas: AREAS },
  editor:    { label: 'Website editor',  role: 'volunteer', perms: { ...NONE, site_edit: true, calendar_edit: true }, areas: [] },
  leader:    { label: 'Ministry leader', role: 'volunteer', perms: { ...NONE }, areas: ['visit', 'contact', 'bible'] },
  volunteer: { label: 'Volunteer',       role: 'volunteer', perms: { ...NONE }, areas: AREAS },
};
function access(a) {
  const title = TITLES[a.title] ? a.title : TITLES[a.role] ? a.role : 'volunteer';
  const base = TITLES[title];
  const o = a.perms && typeof a.perms === 'object' ? a.perms : {};
  const perms = {};
  for (const p of PERMS) perms[p] = typeof o[p] === 'boolean' ? o[p] : base.perms[p];
  let areas = Array.isArray(o.areas) ? o.areas.filter((x) => AREAS.includes(x)) : base.areas.slice();
  if (title === 'admin') { Object.assign(perms, ALL); areas = AREAS.slice(); } // an admin always has everything
  return { title, role: base.role, perms, areas, can_see_private: !!a.can_see_private };
}
// Which area a message belongs to.
export function areaOf(s) {
  if (s.kind === 'contact' && s.topic === 'Bible study request') return 'bible';
  if (s.kind === 'contact' && s.topic === 'Membership transfer') return 'transfer';
  return s.kind;
}
const canSee = (me, s) => me.areas.includes(areaOf(s)) && (!s.is_private || me.can_see_private);

// ---------- http helpers ----------
class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const need = (ok, status, msg) => { if (!ok) throw new Fail(status, msg); };
function cors(req, pub) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': pub ? '*' : ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const str = (v, max = 300) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
const lower = (v) => str(v, 254).toLowerCase();
async function body(req) {
  const t = await req.text();
  need(t.length <= 400000, 413, 'That is too large to send.');
  try { const j = t ? JSON.parse(t) : {}; return j && typeof j === 'object' ? j : {}; } catch { throw new Fail(400, 'Could not read the request.'); }
}

// ---------- mail (through the welcome function) ----------
let mailKey = '';
async function mail(m) {
  try {
    if (!mailKey) { const r = await q("SELECT value FROM automation_status WHERE key = 'mail_relay_key'"); mailKey = r[0] ? r[0].value : ''; }
    if (!mailKey) return { ok: false, detail: 'mail is not set up' };
    const r = await fetch(MAIL_URL + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mail-key': mailKey }, body: JSON.stringify(m), signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok !== false, detail: String(j.detail || j.error || r.status).slice(0, 300) };
  } catch (e) { return { ok: false, detail: String(e.message || e).slice(0, 300) }; }
}

// ---------- team invite email (the template every new team member receives) ----------
const INV_ADDRESS = '205 E Carver St, Alvarado, TX 76009', INV_F = 'Helvetica,Arial,sans-serif', INV_S = 'Georgia,serif';
const ROLE_TEXT={
  admin:'Full access to the church admin, including the team and website settings.',
  pastor:'Read and answer messages and prayer requests, view and update member records, and update the website.',
  elder:'Read and answer prayer requests, visit plans, questions and Bible study requests, and view member records.',
  clerk:'Handle membership transfer requests and keep member records up to date.',
  staff:'Read and answer messages and prayer requests, view and update member records, and update the website.',
  editor:'Update the website, such as events, announcements and service times.',
  leader:'Follow up with first time visitors, questions and Bible study requests.',
  volunteer:'Read and help answer messages that come in through the website.',
};
function inviteMail({ label, title, custom }) {
  const what = custom ? 'Your access has been set up for the work you will be helping with.' : ROLE_TEXT[title];
  const url = SITE + '/admin/';
  const subject = 'Welcome to the Shekinah church admin team';
  const text = `Hello,

You have been added to the Shekinah Haitian Seventh-day Adventist Church admin team as ${label}. Thank you for serving our church family.

What you can do: ${what}

How to sign in
1. Go to ${url}
2. Enter this email address.
3. We will email you a 6 digit code. Enter it to sign in. There is no password to remember.

Please keep the messages and prayer requests you see private. They were shared with our church in trust.

If you were not expecting this or have a question, write to info@shekinahsda.org.

Blessings,
Shekinah Haitian Seventh-day Adventist Church

This message was sent from a no reply address (noreply@shekinahsda.org). Replies to it are not read.
${INV_ADDRESS}`;
  const p = (t, x = '') => `<p style="margin:0 0 16px;${x}">${t}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#FAF6EE">
<div style="background:#FAF6EE;padding:28px 12px;font-family:${INV_F}">
 <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #EDE5D3">
  <div style="background:#13294B;padding:22px 24px;text-align:center"><img src="${SITE}/assets/logo-dark.png" width="280" alt="Shekinah Haitian Seventh-day Adventist Church" style="width:280px;max-width:100%;height:auto;border:0"></div>
  <div style="padding:30px 32px 8px;font-size:16px;line-height:1.65;color:#2C3443">
   <h1 style="font-family:${INV_S};font-size:24px;line-height:1.3;color:#13294B;margin:0 0 18px;font-weight:700">Welcome to the admin team</h1>
   ${p('Hello,')}
   ${p(`You have been added to the Shekinah Haitian Seventh-day Adventist Church admin team as <b style="color:#13294B">${label}</b>. Thank you for serving our church family.`)}
   <div style="background:#F4F7FB;border-left:4px solid #D9A72B;border-radius:8px;padding:14px 16px;margin:0 0 22px"><div style="font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#5B6270;margin-bottom:4px">What you can do</div>${what}</div>
   <div style="text-align:center;margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#0E4A36;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px">Sign in to the church admin</a></div>
   <h2 style="font-size:16px;color:#13294B;margin:0 0 8px">How to sign in</h2>
   <ol style="margin:0 0 20px;padding-left:22px"><li>Click the button above or go to <a href="${url}" style="color:#0E4A36">shekinahsda.org/admin</a>.</li><li>Enter this email address.</li><li>We will email you a 6 digit code. Enter it to sign in. There is no password to remember.</li></ol>
   ${p('Please keep the messages and prayer requests you see private. They were shared with our church in trust.')}
   ${p('If you were not expecting this or have a question, write to <a href="mailto:info@shekinahsda.org" style="color:#0E4A36">info@shekinahsda.org</a>.')}
   ${p('Blessings,<br><b style="color:#13294B">Shekinah Haitian Seventh-day Adventist Church</b>', 'margin-bottom:26px')}
  </div>
  <div style="border-top:1px solid #EDE5D3;padding:16px 32px 22px;font-size:12.5px;line-height:1.6;color:#6B7280;text-align:center">This message was sent from a no reply address (noreply@shekinahsda.org). Replies to it are not read.<br>${INV_ADDRESS}</div>
 </div>
</div></body></html>`;
  return { subject, text, html };
}

// ---------- rate limits ----------
async function limit(key, max, minutes) {
  const r = await q("SELECT count(*) AS n FROM rate_events WHERE key = $1 AND at > now() - ($2 || ' minutes')::interval", [key, minutes]);
  if (Number(r[0].n) >= max) return false;
  await q('INSERT INTO rate_events (key) VALUES ($1)', [key]);
  if (randomInt(50) === 0) await q("DELETE FROM rate_events WHERE at < now() - interval '2 days'");
  return true;
}
const ip = (req) => str((req.headers.get('x-forwarded-for') || '').split(',')[0] || req.headers.get('x-real-ip') || 'unknown', 60);

// ---------- sessions ----------
async function who(req) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') || '');
  need(m, 401, 'Please sign in again.');
  const a = await one(`SELECT a.email, a.role, a.title, a.perms, a.can_see_private FROM admin_sessions s JOIN admins a ON a.email = s.email
                       WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha(m[1])]);
  need(a, 401, 'Please sign in again.');
  return { email: a.email, token: m[1], ...access(a) };
}
const allow = (me, perm) => need(me.perms[perm], 403, 'You do not have access to this. Ask an admin if you need it.');

async function loginStart(req) {
  const b = await body(req), email = lower(b.email);
  need(EMAIL_RE.test(email), 400, 'Please enter your email address.');
  if (!(await limit('login-ip:' + ip(req), 20, 15)) || !(await limit('login:' + email, 5, 15))) throw new Fail(429, 'Too many tries. Please wait 15 minutes and try again.');
  const a = await one('SELECT email FROM admins WHERE lower(email) = $1', [email]);
  if (a) {
    const code = String(randomInt(1000000)).padStart(6, '0');
    await q(`INSERT INTO admin_codes (email, code_hash, expires_at, attempts) VALUES ($1, $2, now() + interval '10 minutes', 0)
             ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`, [a.email, sha(a.email.toLowerCase() + ':' + code)]);
    const sent = await mail({ to: a.email, subject: 'Your Shekinah admin sign in code: ' + code, tag: 'admin-code',
      text: 'Your sign in code for the Shekinah church admin is ' + code + '.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.' });
    if (!sent.ok) { console.log('code mail failed', sent.detail); throw new Fail(502, 'We could not send the code right now. Please try again in a minute.'); }
  }
  return { ok: true }; // same answer whether or not the email is on the team
}
async function loginVerify(req) {
  const b = await body(req), email = lower(b.email), code = str(b.code, 12).replace(/\D/g, '');
  const bad = new Fail(401, 'That code is not right or has expired. Ask for a new one.');
  if (!(await limit('verify-ip:' + ip(req), 30, 15))) throw new Fail(429, 'Too many tries. Please wait 15 minutes and try again.');
  const c = await one('SELECT c.email, c.code_hash, c.attempts, (c.expires_at > now()) AS live FROM admin_codes c WHERE lower(c.email) = $1', [email]);
  if (!c || !c.live || c.attempts >= 5 || code.length !== 6) throw bad;
  if (c.code_hash !== sha(c.email.toLowerCase() + ':' + code)) { await q('UPDATE admin_codes SET attempts = attempts + 1 WHERE email = $1', [c.email]); throw bad; }
  await q('DELETE FROM admin_codes WHERE email = $1', [c.email]);
  const token = randomBytes(32).toString('hex');
  await q("INSERT INTO admin_sessions (token_hash, email, expires_at, created_at) VALUES ($1, $2, now() + interval '30 days', now())", [sha(token), c.email]);
  await q('UPDATE admins SET last_login = now() WHERE email = $1', [c.email]);
  await q('DELETE FROM admin_sessions WHERE expires_at < now()');
  return { token };
}
const checkOut = (me) => ({ email: me.email, role: me.role, can_see_private: me.can_see_private, title: me.title, title_label: TITLES[me.title].label, perms: me.perms, areas: me.areas });

// ---------- messages ----------
const SUB = 'id, kind, name, email, phone, topic, message, details, is_private, status, admin_note, created_at, updated_at, added_by, edited_by, assigned_to, unsubscribed';
const KINDS = ['prayer', 'contact', 'visit', 'newsletter'], STATUSES = ['new', 'in_progress', 'done', 'archived'];
const idOf = (v) => { const s = String(v == null ? '' : v); need(/^\d{1,15}$/.test(s), 400, 'That entry was not found.'); return s; };
async function getSub(me, id) {
  const s = await one(`SELECT ${SUB} FROM submissions WHERE id = $1`, [idOf(id)]);
  need(s && canSee(me, s), 404, 'That entry was not found.');
  return s;
}
async function list(me) {
  const items = (await rows(`SELECT ${SUB} FROM submissions ORDER BY created_at DESC, id DESC`)).filter((s) => canSee(me, s));
  const ids = new Set(items.map((s) => String(s.id)));
  const replies = (await rows('SELECT id, submission_id, sent_by, to_email, subject, body, sent_at FROM replies ORDER BY sent_at, id')).filter((r) => ids.has(String(r.submission_id)));
  return { items, replies };
}
async function update(me, b) {
  const s = await getSub(me, b.id);
  if (b.status !== undefined) { need(STATUSES.includes(b.status), 400, 'That status is not valid.'); await q('UPDATE submissions SET status = $1, updated_at = now() WHERE id = $2', [b.status, s.id]); }
  if (b.admin_note !== undefined) await q('UPDATE submissions SET admin_note = $1, updated_at = now() WHERE id = $2', [str(b.admin_note, 4000), s.id]);
  return { ok: true };
}
async function assign(me, b) {
  allow(me, 'messages_manage');
  const s = await getSub(me, b.id), to = b.email ? lower(b.email) : null;
  let target = null;
  if (to) {
    const a = await one('SELECT email, role, title, perms, can_see_private FROM admins WHERE lower(email) = $1', [to]);
    need(a, 400, 'That person is not on the team.');
    need(canSee(access(a), s), 400, 'That person does not have access to this kind of message.');
    target = a.email;
  }
  await q('UPDATE submissions SET assigned_to = $1, updated_at = now() WHERE id = $2', [target, s.id]);
  if (target && target !== me.email) {
    await mail({ to: target, subject: 'A message was assigned to you (Shekinah admin)', tag: 'assigned',
      text: me.email + ' assigned you a ' + (s.is_private ? 'private ' : '') + areaLabel(s) + ' in the Shekinah church admin.\n\nSign in to read it and follow up:\n' + SITE + '/admin/' });
  }
  return { ok: true };
}
const areaLabel = (s) => ({ prayer: 'prayer request', visit: 'visit request', contact: 'message', bible: 'Bible study request', transfer: 'membership transfer request', newsletter: 'newsletter signup' }[areaOf(s)]);
async function reply(me, b) {
  allow(me, 'messages_manage');
  const s = await getSub(me, b.id), subject = str(b.subject, 200), text = str(b.body, 10000);
  need(s.email && EMAIL_RE.test(s.email) && s.kind !== 'newsletter', 400, 'This entry has no email address to reply to.');
  need(subject && text, 400, 'Write a subject and a message first.');
  const sent = await mail({ to: s.email, subject, text, tag: 'reply', reply_to: STAFF_INBOX });
  need(sent.ok, 502, 'The email could not be sent. Please try again.');
  const r = await wrote(`INSERT INTO replies (submission_id, sent_by, to_email, subject, body, sent_at) VALUES ($1, $2, $3, $4, $5, now())
                         RETURNING id, submission_id, sent_by, to_email, subject, body, sent_at`, [s.id, me.email, s.email, subject, text]);
  await q("UPDATE submissions SET status = 'in_progress', updated_at = now() WHERE id = $1 AND status = 'new'", [s.id]);
  return { reply: r };
}
function entry(b) {
  const e = { kind: b.kind, status: b.status || 'new', name: str(b.name), email: str(b.email, 254), phone: str(b.phone, 60), topic: str(b.topic, 200), message: str(b.message, 10000), admin_note: str(b.admin_note, 4000), is_private: b.is_private === true };
  need(KINDS.includes(e.kind), 400, 'Choose what kind of entry this is.');
  need(STATUSES.includes(e.status), 400, 'That status is not valid.');
  return e;
}
async function create(me, b) {
  allow(me, 'messages_manage');
  const e = entry(b);
  need(canSee(me, e), 403, 'You do not have access to this kind of entry.');
  const r = await wrote(`INSERT INTO submissions (kind, status, name, email, phone, topic, message, admin_note, is_private, details, added_by, created_at, updated_at, unsubscribed)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb, $10, now(), now(), false) RETURNING ${SUB}`,
    [e.kind, e.status, e.name, e.email, e.phone, e.topic || null, e.message, e.admin_note, e.is_private, me.email]);
  return { item: r };
}
async function edit(me, b) {
  allow(me, 'messages_manage');
  const s = await getSub(me, b.id), e = entry(b);
  need(canSee(me, e), 403, 'You do not have access to this kind of entry.');
  const r = await wrote(`UPDATE submissions SET kind = $1, status = $2, name = $3, email = $4, phone = $5, topic = $6, message = $7, admin_note = $8, is_private = $9, edited_by = $10, updated_at = now()
    WHERE id = $11 RETURNING ${SUB}`, [e.kind, e.status, e.name, e.email, e.phone, e.topic || null, e.message, e.admin_note, e.is_private, me.email, s.id]);
  return { item: r };
}
async function del(me, b) {
  allow(me, 'messages_delete');
  const s = await getSub(me, b.id);
  await q('DELETE FROM welcome_log WHERE submission_id = $1', [s.id]);
  await q('DELETE FROM submissions WHERE id = $1', [s.id]); // replies go with it (foreign key)
  return { ok: true };
}
async function delMany(me, b) {
  allow(me, 'messages_delete');
  need(Array.isArray(b.ids) && b.ids.length > 0 && b.ids.length <= 1000, 400, 'Choose at least one entry to delete.');
  const want = [...new Set(b.ids.map((x) => String(x)))];
  const found = await rows(`SELECT ${SUB} FROM submissions WHERE id::text IN (SELECT jsonb_array_elements_text($1::jsonb))`, [JSON.stringify(want)]);
  const ids = found.filter((s) => canSee(me, s)).map((s) => s.id);
  need(ids.length, 404, 'Those entries were not found.');
  const list = JSON.stringify(ids.map(String));
  await q('DELETE FROM welcome_log WHERE submission_id::text IN (SELECT jsonb_array_elements_text($1::jsonb))', [list]);
  await q('DELETE FROM submissions WHERE id::text IN (SELECT jsonb_array_elements_text($1::jsonb))', [list]);
  return { ok: true, deleted: ids.map(String) };
}

// ---------- email list ----------
async function subscribers(me) {
  allow(me, 'email_list');
  return {
    subscribers: await rows(`SELECT * FROM (SELECT DISTINCT ON (lower(email)) email, unsubscribed, status, created_at FROM submissions
                             WHERE kind = 'newsletter' AND email <> '' ORDER BY lower(email), unsubscribed DESC, created_at DESC) d ORDER BY created_at DESC`),
    broadcasts: await rows('SELECT id, subject, body, sent_by, recipient_count, sent_count, sent_at FROM broadcasts ORDER BY sent_at DESC'),
  };
}
async function broadcast(me, b) {
  allow(me, 'email_list');
  const subject = str(b.subject, 200), text = str(b.body, 20000);
  need(subject && text, 400, 'Write a subject and a message first.');
  if (b.test) {
    const sent = await mail({ to: me.email, subject: '[Test] ' + subject, text, tag: 'broadcast-test', unsub: true });
    need(sent.ok, 502, 'The test email could not be sent. Please try again.');
    return { ok: true, sent: 1, total: 1 };
  }
  need(await limit('broadcast', 3, 60), 429, 'Three emails were already sent to the list this hour. Please wait before sending another.');
  const list = (await subscribers(me)).subscribers.filter((s) => !s.unsubscribed && s.status !== 'archived' && EMAIL_RE.test(s.email));
  let sent = 0;
  for (const s of list) { const r = await mail({ to: s.email, subject, text, tag: 'broadcast', unsub: true }); if (r.ok) sent++; }
  await q('INSERT INTO broadcasts (subject, body, sent_by, recipient_count, sent_count, sent_at) VALUES ($1, $2, $3, $4, $5, now())', [subject, text, me.email, list.length, sent]);
  return { sent, total: list.length };
}

// ---------- website content ----------
const CONTENT_KEYS = ['announcement', 'sermons', 'ministries', 'posts'];
const POST_KEEP = ['slug', 'seoTitle', 'metaDesc', 'keywords', 'lang']; // fields the admin editor does not send
async function contentRows() { return rows('SELECT key, value, updated_by, updated_at FROM site_content ORDER BY key'); }
async function contentSave(me, b) {
  allow(me, 'site_edit');
  const key = str(b.key, 40);
  let value = b.value;
  need(CONTENT_KEYS.includes(key), 400, 'That section cannot be saved here.');
  need(value && typeof value === 'object' && Array.isArray(value) === (key !== 'announcement'), 400, 'That content is not in the right shape.');
  if (key === 'posts') {
    // Keep the search fields (slug, SEO title and so on) that the editor form leaves out.
    const old = {};
    const cur = await one("SELECT value FROM site_content WHERE key = 'posts'");
    let defs = [];
    try { const r = await fetch(SITE + '/content-defaults.json', { signal: AbortSignal.timeout(8000) }); if (r.ok) defs = (await r.json()).posts || []; } catch {}
    for (const p of [...defs, ...((cur && cur.value) || [])]) if (p && p.id) old[p.id] = { ...(old[p.id] || {}), ...p };
    value = value.filter((p) => p && typeof p === 'object').map((p) => { const o = old[p.id] || {}, out = { ...p }; for (const k of POST_KEEP) if (out[k] === undefined && o[k] !== undefined) out[k] = o[k]; return out; });
  }
  await q(`INSERT INTO site_content (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [key, JSON.stringify(value), me.email]);
  return { ok: true };
}
async function publicContent() {
  const out = {};
  for (const r of await contentRows()) out[r.key] = r.value;
  return out;
}

// ---------- team ----------
async function team(me) {
  const all = await rows('SELECT email, role, title, perms, can_see_private, last_login, added_by FROM admins ORDER BY created_at, email');
  const people = all.filter((a) => a.added_by !== 'automation');
  if (!me.perms.team_manage) return { me: me.email, admins: people.map((a) => ({ email: a.email, role: access(a).role })) }; // just enough for the assign menu
  return {
    me: me.email,
    titles: Object.entries(TITLES).map(([id, t]) => ({ id, label: t.label, perms: t.perms, areas: t.areas })),
    perm_list: PERMS, area_list: AREAS,
    admins: people.map((a) => { const x = access(a); return { email: a.email, role: x.role, title: x.title, perms: x.perms, areas: x.areas, can_see_private: x.can_see_private, last_login: a.last_login, custom: !!a.perms }; }),
  };
}
// Accepts the old shape {email, role, can_see_private} and the new one {email, title, can_see_private, perms, areas}.
function teamInput(b) {
  const title = TITLES[b.title] ? b.title : TITLES[b.role] ? b.role : null;
  need(title, 400, 'Choose a role for this person.');
  let perms = null;
  if (title !== 'admin' && (b.perms || b.areas)) {
    perms = {};
    for (const p of PERMS) if (b.perms && typeof b.perms[p] === 'boolean' && b.perms[p] !== TITLES[title].perms[p]) perms[p] = b.perms[p];
    if (Array.isArray(b.areas)) { const a = AREAS.filter((x) => b.areas.includes(x)); if (a.join() !== AREAS.filter((x) => TITLES[title].areas.includes(x)).join()) perms.areas = a; }
    if (!Object.keys(perms).length) perms = null;
  }
  return { title, role: TITLES[title].role, perms, priv: b.can_see_private === true };
}
const adminCount = async (except) => Number((await q("SELECT count(*) AS n FROM admins WHERE coalesce(title, role) = 'admin' AND email <> $1", [except]))[0].n);
async function teamAdd(me, b) {
  allow(me, 'team_manage');
  const email = lower(b.email), t = teamInput(b);
  need(EMAIL_RE.test(email), 400, 'Please enter a valid email address.');
  need(!(await one('SELECT 1 AS x FROM admins WHERE lower(email) = $1', [email])), 400, 'That person is already on the team.');
  await q('INSERT INTO admins (email, added_by, created_at, role, title, perms, can_see_private) VALUES ($1, $2, now(), $3, $4, $5::jsonb, $6)', [email, me.email, t.role, t.title, t.perms ? JSON.stringify(t.perms) : null, t.priv]);
  const inv = inviteMail({ label: TITLES[t.title].label, title: t.title, custom: !!t.perms });
  await mail({ to: email, subject: inv.subject, text: inv.text, html: inv.html, noreply: true, tag: 'team-invite' });
  return team(me);
}
async function teamUpdate(me, b) {
  allow(me, 'team_manage');
  const email = lower(b.email), t = teamInput(b);
  const a = await one('SELECT email FROM admins WHERE lower(email) = $1', [email]);
  need(a, 404, 'That person is not on the team.');
  need(a.email !== me.email, 400, 'You cannot change your own access. Ask another admin.');
  if (t.title !== 'admin') need((await adminCount(a.email)) > 0, 400, 'There must be at least one admin.');
  await q('UPDATE admins SET role = $1, title = $2, perms = $3::jsonb, can_see_private = $4 WHERE email = $5', [t.role, t.title, t.perms ? JSON.stringify(t.perms) : null, t.priv, a.email]);
  return team(me);
}
async function teamRemove(me, b) {
  allow(me, 'team_manage');
  const a = await one('SELECT email FROM admins WHERE lower(email) = $1', [lower(b.email)]);
  need(a, 404, 'That person is not on the team.');
  need(a.email !== me.email, 400, 'You cannot remove yourself.');
  need((await adminCount(a.email)) > 0, 400, 'There must be at least one admin.');
  await q('UPDATE submissions SET assigned_to = NULL WHERE assigned_to = $1', [a.email]);
  await q('DELETE FROM admin_codes WHERE email = $1', [a.email]);
  await q('DELETE FROM admins WHERE email = $1', [a.email]); // sessions go with it (foreign key)
  return team(me);
}

// ---------- members ----------
const M_STATUSES = ['Member', 'Baptized member', 'Regular attender', 'Visitor', 'Inactive', 'Transferred out'];
const M_TEXT = ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'household', 'notes'];
const M_DATES = ['birthday', 'member_since', 'baptism_date'];
const M_COLS = ['id', ...M_TEXT, ...M_DATES.map((d) => `to_char(${d}, 'YYYY-MM-DD') AS ${d}`), 'status', 'updated_at', 'updated_by'].join(', ');
async function members(me) {
  allow(me, 'members_view');
  return { members: await rows(`SELECT ${M_COLS} FROM members ORDER BY lower(last_name), lower(first_name), id`), statuses: M_STATUSES, role: me.role,
    can_edit: me.perms.members_edit, can_delete: me.perms.members_delete };
}
async function memberSave(me, b) {
  allow(me, 'members_edit');
  const m = b.member && typeof b.member === 'object' ? b.member : {};
  const v = M_TEXT.map((k) => str(m[k], k === 'notes' ? 4000 : 300));
  const d = M_DATES.map((k) => (/^\d{4}-\d{2}-\d{2}$/.test(String(m[k] || '')) ? String(m[k]) : null));
  const status = M_STATUSES.includes(m.status) ? m.status : 'Member';
  need(v[0], 400, 'Please add a first name.');
  const params = [...v, ...d, status, me.email];
  let row;
  if (m.id != null && m.id !== '') {
    row = await wrote(`UPDATE members SET ${M_TEXT.map((k, i) => `${k} = $${i + 1}`).join(', ')}, ${M_DATES.map((k, i) => `${k} = $${i + 11}::date`).join(', ')}, status = $14, updated_by = $15, updated_at = now()
      WHERE id = $16 RETURNING *`, [...params, idOf(m.id)], M_COLS);
    need(row, 404, 'That member was not found.');
  } else {
    row = await wrote(`INSERT INTO members (${[...M_TEXT, ...M_DATES].join(', ')}, status, updated_by)
      VALUES (${M_TEXT.map((_, i) => '$' + (i + 1)).join(', ')}, ${M_DATES.map((_, i) => `$${i + 11}::date`).join(', ')}, $14, $15) RETURNING *`, params, M_COLS);
  }
  return { member: row };
}
async function memberDelete(me, b) {
  allow(me, 'members_delete');
  await q('DELETE FROM members WHERE id = $1', [idOf(b.id)]);
  return { ok: true };
}

// ---------- calendar (church events and tasks, inside the admin only) ----------
const CAL_KINDS = ['Worship', 'Youth', 'Outreach', 'Meeting', 'Fellowship', 'Health', 'Other'];
const EV_PUB = "id, title, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, start_time, end_time, location, details, category";
const EV_COLS = EV_PUB + ', is_public, created_by, updated_by, updated_at';
const TK_COLS = "id, title, to_char(due_on, 'YYYY-MM-DD') AS due_on, assigned_to, event_id, done, notes, created_by, updated_by, updated_at";
const calEdit = (me) => !!me.perms.calendar_edit; // Jimmy, Nov 11, 2026: the whole team can view; only people with "Edit the calendar" can add, edit or delete
const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(String(v))) ? String(v) : null);
const timeOf = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null);
// Public: events marked "Show on the website", from today on, for the /events/ page.
async function publicEvents() {
  return { events: await rows(`SELECT ${EV_PUB} FROM cal_events WHERE is_public AND coalesce(ends_on, starts_on) >= (now() AT TIME ZONE 'America/Chicago')::date - 1
    AND starts_on <= (now() AT TIME ZONE 'America/Chicago')::date + 400 ORDER BY starts_on, start_time NULLS FIRST, id LIMIT 300`) };
}
async function calendar(me) {
  const team = (await rows('SELECT email FROM admins ORDER BY lower(email)')).map((a) => a.email);
  return {
    events: await rows(`SELECT ${EV_COLS} FROM cal_events WHERE coalesce(ends_on, starts_on) >= current_date - 400 ORDER BY starts_on, start_time NULLS FIRST, id`),
    tasks: await rows(`SELECT ${TK_COLS} FROM cal_tasks WHERE NOT done OR updated_at > now() - interval '30 days' ORDER BY done, due_on NULLS LAST, id`),
    kinds: CAL_KINDS, can_edit: calEdit(me), team, me: me.email,
  };
}
async function eventSave(me, b) {
  need(calEdit(me), 403, 'You do not have access to this. Ask an admin if you need it.');
  const e = b.event && typeof b.event === 'object' ? b.event : {};
  const title = str(e.title, 200), start = dayOf(e.starts_on);
  need(title, 400, 'Please add a name for the event.');
  need(start, 400, 'Please choose the date of the event.');
  let end = dayOf(e.ends_on); if (end && end < start) end = null; if (end === start) end = null;
  const v = [title, start, end, timeOf(e.start_time), timeOf(e.end_time), str(e.location, 300), str(e.details, 4000), CAL_KINDS.includes(e.category) ? e.category : 'Other', me.email, e.is_public !== false];
  let row;
  if (e.id != null && e.id !== '') {
    row = await wrote(`UPDATE cal_events SET title = $1, starts_on = $2::date, ends_on = $3::date, start_time = $4, end_time = $5, location = $6, details = $7, category = $8, updated_by = $9, is_public = $10::boolean, updated_at = now()
      WHERE id = $11 RETURNING *`, [...v, idOf(e.id)], EV_COLS);
    need(row, 404, 'That event was not found.');
  } else {
    row = await wrote(`INSERT INTO cal_events (title, starts_on, ends_on, start_time, end_time, location, details, category, created_by, updated_by, is_public)
      VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $9, $10::boolean) RETURNING *`, v, EV_COLS);
  }
  return { event: row };
}
async function eventDelete(me, b) {
  need(calEdit(me), 403, 'You do not have access to this. Ask an admin if you need it.');
  await q('DELETE FROM cal_events WHERE id = $1', [idOf(b.id)]); // its tasks stay, unlinked
  return { ok: true };
}
async function taskSave(me, b) {
  need(calEdit(me), 403, 'You do not have access to this. Ask an admin if you need it.');
  const t = b.task && typeof b.task === 'object' ? b.task : {};
  const title = str(t.title, 300);
  need(title, 400, 'Please describe the task.');
  let who = lower(t.assigned_to); if (who) need(await one('SELECT 1 AS x FROM admins WHERE lower(email) = $1', [who]), 400, 'Choose someone on the team.'); else who = null;
  const ev = t.event_id != null && t.event_id !== '' ? idOf(t.event_id) : null;
  const v = [title, dayOf(t.due_on), who, ev, str(t.notes, 2000), me.email];
  let row;
  if (t.id != null && t.id !== '') {
    row = await wrote(`UPDATE cal_tasks SET title = $1, due_on = $2::date, assigned_to = $3, event_id = $4::bigint, notes = $5, updated_by = $6, updated_at = now() WHERE id = $7 RETURNING *`, [...v, idOf(t.id)], TK_COLS);
    need(row, 404, 'That task was not found.');
  } else {
    row = await wrote(`INSERT INTO cal_tasks (title, due_on, assigned_to, event_id, notes, created_by, updated_by) VALUES ($1, $2::date, $3, $4::bigint, $5, $6, $6) RETURNING *`, v, TK_COLS);
    if (who && who !== lower(me.email)) await mail({ to: who, subject: 'A church task for you: ' + title, tag: 'task',
      text: 'You have a new task in the Shekinah church admin.\n\n' + title + (v[1] ? '\nDue: ' + v[1] : '') + (v[4] ? '\n\n' + v[4] : '') + '\n\nSee it on the Calendar page: ' + SITE + '/admin/' });
  }
  return { task: row };
}
async function taskDone(me, b) {
  const t = await one(`SELECT ${TK_COLS} FROM cal_tasks WHERE id = $1`, [idOf(b.id)]);
  need(t, 404, 'That task was not found.');
  need(calEdit(me) || lower(t.assigned_to) === lower(me.email), 403, 'Only the person it is assigned to can check this off.');
  return { task: await wrote(`UPDATE cal_tasks SET done = $1::boolean, updated_by = $2, updated_at = now() WHERE id = $3 RETURNING *`, [b.done === true, me.email, t.id], TK_COLS) };
}
async function taskDelete(me, b) {
  need(calEdit(me), 403, 'You do not have access to this. Ask an admin if you need it.');
  await q('DELETE FROM cal_tasks WHERE id = $1', [idOf(b.id)]);
  return { ok: true };
}

// ---------- public form ----------
const SPAM_WORDS = /\b(seo|backlinks?|guest post|link building|first page of google|rank(ing)? your (site|website)|web ?design services|crypto|bitcoin|casino|betting|viagra|cialis|forex|payday loan|lead generation|increase your (traffic|sales)|marketing agency|virtual assistant services)\b/i;
function spam(e) {
  const text = [e.name, e.topic, e.message].filter(Boolean).join(' ');
  return (text.match(/https?:\/\/|www\./gi) || []).length >= 2 || /https?:\/\/|www\./i.test(e.name || '') || SPAM_WORDS.test(text);
}
async function submit(req) {
  const b = await body(req);
  const e = { kind: b.kind, name: str(b.name, 200), email: str(b.email, 254), phone: str(b.phone, 60), topic: str(b.topic, 200), message: str(b.message, 10000), is_private: b.private === true || b.is_private === true };
  need(KINDS.includes(e.kind), 400, 'Sorry, your message could not be sent. Please try again.');
  if (e.kind === 'newsletter' || e.kind === 'visit') need(EMAIL_RE.test(e.email), 400, 'Please enter a valid email address.');
  if (e.email) need(EMAIL_RE.test(e.email), 400, 'Please enter a valid email address.');
  if (e.kind === 'prayer' || e.kind === 'contact') need(e.message, 400, 'Please write your message.');
  if (e.kind === 'visit') need(e.name, 400, 'Please add your name.');
  let details = {};
  if (b.details && typeof b.details === 'object' && !Array.isArray(b.details)) {
    for (const [k, v] of Object.entries(b.details).slice(0, 12)) if (/^[A-Za-z]{1,30}$/.test(k)) details[k] = typeof v === 'boolean' ? v : str(v, 300);
  }
  need(await limit('submit-ip:' + ip(req), 12, 10), 429, 'You have sent several messages in a short time. Please wait a few minutes and try again.');
  if (spam(e)) return { ok: true }; // dropped quietly, like the form does in the browser
  if (e.kind === 'newsletter') {
    const have = await one("SELECT id FROM submissions WHERE kind = 'newsletter' AND lower(email) = $1 AND unsubscribed = false LIMIT 1", [e.email.toLowerCase()]);
    if (have) return { ok: true }; // already on the list
  } else {
    const dup = await one("SELECT id FROM submissions WHERE kind = $1 AND coalesce(email,'') = $2 AND coalesce(phone,'') = $3 AND coalesce(message,'') = $4 AND created_at > now() - interval '10 minutes' LIMIT 1", [e.kind, e.email, e.phone, e.message]);
    if (dup) return { ok: true }; // double click
  }
  const row = await wrote(`INSERT INTO submissions (kind, status, name, email, phone, topic, message, details, is_private, created_at, updated_at, unsubscribed)
    VALUES ($1, 'new', $2, $3, $4, $5, $6, $7::jsonb, $8, now(), now(), false) RETURNING id, kind, topic, is_private, name`,
    [e.kind, e.name, e.email, e.phone, e.topic || null, e.message, JSON.stringify(details), e.is_private]);
  if (e.kind !== 'newsletter') {
    // Tell the church office. No private details in the email: staff sign in to read them.
    const what = (row.is_private ? 'private ' : '') + areaLabel(row);
    await mail({ to: STAFF_INBOX, subject: 'New ' + what + ' on the website', tag: 'staff-alert',
      text: 'A new ' + what + ' came in through shekinahsda.org' + (row.is_private || !row.name ? '' : ' from ' + row.name) + '.\n\nSign in to read it and follow up:\n' + SITE + '/admin/' });
  }
  return { ok: true };
}

// ---------- router ----------
const ROUTES = {
  'POST /admin/update': update, 'POST /admin/assign': assign, 'POST /admin/reply': reply, 'POST /admin/create': create, 'POST /admin/edit': edit, 'POST /admin/delete': del, 'POST /admin/delete-many': delMany,
  'POST /admin/broadcast': broadcast, 'POST /admin/content/save': contentSave,
  'POST /admin/admins/add': teamAdd, 'POST /admin/admins/update': teamUpdate, 'POST /admin/admins/remove': teamRemove,
  'POST /calendar/event': eventSave, 'POST /calendar/event/delete': eventDelete, 'POST /calendar/task': taskSave, 'POST /calendar/task/done': taskDone, 'POST /calendar/task/delete': taskDelete,
  'POST /members/save': memberSave, 'POST /members/delete': memberDelete,
};
const GETS = {
  'GET /admin/list': list, 'GET /admin/subscribers': subscribers, 'GET /admin/admins': team, 'GET /members': members, 'GET /calendar': calendar,
  'GET /admin/content': async (me) => { allow(me, 'site_edit'); return { content: await contentRows() }; },
};
async function route(req, path) {
  const key = req.method + ' ' + path;
  if (key === 'GET /' || key === 'GET /health') return { ok: true, service: 'shekinah api' };
  if (key === 'POST /submit') return submit(req);
  if (key === 'GET /content') return publicContent();
  if (key === 'GET /events') return publicEvents();
  if (key === 'POST /admin/login/start') return loginStart(req);
  if (key === 'POST /admin/login/verify') return loginVerify(req);
  if (ROUTES[key] || GETS[key] || key === 'GET /admin/check' || key === 'POST /admin/logout') {
    const me = await who(req);
    if (key === 'GET /admin/check') return checkOut(me);
    if (key === 'POST /admin/logout') { await q('DELETE FROM admin_sessions WHERE token_hash = $1', [sha(me.token)]); return { ok: true }; }
    if (GETS[key]) return GETS[key](me);
    return ROUTES[key](me, await body(req));
  }
  throw new Fail(404, 'Not found.');
}

export default {
  async fetch(req) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    const pub = path === '/content' || path === '/events' || path === '/submit' || path === '/';
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': path === '/content' || path === '/events' ? 'public, max-age=60' : 'no-store', ...cors(req, pub) };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      return new Response(JSON.stringify(await route(req, path)), { status: 200, headers });
    } catch (e) {
      if (e instanceof Fail) return new Response(JSON.stringify({ error: e.message }), { status: e.status, headers: { ...headers, 'Cache-Control': 'no-store' } });
      console.error(path, e);
      return new Response(JSON.stringify({ error: 'Something went wrong on our side. Please try again.' }), { status: 500, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }
  },
};
