import { NextRequest, NextResponse } from 'next/server';
import { runExtract } from '@/lib/extract';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Live structural checks. `anchor` is the exact string each parser depends on —
 * if the anchor disappears, the site changed its markup and the parser needs a
 * patch. `formats` proves the parser actually resolved something.
 */
const CHECKS = [
  {
    id: 'pornhub',
    name: 'Pornhub',
    url: 'https://www.pornhub.com/view_video.php?viewkey=ph58c466aa61bc5',
    anchor: 'flashvars_',
  },
  {
    id: 'xvideos',
    name: 'XVideos',
    url:
      'https://www.xvideos.com/video.olhhdule7ad/i_just_wanted_to_masturbated_but_stepsister_wants_me_to_fuck_her._she_got_all_my_cum',
    anchor: 'html5player.setVideoUrlHigh',
  },
  {
    id: 'xhamster',
    name: 'xHamster',
    url: 'https://xhamster.com/videos/budhe-sasur-ne-2-bahu-ko-ek-sath-choda-xhJV1hz',
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
    if (result.status === 0) status = 'blocked';
    else if (result.formats.length === 0) status = result.anchorFound ? 'parser-miss' : 'no-formats';

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

  const healthy = results.filter((r) => r.status === 'ok').length;
  return NextResponse.json({ mode: 'suite', healthy, total: results.length, results });
}