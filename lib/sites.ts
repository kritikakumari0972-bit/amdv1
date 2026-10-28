import { fetchFirst, type FetchOpts, type FetchResult } from './http';
import { hostMatches, hostOf } from './normalize';
import { VIDEO_RE, absolutize, decodeEntities, extractBalanced, jsonAfter, looseJson } from './util';

export type FormatKind = 'mp4' | 'hls';
export type RawFormat = { url: string; label: string; kind: FormatKind; source: string; remote?: boolean };

export type ParseCtx = {
  html: string;
  pageUrl: string;
  diag: string[];
  get: (url: string, o?: FetchOpts) => Promise<FetchResult>;
};

export type ParseResult = { formats: RawFormat[]; title?: string; thumbnail?: string };

export type Site = {
  id: string;
  name: string;
  domains: string[];
  referer: string;
  mirrors?: (u: string) => string[];
  parse: (ctx: ParseCtx) => Promise<ParseResult>;
};

/* ------------------------------------------------------------------ helpers */

function push(out: RawFormat[], raw: string, base: string, label: string, source: string) {
  if (!raw) return;
  const url = absolutize(raw, base);
  if (!/^https?:\/\//i.test(url)) return;
  if (!VIDEO_RE.test(url)) return;
  if (out.some((f) => f.url === url)) return;
  out.push({ url, label: label || 'video', kind: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4', source });
}

function deepCollect(node: unknown, out: RawFormat[], base: string, source: string, hint = '', depth = 0) {
  if (node == null || depth > 10) return;
  if (typeof node === 'string') {
    push(out, node, base, hint, source);
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) deepCollect(n, out, base, source, hint, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      let label = hint || k;
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const q = o.height ?? o.quality ?? o.label ?? o.resolution ?? o.res;
        if (typeof q === 'string' || typeof q === 'number') label = /^\d+$/.test(String(q)) ? `${q}p` : String(q);
      }
      deepCollect(v, out, base, source, label, depth + 1);
    }
  }
}

function og(html: string, prop: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] || m[2] || '' : '';
}

function titleTag(html: string): string {
  return html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1]?.trim() ?? '';
}

function meta(html: string, pageUrl: string): { title: string; thumbnail?: string } {
  return {
    title: decodeEntities(og(html, 'og:title') || titleTag(html)),
    thumbnail: og(html, 'og:image') || undefined,
  };
}

/* ------------------------------------------------- MindGeek family (Pornhub) */

/**
 * Verified live 2026-10-21. The player config is plain JSON in the HTML:
 *   "mediaPriority":"hls",
 *   "mediaDefinitions":[{format:"hls", height:480, quality:"480", videoUrl:"…/master.m3u8?…"},
 *                       {format:"mp4", height:1080, quality:[], remote:true,
 *                        videoUrl:"https://www.pornhub.com/video/get_media?s=…&v=<key>&e=1&t=p"}]
 * quality is a STRING for hls and an ARRAY for mp4. The mp4 entry is not a file.
 */
async function parseMindgeek(ctx: ParseCtx): Promise<ParseResult> {
  const out: RawFormat[] = [];
  const { html, pageUrl } = ctx;

  const i = html.indexOf('mediaDefinitions');
  const arrRaw = i === -1 ? null : extractBalanced(html, i, '[', ']');
  const defs: any[] = arrRaw ? ((looseJson(arrRaw) as any) ?? []) : [];
  ctx.diag.push(`mediaDefinitions=${defs.length}`);

  for (const d of defs) {
    if (!d?.videoUrl) continue;
    const fmt = String(d.format || '').toLowerCase();
    const q = typeof d.quality === 'string' ? d.quality : Array.isArray(d.quality) ? '' : String(d.quality ?? '');
    const height = String(d.height || q || '');
    const label = height ? `${height}p` : fmt || 'video';
    const remote = d.remote === true || /\/video\/get_media/.test(d.videoUrl);
    push(out, d.videoUrl, pageUrl, label, remote ? 'get_media' : `mediaDefinitions:${fmt}`);
    const added = out[out.length - 1];
    if (added && remote) added.remote = true;
  }

  const title = html.match(/"video_title"\s*:\s*"([^"]+)"/)?.[1] || og(html, 'og:title') || titleTag(html);
  const poster = html.match(/"image_url"\s*:\s*"([^"]+)"/)?.[1] || og(html, 'og:image') || undefined;

  if (!out.length) {
    for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/g)) {
      const u = m[0].replace(/\\\//g, '/');
      if (/rs:fit:(?:160|320|323):/.test(u)) continue;
      push(out, u, pageUrl, '', 'html-scan');
    }
  }

  return { formats: out, title: decodeEntities(title), thumbnail: poster ? decodeEntities(poster) : undefined };
}

const pornhub: Site = {
  id: 'pornhub',
  name: 'Pornhub',
  domains: ['pornhub.com', 'pornhub.net'],
  referer: 'https://www.pornhub.com/',
  mirrors: (u) => {
    const key = u.match(/viewkey=([A-Za-z0-9]+)/)?.[1] ?? u.match(/\/embed\/([A-Za-z0-9]+)/)?.[1];
    return key ? [u, `https://www.pornhub.com/embed/${key}`] : [u];
  },
  parse: parseMindgeek,
};

const youporn: Site = {
  id: 'youporn',
  name: 'YouPorn',
  domains: ['youporn.com'],
  referer: 'https://www.youporn.com/',
  parse: parseMindgeek,
};

const redtube: Site = {
  id: 'redtube',
  name: 'RedTube',
  domains: ['redtube.com'],
  referer: 'https://www.redtube.com/',
  parse: parseMindgeek,
};

const tube8: Site = {
  id: 'tube8',
  name: 'Tube8',
  domains: ['tube8.com'],
  referer: 'https://www.tube8.com/',
  parse: parseMindgeek,
};

/* ----------------------------------------------------------- XVideos / XNXX */

function html5PlayerSite(meta_: Omit<Site, 'parse'>): Site {
  return {
    ...meta_,
    async parse(ctx) {
      const out: RawFormat[] = [];
      const patterns: Array<[RegExp, string]> = [
        [/html5player\.setVideoUrlHigh\(\s*'([^']+)'/g, 'high'],
        [/html5player\.setVideoUrlMedium\(\s*'([^']+)'/g, 'medium'],
        [/html5player\.setVideoUrlLow\(\s*'([^']+)'/g, 'low'],
        [/html5player\.setVideoHLS\(\s*'([^']+)'/g, 'hls'],
      ];
      for (const [re, label] of patterns) {
        for (const m of ctx.html.matchAll(re)) push(out, m[1], ctx.pageUrl, label, 'html5player');
      }
      for (const m of ctx.html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/g)) {
        push(out, m[1], ctx.pageUrl, 'json-ld', 'json-ld');
      }
      ctx.diag.push(`html5player/json-ld hits=${out.length}`);
      return { formats: out, ...meta(ctx.html, ctx.pageUrl) };
    },
  };
}

const xvideos = html5PlayerSite({
  id: 'xvideos',
  name: 'XVideos',
  domains: ['xvideos.com', 'xvideos.es', 'xvideos-india.com', 'xv-ru.com', 'xvideos-ar.com'],
  referer: 'https://www.xvideos.com/',
  mirrors: (u) => {
    const id = u.match(/\/video\.([a-z0-9]+)/)?.[1];
    return id ? [u, `https://www.xvideos.com/embedframe/${id}`] : [u];
  },
});

const xnxx = html5PlayerSite({
  id: 'xnxx',
  name: 'XNXX',
  domains: ['xnxx.com', 'xnxx.es', 'xnxx2.com'],
  referer: 'https://www.xnxx.com/',
});

/* ----------------------------------------------------------------- xHamster */

const XH_API = 'https://xhamster.com/api/front';

/** Verified live: without this payload the API returns an empty body. */
function xhParams(initials: any): string {
  const p = initials?.xhlMlSource?.payload ?? {};
  return JSON.stringify({
    recommendEnabled: p.recommendEnabled ?? true,
    orientation: p.orientation ?? 'straight',
    clientLanguage: p.clientLanguage ?? 'en',
    country: p.country ?? 'us',
    pageType: 'videoPage',
    limit: p.limit ?? 50,
    experiments: p.experiments ?? {},
    site: 'desktop',
  });
}

const xhamster: Site = {
  id: 'xhamster',
  name: 'xHamster',
  domains: ['xhamster.com', 'xhamster.desi', 'xhamster2.com', 'xhamster3.com', 'xhms.pro', 'xhday.com'],
  referer: 'https://xhamster.com/',

  async parse(ctx) {
    const out: RawFormat[] = [];
    const { html, pageUrl } = ctx;
    const m = meta(html, pageUrl);

    const initials = jsonAfter(html, 'window.initials') as any;
    const params = xhParams(initials);
    const pk: string | undefined = initials?.pk;

    if (initials?.xplayerSettings) {
      deepCollect(initials.xplayerSettings, out, pageUrl, 'xplayerSettings');
      ctx.diag.push('inline xplayerSettings');
    }

    const lastSeg = pageUrl.split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
    const hashSlug = lastSeg.includes('-') ? lastSeg.split('-').pop()! : lastSeg;
    let numId = html.match(/\/(\d{6,})\.(?:jpe?g|webp|avif)/)?.[1];
    if (!numId && hashSlug) {
      const emb = await ctx.get(`https://xhamster.com/embed/${hashSlug}`, { referer: pageUrl });
      if (emb.ok) numId = emb.text.match(/\/(\d{6,})\.(?:jpe?g|webp|avif)/)?.[1];
    }
    ctx.diag.push(`hashSlug=${hashSlug} numId=${numId ?? '-'}`);

    const id = numId ?? hashSlug;
    const headers: Record<string, string> = {
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json, text/plain, */*',
      ...(pk ? { pk } : {}),
    };
    const qs = new URLSearchParams({ preferredLang: 'en', params }).toString();

    const paths = [
      `player/video-list/${id}?${qs}`,
      `player/${id}?${qs}`,
      `player/settings/${id}?${qs}`,
      `video/about?videoIdHashSlug=${encodeURIComponent(hashSlug)}&${qs}`,
      `video/related?videoId=${id}&page=1&${qs}`,
    ];

    for (const p of paths) {
      if (out.length) break;
      const u = `${XH_API}/${p}`;
      const r = await ctx.get(u, { referer: pageUrl, headers });
      ctx.diag.push(`${p.split('?')[0]} -> ${r.status || r.error} len=${r.text?.length ?? 0}`);
      if (!r.ok || !r.text?.trim()) continue;
      const j = looseJson(r.text);
      if (j) deepCollect(j, out, u, 'front-api');
    }

    if (!out.length) {
      for (const mm of html.matchAll(/https?:(?:\\\/|\/){2}[^"'\s<>()]+\.(?:mp4|m3u8)[^"'\s<>()]*/gi)) {
        push(out, mm[0].replace(/\\\//g, '/'), pageUrl, '', 'html-scan');
      }
    }
    return { formats: out, ...m };
  },
};

/* --------------------------------------------------------------- SpankBang */

const spankbang: Site = {
  id: 'spankbang',
  name: 'SpankBang',
  domains: ['spankbang.com', 'spankbang.porn'],
  referer: 'https://spankbang.com/',
  async parse(ctx) {
    const out: RawFormat[] = [];
    const data = jsonAfter(ctx.html, 'stream_data') as any;
    if (data?.stream_url?.length) {
      for (const s of data.stream_url) push(out, s?.src || s?.url, ctx.pageUrl, s?.res || s?.quality || '', 'stream_data');
      ctx.diag.push(`stream_data=${data.stream_url.length}`);
    } else {
      ctx.diag.push('stream_data missing');
      for (const mm of ctx.html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)) push(out, mm[1], ctx.pageUrl, '', 'source-tag');
    }
    return { formats: out, ...meta(ctx.html, ctx.pageUrl) };
  },
};

/* ----------------------------------------------------------------- Eporner */

const eporner: Site = {
  id: 'eporner',
  name: 'Eporner',
  domains: ['eporner.com'],
  referer: 'https://www.eporner.com/',
  async parse(ctx) {
    const out: RawFormat[] = [];
    for (const mm of ctx.html.matchAll(/https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/gi)) push(out, mm[0], ctx.pageUrl, '', 'html');
    if (!out.length) {
      const id = ctx.pageUrl.match(/video-([A-Za-z0-9]+)/)?.[1] ?? ctx.pageUrl.match(/\/([A-Za-z0-9]{6,})\/?$/)?.[1];
      const hash = ctx.html.match(/hash\s*[:=]\s*['"]([A-Za-z0-9]{6,})['"]/i)?.[1];
      ctx.diag.push(`id=${id ?? '-'} hash=${hash ? 'yes' : 'no'}`);
      if (id && hash) {
        const r = await ctx.get(
          `https://www.eporner.com/xhr/video/${id}?hash=${hash}&device=generic&domain=www.eporner.com&fallback=true`,
          { referer: ctx.pageUrl },
        );
        ctx.diag.push(`xhr/video -> ${r.status || r.error}`);
        if (r.ok) {
          const j = looseJson(r.text);
          if (j) deepCollect(j, out, ctx.pageUrl, 'xhr');
        }
      }
    }
    return { formats: out, ...meta(ctx.html, ctx.pageUrl) };
  },
};

/* --------------------------------------------------------- generic fallback */

function genericSite(id: string, name: string, domains: string[], referer: string): Site {
  return {
    id,
    name,
    domains,
    referer,
    async parse(ctx) {
      const out = parseGeneric(ctx.html, ctx.pageUrl);
      ctx.diag.push(`generic scan=${out.length}`);
      return { formats: out, ...meta(ctx.html, ctx.pageUrl) };
    },
  };
}

export const SITES: Site[] = [
  pornhub,
  youporn,
  redtube,
  tube8,
  xvideos,
  xnxx,
  xhamster,
  spankbang,
  eporner,
  genericSite('txxx', 'TXXX', ['txxx.com'], 'https://txxx.com/'),
  genericSite('hqporner', 'HQPorner', ['hqporner.com'], 'https://hqporner.com/'),
  genericSite('beeg', 'Beeg', ['beeg.com'], 'https://beeg.com/'),
  genericSite('porn300', 'Porn300', ['porn300.com'], 'https://www.porn300.com/'),
  genericSite('porntrex', 'PornTrex', ['porntrex.com'], 'https://www.porntrex.com/'),
  genericSite('drtuber', 'DrTuber', ['drtuber.com'], 'https://www.drtuber.com/'),
  genericSite('sunporno', 'SunPorno', ['sunporno.com'], 'https://www.sunporno.com/'),
  genericSite('porncom', 'Porn.com', ['porn.com'], 'https://www.porn.com/'),
  genericSite('tnaflix', 'TNAFlix', ['tnaflix.com'], 'https://www.tnaflix.com/'),
  genericSite('motherless', 'Motherless', ['motherless.com'], 'https://motherless.com/'),
  genericSite('sxyprn', 'SxyPrn', ['sxyprn.com', 'yourporn.sexy'], 'https://sxyprn.com/'),
  genericSite('hdzog', 'HDZog', ['hdzog.com'], 'https://hdzog.com/'),
];

export function resolveSite(rawUrl: string): Site | null {
  const host = hostOf(rawUrl);
  if (!host) return null;
  return SITES.find((s) => hostMatches(host, s.domains)) ?? null;
}

export function parseGeneric(html: string, pageUrl: string): RawFormat[] {
  const out: RawFormat[] = [];

  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const j = looseJson(m[1]);
    if (j) deepCollect(j, out, pageUrl, 'json-ld');
  }
  for (const m of html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const j = looseJson(m[1]);
    if (j) deepCollect(j, out, pageUrl, 'inline-json');
  }
  for (const m of html.matchAll(/https?:(?:\\\/|\/){2}[^"'\s<>()]+\.(?:mp4|m3u8|webm|mpd)[^"'\s<>()]*/gi)) {
    push(out, m[0].replace(/\\\//g, '/'), pageUrl, '', 'html-scan');
  }
  for (const m of html.matchAll(/(?:src|href|data-src|file|url)=["']([^"']+\.(?:mp4|m3u8|webm|mpd)[^"']*)["']/gi)) {
    push(out, m[1], pageUrl, '', 'attr-scan');
  }
  return out;
}

export { fetchFirst };