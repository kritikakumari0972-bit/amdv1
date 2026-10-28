import { NextRequest } from 'next/server';
import { UA } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const STRIP_REFERER_ON = new Set([401, 403, 451]);

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges',
    ...extra,
  };
}

async function upstream(url: string, referer?: string, cookie?: string, range?: string, stripReferer = false) {
  const headers: Record<string, string> = { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' };
  if (referer && !stripReferer) {
    headers.referer = referer;
    try {
      headers.origin = new URL(referer).origin;
    } catch {}
  }
  if (cookie) headers.cookie = cookie;
  if (range) headers.range = range;
  return fetch(url, { headers, redirect: 'follow', cache: 'no-store' });
}

function rewritePlaylist(text: string, base: string, origin: string, referer?: string, cookie?: string): string {
  const proxy = (raw: string) => {
    let abs = raw;
    try {
      abs = new URL(raw, base).toString();
    } catch {}
    return `${origin}/api/stream?u=${encodeURIComponent(abs)}${referer ? `&r=${encodeURIComponent(referer)}` : ''}${
      cookie ? `&c=${encodeURIComponent(cookie)}` : ''
    }`;
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, p1) => `URI="${proxy(p1)}"`);
      return proxy(t);
    })
    .join('\n');
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: cors({ 'access-control-allow-methods': 'GET,HEAD,OPTIONS', 'access-control-allow-headers': 'range' }),
  });
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const target = sp.get('u');
  if (!target) return new Response('missing u', { status: 400, headers: cors() });

  const referer = sp.get('r') || undefined;
  const cookie = sp.get('c') || undefined;
  const range = req.headers.get('range') || undefined;

  let res: Response;
  try {
    res = await upstream(target, referer, cookie, range);
    if (STRIP_REFERER_ON.has(res.status)) res = await upstream(target, referer, cookie, range, true);
  } catch (e) {
    return new Response(`upstream error: ${(e as Error).message}`, { status: 502, headers: cors() });
  }

  if (!res.ok) return new Response(`upstream ${res.status}`, { status: res.status, headers: cors() });

  const contentType = res.headers.get('content-type') || '';
  const isPlaylist = /mpegurl|m3u8/i.test(contentType) || /\.m3u8(\?|$)/i.test(target);

  if (isPlaylist) {
    const text = await res.text();
    const body = rewritePlaylist(text, res.url || target, new URL(req.url).origin, referer, cookie);
    return new Response(body, {
      status: 200,
      headers: cors({ 'content-type': 'application/vnd.apple.mpegurl; charset=utf-8', 'cache-control': 'no-store' }),
    });
  }

  const headers = new Headers(cors());
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = res.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=3600');

  return new Response(res.body, { status: res.status, headers });
}
