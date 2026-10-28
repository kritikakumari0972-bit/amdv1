import { NextRequest } from 'next/server';
import { normalizeUrl } from '@/lib/normalize';
import { resolveSite } from '@/lib/sites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function streamUrl(raw: string, pageUrl: string) {
  const p = new URLSearchParams({ u: raw, r: pageUrl });
  return `/api/stream?${p.toString()}`;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }

  const url = normalizeUrl(String(body.url || ''));
  if (!url) return Response.json({ error: 'invalid url' }, { status: 400 });

  const site = resolveSite(url);
  if (!site) return Response.json({ error: `unrecognized host: ${new URL(url).host}` }, { status: 400 });

  try {
    const result = await site.extract(url);
    if (!result?.formats?.length) {
      return Response.json({ error: `parser-miss (site=${site.name})`, site: site.name }, { status: 422 });
    }
    const formats = result.formats
      .map((f: any) => ({ ...f, streamUrl: streamUrl(f.url, url) }))
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    return Response.json({ title: result.title, site: site.name, formats });
  } catch (e: any) {
    return Response.json({ error: `extract failed: ${e.message}` }, { status: 500 });
  }
}