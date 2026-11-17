// Runs before every API and image request.
// Cloudflare Access already blocks anyone who isn't you. This is a second lock:
// it checks Access's signed token, so the API stays private even if the Access
// setup is ever changed by mistake. If the settings are missing, it fails closed.

let certCache = { keys: null, fetchedAt: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(teamDomain) {
  const fresh = Date.now() - certCache.fetchedAt < 60 * 60 * 1000;
  if (certCache.keys && fresh) return certCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not load Access keys');
  const { keys } = await res.json();
  certCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyAccessToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);

  const keys = await getKeys(env.TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) return false;

  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return false;
  if (payload.iss !== `https://${env.TEAM_DOMAIN}`) return false;
  if (!payload.exp || payload.exp < now) return false;
  return true;
}

export async function onRequest(context) {
  const { request, env, next } = context;

  if (!env.TEAM_DOMAIN || !env.ACCESS_AUD) {
    return new Response('The Grid is not set up yet: add TEAM_DOMAIN and ACCESS_AUD (see README).', { status: 500 });
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];

  if (!token) return new Response('Not signed in', { status: 401 });

  try {
    if (!(await verifyAccessToken(token, env))) {
      return new Response('Not allowed', { status: 403 });
    }
  } catch (e) {
    return new Response('Could not check sign-in', { status: 503 });
  }

  return next();
}
