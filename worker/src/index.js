// 共有サーバー（Cloudflare Worker + D1）
//
// 運営が公開した大会データを、閲覧者が共有コード（閲覧リンク）で読み取る。パスワードは運営用だけ。閲覧者はコメントも書ける。
//   POST   /api/rooms                      共有を作る（運営。運営用パスワードを設定）
//   POST   /api/rooms/:code/login          運営用パスワードを確認して運営トークンを受け取る
//   POST   /api/rooms/:code/join           閲覧トークンを受け取る（パスワード不要。共有コードを知っていることが条件）
//   GET    /api/rooms/:code/sync           大会データとコメントの取得（変化があったときだけ本体を返す）
//   PUT    /api/rooms/:code/state          大会データの公開（運営のみ）
//   POST   /api/rooms/:code/comments       コメント投稿
//   DELETE /api/rooms/:code/comments/:id   コメント削除（運営のみ）
//   PUT    /api/rooms/:code/passwords      運営用パスワードの変更（運営のみ）
//   DELETE /api/rooms/:code                共有の終了。データをすべて削除（運営のみ）
//
// 認証は Authorization: Bearer <トークン>。トークンは HMAC 署名で、サーバーにセッションは持たない。
// 表示側（アプリ）が HTML エスケープするが、サーバーでも文字数・制御文字・形式を検証する。

const PBKDF2_ITERATIONS = 5000; // 無料プランの CPU 時間（10ms）に収めるための値。保存値に回数を含めるので後から上げられる
const TOKEN_TTL = 12 * 60 * 60;
const ROOM_TTL = 90 * 24 * 60 * 60; // 最後の更新から90日で自動削除
const MAX_STATE_CHARS = 1_000_000;
const MAX_BODY_CHARS = 8_000;
const MAX_COMMENTS = 500;
const COMMENT_LIST_LIMIT = 300;
const JOIN_MISS_MAX = 30; // 存在しない共有コードを10分間に試せる回数（IP ごと）
const NAME_MAX = 20;
const COMMENT_MAX = 200;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 64;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_PATTERN = /^[a-hj-km-np-z2-9]{8}$/;
const MATCH_ID_PATTERN = /^[A-Za-z0-9-]{1,16}$/;
const FILE_KIND = 'bukatsu-taikai';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT \'\', viewer_pw TEXT NOT NULL, viewer_ver INTEGER NOT NULL DEFAULT 1, admin_pw TEXT NOT NULL, admin_ver INTEGER NOT NULL DEFAULT 1, state TEXT, rev INTEGER NOT NULL DEFAULT 0, crev INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, match_id TEXT, name TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, who TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_comments_code ON comments (code, id)',
  'CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = (env) => (env.NOW ? env.NOW() : Math.floor(Date.now() / 1000));

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

// ---- 暗号まわり ----

const enc = new TextEncoder();
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derive(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

/** 保存形式: 回数$ソルト$ハッシュ */
async function hashPassword(password) {
  const salt = randomHex(16);
  return `${PBKDF2_ITERATIONS}$${salt}$${await derive(password, salt, PBKDF2_ITERATIONS)}`;
}

async function verifyPassword(password, stored) {
  const [iter, salt, hash] = stored.split('$');
  return safeEqual(await derive(password, salt, Number(iter)), hash);
}

const DUMMY_HASH = `${PBKDF2_ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`;

async function sha256Hex(text) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// ---- DB ----

/** 期限内の共有を1件読む。最後の更新から ROOM_TTL を過ぎた共有は、掃除される前でも「存在しない」として扱う */
function findRoom(env, cols, code) {
  return env.DB.prepare(`SELECT ${cols} FROM rooms WHERE code = ? AND updated_at >= ?`).bind(code, now(env) - ROOM_TTL).first();
}

const ready = new WeakSet();

async function initDb(db) {
  if (ready.has(db)) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  ready.add(db);
}

async function getSecret(env) {
  const row = await env.DB.prepare('SELECT v FROM config WHERE k = ?').bind('secret').first();
  if (row) return row.v;
  await env.DB.prepare('INSERT OR IGNORE INTO config (k, v) VALUES (?, ?)').bind('secret', randomHex(32)).run();
  return (await env.DB.prepare('SELECT v FROM config WHERE k = ?').bind('secret').first()).v;
}

async function issueToken(env, room, role) {
  const payload = { c: room.code, r: role, v: role === 'admin' ? room.admin_ver : room.viewer_ver, e: now(env) + TOKEN_TTL };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(await getSecret(env)), enc.encode(body));
  return { token: `${body}.${b64url(new Uint8Array(sig))}`, expiresAt: payload.e, role };
}

/** トークンを検証し、部屋と権限を返す。失敗時は 401 */
async function authorize(env, request, code) {
  const fail = () => new HttpError(401, '認証が切れました。もう一度パスワードを入力してください');
  const m = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) throw fail();
  const [body, sig] = m[1].split('.');
  if (!body || !sig) throw fail();
  let payload;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(await getSecret(env)), b64urlDecode(sig), enc.encode(body));
    if (!ok) throw fail();
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    throw fail();
  }
  if (payload.c !== code || payload.e < now(env)) throw fail();
  const room = await findRoom(env, 'code, title, viewer_ver, admin_ver, rev, crev, updated_at', code);
  if (!room) throw new HttpError(404, 'この共有は終了したか、存在しません');
  const ver = payload.r === 'admin' ? room.admin_ver : room.viewer_ver;
  if (payload.r !== 'admin' && payload.r !== 'viewer') throw fail();
  if (payload.v !== ver) throw fail();
  return { room, role: payload.r };
}

function requireAdmin(auth) {
  if (auth.role !== 'admin') throw new HttpError(403, 'この操作は運営用パスワードでログインしたときだけできます');
}

// ---- 回数制限（D1 に保存。無料プランの書き込み回数を考え、必要な箇所だけ） ----

async function isLimited(env, key, max) {
  const row = await env.DB.prepare('SELECT n, until FROM limits WHERE k = ?').bind(key).first();
  return !!row && row.until > now(env) && row.n >= max;
}

async function countHit(env, key, windowSec) {
  const t = now(env);
  const row = await env.DB.prepare('SELECT n, until FROM limits WHERE k = ?').bind(key).first();
  if (!row || row.until <= t) {
    await env.DB.prepare('INSERT OR REPLACE INTO limits (k, n, until) VALUES (?, 1, ?)').bind(key, t + windowSec).run();
  } else {
    await env.DB.prepare('UPDATE limits SET n = n + 1 WHERE k = ?').bind(key).run();
  }
}

// ---- 入力の検証 ----

async function readJson(request, maxChars) {
  const text = await request.text();
  if (text.length > maxChars) throw new HttpError(413, 'データが大きすぎます');
  try {
    const data = JSON.parse(text || '{}');
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError(400, '送られたデータの形式が正しくありません');
  }
}

function checkPassword(pw, label) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
    throw new HttpError(400, `${label}は${PASSWORD_MIN}文字以上${PASSWORD_MAX}文字以下で入力してください`);
  }
}

const strip = (s) => s.replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '');
const length = (s) => [...s].length;
const clip = (s, n) => [...s].slice(0, n).join('');

function cleanName(v) {
  const s = strip(String(v ?? '')).replace(/\s+/g, ' ').trim();
  if (length(s) > NAME_MAX) throw new HttpError(400, `名前は${NAME_MAX}文字以内にしてください`);
  return s || '名無し';
}

function cleanBody(v) {
  const s = strip(String(v ?? '').replace(/\r\n?/g, '\n')).replace(/\n{3,}/g, '\n\n').trim();
  if (!s) throw new HttpError(400, 'コメントを入力してください');
  if (length(s) > COMMENT_MAX) throw new HttpError(400, `コメントは${COMMENT_MAX}文字以内にしてください`);
  return s;
}

function checkState(state) {
  const ok = state && typeof state === 'object' && !Array.isArray(state) && state.kind === FILE_KIND &&
    typeof state.version === 'number' && Array.isArray(state.players) && Array.isArray(state.tables);
  if (!ok) throw new HttpError(400, 'このアプリの大会データではありません');
}

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';

// ---- ハンドラ ----

async function createRoom(env, request) {
  const body = await readJson(request, MAX_BODY_CHARS);
  checkPassword(body.adminPassword, '運営用パスワード');
  const ipKey = `mk:${await sha256Hex(clientIp(request))}`;
  if (await isLimited(env, ipKey, 5)) throw new HttpError(429, '短時間に共有を作りすぎています。しばらく待ってからやり直してください');
  await countHit(env, ipKey, 3600);

  const t = now(env);
  // 古い共有と期限切れの制限記録を掃除する
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE code IN (SELECT code FROM rooms WHERE updated_at < ?)').bind(t - ROOM_TTL),
    env.DB.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(t - ROOM_TTL),
    env.DB.prepare('DELETE FROM limits WHERE until < ?').bind(t),
  ]);

  const adminPw = await hashPassword(body.adminPassword);
  const title = clip(strip(String(body.title ?? '')).trim(), 100);
  for (let i = 0; i < 5; i++) {
    const code = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    // viewer_pw は以前の版（閲覧用パスワードあり）との互換のために残した列。今は使わない
    const r = await env.DB.prepare('INSERT OR IGNORE INTO rooms (code, title, viewer_pw, admin_pw, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(code, title, '', adminPw, t, t).run();
    if (r.meta.changes === 1) {
      const room = { code, admin_ver: 1, viewer_ver: 1 };
      return json({ ok: true, code, ...(await issueToken(env, room, 'admin')) }, 201);
    }
  }
  throw new HttpError(500, '共有コードを作れませんでした。もう一度お試しください');
}

async function login(env, request, code) {
  const body = await readJson(request, MAX_BODY_CHARS);
  const ipKey = `fl:${code}:${await sha256Hex(clientIp(request))}`;
  const codeKey = `fc:${code}`;
  if ((await isLimited(env, ipKey, 10)) || (await isLimited(env, codeKey, 60))) {
    throw new HttpError(429, 'パスワードの間違いが続いたため、しばらく入力できません。10分ほど待ってください');
  }
  const room = await findRoom(env, 'code, admin_pw, admin_ver, viewer_ver', code);
  const pw = typeof body.password === 'string' ? body.password.slice(0, PASSWORD_MAX) : '';
  // 共有コードの有無で処理時間が変わらないよう、存在しない場合も同じ計算をする
  const ok = await verifyPassword(pw, room ? room.admin_pw : DUMMY_HASH);
  if (!room || !ok) {
    await countHit(env, ipKey, 600);
    await countHit(env, codeKey, 600);
    throw new HttpError(401, '共有コードまたはパスワードが違います');
  }
  return json({ ok: true, code, ...(await issueToken(env, room, 'admin')) });
}

/** 閲覧者の入場。パスワードは要らない。存在しない共有コードを試し続けると、IP ごとに一時的に止める */
async function join(env, request, code) {
  const key = `jn:${await sha256Hex(clientIp(request))}`;
  if (await isLimited(env, key, JOIN_MISS_MAX)) throw new HttpError(429, '存在しない共有コードの入力が続いたため、しばらく入れません。10分ほど待ってください');
  const room = await findRoom(env, 'code, admin_ver, viewer_ver', code);
  if (!room) {
    await countHit(env, key, 600);
    throw new HttpError(404, '共有コードが見つかりません。入力を確認してください（共有が終了した可能性もあります）');
  }
  return json({ ok: true, code, ...(await issueToken(env, room, 'viewer')) });
}

function commentRow(r) {
  return { id: r.id, matchId: r.match_id, name: r.name, text: r.body, at: r.at };
}

async function sync(env, request, url, code) {
  const auth = await authorize(env, request, code);
  const { room } = auth;
  const rev = Number(url.searchParams.get('rev'));
  const crev = Number(url.searchParams.get('crev'));
  const out = { ok: true, role: auth.role, title: room.title, rev: room.rev, crev: room.crev, updatedAt: room.updated_at, keepUntil: room.updated_at + ROOM_TTL, serverTime: now(env) };
  if (rev !== room.rev) {
    const row = await env.DB.prepare('SELECT state FROM rooms WHERE code = ?').bind(code).first();
    out.state = row?.state ? JSON.parse(row.state) : null;
  }
  if (crev !== room.crev) {
    const { results } = await env.DB.prepare('SELECT id, match_id, name, body, at FROM comments WHERE code = ? ORDER BY id DESC LIMIT ?')
      .bind(code, COMMENT_LIST_LIMIT).all();
    out.comments = results.reverse().map(commentRow);
  }
  return json(out);
}

async function putState(env, request, code) {
  const auth = await authorize(env, request, code);
  requireAdmin(auth);
  const body = await readJson(request, MAX_STATE_CHARS + MAX_BODY_CHARS);
  checkState(body.state);
  const text = JSON.stringify(body.state);
  if (text.length > MAX_STATE_CHARS) throw new HttpError(413, '大会データが大きすぎます');
  const title = clip(strip(String(body.state.meta?.title ?? '')).trim(), 100);
  // 版番号は DB 側で +1 する。読んだ値に +1 して書くと、2台から同時に送ったときに同じ番号になり、閲覧者が後の更新を受け取れない
  const rev = await env.DB.prepare('UPDATE rooms SET state = ?, title = ?, rev = rev + 1, updated_at = ? WHERE code = ? RETURNING rev')
    .bind(text, title, now(env), code).first('rev');
  if (rev === null) throw new HttpError(404, 'この共有は終了したか、存在しません');
  return json({ ok: true, rev, keepUntil: now(env) + ROOM_TTL });
}

async function postComment(env, request, code) {
  const auth = await authorize(env, request, code);
  const body = await readJson(request, MAX_BODY_CHARS);
  const name = cleanName(body.name);
  const text = cleanBody(body.text);
  const matchId = body.matchId == null || body.matchId === '' ? null : String(body.matchId);
  if (matchId !== null && !MATCH_ID_PATTERN.test(matchId)) throw new HttpError(400, 'コメントの対象が正しくありません');
  const who = (await sha256Hex(`${clientIp(request)}:${code}`)).slice(0, 12);
  const key = `cm:${code}:${who}`;
  if (await isLimited(env, key, 6)) throw new HttpError(429, '投稿が続いています。少し待ってから送ってください');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE code = ?').bind(code).first('n');
  if (count >= MAX_COMMENTS) throw new HttpError(429, 'この共有のコメントが上限（500件）に達しました。運営に削除を依頼してください');
  await countHit(env, key, 60);
  const t = now(env);
  const r = await env.DB.prepare('INSERT INTO comments (code, match_id, name, body, at, who) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(code, matchId, name, text, t, who).run();
  await env.DB.prepare('UPDATE rooms SET crev = crev + 1 WHERE code = ?').bind(code).run();
  return json({ ok: true, id: r.meta.last_row_id, role: auth.role }, 201);
}

async function deleteComment(env, request, code, id) {
  const auth = await authorize(env, request, code);
  requireAdmin(auth);
  const r = await env.DB.prepare('DELETE FROM comments WHERE id = ? AND code = ?').bind(id, code).run();
  if (r.meta.changes) await env.DB.prepare('UPDATE rooms SET crev = crev + 1 WHERE code = ?').bind(code).run();
  return json({ ok: true, deleted: r.meta.changes });
}

async function changePassword(env, request, code) {
  const auth = await authorize(env, request, code);
  requireAdmin(auth);
  const body = await readJson(request, MAX_BODY_CHARS);
  checkPassword(body.password, '運営用パスワード');
  const hashed = await hashPassword(body.password);
  await env.DB.prepare('UPDATE rooms SET admin_pw = ?, admin_ver = admin_ver + 1 WHERE code = ?').bind(hashed, code).run();
  // 運営用を変えると今のトークンも無効になるため、新しいトークンを返す
  const fresh = await env.DB.prepare('SELECT code, viewer_ver, admin_ver FROM rooms WHERE code = ?').bind(code).first();
  return json({ ok: true, ...(await issueToken(env, fresh, 'admin')) });
}

async function closeRoom(env, request, code) {
  const auth = await authorize(env, request, code);
  requireAdmin(auth);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(code),
  ]);
  return json({ ok: true });
}

async function route(env, request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  if (path === '/api/health' && method === 'GET') return json({ ok: true });
  if (path === '/api/rooms' && method === 'POST') return createRoom(env, request);

  const m = /^\/api\/rooms\/([^/]+)(?:\/([a-z]+)(?:\/(\d+))?)?$/.exec(path);
  if (!m) throw new HttpError(404, '見つかりません');
  const code = m[1].toLowerCase();
  if (!CODE_PATTERN.test(code)) throw new HttpError(404, '共有コードの形式が正しくありません');
  const [, , action, id] = m;
  if (!action && method === 'DELETE') return closeRoom(env, request, code);
  if (action === 'login' && method === 'POST') return login(env, request, code);
  if (action === 'join' && method === 'POST') return join(env, request, code);
  if (action === 'sync' && method === 'GET') return sync(env, request, url, code);
  if (action === 'state' && method === 'PUT') return putState(env, request, code);
  if (action === 'comments' && !id && method === 'POST') return postComment(env, request, code);
  if (action === 'comments' && id && method === 'DELETE') return deleteComment(env, request, code, Number(id));
  if (action === 'passwords' && method === 'PUT') return changePassword(env, request, code);
  throw new HttpError(404, '見つかりません');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      await initDb(env.DB);
      return await route(env, request);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
      console.error(e);
      return json({ ok: false, error: 'サーバーでエラーが発生しました' }, 500);
    }
  },
};
