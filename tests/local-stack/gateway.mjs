// Minimal Supabase-like gateway for local tests: /rest/v1 -> PostgREST, /auth/v1 -> tiny auth server.
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const PGRST = process.env.PGRST_URL ?? 'http://127.0.0.1:3001';
const SECRET = process.env.JWT_SECRET;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token ?? '').split('.');
  if (!s) return null;
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  if (sig !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (p.exp && p.exp < Date.now() / 1000) return null;
  return p;
}
const hash = (pw) => crypto.createHash('sha256').update(pw).digest('hex');
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
  res.end(JSON.stringify(body));
};
function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: crypto.randomUUID(), user };
}
const userJson = (r) => ({ id: r.id, aud: 'authenticated', role: 'authenticated', email: r.email, user_metadata: r.raw_user_meta_data ?? {}, app_metadata: {}, created_at: new Date().toISOString() });
const readBody = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)); });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 200, {});
    try {
      if (url.pathname.startsWith('/auth/v1/')) {
        const path = url.pathname.slice('/auth/v1'.length);
        const body = req.method === 'GET' ? {} : JSON.parse((await readBody(req)) || '{}');
        if (path === '/signup') {
          const id = crypto.randomUUID();
          const r = await pool.query('insert into auth.users (id, email, raw_user_meta_data, password_hash) values ($1,$2,$3,$4) returning *', [id, body.email, body.data ?? {}, hash(body.password)]);
          return send(res, 200, session(userJson(r.rows[0])));
        }
        if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
          const r = await pool.query('select * from auth.users where email=$1 and password_hash=$2', [body.email, hash(body.password)]);
          if (!r.rows[0]) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
          return send(res, 200, session(userJson(r.rows[0])));
        }
        if (path === '/user') {
          const p = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
          if (!p?.sub) return send(res, 401, { msg: 'invalid JWT', code: 401 });
          const r = await pool.query('select * from auth.users where id=$1', [p.sub]);
          if (!r.rows[0]) return send(res, 404, { msg: 'User not found' });
          return send(res, 200, userJson(r.rows[0]));
        }
        if (path === '/logout') return send(res, 204, {});
        return send(res, 404, { msg: `not implemented: ${path}` });
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const target = PGRST + url.pathname.slice('/rest/v1'.length) + url.search;
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length'];
        if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
        const r = await fetch(target, { method: req.method, headers, body });
        const out = Buffer.from(await r.arrayBuffer());
        const h = Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(k)));
        res.writeHead(r.status, h);
        return res.end(out);
      }
      send(res, 404, { msg: 'not found' });
    } catch (e) {
      console.error(e);
      send(res, 500, { msg: String(e) });
    }
  })
  .listen(PORT, () => console.log(`gateway on :${PORT}`));
