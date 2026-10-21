import { NextRequest, NextResponse } from 'next/server';
import { runExtract } from '@/lib/extract';

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

  const url = String(body?.url ?? '').trim();
  const cookie = String(body?.cookie ?? '').trim();

  if (!/^https?:\/\/.+\..+/.test(url)) {
    return NextResponse.json({ error: 'Paste a full http(s) video URL' }, { status: 400 });
  }

  try {
    const result = await runExtract(url, cookie, { sizes: body?.sizes !== false });
    if (!result.formats.length) {
      return NextResponse.json(
        { error: `No playable stream found (HTTP ${result.status})`, ...result },
        { status: 200 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}