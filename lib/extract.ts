import { cookieFor, fetchFirst, probeSize } from './http';
import { parseGeneric, resolveSite, type ParseCtx, type RawFormat } from './sites';
import { dedupe, heightFrom } from './util';

export type ExtractFormat = {
  url: string;
  streamUrl: string;
  label: string;
  kind: string;
  size: number | null;
  source: string;
};

export type ExtractResult = {
  ok: boolean;
  site: string;
  pageTitle: string;
  thumbnail: string | null;
  formats: ExtractFormat[];
  diagnostics: string[];
  status: number;
  tried: string[];
  anchorFound: boolean | null;
};

export type ExtractOpts = { sizes?: boolean; anchor?: string };

export async function runExtract(
  rawUrl: string,
  userCookie = '',
  opts: ExtractOpts = {},
): Promise<ExtractResult> {
  const diag: string[] = [];
  const site = resolveSite(rawUrl);
  const referer = site?.referer ?? new URL(rawUrl).origin + '/';
  const cookie = userCookie || cookieFor(referer);
  const urls = site?.mirrors ? site.mirrors(rawUrl) : [rawUrl];

  const page = await fetchFirst(urls, { referer, cookie, timeout: 15000 });

  const base: ExtractResult = {
    ok: false,
    site: site?.id ?? 'generic',
    pageTitle: '',
    thumbnail: null,
    formats: [],
    diagnostics: diag,
    status: page.status || 502,
    tried: page.tried,
    anchorFound: null,
  };

  if (!page.ok || !page.text) {
    diag.push(`page load failed (${page.error || page.status || 'network'})`);
    return base;
  }
  if (opts.anchor) base.anchorFound = page.text.includes(opts.anchor);

  const ctx: ParseCtx = {
    html: page.text,
    pageUrl: page.url,
    diag,
    get: (u, o) => fetchFirst([u], { referer, cookie, ...o }),
  };

  let parsed: { formats: RawFormat[]; title?: string; thumbnail?: string } = { formats: [] };
  if (site) {
    try {
      parsed = await site.parse(ctx);
    } catch (e) {
      diag.push(`parser error: ${(e as Error).message}`);
    }
  } else {
    diag.push('no dedicated parser, using generic scan');
  }

  let formats = parsed.formats;
  if (!formats.length) {
    formats = parseGeneric(page.text, page.url);
    diag.push(`generic scan -> ${formats.length}`);
  }

  formats = dedupe(formats, (f) => f.url).filter((f) => !/\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(f.url));
  formats.sort((a, b) => {
    const ka = a.kind === 'mp4' ? 0 : 1;
    const kb = b.kind === 'mp4' ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return heightFrom(`${b.label} ${b.url}`) - heightFrom(`${a.label} ${a.url}`);
  });

  const mk = (u: string) =>
    `/api/stream?u=${encodeURIComponent(u)}&r=${encodeURIComponent(referer)}${
      cookie ? `&c=${encodeURIComponent(cookie)}` : ''
    }`;

  const out: ExtractFormat[] = formats.map((f) => ({
    url: f.url,
    streamUrl: mk(f.url),
    label: f.label || 'video',
    kind: f.kind,
    size: null,
    source: f.source,
  }));

  if (opts.sizes !== false) {
    await Promise.all(
      out
        .slice(0, 6)
        .filter((f) => f.kind === 'mp4')
        .map(async (f) => {
          f.size = await probeSize(f.url, referer, cookie);
        }),
    );
  }

  diag.push(`resolved ${out.length} format(s)`);

  return {
    ...base,
    ok: out.length > 0,
    pageTitle: parsed.title ?? '',
    thumbnail: parsed.thumbnail ?? null,
    formats: out,
  };
}