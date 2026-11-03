/* Same-origin gateway for the Sites deployment.
   The existing production origin is the only one allowed by the Supabase
   function's CORS policy. The copied config points the app at /api and /gas,
   and this Worker forwards only those two routes to their fixed upstreams. */

const SUPABASE = 'https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api';
const GAS = 'https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec';

const STRIP_REQUEST = [
  'host', 'origin', 'referer', 'cf-connecting-ip', 'cf-ipcountry',
  'x-forwarded-for', 'x-real-ip', 'content-length'
];
const STRIP_RESPONSE = [
  'content-encoding', 'content-length', 'transfer-encoding', 'connection',
  'set-cookie', 'access-control-allow-origin', 'access-control-allow-credentials',
  'access-control-allow-headers', 'access-control-allow-methods'
];

async function proxy(request, upstream) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'GET, POST, OPTIONS', 'cache-control': 'no-store' }
    });
  }

  const headers = new Headers(request.headers);
  STRIP_REQUEST.forEach((name) => headers.delete(name));

  const init = { method: request.method, headers, redirect: 'follow' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(upstream, init);
    const outHeaders = new Headers(response.headers);
    STRIP_RESPONSE.forEach((name) => outHeaders.delete(name));
    outHeaders.set('cache-control', 'no-store');
    outHeaders.set('x-content-type-options', 'nosniff');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders
    });
  } catch (err) {
    console.warn('[sites-proxy] upstream failed', err && err.message);
    return new Response(JSON.stringify({
      success: false,
      error: 'The study service is temporarily unavailable.'
    }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api') return proxy(request, SUPABASE + url.search);
    if (url.pathname === '/gas') return proxy(request, GAS + url.search);
    return env.ASSETS.fetch(request);
  }
};
