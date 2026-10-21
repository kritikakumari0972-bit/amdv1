import { fetchFirst, type FetchOpts, type FetchResult } from './http';
import {
  VIDEO_RE,
  HLS_RE,
  IMAGE_RE,
  absolutize,
  extractBalanced,
  jsonAfter,
  looseJson,
} from './util';

export type FormatKind = 'mp4' | 'hls';
export type RawFormat = { url: string; label: string; kind: FormatKind; source: string };

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
  match: RegExp;
  referer: string;
  mirrors?: (u: string) => string[];
  parse: (ctx: ParseCtx) => Promise<ParseResult>;
};

/* ------------------------------------------------------------------ helpers */

function push(out: RawFormat[], raw: string, base: string, label: string, source: string) {
  if (!raw) return;
  const url = absolutize(raw, base);
  if (!/^https?:\/\//i.test(url)) return;
  if (!VIDEO_RE.test(url) || IMAGE_RE.test(url)) return;
  if (out.some((f) => f.url === url)) return;
  out.push({ url, label: label || 'video', kind: HLS_RE.test(url) ? 'hls' : 'mp4', source });
}

/** Walk any JSON shape looking for video URLs, keeping quality hints. */
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
        const q = o.quality ?? o.label ?? o.resolution ?? o.height ?? o.res;
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

/* ------------------------------------------------------------------ Pornhub */

const pornhub: Site = {
  id: 'pornhub',
  name: 'Pornhub',
  match: /(^|\.)pornhub\.com$/i,
  referer: 'https://www.pornhub.com/',
  mirrors: (u) => [u, u.replace('://www.', '://')],

  async parse(ctx) {
    const out: RawFormat[] = [];
    const title = og(ctx.html, 'og:title') || titleTag(ctx.html);
    const thumbnail = og(ctx.html, 'og:image') || undefined;

    const idx = ctx.html.indexOf('flashvars_');
    if (idx !== -1) {
      const raw = extractBalanced(ctx.html, idx);
      const data = raw ? (looseJson(raw.replace(/\\\//g, '/')) as any) : null;
      if (data) {
        const defs: any[] = Array.isArray(data.mediaDefinitions) ? data.mediaDefinitions : [];
        ctx.diag.push(`flashvars ok, ${defs.length} mediaDefinitions`);
        for (const d of defs) {
          const url = d?.videoUrl || d?.video_url;
          if (!url) continue;
          const label = d.quality ? `${d.quality}p` : d.format === 'hls' ? 'hls' : 'video';
          push(out, url, ctx.pageUrl, label, 'mediaDefinitions');
        }
      } else {
        ctx.diag.push('flashvars present but unparsable');
      }
    } else {
      ctx.diag.push('no flashvars_ (disabled / premium video?)');
    }

    // belt-and-braces: inline JSON and player script
    for (const m of ctx.html.matchAll(/"(?:videoUrl|video_url|src)"\s*:\s*"(https?:[^"]+\.(?:mp4|m3u8)[^"]*)"/g)) {
      push(out, m[1], ctx.pageUrl, '', 'inline-json');
    }
    for (const m of ctx.html.matchAll(/quality["']?\s*[:=]\s*["']?(\d{3,4})["']?[\s\S]{0,600}?(https?:[^"'\s]+\.m3u8[^"'\s]*)/g)) {
      push(out, m[2], ctx.pageUrl, `${m[1]}p`, 'inline-hls');
    }

    return { formats: out, title, thumbnail };
  },
};

/* ----------------------------------------------------------- XVideos / XNXX */

function html5PlayerSite(meta: Omit<Site, 'parse'>): Site {
  return {
    ...meta,
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
      ctx.diag.push(`html5player/JSON-LD hits: ${out.length}`);
      return { formats: out, title: og(ctx.html, 'og:title') || titleTag(ctx.html), thumbnail: og(ctx.html, 'og:image') || undefined };
    },
  };
}

const xvideos = html5PlayerSite({
  id: 'xvideos',
  name: 'XVideos',
  match: /(^|\.)xvideos\.com$/i,
  referer: 'https://www.xvideos.com/',
});

const xnxx = html5PlayerSite({
  id: 'xnxx',
  name: 'XNXX',
  match: /(^|\.)xnxx\.com$/i,
  referer: 'https://www.xnxx.com/',
});

/* ----------------------------------------------------------------- xHamster */

/**
 * xHamster now serves an Astro shell: window.initials exists but carries NO
 * xplayerSettings and no mp4/m3u8. The numeric id is recoverable from the
 * server-rendered /embed/<slug> poster, and the player endpoint only accepts
 * that numeric id. Several candidate endpoints are tried in order.
 */
const xhamster: Site = {
  id: 'xhamster',
  name: 'xHamster',
  match: /(^|\.)xhamster\.com$/i,
  referer: 'https://xhamster.com/',
  mirrors: (u) => [u],

  async parse(ctx) {
    const out: RawFormat[] = [];
    const { html, pageUrl } = ctx;
    const title = og(html, 'og:title') || titleTag(html);
    const thumbnail = og(html, 'og:image') || undefined;

    // 1) legacy inline settings (still present on some surfaces)
    const initials = jsonAfter(html, 'window.initials') as any;
    if (initials?.xplayerSettings) {
      deepCollect(initials.xplayerSettings, out, pageUrl, 'xplayerSettings');
      ctx.diag.push('xplayerSettings found inline');
    } else {
      ctx.diag.push('no inline xplayerSettings (Astro shell)');
    }

    // 2) recover numeric id
    let numId = html.match(/\/(\d{6,})\.(?:jpe?g|webp|avif)/)?.[1];
    const lastSeg = pageUrl.split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
    const slugId = lastSeg.includes('-') ? lastSeg.split('-').pop()! : lastSeg;

    if (!numId && slugId) {
      const emb = await ctx.get(`https://xhamster.com/embed/${slugId}`, { referer: pageUrl });
      if (emb.ok) numId = emb.text.match(/\/(\d{6,})\.(?:jpe?g|webp|avif)/)?.[1];
      ctx.diag.push(`embed ${emb.status} -> numId ${numId ?? 'not found'}`);
    } else if (numId) {
      ctx.diag.push(`numId from page: ${numId}`);
    }

    // 3) player endpoints, numeric id only
    if (numId && !out.length) {
      const candidates = [
        `https://xhamster.com/xplayer/v2?video=${numId}`,
        `https://xhamster.com/xplayer/v2/?video=${numId}`,
        `https://xhamster.com/api/front/v2/videos/${numId}/player`,
        `https://xhamster.com/api/front/v2/videos/${numId}`,
      ];
      for (const u of candidates) {
        const r = await ctx.get(u, {
          referer: pageUrl,
          headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/html;q=0.9' },
        });
        ctx.diag.push(`${u.replace('https://xhamster.com/', '')} -> ${r.status || r.error}`);
        if (!r.ok || !r.text) continue;

        const t = r.text.trim();
        if (t.startsWith('{') || t.startsWith('[')) {
          const j = looseJson(t);
          if (j) deepCollect(j, out, u, 'player-api');
        } else {
          const s = (jsonAfter(t, 'xplayerSettings') as any) ?? (jsonAfter(t, 'window.initials') as any);
          if (s) deepCollect(s.xplayerSettings ?? s, out, u, 'player-html');
        }
        if (out.length) break;
      }
    }

    // 4) last resort: raw scan (escaped slashes included)
    if (!out.length) {
      for (const m of html.matchAll(/https?:(?:\\\/|\/){2}[^"'\s<>()]+\.(?:mp4|m3u8)[^"'\s<>()]*/gi)) {
        push(out, m[0].replace(/\\\//g, '/'), pageUrl, '', 'html-scan');
      }
    }

    return { formats: out, title, thumbnail };
  },
};

/* --------------------------------------------------------------- SpankBang */

const spankbang: Site = {
  id: 'spankbang',
  name: 'SpankBang',
  match: /(^|\.)spankbang\.com$/i,
  referer: 'https://spankbang.com/',

  async parse(ctx) {
    const out: RawFormat[] = [];
    const data = jsonAfter(ctx.html, 'stream_data') as any;
    if (data?.stream_url?.length) {
      for (const s of data.stream_url) push(out, s?.src || s?.url, ctx.pageUrl, s?.res || s?.quality || '', 'stream_data');
      ctx.diag.push(`stream_data ok (${data.stream_url.length})`);
    } else {
      ctx.diag.push('stream_data missing');
      for (const m of ctx.html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)) push(out, m[1], ctx.pageUrl, '', 'source-tag');
    }
    return { formats: out, title: og(ctx.html, 'og:title') || titleTag(ctx.html), thumbnail: og(ctx.html, 'og:image') || undefined };
  },
};

/* ----------------------------------------------------------------- Eporner */

const eporner: Site = {
  id: 'eporner',
  name: 'Eporner',
  match: /(^|\.)eporner\.com$/i,
  referer: 'https://www.eporner.com/',

  async parse(ctx) {
    const out: RawFormat[] = [];
    for (const m of ctx.html.matchAll(/https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/gi)) push(out, m[0], ctx.pageUrl, '', 'html');

    if (!out.length) {
      const id =
        ctx.pageUrl.match(/video-([A-Za-z0-9]+)/)?.[1] ?? ctx.pageUrl.match(/\/([A-Za-z0-9]{6,})\/?$/)?.[1];
      const hash = ctx.html.match(/hash\s*[:=]\s*['"]([A-Za-z0-9]{6,})['"]/i)?.[1];
      ctx.diag.push(`eporner id=${id ?? '-'} hash=${hash ? 'yes' : 'no'}`);
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
    return { formats: out, title: og(ctx.html, 'og:title') || titleTag(ctx.html), thumbnail: og(ctx.html, 'og:image') || undefined };
  },
};

/* ----------------------------------------------------------------- registry */

export const SITES: Site[] = [pornhub, xvideos, xnxx, xhamster, spankbang, eporner];

export function resolveSite(rawUrl: string): Site | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    return null;
  }
  return SITES.find((s) => s.match.test(host)) ?? null;
}

/** Deep scan of any page: JSON-LD, inline JSON, attributes, raw URLs. */
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