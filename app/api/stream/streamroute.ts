import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function enc(url: string, referer?: string) {
  const p = new URLSearchParams({ u: url });
  if (referer) p.set('r', referer);
  return `/api/stream?${p.toString()}`;
}

function headersFor(referer?: string, range?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'user-agent': UA,
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
  };
  if (referer) {
    h.referer = referer;
    try { h.origin = new URL(referer).origin; } catch {}
  }
  if (range) h.range = range;
  return h;
}

async function rewritePlaylist(u: string, referer: string | undefined, body: string, base: string) {
  const lines = body.split('\n').map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
        let abs = uri;
        try { abs = new URL(uri, base).toString(); } catch {}
        return `URI="${enc(abs, referer)}"`;
      });
    }
    let abs = t;
    try { abs = new URL(t, base).toString(); } catch {}
    return enc(abs, referer);
  });
  return lines.join('\n');
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const u = sp.get('u');
  const referer = sp.get('r') || undefined;
  if (!u) return new Response('missing u', { status: 400 });

  const range = req.headers.get('range');
  const upstream = await fetch(u, { headers: headersFor(referer, range), redirect: 'follow' });

  const ct = upstream.headers.get('content-type') || '';
  const isPlaylist = /mpegurl/i.test(ct) || /\.m3u8($|\?)/i.test(u);

  if (isPlaylist && upstream.ok) {
    const text = await upstream.text();
    const rewritten = await rewritePlaylist(u, referer, text, upstream.url || u);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  }

  const out = new Headers();
  out.set('content-type', ct || 'application/octet-stream');
  out.set('accept-ranges', 'bytes');
  out.set('access-control-allow-origin', '*');
  out.set('cache-control', 'public, max-age=3600');
  for (const k of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function HEAD(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const u = sp.get('u');
  const referer = sp.get('r') || undefined;
  if (!u) return new Response(null, { status: 400 });
  const upstream = await fetch(u, { method: 'HEAD', headers: headersFor(referer), redirect: 'follow' });
  const out = new Headers();
  for (const k of ['content-type', 'content-length', 'accept-ranges']) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set('access-control-allow-origin', '*');
  return new Response(null, { status: upstream.status, headers: out });
}