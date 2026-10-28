import { NextRequest, NextResponse } from 'next/server';
import { runExtract } from '@/lib/extract';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CHECKS = [
  {
    id: 'pornhub',
    name: 'Pornhub',
    url: 'https://www.pornhub.com/view_video.php?viewkey=6881deab3f441',
    anchor: 'mediaDefinitions',
  },
  {
    id: 'xvideos',
    name: 'XVideos',
    url: 'https://www.xvideos.com/video.olhhdule7ad',
    anchor: 'html5player.setVideoUrlHigh',
  },
  {
    id: 'xhamster',
    name: 'xHamster',
    url: 'https://xhamster.com/videos/xhJV1hz',
    anchor: 'window.initials',
  },
];

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const custom = sp.get('url');

  if (custom) {
    const result = await runExtract(custom, sp.get('cookie') ?? '', { sizes: false });
    return NextResponse.json({ mode: 'single', ...result });
  }

  const results = [];
  for (const check of CHECKS) {
    const started = Date.now();
    const result = await runExtract(check.url, '', { sizes: false, anchor: check.anchor });
    const ms = Date.now() - started;

    let status: 'ok' | 'parser-miss' | 'no-formats' | 'blocked' = 'ok';
    if (!result.reachable) status = 'blocked';
    else if (!result.formats.length) status = result.anchorFound ? 'parser-miss' : 'no-formats';

    results.push({
      id: check.id,
      name: check.name,
      status,
      ms,
      httpStatus: result.status,
      anchorFound: result.anchorFound,
      formats: result.formats.length,
      diagnostics: result.diagnostics,
    });
  }

  return NextResponse.json({
    mode: 'suite',
    healthy: results.filter((r) => r.status === 'ok').length,
    total: results.length,
    results,
  });
}
