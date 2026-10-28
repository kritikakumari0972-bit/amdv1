export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const NAV_HEADERS: Record<string, string> = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

const SITE_COOKIES: Array<[RegExp, string]> = [
  [/pornhub\.com$/i, 'platform=pc; age_verified=1; accessAgeDisclaimerPH=1; accessPH=1; cookieConsent=1'],
  [/youporn\.com$/i, 'platform=pc; cookieConsent=1'],
  [/redtube\.com$/i, 'platform=pc; cookieConsent=1'],
  [/tube8\.com$/i, 'platform=pc; cookieConsent=1'],
  [/xhamster\.com$/i, 'age_verified=1; platform=pc; cookieConsent=1; x_vdnkey=1'],
  [/xvideos\.com$|xnxx\.com$/i, 'platform=pc; cookieConsent=1'],
  [/spankbang\.com$/i, 'sb_sfw=0'],
];

export function cookieFor(referer: string): string {
  let host = '';
  try {
    host = new URL(referer).hostname;
  } catch {
    return '';
  }
  return SITE_COOKIES.find(([re]) => re.test(host))?.[1] ?? '';
}

export type Jar = Map<string, string>;

function absorb(res: Response, jar?: Jar) {
  if (!jar) return;
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const lines = h.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
  for (const line of lines) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function jarString(jar?: Jar): string {
  return jar && jar.size ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : '';
}

export type FetchOpts = {
  referer?: string;
  cookie?: string;
  jar?: Jar;
  headers?: Record<string, string>;
  range?: string;
  timeout?: number;
  method?: string;
};

export type FetchResult = {
  ok: boolean;
  status: number;
  url: string;
  text: string;
  headers: Headers;
  error?: string;
};

function buildHeaders(o: FetchOpts): Record<string, string> {
  const headers: Record<string, string> = { ...NAV_HEADERS, ...(o.headers || {}) };
  if (o.referer) {
    headers.referer = o.referer;
    try {
      headers.origin = new URL(o.referer).origin;
    } catch {}
  }
  const cookie = [o.cookie, jarString(o.jar)].filter(Boolean).join('; ');
  if (cookie) headers.cookie = cookie;
  if (o.range) headers.range = o.range;
  return headers;
}

export async function fetchOnce(url: string, o: FetchOpts = {}): Promise<FetchResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeout ?? 15000);
  try {
    const res = await fetch(url, {
      method: o.method || 'GET',
      headers: buildHeaders(o),
      redirect: 'follow',
      signal: ctl.signal,
      cache: 'no-store',
    });
    absorb(res, o.jar);
    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, url: res.url || url, text, headers: res.headers };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      status: 0,
      url,
      text: '',
      headers: new Headers(),
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFirst(urls: string[], o: FetchOpts = {}): Promise<FetchResult & { tried: string[] }> {
  const tried: string[] = [];
  let last: FetchResult = { ok: false, status: 0, url: urls[0] ?? '', text: '', headers: new Headers() };
  for (const u of urls) {
    tried.push(u);
    const r = await fetchOnce(u, o);
    if (r.ok && r.text) return { ...r, tried };
    last = r;
  }
  return { ...last, tried };
}

/** Follow redirects without downloading the body, unless the reply is JSON. */
export async function resolveTarget(
  url: string,
  referer: string,
  cookie: string,
  jar?: Jar,
): Promise<{ finalUrl: string; contentType: string; text: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: buildHeaders({ referer, cookie, jar }),
      redirect: 'follow',
      signal: ctl.signal,
      cache: 'no-store',
    });
    const ct = res.headers.get('content-type') || '';
    if (/json/i.test(ct)) {
      const text = await res.text().catch(() => '');
      return { finalUrl: res.url || url, contentType: ct, text };
    }
    try {
      await res.body?.cancel();
    } catch {}
    return { finalUrl: res.url || url, contentType: ct, text: '' };
  } catch {
    return { finalUrl: url, contentType: '', text: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Size probe that never downloads the body. */
export async function probeSize(url: string, referer: string, cookie: string, jar?: Jar): Promise<number | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: buildHeaders({ referer, cookie, jar, range: 'bytes=0-0' }),
      redirect: 'follow',
      signal: ctl.signal,
      cache: 'no-store',
    });
    try {
      const cr = res.headers.get('content-range');
      if (cr) {
        const m = cr.match(/\/(\d+)\s*$/);
        if (m) return parseInt(m[1], 10);
      }
      const cl = res.headers.get('content-length');
      if (cl) return parseInt(cl, 10);
    } finally {
      try {
        await res.body?.cancel();
      } catch {}
    }
  } catch {}
  finally {
    clearTimeout(timer);
  }
  return null;
}