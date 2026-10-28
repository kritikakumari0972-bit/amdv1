'use client';
import { useRef, useState } from 'react';

type Fmt = { label: string; url: string; type: 'hls' | 'mp4'; height?: number; streamUrl: string };

let hlsPromise: Promise<any> | null = null;
function loadHls(): Promise<any> {
  const w = window as any;
  if (w.Hls) return Promise.resolve(w.Hls);
  if (!hlsPromise) {
    hlsPromise = import('hls.js')
      .then((m: any) => m.default || m)
      .catch(async () => {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
          s.onload = () => res();
          s.onerror = () => rej(new Error('hls.js cdn failed'));
          document.head.appendChild(s);
        });
        return w.Hls;
      });
  }
  return hlsPromise;
}

export default function Home() {
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState<{ title: string; site: string; formats: Fmt[] } | null>(null);
  const [sel, setSel] = useState<Fmt | null>(null);
  const [prevErr, setPrevErr] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);

  async function paste() {
    try {
      if (navigator.clipboard?.readText) { setRaw((await navigator.clipboard.readText()).trim()); return; }
    } catch {}
    const ta = document.createElement('textarea');
    document.body.appendChild(ta); ta.select();
    document.execCommand('paste'); setRaw(ta.value.trim()); ta.remove();
  }

  async function extract() {
    setErr(''); setPrevErr(''); setData(null); setSel(null);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) videoRef.current.removeAttribute('src');
    if (!raw.trim()) { setErr('Paste a URL first'); return; }

    setLoading(true);
    try {
      const r = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: raw.trim() }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || `HTTP ${r.status}`); return; }
      setData(j);
      if (j.formats?.[0]) preview(j.formats[0]);
    } catch (e: any) {
      setErr('Extract failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function preview(f: Fmt) {
    const v = videoRef.current;
    if (!v) return;
    setSel(f); setPrevErr('');
    v.muted = true;                       // MUST be before play()
    (v as any).playsInline = true;

    const isHls = f.type === 'hls' || /\.m3u8($|\?)/i.test(f.url) || /\.m3u8($|\?)/i.test(f.streamUrl);
    const tryPlay = () =>
      v.play().catch((e: any) => setPrevErr(`Autoplay blocked (${e.name}) — press play`));

    if (isHls) {
      const Hls = await loadHls().catch(() => null);
      if (Hls && Hls.isSupported()) {
        if (hlsRef.current) hlsRef.current.destroy();
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e: any, d: any) => {
          setPrevErr(d.fatal ? `HLS fatal: ${d.type}/${d.details}` : `HLS: ${d.details}`);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
        hls.loadSource(f.streamUrl);
        hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = f.streamUrl;
        v.addEventListener('loadedmetadata', tryPlay, { once: true });
      } else {
        setPrevErr('HLS not supported in this browser');
      }
    } else {
      v.src = f.streamUrl;
      v.addEventListener('loadedmetadata', tryPlay, { once: true });
      v.addEventListener('error', () => setPrevErr(`Media error: ${v.error?.code}`), { once: true });
    }
  }

  function download() {
    if (!sel) return;
    const a = document.createElement('a');
    a.href = sel.streamUrl;
    a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <main className="wrap">
      <h1>GrabTube</h1>
      <div className="row">
        <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste video URL…" />
        <button onClick={paste}>Paste</button>
        <button onClick={extract} disabled={loading}>{loading ? 'Extracting…' : 'Extract'}</button>
      </div>

      {err && <p className="err">{err}</p>}

      <video ref={videoRef} controls playsInline muted className="player" />
      {prevErr && <p className="err">{prevErr}</p>}

      {data && (
        <>
          <h2>{data.title}</h2>
          <ul className="list">
            {data.formats.map((f, i) => (
              <li key={i} className={sel === f ? 'active' : ''} onClick={() => preview(f)}>
                {f.label} {f.type.toUpperCase()}
              </li>
            ))}
          </ul>
          <button onClick={download} disabled={!sel}>Download selected</button>
        </>
      )}
    </main>
  );
}