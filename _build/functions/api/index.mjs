// Shekinah church API (Neon Function "api"). Rebuilt Nov 2026 with per person permissions.
// It replaces the old "shekinah" function (source lost) and the "members" function.
// Public:  POST /submit, GET /content
// Sign in: POST /admin/login/start, POST /admin/login/verify, GET /admin/check, POST /admin/logout
// Admin:   /admin/list, update, assign, reply, create, edit, delete, subscribers, broadcast,
//          content, content/save, admins, admins/add, admins/update, admins/remove
// Members: GET /members, POST /members/list (paged), POST /members/find, POST /members/save, POST /members/delete
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
  need(t.length <= 6000000, 413, 'That is too large to send.'); // room for one list photo
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
    return { ok: r.ok && j.ok !== false, id: j.id || null, detail: String(j.detail || j.error || r.status).slice(0, 300) };
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
function inviteMail({ label, title, custom, name }) {
  const hi = name ? 'Hello ' + String(name).split(' ')[0].replace(/[<>&"']/g, '') + ',' : 'Hello,';
  const what = custom ? 'Your access has been set up for the work you will be helping with.' : ROLE_TEXT[title];
  const url = SITE + '/admin/';
  const subject = 'Welcome to the Shekinah church admin team';
  const text = `${hi}

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
   ${p(hi)}
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
  const a = await one(`SELECT a.email, a.role, a.title, a.perms, a.can_see_private, a.full_name FROM admin_sessions s JOIN admins a ON a.email = s.email
                       WHERE s.token_hash = $1 AND s.expires_at > now() AND a.suspended_at IS NULL`, [sha(m[1])]);
  need(a, 401, 'Please sign in again.');
  return { email: a.email, token: m[1], full_name: a.full_name || '', ...access(a) };
}
const allow = (me, perm) => need(me.perms[perm], 403, 'You do not have access to this. Ask an admin if you need it.');

async function loginStart(req) {
  const b = await body(req), email = lower(b.email);
  need(EMAIL_RE.test(email), 400, 'Please enter your email address.');
  if (!(await limit('login-ip:' + ip(req), 20, 15)) || !(await limit('login:' + email, 5, 15))) throw new Fail(429, 'Too many tries. Please wait 15 minutes and try again.');
  const a = await one('SELECT email FROM admins WHERE lower(email) = $1 AND suspended_at IS NULL', [email]);
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
  const c = await one('SELECT c.email, c.code_hash, c.attempts, (c.expires_at > now()) AS live FROM admin_codes c JOIN admins a ON a.email = c.email WHERE lower(c.email) = $1 AND a.suspended_at IS NULL', [email]);
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
    subscribers: await rows(`SELECT d.*,
        COALESCE((SELECT x.name FROM submissions x WHERE lower(x.email) = lower(d.email) AND COALESCE(x.name, '') <> '' ORDER BY (x.kind = 'newsletter') DESC, x.updated_at DESC NULLS LAST LIMIT 1),
          -- no name on any form: use the team list or the member records with the same email (Jimmy, Nov 23, 2026)
          (SELECT NULLIF(a.full_name, '') FROM admins a WHERE lower(a.email) = lower(d.email)),
          (SELECT NULLIF(trim(m.first_name || ' ' || m.last_name), '') FROM members m WHERE lower(m.email) = lower(d.email) ORDER BY m.updated_at DESC NULLS LAST LIMIT 1), '') AS name,
        COALESCE((SELECT x.phone FROM submissions x WHERE lower(x.email) = lower(d.email) AND COALESCE(x.phone, '') <> '' ORDER BY (x.kind = 'newsletter') DESC, x.updated_at DESC NULLS LAST LIMIT 1),
          (SELECT NULLIF(m.phone, '') FROM members m WHERE lower(m.email) = lower(d.email) ORDER BY m.updated_at DESC NULLS LAST LIMIT 1), '') AS phone
      FROM (SELECT DISTINCT ON (lower(email)) email, unsubscribed, status, created_at FROM submissions
            WHERE kind = 'newsletter' AND email <> '' ORDER BY lower(email), unsubscribed DESC, created_at DESC) d ORDER BY created_at DESC`),
    broadcasts: await rows('SELECT id, subject, body, sent_by, recipient_count, sent_count, sent_at FROM broadcasts ORDER BY sent_at DESC'),
  };
}
async function subEdit(me, b) {
  allow(me, 'email_list');
  const email = str(b.email, 200), name = str(b.name, 120), phone = str(b.phone, 40);
  need(email, 400, 'Missing email.');
  const r = await q(`UPDATE submissions SET name = $2, phone = $3, edited_by = $4, updated_at = now()
    WHERE kind = 'newsletter' AND lower(email) = lower($1) RETURNING id`, [email, name, phone, me.email]);
  need(r.length, 404, 'That email is not on the list.');
  return { ok: true, email, name, phone };
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
  return sendToList(subject, text, me.email);
}
async function sendToList(subject, text, by) {
  const list = (await subscribers({ perms: { email_list: true }, role: 'admin' })).subscribers.filter((s) => !s.unsubscribed && s.status !== 'archived' && EMAIL_RE.test(s.email));
  let sent = 0;
  for (const s of list) { const r = await mail({ to: s.email, subject, text, tag: 'broadcast', unsub: true }); if (r.ok) sent++; }
  const b = await wrote('INSERT INTO broadcasts (subject, body, sent_by, recipient_count, sent_count, sent_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING *', [subject, text, by, list.length, sent], 'id');
  return { sent, total: list.length, id: b ? b.id : null };
}

// ---------- scheduled newsletters (Jimmy, Nov 23, 2026: "schedule them automatically") ----------
// The daily trigger sends every issue whose day has come (5:11 AM Central) and emails a preview two days before.
const NQ_COLS = "id, to_char(send_on, 'YYYY-MM-DD') AS send_on, subject, body, status, preview_to, preview_sent_at, sent_at, sent_count, created_by, updated_by, updated_at";
async function newsQueue(me) {
  allow(me, 'email_list');
  return { queue: await rows(`SELECT ${NQ_COLS} FROM newsletter_queue WHERE status <> 'deleted' ORDER BY send_on, id`) };
}
async function newsQueueSave(me, b) {
  allow(me, 'email_list');
  const n = b.issue && typeof b.issue === 'object' ? b.issue : {};
  const subject = str(n.subject, 200), body = str(n.body, 20000), day = dayOf(n.send_on);
  need(subject && body, 400, 'Write a subject and a message first.');
  need(day, 400, 'Choose the day it should go out.');
  if (n.id != null && n.id !== '') {
    const old = await one(`SELECT ${NQ_COLS} FROM newsletter_queue WHERE id = $1`, [idOf(n.id)]);
    need(old, 404, 'That newsletter was not found.');
    need(old.status === 'scheduled' || old.status === 'paused', 409, 'This newsletter was already sent, so it cannot be changed.');
    const st = n.status === 'paused' ? 'paused' : n.status === 'scheduled' ? 'scheduled' : old.status;
    return { issue: await wrote(`UPDATE newsletter_queue SET subject = $1, body = $2, send_on = $3::date, status = $4, updated_by = $5, updated_at = now(),
      preview_sent_at = CASE WHEN send_on = $3::date THEN preview_sent_at ELSE NULL END WHERE id = $6 RETURNING *`, [subject, body, day, st, me.email, old.id], NQ_COLS) };
  }
  return { issue: await wrote(`INSERT INTO newsletter_queue (send_on, subject, body, status, preview_to, created_by, updated_by) VALUES ($1::date, $2, $3, 'scheduled', $4, $4, $4) RETURNING *`, [day, subject, body, me.email], NQ_COLS) };
}
async function newsQueueDelete(me, b) {
  allow(me, 'email_list');
  await q("UPDATE newsletter_queue SET status = 'deleted', updated_by = $2, updated_at = now() WHERE id = $1 AND status IN ('scheduled', 'paused')", [idOf(b.id), me.email]);
  return { ok: true };
}
async function newsQueueRun() {
  const today = (await one("SELECT to_char((now() AT TIME ZONE 'America/Chicago')::date, 'YYYY-MM-DD') AS d")).d;
  let previews = 0, sent = 0;
  // Preview to whoever scheduled it, two days ahead, so there is time to fix or pause it.
  for (const n of await rows(`SELECT ${NQ_COLS} FROM newsletter_queue WHERE status = 'scheduled' AND preview_sent_at IS NULL AND send_on <= $1::date + 2 AND send_on > $1::date`, [today])) {
    const to = EMAIL_RE.test(n.preview_to || '') ? n.preview_to : 'info@shekinahsda.org';
    const r = await mail({ to, subject: '[Preview, goes out ' + n.send_on + '] ' + n.subject, text: n.body, tag: 'broadcast-test', unsub: true });
    if (r.ok) { await q('UPDATE newsletter_queue SET preview_sent_at = now() WHERE id = $1', [n.id]); previews++; }
  }
  // Claim each due issue before sending so a second run can never send it twice.
  for (const n of await rows(`SELECT ${NQ_COLS} FROM newsletter_queue WHERE status = 'scheduled' AND send_on <= $1::date ORDER BY send_on, id LIMIT 2`, [today])) {
    const got = await wrote("UPDATE newsletter_queue SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'scheduled' RETURNING *", [n.id], 'id');
    if (!got) continue;
    const r = await sendToList(n.subject, n.body, 'Scheduled by ' + (n.created_by || 'the team'));
    await q("UPDATE newsletter_queue SET status = 'sent', sent_at = now(), sent_count = $2, broadcast_id = $3, updated_at = now() WHERE id = $1", [n.id, r.sent, r.id]);
    sent++;
  }
  return { previews, sent };
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
  const all = await rows('SELECT email, full_name, role, title, perms, can_see_private, last_login, added_by, suspended_at FROM admins ORDER BY created_at, email');
  const people = all.filter((a) => a.added_by !== 'automation');
  if (!me.perms.team_manage) return { me: me.email, admins: people.filter((a) => !a.suspended_at).map((a) => ({ email: a.email, full_name: a.full_name || '', role: access(a).role })) }; // just enough for the assign menu
  return {
    me: me.email,
    titles: Object.entries(TITLES).map(([id, t]) => ({ id, label: t.label, perms: t.perms, areas: t.areas })),
    perm_list: PERMS, area_list: AREAS,
    admins: people.map((a) => { const x = access(a); return { email: a.email, full_name: a.full_name || '', role: x.role, title: x.title, perms: x.perms, areas: x.areas, can_see_private: x.can_see_private, last_login: a.last_login, custom: !!a.perms, suspended: !!a.suspended_at, suspended_at: a.suspended_at }; }),
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
const adminCount = async (except) => Number((await q("SELECT count(*) AS n FROM admins WHERE coalesce(title, role) = 'admin' AND suspended_at IS NULL AND email <> $1", [except]))[0].n);
async function teamAdd(me, b) {
  allow(me, 'team_manage');
  const email = lower(b.email), t = teamInput(b), name = str(b.full_name, 80);
  need(name.length >= 2, 400, "Please enter the person's full name.");
  need(EMAIL_RE.test(email), 400, 'Please enter a valid email address.');
  need(!(await one('SELECT 1 AS x FROM admins WHERE lower(email) = $1', [email])), 400, 'That person is already on the team.');
  await q('INSERT INTO admins (email, added_by, created_at, role, title, perms, can_see_private, full_name) VALUES ($1, $2, now(), $3, $4, $5::jsonb, $6, $7)', [email, me.email, t.role, t.title, t.perms ? JSON.stringify(t.perms) : null, t.priv, name]);
  const inv = inviteMail({ label: TITLES[t.title].label, title: t.title, custom: !!t.perms, name });
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
async function teamName(me, b) {
  const email = lower(b.email), name = str(b.full_name, 80);
  if (email !== lower(me.email)) allow(me, 'team_manage'); // anyone can fix their own name
  need(name.length >= 2, 400, "Please enter the person's full name.");
  const a = await one('SELECT email FROM admins WHERE lower(email) = $1', [email]);
  need(a, 404, 'That person is not on the team.');
  await q('UPDATE admins SET full_name = $1 WHERE email = $2', [name, a.email]);
  return team(me);
}
async function teamSuspend(me, b) {
  allow(me, 'team_manage');
  const a = await one('SELECT email FROM admins WHERE lower(email) = $1', [lower(b.email)]);
  need(a, 404, 'That person is not on the team.');
  need(a.email !== me.email, 400, 'You cannot suspend yourself.');
  if (b.suspended === true) {
    need((await adminCount(a.email)) > 0, 400, 'There must be at least one admin.');
    await q('UPDATE admins SET suspended_at = coalesce(suspended_at, now()) WHERE email = $1', [a.email]);
    await q('DELETE FROM admin_sessions WHERE email = $1', [a.email]); // signed out right away
    await q('DELETE FROM admin_codes WHERE email = $1', [a.email]);
  } else await q('UPDATE admins SET suspended_at = NULL WHERE email = $1', [a.email]);
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
const M_STATUSES = ['Member', 'Baptized member', 'Regular attender', 'Visitor', 'Inactive', 'Transferred out', 'Donor']; // Donor: a former member who still gives (Jimmy, Nov 27, 2026)
const M_TEXT = ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'household', 'notes'];
const M_DATES = ['birthday', 'member_since', 'baptism_date'];
const M_COLS = ['id', ...M_TEXT, ...M_DATES.map((d) => `to_char(${d}, 'YYYY-MM-DD') AS ${d}`), 'status', 'updated_at', 'updated_by'].join(', ');
async function members(me) {
  allow(me, 'members_view');
  return { members: await rows(`SELECT ${M_COLS} FROM members ORDER BY lower(last_name), lower(first_name), id`), statuses: M_STATUSES, role: me.role,
    can_edit: me.perms.members_edit, can_delete: me.perms.members_delete };
}
// Paged list for large member lists (Jimmy, Nov 27, 2026: plan for 100,000 contacts). Search, filters, counts and birthdays run in the database.
const M_TODAY = "(now() AT TIME ZONE 'America/Chicago')::date";
const M_NEXTB = `(CASE WHEN birthday IS NULL THEN NULL ELSE (SELECT CASE WHEN x < ${M_TODAY} THEN (birthday + make_interval(years => extract(year FROM ${M_TODAY})::int + 1 - extract(year FROM birthday)::int))::date ELSE x END
  FROM (SELECT (birthday + make_interval(years => extract(year FROM ${M_TODAY})::int - extract(year FROM birthday)::int))::date AS x) y) - ${M_TODAY} END)`;
const M_FILTERS = {
  mem: "status IN ('Member', 'Baptized member')", bap: "(status = 'Baptized member' OR baptism_date IS NOT NULL)", reg: "status = 'Regular attender'",
  vis: "status = 'Visitor'", don: "status = 'Donor'", ina: "status IN ('Inactive', 'Transferred out')", bday: `${M_NEXTB} <= 30`,
};
const M_SORTS = { name: 'lower(last_name), lower(first_name), id', recent: 'updated_at DESC NULLS LAST, id DESC', status: 'status, lower(last_name), lower(first_name), id', birthday: `${M_NEXTB} NULLS LAST, lower(last_name), id` };
async function memberList(me, b) {
  allow(me, 'members_view');
  const per = [25, 50, 100, 200, 1000].includes(+b.per) ? +b.per : 100;
  const page = Math.max(1, Math.min(100000, parseInt(b.page, 10) || 1));
  const text = str(b.q, 120).trim().toLowerCase();
  const digits = text.replace(/\D/g, '');
  const where = [], params = [];
  if (text) {
    params.push('%' + text.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
    const n = params.length;
    let w = `(lower(first_name || ' ' || last_name) LIKE $${n} OR lower(last_name || ' ' || first_name) LIKE $${n} OR lower(email) LIKE $${n} OR lower(household) LIKE $${n} OR lower(city) LIKE $${n}`;
    if (digits.length >= 3) { params.push('%' + digits + '%'); w += ` OR regexp_replace(phone, '\\D', '', 'g') LIKE $${params.length}`; }
    where.push(w + ')');
  }
  if (M_STATUSES.includes(b.status)) { params.push(b.status); where.push(`status = $${params.length}`); }
  if (M_FILTERS[b.filter]) where.push(M_FILTERS[b.filter]);
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = M_SORTS[b.sort] || M_SORTS.name;
  const [list, tot, counts, bdays] = await Promise.all([
    rows(`SELECT ${M_COLS}, ${M_NEXTB} AS bday_in FROM members ${W} ORDER BY ${order} LIMIT ${per} OFFSET ${(page - 1) * per}`, params),
    one(`SELECT count(*)::int AS n FROM members ${W}`, params),
    one(`SELECT count(*)::int AS "all", ${Object.entries(M_FILTERS).map(([k, f]) => `count(*) FILTER (WHERE ${f})::int AS ${k}`).join(', ')},
      coalesce((SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int AS n FROM members GROUP BY status) s), '{}'::json) AS by_status FROM members`),
    b.page > 1 ? [] : rows(`SELECT id, first_name, last_name, phone, to_char(birthday, 'YYYY-MM-DD') AS birthday, ${M_NEXTB} AS bday_in FROM members WHERE ${M_FILTERS.bday} ORDER BY ${M_NEXTB}, lower(last_name) LIMIT 40`),
  ]);
  return { members: list, total: tot ? tot.n : 0, page, per, counts, birthdays: bdays, statuses: M_STATUSES, role: me.role,
    can_edit: me.perms.members_edit, can_delete: me.perms.members_delete };
}
// Import check: which people on a list are already in Members (same email, phone or full name).
async function memberFind(me, b) {
  allow(me, 'members_view');
  const list = (Array.isArray(b.people) ? b.people.slice(0, 1000) : []).map((p, i) => ({ i, e: str(p && p.email, 200).trim().toLowerCase(),
    p: str(p && p.phone, 60).replace(/\D/g, '').slice(-10), n: (str(p && p.first_name, 120) + ' ' + str(p && p.last_name, 120)).trim().toLowerCase() }));
  if (!list.length) return { found: [] };
  const r = await rows(`SELECT y.i, (SELECT first_name || ' ' || last_name FROM members m WHERE (y.e <> '' AND lower(m.email) = y.e)
      OR (length(y.p) >= 7 AND right(regexp_replace(m.phone, '\\D', '', 'g'), 10) = y.p) OR (length(y.n) > 2 AND lower(trim(m.first_name || ' ' || m.last_name)) = y.n) LIMIT 1) AS name
    FROM jsonb_to_recordset($1::jsonb) AS y(i int, e text, p text, n text)`, [JSON.stringify(list)]);
  return { found: r.filter((x) => x.name).map((x) => ({ i: x.i, name: x.name })) };
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
// ---- import a list (Jimmy, Nov 22, 2026): a photo or a handwritten list is read by Claude, a CSV or Excel file in the browser.
// Nothing is saved here: the admin shows a preview, the person fixes it, then /members/import saves the rows they kept.
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const READ_PROMPT = `This is a photo or scan of a church member or contact list (it may be handwritten). Read every person on it.
Return ONLY a JSON array, no other words. One object per person with these keys (use "" when not on the list):
first_name, last_name, phone, email, address, city, state, zip, birthday (YYYY-MM-DD only if a full date is written, else ""), household, notes,
unsure (true when any part was hard to read, else false).
Copy what is written; do not invent anything. Put a family or household name in household. Put anything else written about the person in notes.
If the image is not a list of people, return [].`;
async function memberRead(me, b) {
  allow(me, 'members_edit');
  const key = process.env.ANTHROPIC_API_KEY || '';
  need(key, 503, 'Reading photos is not turned on yet. An admin needs to add the AI key in Neon (api function, environment ANTHROPIC_API_KEY). CSV and Excel files work now.');
  const type = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(b.media_type) ? b.media_type : null;
  const data = typeof b.data === 'string' ? b.data.replace(/^data:[^,]+,/, '') : '';
  need(type && data.length > 100 && data.length < 5500000 && /^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 2000)), 400, 'Please choose a photo (JPG or PNG).');
  if (!(await limit('read-list:' + me.email, 40, 60))) throw new Fail(429, 'That is a lot of photos for one hour. Please wait a bit and try again.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: type, data } }, { type: 'text', text: READ_PROMPT }] }] }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.log('read list failed', r.status, JSON.stringify(j).slice(0, 300)); throw new Fail(502, 'The photo could not be read right now' + (r.status === 400 && /credit/i.test(JSON.stringify(j)) ? ' (the AI account is out of credit)' : '') + '. Please try again.'); }
  const text = (j.content || []).map((c) => c.text || '').join('');
  let list = [];
  try { list = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  return { people: list.slice(0, 300).map((p) => { const o = {}; for (const k of M_TEXT) o[k] = str(p && p[k], k === 'notes' ? 1000 : 200); o.birthday = /^\d{4}-\d{2}-\d{2}$/.test(String(p && p.birthday)) ? p.birthday : ''; o.unsure = !!(p && p.unsure); return o; }).filter((o) => o.first_name || o.last_name) };
}
async function memberImport(me, b) {
  allow(me, 'members_edit');
  const list = Array.isArray(b.members) ? b.members.slice(0, 1000) : [];
  need(list.length, 400, 'There is no one to add.');
  const status = M_STATUSES.includes(b.status) ? b.status : 'Member';
  const clean = list.map((m) => { const o = { status: M_STATUSES.includes(m && m.status) ? m.status : status, updated_by: me.email };
    for (const k of M_TEXT) o[k] = str(m && m[k], k === 'notes' ? 4000 : 300);
    for (const k of M_DATES) o[k] = /^\d{4}-\d{2}-\d{2}$/.test(String(m && m[k] || '')) && !isNaN(Date.parse(m[k])) ? m[k] : null;
    if (!o.first_name && o.last_name) { o.first_name = o.last_name; o.last_name = ''; }
    return o; }).filter((o) => o.first_name);
  need(clean.length, 400, 'Each person needs at least a first name.');
  const cols = [...M_TEXT, ...M_DATES, 'status', 'updated_by'];
  const r = await q(`WITH x AS (INSERT INTO members (${cols.join(', ')}) SELECT ${cols.join(', ')} FROM jsonb_to_recordset($1::jsonb) AS y(${M_TEXT.map((k) => k + ' text').join(', ')}, ${M_DATES.map((k) => k + ' date').join(', ')}, status text, updated_by text) RETURNING *)
    SELECT coalesce(json_agg(t), '[]'::json) AS j FROM (SELECT ${M_COLS} FROM x) t`, [JSON.stringify(clean)]);
  const added = r[0] ? (typeof r[0].j === 'string' ? JSON.parse(r[0].j) : r[0].j) : [];
  return { added: added.length, members: added };
}
async function memberDelete(me, b) {
  allow(me, 'members_delete');
  await q('DELETE FROM members WHERE id = $1', [idOf(b.id)]);
  return { ok: true };
}

// ---------- calendar (church events and tasks, inside the admin only) ----------
const CAL_KINDS = ['Worship', 'Youth', 'Outreach', 'Meeting', 'Fellowship', 'Health', 'Project', 'Other'];
const CAL_COLORS = ['blue', 'navy', 'purple', 'pink', 'red', 'orange', 'gold', 'green', 'teal', 'brown', 'gray'];
const EV_PUB = "id, title, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, start_time, end_time, location, details, category, color";
const EV_COLS = EV_PUB + ", is_public, created_by, updated_by, updated_at, repeat, to_char(repeat_until, 'YYYY-MM-DD') AS repeat_until, invitees, remind";
const REPEATS = ['none', 'weekly', 'monthly', 'yearly'];
const REMIND_MIN = [30, 15, 5, 1]; // Jimmy, Nov 22, 2026: reminder emails 30, 15, 5 and 1 minute before, to everyone in the meeting
const TZ = 'America/Chicago';
const ymdUTC = (d) => d.toISOString().slice(0, 10);
const addDaysStr = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymdUTC(d); };
// Dates (YYYY-MM-DD) an event happens on between from and to (inclusive). Monthly and yearly skip months without that day.
function occurrences(e, from, to, max = 400) {
  const start = e.starts_on, rep = REPEATS.includes(e.repeat) ? e.repeat : 'none', until = e.repeat_until && e.repeat_until < to ? e.repeat_until : to, out = [];
  if (rep === 'none') return start >= from && start <= to ? [start] : (e.ends_on && start < from && e.ends_on >= from ? [start] : []);
  const [y0, m0, d0] = start.split('-').map(Number);
  for (let i = 0; out.length < max && i < 5000; i++) {
    let k;
    if (rep === 'weekly') k = addDaysStr(start, 7 * i);
    else { const d = new Date(Date.UTC(y0 + (rep === 'yearly' ? i : 0), m0 - 1 + (rep === 'monthly' ? i : 0), d0)); if (d.getUTCDate() !== d0) continue; k = ymdUTC(d); }
    if (k > until) break;
    if (k >= from) out.push(k);
  }
  return out;
}
// A Central time wall clock (date + HH:MM) as a real moment.
function chicago(day, time) {
  const [y, mo, d] = day.split('-').map(Number), [h, mi] = String(time).split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return new Date(guess + (guess - shown));
}
const t12s = (t) => { if (!t) return 'All day'; const [h, m] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); };
const dayLongS = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const repeatText = (e) => e.repeat === 'weekly' ? 'Every week on ' + new Date(e.starts_on + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' })
  : e.repeat === 'monthly' ? 'Every month on day ' + Number(e.starts_on.slice(8)) : e.repeat === 'yearly' ? 'Every year on ' + new Date(e.starts_on + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' }) : '';
const inviteesOf = (e) => { let v = e.invitees; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } } return Array.isArray(v) ? v.filter((x) => EMAIL_RE.test(x)) : []; };
// Nobody invited means no emails at all, not even reminders to the person who made it (Jimmy, Nov 23, 2026).
const meetingPeople = (e) => inviteesOf(e).length ? [...new Set([lower(e.created_by), ...inviteesOf(e).map(lower)].filter((x) => EMAIL_RE.test(x)))] : [];
const GAP = Number(process.env.MAIL_GAP_MS || 600); // Resend allows a few calls a second
const sleep = (ms) => new Promise((ok) => setTimeout(ok, Math.min(ms, GAP)));
async function mailCancel(ids) {
  if (!ids.length) return;
  try {
    if (!mailKey) { const r = await q("SELECT value FROM automation_status WHERE key = 'mail_relay_key'"); mailKey = r[0] ? r[0].value : ''; }
    await fetch(MAIL_URL + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mail-key': mailKey }, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(30000) });
  } catch (e) { console.log('cancel failed', String(e.message || e)); }
}
// Cancel the reminders not sent yet for one event (or a list of events).
async function dropReminders(ids) {
  const r = await q('DELETE FROM cal_reminders WHERE event_id = ANY($1::bigint[]) AND send_at > now() RETURNING resend_id', ['{' + ids.join(',') + '}']);
  await mailCancel(r.map((x) => x.resend_id).filter(Boolean));
}
// Schedule reminder emails (with Resend's scheduled sending) for the meetings that start in the next 50 hours.
// Runs when a meeting is saved and once a day from the Neon trigger, so the database is not woken every minute.
async function planReminders(only) {
  const now = Date.now(), horizon = now + 50 * 3600e3, today = new Date(now - 24 * 3600e3).toISOString().slice(0, 10), last = new Date(horizon + 24 * 3600e3).toISOString().slice(0, 10);
  const evs = await rows(`SELECT ${EV_COLS} FROM cal_events WHERE remind AND start_time IS NOT NULL AND start_time <> '' AND (repeat <> 'none' OR starts_on >= $1::date - 1)` + (only ? ' AND id = $2' : ''), only ? [today, only] : [today]);
  let made = 0;
  for (const e of evs) {
    const who = meetingPeople(e);
    if (!who.length) continue;
    for (const day of occurrences(e, today, last, 10)) {
      const at = chicago(day, e.start_time).getTime();
      if (at > horizon) continue;
      for (const m of REMIND_MIN) {
        const send = at - m * 60e3;
        if (send < now + 60e3) continue;
        const have = await one('SELECT 1 AS x FROM cal_reminders WHERE event_id = $1 AND occurs_on = $2::date AND minutes = $3', [e.id, day, m]);
        if (have) continue;
        const when = m === 1 ? 'in 1 minute' : 'in ' + m + ' minutes';
        const text = `Reminder: ${e.title} starts ${when}.\n\nWhen: ${dayLongS(day)}, ${t12s(e.start_time)}${e.end_time ? ' to ' + t12s(e.end_time) : ''} (Central time)` + (e.location ? '\nWhere: ' + e.location : '') + (repeatText(e) ? '\nRepeats: ' + repeatText(e) : '') + (e.details ? '\n\n' + e.details : '') + '\n\nSee it on the church calendar: ' + SITE + '/admin/';
        const r = await mail({ to: who[0], bcc: who.slice(1), subject: `Starts ${when}: ${e.title}`, tag: 'meeting-reminder', text, scheduled_at: new Date(send).toISOString() });
        await q('INSERT INTO cal_reminders (event_id, occurs_on, minutes, send_at, resend_id, status) VALUES ($1, $2::date, $3, $4::timestamptz, $5, $6) ON CONFLICT DO NOTHING',
          [e.id, day, m, new Date(send).toISOString(), r.id || null, r.ok ? 'scheduled' : 'failed ' + r.detail]);
        if (r.ok) made++;
        await sleep(600); // Resend allows a few calls a second
      }
    }
  }
  await q("DELETE FROM cal_reminders WHERE send_at < now() - interval '30 days'");
  return { ok: true, scheduled: made };
}
// ---------- meeting emails: invitation and update, with a calendar file (.ics) ----------
const icsEsc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = (l) => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
const ymd = (k) => k.replace(/-/g, '');
const addDayKey = (k, n) => new Date(Date.parse(k + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function meetingIcs(e) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shekinah SDA Church//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:America/Chicago', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0600', 'TZOFFSETTO:-0500', 'TZNAME:CDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0600', 'TZNAME:CST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', 'UID:shekinah-event-' + e.id + '@shekinahsda.org', 'SEQUENCE:' + Math.floor(Date.now() / 1000), 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')];
  if (e.start_time) {
    const st = e.start_time.replace(':', '') + '00';
    let et = e.end_time ? e.end_time.replace(':', '') + '00' : null, endDay = e.ends_on || e.starts_on;
    if (!et) { const [h, m] = e.start_time.split(':').map(Number); const t = h * 60 + m + 60; et = String(Math.floor(t / 60) % 24).padStart(2, '0') + String(t % 60).padStart(2, '0') + '00'; if (t >= 1440) endDay = addDayKey(endDay, 1); }
    L.push('DTSTART;TZID=America/Chicago:' + ymd(e.starts_on) + 'T' + st, 'DTEND;TZID=America/Chicago:' + ymd(endDay) + 'T' + et);
  } else {
    L.push('DTSTART;VALUE=DATE:' + ymd(e.starts_on), 'DTEND;VALUE=DATE:' + ymd(addDayKey(e.ends_on || e.starts_on, 1)));
  }
  if (e.repeat && e.repeat !== 'none') L.push('RRULE:FREQ=' + ({ weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[e.repeat] || 'WEEKLY') + (e.repeat_until ? ';UNTIL=' + ymd(e.repeat_until) + 'T235959Z' : ''));
  L.push('SUMMARY:' + icsEsc(e.title));
  if (e.location) L.push('LOCATION:' + icsEsc(e.location));
  L.push('DESCRIPTION:' + icsEsc((e.details ? e.details + '\n\n' : '') + 'Shekinah Haitian Seventh-day Adventist Church, ' + INV_ADDRESS));
  L.push('ORGANIZER;CN=Shekinah SDA Church:mailto:info@shekinahsda.org', 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
const hEsc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const whenOf = (e) => (e.start_time ? t12s(e.start_time) + (e.end_time ? ' to ' + t12s(e.end_time) : '') + ' (Central time)' : 'All day') + (e.ends_on && e.ends_on !== e.starts_on ? ', until ' + dayLongS(e.ends_on) : '');
const MEET_FIELDS = [['title', 'Name'], ['starts_on', 'Date'], ['start_time', 'Starts'], ['end_time', 'Ends'], ['ends_on', 'Last day'], ['location', 'Where'], ['repeat', 'Repeats'], ['repeat_until', 'Repeats until'], ['details', 'Details']];
const fieldText = (e, k) => k === 'starts_on' || k === 'ends_on' || k === 'repeat_until' ? (e[k] ? dayLongS(e[k]) : 'None') : k === 'start_time' || k === 'end_time' ? (e[k] ? t12s(e[k]) : 'None') : k === 'repeat' ? (repeatText(e) || 'Does not repeat') : (e[k] || 'None');
function meetingChanges(old, e) { return MEET_FIELDS.filter(([k]) => String(old[k] || '') !== String(e[k] || '')).map(([k, label]) => ({ label, was: fieldText(old, k), now: fieldText(e, k) })); }
function meetingMail(kind, e, me, changes) {
  const who = me.full_name || me.email, upd = kind === 'update';
  const subject = (upd ? 'Meeting updated: ' : 'Meeting invitation: ') + e.title;
  const rep = repeatText(e) ? repeatText(e) + (e.repeat_until ? ' until ' + dayLongS(e.repeat_until) : '') : '';
  const lead = upd ? `${who} changed a meeting you are invited to. Here are the new details.` : `${who} invited you to a meeting at Shekinah Haitian Seventh-day Adventist Church.`;
  const remindLine = e.remind && e.start_time ? 'You will get a reminder email 30, 15, 5 and 1 minute before it starts.' : '';
  const text = ['Hello,', '', lead, '', e.title, 'When: ' + dayLongS(e.starts_on) + ', ' + whenOf(e)]
    .concat(rep ? ['Repeats: ' + rep] : [], e.location ? ['Where: ' + e.location] : [], e.details ? ['', e.details] : [],
      upd && changes.length ? ['', 'What changed:'].concat(changes.map((c) => c.label + ': ' + c.was + ' -> ' + c.now)) : [],
      ['', 'The calendar file attached adds this meeting to your phone or computer calendar.'], remindLine ? [remindLine] : [],
      ['', 'Questions? Reply to this email to reach ' + who + '.', '', 'Shekinah Haitian Seventh-day Adventist Church', INV_ADDRESS]).join('\n');
  const row = (ic, label, val) => `<tr><td style="padding:8px 0;width:92px;vertical-align:top;font-size:13px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#6B7280">${label}</td><td style="padding:8px 0;font-size:16px;color:#13294B;font-weight:600">${val}</td></tr>`;
  const mapUrl = e.location && !/zoom|online|meet\.google|teams/i.test(e.location) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.location) : '';
  const html = `<!doctype html><html><body style="margin:0;background:#FAF6EE">
<div style="background:#FAF6EE;padding:28px 12px;font-family:${INV_F}">
 <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #EDE5D3">
  <div style="background:#13294B;padding:22px 24px;text-align:center"><img src="${SITE}/assets/logo-dark.png" width="260" alt="Shekinah Haitian Seventh-day Adventist Church" style="width:260px;max-width:100%;height:auto;border:0"></div>
  <div style="padding:28px 32px 6px;font-size:16px;line-height:1.6;color:#2C3443">
   <div style="display:inline-block;background:${upd ? '#FFF1D6' : '#E3F6E8'};color:${upd ? '#8A5A00' : '#157A2F'};font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;border-radius:999px;padding:4px 12px;margin-bottom:12px">${upd ? 'Meeting updated' : 'You are invited'}</div>
   <h1 style="font-family:${INV_S};font-size:25px;line-height:1.3;color:#13294B;margin:0 0 10px;font-weight:700">${hEsc(e.title)}</h1>
   <p style="margin:0 0 18px">${hEsc(lead)}</p>
   <div style="background:#F4F7FB;border-left:4px solid #D9A72B;border-radius:10px;padding:8px 18px;margin:0 0 20px"><table role="presentation" style="border-collapse:collapse;width:100%">
    ${row('', 'Date', hEsc(dayLongS(e.starts_on)))}
    ${row('', 'Time', hEsc(whenOf(e)))}
    ${rep ? row('', 'Repeats', hEsc(rep)) : ''}
    ${e.location ? row('', 'Where', mapUrl ? `<a href="${mapUrl}" style="color:#0E4A36">${hEsc(e.location)}</a>` : hEsc(e.location)) : ''}
   </table></div>
   ${upd && changes.length ? `<div style="border:1px solid #F3D9A4;background:#FFFAF0;border-radius:10px;padding:12px 16px;margin:0 0 20px"><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#8A5A00;margin-bottom:6px">What changed</div>${changes.map((c) => `<div style="font-size:15px;margin:4px 0"><b style="color:#13294B">${hEsc(c.label)}:</b> <span style="color:#9AA1AD;text-decoration:line-through">${hEsc(c.was)}</span> &rarr; <b style="color:#13294B">${hEsc(c.now)}</b></div>`).join('')}</div>` : ''}
   ${e.details ? `<p style="margin:0 0 18px;white-space:pre-line">${hEsc(e.details)}</p>` : ''}
   <p style="margin:0 0 8px"><b style="color:#13294B">Add it to your calendar:</b> open the calendar file attached to this email (shekinah-meeting.ics). It works with iPhone, Android, Google and Outlook calendars${upd ? ' and updates the meeting you already saved' : ''}.</p>
   ${remindLine ? `<p style="margin:0 0 8px;color:#5B6270">${remindLine}</p>` : ''}
   <p style="margin:16px 0 24px">Questions? Just reply to this email to reach ${hEsc(who)}.</p>
  </div>
  <div style="border-top:1px solid #EDE5D3;padding:16px 32px 22px;font-size:12.5px;line-height:1.6;color:#6B7280;text-align:center">Shekinah Haitian Seventh-day Adventist Church<br>${INV_ADDRESS}</div>
 </div>
</div></body></html>`;
  return { subject, text, html };
}
async function sendMeeting(kind, e, list, me, changes = []) {
  const m = meetingMail(kind, e, me, changes), ics = Buffer.from(meetingIcs(e)).toString('base64');
  for (const to of list) {
    await mail({ to, subject: m.subject, tag: kind === 'update' ? 'meeting-update' : 'meeting-invite', text: m.text, html: m.html, reply_to: me.email,
      attachments: [{ filename: 'shekinah-meeting.ics', content: ics, content_type: 'text/calendar; charset=utf-8; method=PUBLISH' }] });
    await sleep(600);
  }
}
const sendInvites = (e, list, me) => sendMeeting('invite', e, list, me);
const TK_COLS = "id, title, to_char(due_on, 'YYYY-MM-DD') AS due_on, assigned_to, event_id, done, notes, created_by, updated_by, updated_at";
const calEdit = (me) => !!me.perms.calendar_edit; // Jimmy, Nov 11, 2026: the whole team can view; only people with "Edit the calendar" can add, edit or delete
const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(String(v))) ? String(v) : null);
const timeOf = (v) => { const m = /^([01]?\d|2[0-3]):([0-5]\d)(:\d\d)?$/.exec(String(v || '').trim()); return m ? m[1].padStart(2, '0') + ':' + m[2] : null; };
// Public: events marked "Show on the website", from today on, for the /events/ page.
async function publicEvents() {
  const list = await rows(`SELECT ${EV_PUB}, repeat, to_char(repeat_until, 'YYYY-MM-DD') AS repeat_until FROM cal_events WHERE is_public AND (coalesce(ends_on, starts_on) >= (now() AT TIME ZONE 'America/Chicago')::date - 1 OR repeat <> 'none')
    AND starts_on <= (now() AT TIME ZONE 'America/Chicago')::date + 400 ORDER BY starts_on, start_time NULLS FIRST, id LIMIT 300`);
  const from = addDaysStr(new Date().toISOString().slice(0, 10), -1), to = addDaysStr(from, 180), out = [];
  for (const e of list) {
    const { repeat, repeat_until, ...pub } = e;
    if (!repeat || repeat === 'none') { out.push(pub); continue; }
    for (const k of occurrences(e, from, to, 60)) out.push({ ...pub, id: k === e.starts_on ? e.id : e.id + '_' + k, starts_on: k, ends_on: null });
  }
  out.sort((a, b) => (a.starts_on + (a.start_time || '')).localeCompare(b.starts_on + (b.start_time || '')));
  return { events: out.slice(0, 300) };
}
async function calendar(me) {
  const team = (await rows('SELECT email FROM admins ORDER BY lower(email)')).map((a) => a.email);
  return {
    events: await rows(`SELECT ${EV_COLS} FROM cal_events WHERE coalesce(ends_on, starts_on) >= current_date - 400 OR repeat <> 'none' ORDER BY starts_on, start_time NULLS FIRST, id`),
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
  const v = [title, start, end, timeOf(e.start_time), timeOf(e.end_time), str(e.location, 300), str(e.details, 4000), CAL_KINDS.includes(e.category) ? e.category : 'Other', me.email, e.is_public !== false, CAL_COLORS.includes(e.color) ? e.color : null];
  const isEdit = e.id != null && e.id !== '';
  const old = isEdit ? await one(`SELECT ${EV_COLS} FROM cal_events WHERE id = $1`, [idOf(e.id)]) : null;
  // Repeat, invitees and reminders keep their saved value when the screen does not send them (for example a drag to another day).
  const repeat = 'repeat' in e ? (REPEATS.includes(e.repeat) ? e.repeat : 'none') : old ? old.repeat || 'none' : 'none';
  let until = 'repeat_until' in e ? dayOf(e.repeat_until) : old ? old.repeat_until : null; if (repeat === 'none' || (until && until < start)) until = null;
  let inv = 'invitees' in e ? (Array.isArray(e.invitees) ? e.invitees : String(e.invitees || '').split(/[\s,;]+/)).map(lower).filter(Boolean) : old ? inviteesOf(old) : [];
  const badInv = inv.find((x) => !EMAIL_RE.test(x)); need(!badInv, 400, '"' + badInv + '" is not a valid email address.');
  inv = [...new Set(inv)].slice(0, 50);
  const remind = 'remind' in e ? e.remind === true : old ? old.remind === true : false;
  const dup = await rows(`SELECT id FROM cal_events WHERE lower(regexp_replace(trim(title), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
    AND starts_on = $2::date AND id <> $3 LIMIT 1`, [title, start, isEdit ? idOf(e.id) : -1]);
  need(!dup.length, 409, 'There is already an event called "' + title + '" on that day. Open that event to change it instead of adding it again.');
  let row;
  if (isEdit) {
    row = await wrote(`UPDATE cal_events SET title = $1, starts_on = $2::date, ends_on = $3::date, start_time = $4, end_time = $5, location = $6, details = $7, category = $8, updated_by = $9, is_public = $10::boolean, color = $11,
      repeat = $13, repeat_until = $14::date, invitees = $15::jsonb, remind = $16::boolean, updated_at = now() WHERE id = $12 RETURNING *`, [...v, idOf(e.id), repeat, until, JSON.stringify(inv), remind], EV_COLS);
    need(row, 404, 'That event was not found.');
  } else {
    row = await wrote(`INSERT INTO cal_events (title, starts_on, ends_on, start_time, end_time, location, details, category, created_by, updated_by, is_public, color, repeat, repeat_until, invitees, remind)
      VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $9, $10::boolean, $11, $12, $13::date, $14::jsonb, $15::boolean) RETURNING *`, [...v, repeat, until, JSON.stringify(inv), remind], EV_COLS);
  }
  const fresh = inv.filter((x) => x !== lower(me.email) && !(old ? inviteesOf(old).map(lower) : []).includes(x));
  if (fresh.length) await sendInvites(row, fresh, me);
  // People already invited hear about changes to the date, time, place or details.
  let updated = 0;
  if (old) {
    const changes = meetingChanges(old, row), keep = inv.filter((x) => x !== lower(me.email) && !fresh.includes(x));
    if (changes.length && keep.length) { await sendMeeting('update', row, keep, me, changes); updated = keep.length; }
  }
  // Any change can move the time, so the reminders not sent yet are planned again.
  if (old) await dropReminders([row.id]);
  if (row.remind) await planReminders(row.id);
  return { event: row, invited: fresh.length, updated };
}
// One click "Send invite again": everyone invited (or one person) gets the current invitation with the calendar file.
async function eventResend(me, b) {
  need(calEdit(me), 403, 'You do not have access to this. Ask an admin if you need it.');
  const row = await one(`SELECT ${EV_COLS} FROM cal_events WHERE id = $1`, [idOf(b.id)]);
  need(row, 404, 'That event was not found.');
  const all = inviteesOf(row).map(lower).filter((x) => x !== lower(me.email));
  const who = b.email ? lower(b.email) : null;
  const list = who ? all.filter((x) => x === who) : all;
  need(list.length, 400, who ? 'That person is not invited to this meeting.' : 'Nobody else is invited to this meeting yet.');
  await sendInvites(row, list, me);
  return { sent: list.length };
}
async function eventDelete(me, b) {
  need(calEdit(me), 403, 'You do not have access to this. Ask an admin if you need it.');
  await dropReminders([idOf(b.id)]);
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
    VALUES ($1, 'new', $2, $3, $4, $5, $6, $7::jsonb, $8, now(), now(), false) RETURNING id, kind, topic, is_private, name, email, phone`,
    [e.kind, e.name, e.email, e.phone, e.topic || null, e.message, JSON.stringify(details), e.is_private]);
  {
    // Tell the team about every form, email sign ups included. No private details in the email: staff sign in to read them.
    const what = (row.is_private ? 'private ' : '') + areaLabel(row);
    // Who it is (name, email, phone) is shown for everything except private requests (Jimmy, Nov 23, 2026). Messages stay in the admin.
    const who = row.is_private ? '' : [row.name ? 'Name: ' + row.name : '', row.email ? 'Email: ' + row.email : '', row.phone ? 'Phone: ' + row.phone : ''].filter(Boolean).join('\n');
    const text = 'A new ' + what + ' came in through shekinahsda.org' + (row.is_private || !row.name ? '' : ' from ' + row.name) + '.\n\n' + (who ? who + '\n\n' : '') + 'Sign in to read it and follow up:\n' + SITE + '/admin/';
    for (const to of await alertList()) await mail({ to, subject: 'New ' + what + ' on the website', tag: 'staff-alert', text });
  }
  // "Email me the newsletter" box on the prayer, Bible study, contact and visit forms (Nov 23, 2026). No second team alert.
  if (b.subscribe === true && e.kind !== 'newsletter' && EMAIL_RE.test(e.email)) {
    const have = await one("SELECT id FROM submissions WHERE kind = 'newsletter' AND lower(email) = $1 AND unsubscribed = false LIMIT 1", [e.email.toLowerCase()]);
    if (!have) await q(`INSERT INTO submissions (kind, status, name, email, phone, details, is_private, created_at, updated_at, unsubscribed)
      VALUES ('newsletter', 'new', $1, $2, $3, $4::jsonb, false, now(), now(), false)`, [e.is_private ? '' : e.name, e.email, e.is_private ? '' : e.phone, JSON.stringify({ source: e.kind + ' form' })]);
  }
  await sendThanksNow();
  return { ok: true };
}
// Who gets the new message alert: automation_status key 'staff_alert_emails' (comma separated), plus the office inbox.
async function alertList() {
  let list = [STAFF_INBOX];
  try {
    const r = await q("SELECT value FROM automation_status WHERE key = 'staff_alert_emails'");
    if (r[0] && r[0].value) list = list.concat(String(r[0].value).split(','));
  } catch (e) {}
  const seen = new Set();
  return list.map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) && !seen.has(x) && seen.add(x)).slice(0, 10);
}
// Ask the welcome function to send the thank you or welcome email right away (it skips anything already sent).
async function sendThanksNow() {
  try {
    if (!mailKey) { const r = await q("SELECT value FROM automation_status WHERE key = 'mail_relay_key'"); mailKey = r[0] ? r[0].value : ''; }
    if (!mailKey) return;
    await fetch(MAIL_URL + '/run', { method: 'POST', headers: { 'x-mail-key': mailKey }, signal: AbortSignal.timeout(25000) });
  } catch (e) { console.log('thanks now failed', String(e.message || e).slice(0, 200)); }
}

// ---------- daily reports (Google Analytics + Search Console) ----------
// A GitHub Actions job (.github/workflows/reports-daily.yml) reads both Google APIs with a keyless,
// read only Google Cloud identity and posts the numbers here. It proves who it is with GitHub's own
// signed OIDC token, so no shared secret exists anywhere.
const GH_ISS = 'https://token.actions.githubusercontent.com', GH_REPO = 'peremis20/shekinahchurch', GH_AUD = 'shekinah-reports';
let ghKeys = null, ghKeysAt = 0;
const b64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
async function githubOidc(req) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const parts = tok.split('.'); need(parts.length === 3, 401, 'Not allowed.');
  let head, claims; try { head = JSON.parse(b64u(parts[0]).toString()); claims = JSON.parse(b64u(parts[1]).toString()); } catch { throw new Fail(401, 'Not allowed.'); }
  need(head.alg === 'RS256' && head.kid, 401, 'Not allowed.');
  if (!ghKeys || Date.now() - ghKeysAt > 3600e3) { const r = await fetch(GH_ISS + '/.well-known/jwks'); ghKeys = (await r.json()).keys || []; ghKeysAt = Date.now(); }
  const jwk = ghKeys.find((k) => k.kid === head.kid); need(jwk, 401, 'Not allowed.');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Date.now() / 1000;
  need(ok && claims.iss === GH_ISS && claims.aud === GH_AUD && claims.repository === GH_REPO && claims.ref === 'refs/heads/main' && claims.exp > now && (claims.nbf || 0) <= now + 60, 401, 'Not allowed.');
  return claims;
}
async function reportsIngest(req) {
  await githubOidc(req);
  const b = await body(req);
  need(b && b.generated_at && (b.ga || b.gsc), 400, 'Missing report data.');
  await q(`INSERT INTO automation_status (key, value, updated_at) VALUES ('reports_daily', $1, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(b)]);
  return { ok: true };
}
async function reportsGet(me) {
  allow(me, 'messages_manage');
  const r = await one("SELECT value, updated_at FROM automation_status WHERE key = 'reports_daily'");
  if (!r) return { report: null };
  let v = null; try { v = JSON.parse(r.value); } catch {}
  return { report: v, saved_at: r.updated_at };
}

// View only share link: anyone with the secret link can see the website numbers, nothing else.
async function shareKey(make) {
  const r = await one("SELECT value FROM automation_status WHERE key = 'reports_share_key'");
  if (r && r.value) return r.value;
  if (!make) return '';
  const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let k = ''; for (let i = 0; i < 6; i++) k += A[randomInt(A.length)];
  await q(`INSERT INTO automation_status (key, value, updated_at) VALUES ('reports_share_key', $1, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [k]);
  return k;
}
async function reportsView() {
  // The public page shekinahsda.org/report works only while sharing is turned on in the admin.
  need(await shareKey(false), 404, 'This link is not active.');
  const r = await one("SELECT value, updated_at FROM automation_status WHERE key = 'reports_daily'");
  let v = null; if (r) { try { v = JSON.parse(r.value); } catch {} }
  return { report: v, saved_at: r ? r.updated_at : null };
}
async function shareGet(me) { allow(me, 'team_manage'); return { key: await shareKey(false) }; }
async function shareMake(me) {
  allow(me, 'team_manage');
  await q("DELETE FROM automation_status WHERE key = 'reports_share_key'");
  return { key: await shareKey(true) };
}
async function shareOff(me) { allow(me, 'team_manage'); await q("DELETE FROM automation_status WHERE key = 'reports_share_key'"); return { key: '' }; }

// ---------- projects (church projects and costs; Jimmy, Nov 16, 2026) ----------
// Every team member can see the list and add a project. Changing or deleting: the person who added it, or anyone who can manage the team.
// cost = estimated cost. The overall budget is in automation_status 'projects_budget' (set by team managers).
const PJ_COLS = "id, name, dept, purpose, cost::float8 AS cost, actual_cost::float8 AS actual_cost, status, progress, to_char(start_on, 'YYYY-MM-DD') AS start_on, to_char(end_on, 'YYYY-MM-DD') AS end_on, to_char(created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS added_on, created_by, updated_by, approval, approval_by, to_char(approval_on, 'YYYY-MM-DD') AS approval_on";
const PJ_APPROVAL = ['Waiting', 'Approved', 'Not approved'];
const PJ_DEPTS = ['Building Development', 'Children', 'Community Services', 'Deacons', 'Education', 'Health', 'Music', 'Outreach', 'Pathfinders', 'Sabbath School', 'Women', 'Men', 'Youth', 'Other'];
const PJ_STATUS = ['Not Started', 'Planned', 'In Progress', 'Completed'];
const pjMine = (me, p) => me.perms.team_manage || lower(p.created_by) === lower(me.email);
function money(v) {
  const n = Number(String(v == null || v === '' ? '0' : v).replace(/[$,\s]/g, ''));
  return isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}
async function pjBudget() { const r = await q("SELECT value FROM automation_status WHERE key = 'projects_budget'"); return r[0] ? Number(r[0].value) || 0 : 0; }
async function projects(me) {
  const list = await rows(`SELECT ${PJ_COLS} FROM projects ORDER BY created_at DESC, id DESC`);
  return { projects: list, depts: PJ_DEPTS, statuses: PJ_STATUS, budget: await pjBudget(), me: me.email, can_manage: !!me.perms.team_manage };
}
async function projectSave(me, b) {
  const p = b.project && typeof b.project === 'object' ? b.project : {};
  const name = str(p.name, 200), dept = str(p.dept, 100), purpose = str(p.purpose, 2000), cost = money(p.cost), actual = money(p.actual_cost);
  const status = PJ_STATUS.includes(p.status) ? p.status : 'Planned';
  let progress = Math.round(Number(p.progress)); if (!isFinite(progress)) progress = 0; progress = Math.max(0, Math.min(100, progress));
  if (status === 'Completed') progress = 100;
  need(name, 400, 'Please add the project name.');
  need(cost !== null, 400, 'Please enter the estimated cost as a number, like 250 or 1200.50.');
  need(actual !== null, 400, 'Please enter the actual cost as a number, or leave it empty.');
  const day = (x) => { const t = String(x || '').trim(); if (!t) return null; need(/^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t)), 400, 'Please pick the start and end dates from the calendar.'); return t; };
  const startOn = day(p.start_on), endOn = day(p.end_on);
  need(!startOn || !endOn || endOn >= startOn, 400, 'The end date cannot be before the start date.');
  const v = [name, dept, purpose, cost, actual, status, progress, me.email, startOn, endOn];
  let row;
  if (p.id != null && p.id !== '') {
    const old = await one('SELECT id, created_by FROM projects WHERE id = $1', [idOf(p.id)]);
    need(old, 404, 'That project was not found.');
    need(pjMine(me, old), 403, 'Only the person who added this project or an admin can change it.');
    row = await wrote('UPDATE projects SET name = $1, dept = $2, purpose = $3, cost = $4::numeric, actual_cost = $5::numeric, status = $6, progress = $7::int, updated_by = $8, start_on = $9::date, end_on = $10::date, updated_at = now() WHERE id = $11 RETURNING *', [...v, old.id], PJ_COLS);
  } else {
    row = await wrote('INSERT INTO projects (name, dept, purpose, cost, actual_cost, status, progress, created_by, updated_by, start_on, end_on) VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, $7::int, $8, $8, $9::date, $10::date) RETURNING *', v, PJ_COLS);
  }
  await pjCal(row.id, me);
  return { project: row };
}
// A project with dates gets a private entry on the church calendar, kept in step with the project.
async function pjCal(id, me) {
  const p = await one("SELECT id, name, purpose, dept, cal_event_id, to_char(start_on, 'YYYY-MM-DD') AS s, to_char(end_on, 'YYYY-MM-DD') AS e FROM projects WHERE id = $1", [id]);
  if (!p) return;
  if (!p.s && !p.e) {
    if (p.cal_event_id) { await q('UPDATE projects SET cal_event_id = NULL WHERE id = $1', [p.id]); await q('DELETE FROM cal_events WHERE id = $1', [p.cal_event_id]); }
    return;
  }
  const start = p.s || p.e, end = p.s && p.e && p.e > p.s ? p.e : null;
  const title = ('Project: ' + p.name).slice(0, 200);
  const details = [p.purpose, p.dept ? 'Department: ' + p.dept : '', 'Added from the Projects page. Change the dates there.'].filter(Boolean).join('\n');
  const ev = p.cal_event_id ? await one('SELECT id FROM cal_events WHERE id = $1', [p.cal_event_id]) : null;
  if (ev) {
    await q("UPDATE cal_events SET title = $1, starts_on = $2::date, ends_on = $3::date, details = $4, category = 'Project', is_public = false, updated_by = $5, updated_at = now() WHERE id = $6", [title, start, end, details, me.email, ev.id]);
  } else {
    const n = await wrote("INSERT INTO cal_events (title, starts_on, ends_on, details, category, is_public, created_by, updated_by) VALUES ($1, $2::date, $3::date, $4, 'Project', false, $5, $5) RETURNING *", [title, start, end, details, me.email], 'id');
    await q('UPDATE projects SET cal_event_id = $1 WHERE id = $2', [n.id, p.id]);
  }
}
async function projectApprove(me, b) {
  allow(me, 'team_manage');
  const a = PJ_APPROVAL.includes(b.approval) ? b.approval : null;
  need(a, 400, 'Please pick Waiting, Approved or Not approved.');
  const old = await one('SELECT id FROM projects WHERE id = $1', [idOf(b.id)]);
  need(old, 404, 'That project was not found.');
  const row = await wrote("UPDATE projects SET approval = $1, approval_by = CASE WHEN $1 = 'Waiting' THEN NULL ELSE $2 END, approval_on = CASE WHEN $1 = 'Waiting' THEN NULL ELSE (now() AT TIME ZONE 'America/Chicago')::date END, updated_at = now() WHERE id = $3 RETURNING *", [a, me.email, old.id], PJ_COLS);
  return { project: row };
}
async function projectDelete(me, b) {
  const old = await one('SELECT id, created_by, cal_event_id FROM projects WHERE id = $1', [idOf(b.id)]);
  need(old, 404, 'That project was not found.');
  need(pjMine(me, old), 403, 'Only the person who added this project or an admin can delete it.');
  await q('DELETE FROM projects WHERE id = $1', [old.id]);
  if (old.cal_event_id) await q('DELETE FROM cal_events WHERE id = $1', [old.cal_event_id]);
  return { ok: true };
}
async function projectBudget(me, b) {
  allow(me, 'team_manage');
  const n = money(b.budget);
  need(n !== null, 400, 'Please enter the budget as a number.');
  await q("INSERT INTO automation_status (key, value, updated_at) VALUES ('projects_budget', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [String(n)]);
  return { budget: n };
}

// ---------- router ----------
const ROUTES = {
  'POST /admin/update': update, 'POST /admin/assign': assign, 'POST /admin/reply': reply, 'POST /admin/create': create, 'POST /admin/edit': edit, 'POST /admin/delete': del, 'POST /admin/delete-many': delMany,
  'POST /admin/broadcast': broadcast, 'POST /admin/newsletters/save': newsQueueSave, 'POST /admin/newsletters/delete': newsQueueDelete, 'POST /admin/subscribers/edit': subEdit, 'POST /admin/content/save': contentSave,
  'POST /admin/admins/add': teamAdd, 'POST /admin/admins/update': teamUpdate, 'POST /admin/admins/remove': teamRemove, 'POST /admin/admins/name': teamName, 'POST /admin/admins/suspend': teamSuspend,
  'POST /calendar/event': eventSave, 'POST /calendar/event/delete': eventDelete, 'POST /calendar/event/resend': eventResend, 'POST /calendar/task': taskSave, 'POST /calendar/task/done': taskDone, 'POST /calendar/task/delete': taskDelete,
  'POST /admin/reports/share/new': shareMake, 'POST /admin/reports/share/off': shareOff,
  'POST /members/list': memberList, 'POST /members/find': memberFind, 'POST /members/save': memberSave, 'POST /members/delete': memberDelete, 'POST /members/read': memberRead, 'POST /members/import': memberImport,
  'POST /projects/save': projectSave, 'POST /projects/delete': projectDelete, 'POST /projects/approve': projectApprove, 'POST /projects/budget': projectBudget,
};
const GETS = {
  'GET /admin/list': list, 'GET /admin/subscribers': subscribers, 'GET /admin/admins': team, 'GET /members': members, 'GET /calendar': calendar, 'GET /admin/reports': reportsGet, 'GET /admin/reports/share': shareGet, 'GET /projects': projects, 'GET /admin/newsletters': newsQueue,
  'GET /admin/content': async (me) => { allow(me, 'site_edit'); return { content: await contentRows() }; },
};
// ---------- likes (public, Nov 17, 2026) ----------
const LIKE_PAGE = /^\/(kreyol|blog)\/[a-z0-9-]{1,120}\/$/;
async function likesGet(req) {
  const page = str(new URL(req.url).searchParams.get('p'), 140);
  need(LIKE_PAGE.test(page), 400, 'Unknown page.');
  const r = await q('SELECT n FROM page_likes WHERE page = $1', [page]);
  return { page, n: r.length ? Number(r[0].n) : 0 };
}
async function likesPost(req) {
  const b = await body(req);
  const page = str(b && b.p, 140), on = !(b && b.on === false);
  need(LIKE_PAGE.test(page), 400, 'Unknown page.');
  const who = ip(req);
  need(await limit('like:' + who, 60, 1440), 429, 'Please try again later.');
  if (!(await limit('like:' + who + ':' + page, 4, 1440))) {
    const r = await q('SELECT n FROM page_likes WHERE page = $1', [page]);
    return { page, n: r.length ? Number(r[0].n) : 0 };
  }
  const r = on
    ? await q('INSERT INTO page_likes (page, n) VALUES ($1, 1) ON CONFLICT (page) DO UPDATE SET n = page_likes.n + 1, updated_at = now() RETURNING n', [page])
    : await q('UPDATE page_likes SET n = GREATEST(n - 1, 0), updated_at = now() WHERE page = $1 RETURNING n', [page]);
  return { page, n: r.length ? Number(r[0].n) : 0 };
}

async function route(req, path) {
  const key = req.method + ' ' + path;
  if (key === 'GET /' || key === 'GET /health') return { ok: true, service: 'shekinah api' };
  if (key === 'POST /submit') return submit(req);
  if (key === 'GET /content') return publicContent();
  if (key === 'GET /events') return publicEvents();
  if (key === 'GET /likes') return likesGet(req);
  if (key === 'POST /likes') return likesPost(req);
  if (key === 'POST /reports/ingest') return reportsIngest(req);
  // Daily Neon trigger: plan the meeting reminders for the next two days (safe to run any time, it skips what is planned).
  if (key === 'POST /cron/reminders') { const r = await planReminders(); let news = null; try { news = await newsQueueRun(); } catch (e) { news = { error: String(e.message || e).slice(0, 200) }; } return { ...r, news }; }
  if (key === 'GET /reports/view') return reportsView();
  if (key === 'POST /admin/login/start') return loginStart(req);
  if (key === 'POST /admin/login/verify') return loginVerify(req);
  if (ROUTES[key] || GETS[key] || key === 'GET /admin/check' || key === 'POST /admin/logout' || key === 'POST /admin/logout-all') {
    const me = await who(req);
    if (key === 'GET /admin/check') return checkOut(me);
    if (key === 'POST /admin/logout') { await q('DELETE FROM admin_sessions WHERE token_hash = $1', [sha(me.token)]); return { ok: true }; }
    if (key === 'POST /admin/logout-all') { const r = await q('DELETE FROM admin_sessions WHERE lower(email) = lower($1) RETURNING 1', [me.email]); return { ok: true, ended: r.length }; }
    if (GETS[key]) return GETS[key](me);
    return ROUTES[key](me, await body(req));
  }
  throw new Fail(404, 'Not found.');
}

export default {
  async fetch(req) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    const pub = path === '/reports/view' || path === '/content' || path === '/events' || path === '/submit' || path === '/likes' || path === '/';
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
