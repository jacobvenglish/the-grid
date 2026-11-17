// /img/:key -> serves an image from R2 storage.

export async function onRequestGet({ env, params }) {
  const key = String(params.key || '');
  if (!/^[a-f0-9-]{36}\.[a-z]{3,4}$/.test(key)) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Each key is unique and never changes, so the browser can keep it for a year.
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (key.endsWith('.svg')) {
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  return new Response(object.body, { headers });
}
