export const VIDEO_RE = /\.(mp4|m3u8|webm|mov|m4v|mpd)(?:[?#]|$)/i;
export const HLS_RE = /\.m3u8(?:[?#]|$)/i;

export function decodeEntities(s: string): string {
  return s
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\\[rn]/g, '')
    .trim();
}

export function absolutize(raw: string, base: string): string {
  const s = decodeEntities(raw);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  try {
    return new URL(s, base).toString();
  } catch {
    return s;
  }
}

export function extractBalanced(text: string, from: number, open = '{', close = '}'): string | null {
  const start = text.indexOf(open, from);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function looseJson(raw: string): unknown | null {
  for (const a of [raw, raw.replace(/,\s*([}\]])/g, '$1'), raw.replace(/'/g, '"')]) {
    try {
      return JSON.parse(a);
    } catch {}
  }
  return null;
}

export function jsonAfter(text: string, marker: string): unknown | null {
  const i = text.indexOf(marker);
  if (i === -1) return null;
  const raw = extractBalanced(text, i);
  return raw ? looseJson(raw) : null;
}

export function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const LABEL_HEIGHTS: Record<string, number> = {
  '2160': 2160, '4k': 2160, '1440': 1440, '1080': 1080, high: 1080, hd: 1080,
  '720': 720, medium: 720, sd: 480, '480': 480, low: 360, '360': 360,
};

export function heightFrom(s: string): number {
  const t = String(s).toLowerCase();
  for (const [k, v] of Object.entries(LABEL_HEIGHTS)) if (t.includes(k)) return v;
  const m = t.match(/(\d{3,4})\s*p?\b/);
  return m ? parseInt(m[1], 10) : 0;
}

export function humanSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function safeFileName(title: string, fallback = 'video'): string {
  const base = (title || fallback)
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80)
    .trim();
  return base || fallback;
}