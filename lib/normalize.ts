export function normalizeUrl(input: string): string | null {
  let s = String(input ?? '').trim();
  if (!s) return null;

  s = s.replace(/^[\s"'<([]+/, '').replace(/[\s"'>)\]]+$/, '');

  const iframe = s.match(/src\s*=\s*["']([^"']+)["']/i);
  if (iframe) s = iframe[1].trim();

  s = s.split(/\s+/)[0];
  if (s.startsWith('//')) s = 'https:' + s;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (!/\./.test(u.hostname)) return null;
  u.hash = '';
  return u.toString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith('.' + d));
}