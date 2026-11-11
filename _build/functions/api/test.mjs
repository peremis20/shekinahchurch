// Local test of the api function against a real Postgres (PGlite). Network calls are replaced: SQL goes to PGlite, mail is captured.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const API_SRC = process.argv[2];
process.env.DATABASE_URL = 'postgres://u:p@ep-x.c-7.us-east-2.aws.neon.tech/neondb';
process.env.SQL_URL = 'http://sql.local/sql';
process.env.MAIL_URL = 'http://mail.local';

const db = new PGlite();
await db.exec(`
CREATE TABLE admins (email text PRIMARY KEY, added_by text, created_at timestamptz NOT NULL DEFAULT now(), last_login timestamptz, role text NOT NULL DEFAULT 'volunteer' CHECK (role IN ('admin','staff','volunteer')), can_see_private boolean NOT NULL DEFAULT false);
CREATE TABLE admin_codes (email text PRIMARY KEY, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0);
CREATE TABLE admin_sessions (token_hash text PRIMARY KEY, email text NOT NULL REFERENCES admins(email) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE automation_status (key text PRIMARY KEY, value text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE broadcasts (id bigserial PRIMARY KEY, subject text NOT NULL, body text NOT NULL, sent_by text NOT NULL, recipient_count integer NOT NULL, sent_count integer NOT NULL, sent_at timestamptz NOT NULL);
CREATE TABLE submissions (id bigserial PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('visit','prayer','contact','newsletter')), name text, email text, phone text, topic text, message text, details jsonb NOT NULL DEFAULT '{}', is_private boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','archived')), admin_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), added_by text, edited_by text, assigned_to text, unsubscribed boolean NOT NULL DEFAULT false);
CREATE TABLE replies (id bigserial PRIMARY KEY, submission_id bigint NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, sent_by text NOT NULL, to_email text NOT NULL, subject text NOT NULL, body text NOT NULL, sent_at timestamptz NOT NULL);
CREATE TABLE site_content (key text PRIMARY KEY, value jsonb NOT NULL, updated_by text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE welcome_log (submission_id bigint PRIMARY KEY, email text NOT NULL DEFAULT '', status text NOT NULL, detail text NOT NULL DEFAULT '', sent_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, kind text NOT NULL DEFAULT '');
CREATE TABLE members (id serial PRIMARY KEY, first_name text NOT NULL, last_name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '', zip text NOT NULL DEFAULT '',
  birthday date, status text NOT NULL DEFAULT 'Member' CHECK (status IN ('Member','Baptized member','Regular attender','Visitor','Inactive','Transferred out')), member_since date, baptism_date date, household text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL DEFAULT '');
`);
// the real migration file (pgcrypto may be missing in PGlite: gen_random_bytes is then replaced for the test)
let mig = readFileSync(new URL('schema.sql', 'file://' + API_SRC.replace(/index\.mjs$/, '')), 'utf8');
try { await db.query('SELECT gen_random_bytes(4)'); } catch { mig = mig.replace("encode(gen_random_bytes(32), 'hex')", "md5(random()::text) || md5(random()::text)"); }
await db.exec(mig); await db.exec(mig); // twice: must be safe to run again
await db.exec(`INSERT INTO admins (email, added_by, role, can_see_private) VALUES ('owner@x.org','seed','admin',true), ('old-staff@x.org','seed','staff',false), ('bot@x.org','automation','staff',false);`);

const mails = []; let mailOk = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url === 'http://sql.local/sql') {
    const { query, params } = JSON.parse(opt.body);
    try { const r = await db.query(query, params, { rowMode: 'object', parsers: {} });
      // Neon-Raw-Text-Output: every value is text
      const rows = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? null : typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v)])));
      return new Response(JSON.stringify({ rows }), { status: 200 });
    } catch (e) { return new Response(JSON.stringify({ message: String(e.message) }), { status: 400 }); }
  }
  if (url === 'http://mail.local/send') { const m = JSON.parse(opt.body); m._key = opt.headers['x-mail-key']; mails.push(m); return new Response(JSON.stringify({ ok: mailOk }), { status: mailOk ? 200 : 502 }); }
  if (url.endsWith('/content-defaults.json')) return new Response(JSON.stringify({ posts: [{ id: 'p1', title: 'Old', slug: 'old-slug', seoTitle: 'SEO Old', metaDesc: 'md', keywords: ['k'], lang: 'ht' }] }), { status: 200 });
  throw new Error('unexpected fetch ' + url);
};
const api = (await import(API_SRC)).default;
let ipn = 0;
async function call(method, path, { token, body, ip } = {}) {
  const headers = { origin: 'https://shekinahsda.org', 'x-forwarded-for': ip || '10.0.0.' + (++ipn % 250) };
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await api.fetch(new Request('https://api.local' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, headers: r.headers };
}
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
async function signIn(email) {
  mails.length = 0;
  const s = await call('POST', '/admin/login/start', { body: { email } });
  if (s.status !== 200) return { err: s };
  const m = mails.find((x) => x.tag === 'admin-code');
  if (!m) return { none: true };
  const code = /code for the Shekinah church admin is (\d{6})/.exec(m.text)[1];
  const v = await call('POST', '/admin/login/verify', { body: { email, code } });
  return { token: v.j && v.j.token, v, code };
}

// ---- basics ----
let r = await call('GET', '/'); ok(r.status === 200 && r.j.ok, 'health');
r = await call('OPTIONS', '/admin/list'); ok(r.status === 204 && r.headers.get('access-control-allow-headers').includes('Authorization'), 'preflight');
r = await call('GET', '/admin/list'); ok(r.status === 401, 'list needs sign in', r);
r = await call('GET', '/admin/list', { token: 'nope' }); ok(r.status === 401, 'bad token', r);
r = await call('GET', '/nothing'); ok(r.status === 404 && r.j.error, '404 json');

// ---- sign in ----
r = await call('POST', '/admin/login/start', { body: { email: 'stranger@x.org' } }); ok(r.status === 200 && mails.length === 0, 'unknown email: same answer, no mail', r);
let owner = await signIn('Owner@X.org'); ok(owner.token && owner.token.length === 64, 'owner signs in (case insensitive)', owner.v);
ok(mails[0]._key && mails[0]._key.length >= 32, 'mail uses the relay key');
r = await call('POST', '/admin/login/verify', { body: { email: 'owner@x.org', code: owner.code } }); ok(r.status === 401, 'code cannot be used twice', r);
await call('POST', '/admin/login/start', { body: { email: 'old-staff@x.org' } });
for (let i = 0; i < 5; i++) await call('POST', '/admin/login/verify', { body: { email: 'old-staff@x.org', code: '000000' } });
const realCode = /is (\d{6})/.exec(mails.filter((x) => x.to === 'old-staff@x.org').pop().text)[1];
r = await call('POST', '/admin/login/verify', { body: { email: 'old-staff@x.org', code: realCode } }); ok(r.status === 401, 'locked after 5 wrong codes', r);
r = await call('GET', '/admin/check', { token: owner.token }); ok(r.j.email === 'owner@x.org' && r.j.role === 'admin' && r.j.can_see_private === true && r.j.perms.team_manage, 'check for admin', r.j);
mailOk = false; r = await call('POST', '/admin/login/start', { body: { email: 'owner@x.org' } }); ok(r.status === 502, 'mail failure is reported', r); mailOk = true;

// ---- public forms ----
const sub = (b, ip) => call('POST', '/submit', { body: b, ip });
r = await sub({ kind: 'prayer', name: 'Ana', email: 'ana@x.org', phone: '', message: 'Please pray for my family', private: true }); ok(r.status === 200, 'private prayer', r);
ok(mails.some((m) => m.tag === 'staff-alert' && /private prayer request/.test(m.subject) && !/Ana/.test(m.text) && !/family/.test(m.text)), 'staff alert hides private details', mails.slice(-1));
r = await sub({ kind: 'prayer', name: '', email: '', phone: '', message: 'Open prayer', private: false }); ok(r.status === 200, 'anonymous prayer');
r = await sub({ kind: 'contact', topic: 'Bible study request', name: 'Ben', email: 'ben@x.org', phone: '', message: 'I would like to start a Bible study.', details: { language: 'Kreyòl', format: 'By phone' } }); ok(r.status === 200, 'bible study');
r = await sub({ kind: 'contact', topic: 'Membership transfer', name: 'Cy', email: 'cy@x.org', phone: '', message: 'Transfer in from First Church', details: { transfer: 'Transfer in', church: 'First Church', churchLocation: '', conference: '', family: '' } }); ok(r.status === 200, 'transfer');
r = await sub({ kind: 'contact', topic: 'General question', name: 'Di', email: 'di@x.org', phone: '', message: 'What time is church?' }); ok(r.status === 200, 'contact');
r = await sub({ kind: 'visit', name: 'Ed', email: 'ed@x.org', phone: '', message: '', details: { guests: '3', date: '2026-11-14', kids: true, language: 'kr' } }); ok(r.status === 200, 'visit');
r = await sub({ kind: 'newsletter', email: 'news@x.org' }); ok(r.status === 200, 'newsletter');
r = await sub({ kind: 'newsletter', email: 'NEWS@x.org' }); ok(r.status === 200, 'newsletter again');
r = await sub({ kind: 'newsletter', email: 'bad' }); ok(r.status === 400 && r.j.error, 'newsletter bad email', r);
r = await sub({ kind: 'contact', name: 'x', email: 'a@b.co', message: 'Buy SEO backlinks now' }); ok(r.status === 200, 'spam accepted quietly');
r = await sub({ kind: 'hack', message: 'x' }); ok(r.status === 400, 'unknown kind');
r = await sub({ kind: 'contact', name: 'Di', email: 'di@x.org', phone: '', topic: 'General question', message: 'What time is church?' }); ok(r.status === 200, 'double click');
let n = (await db.query('SELECT kind, topic, is_private, details, status, unsubscribed FROM submissions ORDER BY id')).rows;
ok(n.length === 7, 'seven rows stored (spam, repeat newsletter and double click dropped)', n.length);
ok(n[0].is_private === true && n[2].details.language === 'Kreyòl' && n[5].details.kids === true && n[5].details.guests === '3' && n.every((x) => x.status === 'new'), 'stored shapes', n);
for (let i = 0; i < 13; i++) r = await sub({ kind: 'contact', name: 'F', email: 'f@x.org', message: 'm' + i }, '9.9.9.9'); ok(r.status === 429, 'form rate limit', r);
await db.query("DELETE FROM submissions WHERE email = 'f@x.org'");

// ---- team: old and new shapes ----
const O = owner.token;
r = await call('POST', '/admin/admins/add', { token: O, body: { email: ' Vol@X.org ', role: 'volunteer', can_see_private: false } }); ok(r.status === 200 && r.j.admins.some((a) => a.email === 'vol@x.org' && a.title === 'volunteer') && !r.j.admins.some((a) => a.email === 'bot@x.org'), 'add (old shape), bot hidden', r.j);
ok(mails.some((m) => m.tag === 'team-invite' && m.to === 'vol@x.org'), 'invite mail');
for (const [e, t, priv] of [['pastor@x.org', 'pastor', true], ['elder@x.org', 'elder', false], ['clerk@x.org', 'clerk', false], ['editor@x.org', 'editor', false], ['leader@x.org', 'leader', false]]) {
  r = await call('POST', '/admin/admins/add', { token: O, body: { email: e, title: t, can_see_private: priv } }); ok(r.status === 200, 'add ' + t, r);
}
r = await call('POST', '/admin/admins/add', { token: O, body: { email: 'vol@x.org', role: 'staff' } }); ok(r.status === 400, 'no duplicates');
r = await call('POST', '/admin/admins/update', { token: O, body: { email: 'owner@x.org', role: 'volunteer', can_see_private: false } }); ok(r.status === 400, 'cannot change yourself');
r = await call('POST', '/admin/admins/remove', { token: O, body: { email: 'owner@x.org' } }); ok(r.status === 400, 'cannot remove yourself');
const roles = (await db.query("SELECT email, role, title FROM admins WHERE added_by <> 'automation' ORDER BY email")).rows;
ok(roles.every((x) => ['admin', 'staff', 'volunteer'].includes(x.role)) && roles.find((x) => x.email === 'clerk@x.org').role === 'volunteer' && roles.find((x) => x.email === 'pastor@x.org').role === 'staff', 'legacy role column stays valid', roles);

const T = {};
for (const e of ['vol', 'pastor', 'elder', 'clerk', 'editor', 'leader', 'old-staff']) { await db.query('DELETE FROM admin_codes'); await db.query("DELETE FROM rate_events"); const s = await signIn(e + '@x.org'); T[e] = s.token; ok(!!s.token, 'sign in ' + e, s.v || s); }
const seen = async (who) => { const l = await call('GET', '/admin/list', { token: T[who] || O }); return l.j.items.map((i) => (i.is_private ? 'P:' : '') + (i.topic === 'Bible study request' ? 'bible' : i.topic === 'Membership transfer' ? 'transfer' : i.kind)).sort().join(','); };
ok((await seen('owner')) === 'P:prayer,bible,contact,newsletter,prayer,transfer,visit', 'admin sees all', await seen('owner'));
ok((await seen('pastor')) === 'P:prayer,bible,contact,newsletter,prayer,transfer,visit', 'pastor with private box sees all', await seen('pastor'));
ok((await seen('old-staff')) === 'bible,contact,newsletter,prayer,transfer,visit', 'staff without private box: no private prayer', await seen('old-staff'));
ok((await seen('elder')) === 'bible,contact,prayer,visit', 'elder areas', await seen('elder'));
ok((await seen('clerk')) === 'transfer', 'clerk sees transfers only', await seen('clerk'));
ok((await seen('editor')) === '', 'editor sees no messages', await seen('editor'));
ok((await seen('leader')) === 'bible,contact,visit', 'leader areas', await seen('leader'));
ok((await seen('vol')) === 'bible,contact,newsletter,prayer,transfer,visit', 'volunteer as before', await seen('vol'));
r = await call('GET', '/admin/list', { token: O }); const items = r.j.items;
ok(typeof items[0].is_private === 'boolean' && typeof items[0].details === 'object' && !isNaN(new Date(String(items[0].created_at).replace(' ', 'T'))), 'list types', items[0]);
const id = (f) => items.find(f).id, privId = id((i) => i.is_private), transferId = id((i) => i.topic === 'Membership transfer'), contactId = id((i) => i.topic === 'General question'), visitId = id((i) => i.kind === 'visit'), bibleId = id((i) => i.topic === 'Bible study request');

// ---- permissions on each action ----
const P = (who, path, body) => call('POST', path, { token: T[who] || O, body });
r = await P('vol', '/admin/update', { id: contactId, status: 'in_progress' }); ok(r.status === 200, 'volunteer can set status', r);
r = await P('vol', '/admin/update', { id: contactId, admin_note: 'called' }); ok(r.status === 200, 'volunteer can add a note');
r = await P('vol', '/admin/update', { id: privId, status: 'done' }); ok(r.status === 404, 'volunteer cannot touch a private request', r);
r = await P('clerk', '/admin/update', { id: contactId, status: 'done' }); ok(r.status === 404, 'clerk cannot touch other areas', r);
r = await P('clerk', '/admin/update', { id: transferId, status: 'in_progress' }); ok(r.status === 200, 'clerk can work a transfer');
r = await P('vol', '/admin/reply', { id: contactId, subject: 'Re', body: 'Hi' }); ok(r.status === 403, 'volunteer cannot reply', r);
r = await P('leader', '/admin/assign', { id: visitId, email: 'leader@x.org' }); ok(r.status === 403, 'leader cannot assign');
r = await P('vol', '/admin/create', { kind: 'contact', status: 'new', name: 'Z', email: '', phone: '', topic: '', message: 'm', admin_note: '', is_private: false }); ok(r.status === 403, 'volunteer cannot add entries');
r = await P('vol', '/admin/edit', { id: contactId, kind: 'contact', status: 'new', name: 'Z', email: '', phone: '', topic: '', message: 'm', admin_note: '', is_private: false }); ok(r.status === 403, 'volunteer cannot edit');
for (const w of ['vol', 'pastor', 'elder', 'clerk', 'editor', 'leader', 'old-staff']) { r = await P(w, '/admin/delete', { id: contactId }); ok(r.status === 403, w + ' cannot delete', r); }
mails.length = 0;
r = await P('pastor', '/admin/reply', { id: contactId, subject: 'Re: your message', body: 'Church is at 11.' }); ok(r.status === 200 && r.j.reply.sent_by === 'pastor@x.org' && String(r.j.reply.submission_id) === String(contactId) && mails[0].to === 'di@x.org', 'pastor replies', r.j);
ok((await db.query('SELECT status FROM submissions WHERE id = $1', [contactId])).rows[0].status === 'in_progress', 'reply keeps status moving');
r = await P('clerk', '/admin/reply', { id: contactId, subject: 's', body: 'b' }); ok(r.status === 404, 'clerk cannot reply outside transfers', r);
r = await P('pastor', '/admin/assign', { id: transferId, email: 'elder@x.org' }); ok(r.status === 400, 'cannot assign to someone without access to that area', r);
mails.length = 0;
r = await P('pastor', '/admin/assign', { id: transferId, email: 'clerk@x.org' }); ok(r.status === 200 && mails[0].to === 'clerk@x.org', 'assign with email', r);
r = await P('pastor', '/admin/assign', { id: privId, email: 'old-staff@x.org' }); ok(r.status === 400, 'cannot assign a private request to someone who cannot see it', r);
r = await P('pastor', '/admin/assign', { id: transferId, email: null }); ok(r.status === 200, 'unassign');
r = await P('clerk', '/admin/create', { kind: 'prayer', status: 'new', name: 'Z', email: '', phone: '', topic: '', message: 'm', admin_note: '', is_private: false }); ok(r.status === 403, 'clerk cannot add outside their area', r);
r = await P('clerk', '/admin/create', { kind: 'contact', status: 'new', name: 'Zed', email: '', phone: '555', topic: 'Membership transfer', message: 'by phone', admin_note: '', is_private: false }); ok(r.status === 200 && r.j.item.added_by === 'clerk@x.org' && typeof r.j.item.details === 'object', 'clerk adds a transfer', r);
r = await P('clerk', '/admin/edit', { id: r.j.item.id, kind: 'contact', status: 'done', name: 'Zed', email: '', phone: '555', topic: 'General question', message: 'by phone', admin_note: '', is_private: false }); ok(r.status === 403, 'clerk cannot move an entry out of their area', r);
r = await P('pastor', '/admin/edit', { id: bibleId, kind: 'contact', status: 'done', name: 'Ben B', email: 'ben@x.org', phone: '', topic: 'Bible study request', message: 'x', admin_note: 'n', is_private: false }); ok(r.status === 200 && r.j.item.edited_by === 'pastor@x.org' && r.j.item.details.language === 'Kreyòl', 'edit keeps details', r);
r = await call('POST', '/admin/delete', { token: O, body: { id: contactId } }); ok(r.status === 200 && (await db.query('SELECT count(*)::int n FROM replies')).rows[0].n === 0, 'admin deletes, replies go too', r);
r = await P('pastor', '/admin/update', { id: '1; DROP TABLE admins', status: 'done' }); ok(r.status === 400, 'bad id refused');

// ---- team page, email list, website ----
for (const w of ['vol', 'pastor', 'elder', 'clerk', 'editor', 'leader', 'old-staff']) {
  r = await call('GET', '/admin/admins', { token: T[w] }); ok(r.status === 200 && r.j.me === w + '@x.org' && r.j.admins.every((a) => Object.keys(a).sort().join() === 'email,role'), w + ' gets only email and role of the team', r.j);
  r = await P(w, '/admin/admins/add', { email: 'evil@x.org', title: 'admin' }); ok(r.status === 403, w + ' cannot add people');
  r = await P(w, '/admin/admins/update', { email: 'vol@x.org', title: 'admin' }); ok(r.status === 403, w + ' cannot change roles');
  r = await P(w, '/admin/admins/remove', { email: 'vol@x.org' }); ok(r.status === 403, w + ' cannot remove people');
  r = await call('GET', '/admin/subscribers', { token: T[w] }); ok(r.status === 403, w + ' cannot see the email list');
  r = await P(w, '/admin/broadcast', { subject: 's', body: 'b', test: false }); ok(r.status === 403, w + ' cannot email the list');
  const site = ['pastor', 'editor', 'old-staff'].includes(w);
  r = await call('GET', '/admin/content', { token: T[w] }); ok(r.status === (site ? 200 : 403), w + ' website editor read ' + (site ? 'yes' : 'no'), r);
  r = await P(w, '/admin/content/save', { key: 'announcement', value: { on: true, text: 'Hi from ' + w, link: '', linkText: '' } }); ok(r.status === (site ? 200 : 403), w + ' website editor save ' + (site ? 'yes' : 'no'), r);
  const mv = ['pastor', 'elder', 'clerk', 'old-staff'].includes(w), me = ['pastor', 'clerk', 'old-staff'].includes(w);
  r = await call('GET', '/members', { token: T[w] }); ok(r.status === (mv ? 200 : 403), w + ' members view ' + mv, r);
  r = await P(w, '/members/save', { member: { first_name: 'M ' + w, last_name: 'Test', birthday: '1990-05-01', status: 'Member' } }); ok(r.status === (me ? 200 : 403) && (!me || (r.j.member.birthday === '1990-05-01' && r.j.member.updated_by === w + '@x.org')), w + ' members edit ' + me, r);
  r = await P(w, '/members/delete', { id: 1 }); ok(r.status === 403, w + ' cannot delete members');
}
r = await call('GET', '/members', { token: O }); ok(r.j.members.length === 3 && r.j.statuses.length === 6, 'members list', r.j.members.length);
r = await call('POST', '/members/save', { token: O, body: { member: { id: r.j.members[0].id, first_name: 'Changed', last_name: 'Test', birthday: '', status: 'Nope' } } }); ok(r.status === 200 && r.j.member.first_name === 'Changed' && r.j.member.birthday === null && r.j.member.status === 'Member', 'member update', r);
r = await call('POST', '/members/delete', { token: O, body: { id: r.j.member.id } }); ok(r.status === 200, 'admin deletes a member');
r = await call('POST', '/admin/content/save', { token: O, body: { key: 'posts', value: [{ id: 'p1', title: 'New title', cat: 'Devotional', date: 'Nov 9, 2026', author: 'A', read: '5 min', excerpt: 'e', body: ['a', 'b'], verse: '' }, { id: 'n1', title: 'Brand new', cat: 'Health', body: ['x'] }] } }); ok(r.status === 200, 'save posts');
r = await call('GET', '/content'); ok(r.status === 200 && r.j.posts[0].title === 'New title' && r.j.posts[0].slug === 'old-slug' && r.j.posts[0].seoTitle === 'SEO Old' && r.j.posts[0].lang === 'ht' && r.j.posts[1].slug === undefined && r.j.announcement.on === true && r.headers.get('cache-control').includes('max-age=60') && r.headers.get('access-control-allow-origin') === '*', 'public content keeps search fields', r.j);
r = await call('POST', '/admin/content/save', { token: O, body: { key: 'admins', value: [] } }); ok(r.status === 400, 'unknown content key refused');
r = await call('POST', '/admin/content/save', { token: O, body: { key: 'posts', value: { a: 1 } } }); ok(r.status === 400, 'wrong content shape refused');
r = await call('GET', '/admin/content', { token: O }); ok(r.j.content.find((c) => c.key === 'posts').updated_by === 'owner@x.org' && Array.isArray(r.j.content.find((c) => c.key === 'posts').value), 'admin content rows', r.j);
r = await call('GET', '/admin/subscribers', { token: O }); ok(r.j.subscribers.length === 1 && r.j.subscribers[0].unsubscribed === false, 'one subscriber', r.j);
mails.length = 0;
r = await call('POST', '/admin/broadcast', { token: O, body: { subject: 'News', body: 'Hello', test: true } }); ok(r.status === 200 && mails.length === 1 && mails[0].to === 'owner@x.org' && mails[0].unsub === true, 'test broadcast goes to me only', mails);
r = await call('POST', '/admin/broadcast', { token: O, body: { subject: 'News', body: 'Hello', test: false } }); ok(r.status === 200 && r.j.sent === 1 && r.j.total === 1 && mails[1].to === 'news@x.org', 'broadcast', r.j);
await db.query("UPDATE submissions SET unsubscribed = true WHERE kind = 'newsletter'");
r = await call('POST', '/admin/broadcast', { token: O, body: { subject: 'News 2', body: 'Hello', test: false } }); ok(r.j.total === 0, 'unsubscribed people are skipped', r.j);
r = await sub({ kind: 'newsletter', email: 'news@x.org' }); ok((await db.query("SELECT count(*)::int n FROM submissions WHERE kind='newsletter'")).rows[0].n === 2, 'can subscribe again after unsubscribing');

// ---- fine tuning one person ----
r = await call('GET', '/admin/admins', { token: O }); ok(r.j.titles.length === 8 && r.j.admins.find((a) => a.email === 'clerk@x.org').perms.members_edit === true && r.j.perm_list.length === 8, 'team page data for admins', r.j.titles && r.j.titles.length);
r = await call('POST', '/admin/admins/update', { token: O, body: { email: 'leader@x.org', title: 'leader', can_see_private: false, perms: { site_edit: true, team_manage: false }, areas: ['visit'] } });
let L = r.j.admins.find((a) => a.email === 'leader@x.org'); ok(r.status === 200 && L.perms.site_edit === true && L.areas.join() === 'visit' && L.custom === true, 'custom access for one person', L);
ok((await seen('leader')) === 'visit', 'custom areas apply at once', await seen('leader'));
r = await P('leader', '/admin/content/save', { key: 'announcement', value: { on: false, text: '', link: '', linkText: '' } }); ok(r.status === 200, 'custom permission applies at once');
r = await call('POST', '/admin/admins/update', { token: O, body: { email: 'leader@x.org', title: 'leader', can_see_private: false, perms: { site_edit: false }, areas: ['visit', 'contact', 'bible'] } });
L = r.j.admins.find((a) => a.email === 'leader@x.org'); ok(L.custom === false && L.perms.site_edit === false, 'back to the preset', L);
r = await call('POST', '/admin/admins/update', { token: O, body: { email: 'vol@x.org', title: 'admin', can_see_private: true, perms: { team_manage: false } } }); ok(r.j.admins.find((a) => a.email === 'vol@x.org').perms.team_manage === true, 'an admin cannot be cut down by overrides');
r = await call('POST', '/admin/admins/update', { token: O, body: { email: 'vol@x.org', role: 'volunteer', can_see_private: false } }); ok(r.status === 200, 'demote second admin');
r = await call('POST', '/admin/admins/remove', { token: O, body: { email: 'pastor@x.org' } }); ok(r.status === 200 && !r.j.admins.some((a) => a.email === 'pastor@x.org'), 'remove a person');
r = await call('GET', '/admin/check', { token: T.pastor }); ok(r.status === 401, 'removed person is signed out at once', r);
r = await call('POST', '/admin/logout', { token: T.elder }); r = await call('GET', '/admin/check', { token: T.elder }); ok(r.status === 401, 'logout ends the session');
await db.query("UPDATE admin_sessions SET expires_at = now() - interval '1 minute' WHERE email = 'clerk@x.org'");
r = await call('GET', '/admin/check', { token: T.clerk }); ok(r.status === 401, 'expired session refused');
// sessions made by the old server (sha256 of the token) keep working
const { createHash } = await import('node:crypto');
await db.query("INSERT INTO admin_sessions (token_hash, email, expires_at) VALUES ($1, 'owner@x.org', now() + interval '1 day')", [createHash('sha256').update('legacy-token-123').digest('hex')]);
r = await call('GET', '/admin/check', { token: 'legacy-token-123' }); ok(r.status === 200 && r.j.email === 'owner@x.org', 'old sessions still work', r);

console.log(`\n${pass} passed, ${fail} failed`);
globalThis.fetch = realFetch;
process.exit(fail ? 1 : 0);
