import { NextRequest, NextResponse } from 'next/server';
import { runExtract } from '@/lib/extract';
import { normalizeUrl } from '@/lib/normalize';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = normalizeUrl(String(body?.url ?? ''));
  if (!url) {
    return NextResponse.json(
      { error: 'Paste a video URL (with or without https://) or an <iframe> embed tag' },
      { status: 400 },
    );
  }

  try {
    const result = await runExtract(url, String(body?.cookie ?? '').trim(), { sizes: body?.sizes !== false });
    if (!result.formats.length) {
      return NextResponse.json({ error: `No playable stream found (HTTP ${result.status})`, ...result });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}