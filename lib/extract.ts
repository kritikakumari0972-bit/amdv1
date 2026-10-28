import { cookieFor, fetchFirst, probeSize, resolveTarget, type Jar } from './http';
import { normalizeUrl } from './normalize';
import { parseGeneric, resolveSite, type ParseCtx, type RawFormat } from './sites';
import { absolutize, dedupe, heightFrom, looseJson } from './util';

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
  reachable: boolean;
  tried: string[];
  anchorFound: boolean | null;
};

export type ExtractOpts = { sizes?: boolean; anchor?: string };

export async function runExtract(rawUrl: string, userCookie = '', opts: ExtractOpts = {}): Promise<ExtractResult> {
  const diag: string[] = [];
  const url = normalizeUrl(rawUrl);
  const base: ExtractResult = {
    ok: false,
    site: 'generic',
    pageTitle: '',
    thumbnail: null,
    formats: [],
    diagnostics: diag,
    status: 0,
    reachable: false,
    tried: [],
    anchorFound: null,
  };
  if (!url) {
    diag.push('unparsable URL');
    return base;
  }

  const site = resolveSite(url);
  const referer = site?.referer ?? new URL(url).origin + '/';
  const cookie = userCookie || cookieFor(referer);
  const jar: Jar = new Map();
  const urls = site?.mirrors ? site.mirrors(url) : [url];

  const page = await fetchFirst(urls, { referer, cookie, timeout: 15000, jar });
  base.site = site?.id ?? 'generic';
  base.status = page.status;
  base.reachable = page.status > 0;
  base.tried = page.tried;

  if (!page.ok || !page.text) {
    diag.push(`page load failed (${page.error || page.status || 'network'})`);
    return base;
  }
  if (opts.anchor) base.anchorFound = page.text.includes(opts.anchor);

  const ctx: ParseCtx = {
    html: page.text,
    pageUrl: page.url,
    diag,
    get: (u, o) => fetchFirst([u], { referer, cookie, jar, ...o }),
  };

  let parsed: { formats: RawFormat[]; title?: string; thumbnail?: string } = { formats: [] };
  if (site) {
    try {
      parsed = await site.parse(ctx);
    } catch (e) {
      diag.push(`parser error: ${(e as Error).message}`);
    }
  } else {
    diag.push('no registered site, generic scan only');
  }

  let formats = parsed.formats;
  if (!formats.length) {
    formats = parseGeneric(page.text, page.url);
    diag.push(`generic scan -> ${formats.length}`);
  }

  // resolve indirect URLs (Pornhub /video/get_media) into real files
  for (const f of formats) {
    if (!f.remote) continue;
    const r = await resolveTarget(f.url, referer, cookie, jar);
    if (r.text) {
      const j = looseJson(r.text) as any;
      const u = typeof j === 'string' ? j : j?.url ?? j?.videoUrl ?? j?.mp4 ?? '';
      if (u) f.url = absolutize(u, r.finalUrl);
      diag.push(`remote json -> ${u ? 'resolved' : 'no url'}`);
    } else if (r.finalUrl !== f.url) {
      f.url = r.finalUrl;
      diag.push('remote redirect followed');
    } else {
      diag.push(`remote unresolved (${r.contentType || 'no ct'})`);
    }
  }

  formats = dedupe(formats, (f) => f.url).filter((f) => !/\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(f.url));
  formats.sort((a, b) => {
    const ka = a.kind === 'mp4' ? 0 : 1;
    const kb = b.kind === 'mp4' ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return heightFrom(`${b.label} ${b.url}`) - heightFrom(`${a.label} ${a.url}`);
  });

  const mk = (u: string) =>
    `/api/stream?u=${encodeURIComponent(u)}&r=${encodeURIComponent(referer)}${cookie ? `&c=${encodeURIComponent(cookie)}` : ''}`;

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
          f.size = await probeSize(f.url, referer, cookie, jar);
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