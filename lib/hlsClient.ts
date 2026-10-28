'use client';

export type Progress = (done: number, total: number) => void;
export type MergeResult = { blob: Blob; extension: string };

function resolve(uri: string, base: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

function ivFor(sequence: number, ivHex: string | null): Uint8Array {
  if (ivHex) {
    const hex = ivHex.padStart(32, '0');
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  const out = new Uint8Array(16);
  new DataView(out.buffer).setUint32(12, sequence >>> 0);
  return out;
}

export async function mergeHls(playlistUrl: string, onProgress?: Progress, signal?: AbortSignal): Promise<MergeResult> {
  let text = await (await fetch(playlistUrl, { signal })).text();
  let base = playlistUrl;

  if (/#EXT-X-STREAM-INF/.test(text)) {
    const lines = text.split(/\r?\n/);
    let best = '';
    let bestBandwidth = -1;
    let bandwidth = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        bandwidth = parseInt(line.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
      } else if (line && !line.startsWith('#') && bandwidth > bestBandwidth) {
        bestBandwidth = bandwidth;
        best = line;
      }
    }
    if (best) {
      const variant = resolve(best, base);
      text = await (await fetch(variant, { signal })).text();
      base = variant;
    }
  }

  const isFmp4 = /#EXT-X-MAP/.test(text);
  let keyUri: string | null = null;
  let ivHex: string | null = null;
  let mediaSequence = 0;
  const segments: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
      mediaSequence = parseInt(line.split(':')[1] ?? '0', 10) || 0;
    } else if (line.startsWith('#EXT-X-KEY')) {
      keyUri = line.match(/URI="([^"]+)"/)?.[1] ?? null;
      ivHex = line.match(/IV=0x([0-9A-Fa-f]+)/)?.[1] ?? null;
    } else if (!line.startsWith('#')) {
      segments.push(resolve(line, base));
    }
  }
  if (!segments.length) throw new Error('Playlist contained no segments');

  let key: CryptoKey | null = null;
  if (keyUri) {
    const bytes = await (await fetch(resolve(keyUri, base), { signal })).arrayBuffer();
    key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-CBC' }, false, ['decrypt']);
  }

  const parts: ArrayBuffer[] = new Array(segments.length);
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < segments.length) {
      const index = cursor++;
      const buffer = await (await fetch(segments[index], { signal })).arrayBuffer();
      parts[index] = key
        ? await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivFor(mediaSequence + index, ivHex) }, key, buffer)
        : buffer;
      done++;
      onProgress?.(done, segments.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(5, segments.length) }, worker));

  return {
    blob: new Blob(parts, { type: isFmp4 ? 'video/mp4' : 'video/mp2t' }),
    extension: isFmp4 ? 'mp4' : 'ts',
  };
}