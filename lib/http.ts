export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const NAV_HEADERS: Record<string, string> = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

/** Age-gate / consent cookies so we never land on a wall. */
const SITE_COOKIES: Array<[RegExp, string]> = [
  [/pornhub\.com$/i, 'platform=pc; age_verified=1; accessAgeDisclaimerPH=1; accessPH=1; cookieConsent=1'],
  [/xhamster\.com$/i, 'age_verified=1; platform=pc; cookieConsent=1; x_vdnkey=1'],
  [/xvideos\.com$|xnxx\.com$/i, 'platform=pc; cookieConsent=1'],
  [/spankbang\.com$/i, 'sb_sfw=0'],
  [/eporner\.com$/i, 'cookieConsent=1'],
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

export type FetchOpts = {
  referer?: string;
  cookie?: string;
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

export async function fetchOnce(url: string, o: FetchOpts = {}): Promise<FetchResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeout ?? 15000);
  try {
    const headers: Record<string, string> = { ...NAV_HEADERS, ...(o.headers || {}) };
    if (o.referer) {
      headers.referer = o.referer;
      try {
        headers.origin = new URL(o.referer).origin;
      } catch {
        /* ignore */
      }
    }
    if (o.cookie) headers.cookie = o.cookie;
    if (o.range) headers.range = o.range;

    const res = await fetch(url, {
      method: o.method || 'GET',
      headers,
      redirect: 'follow',
      signal: ctl.signal,
      cache: 'no-store',
    });
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

/** Try each URL in order, return the first that loads. */
export async function fetchFirst(
  urls: string[],
  o: FetchOpts = {},
): Promise<FetchResult & { tried: string[] }> {
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

/** Cheap file-size probe. Never throws. */
export async function probeSize(url: string, referer: string, cookie: string): Promise<number | null> {
  const r = await fetchOnce(url, { referer, cookie, range: 'bytes=0-0', timeout: 7000 });
  const cr = r.headers.get('content-range');
  if (cr) {
    const m = cr.match(/\/(\d+)\s*$/);
    if (m) return parseInt(m[1], 10);
  }
  if (r.status === 200) {
    const cl = r.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
  }
  return null;
}