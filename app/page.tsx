'use client';

import { useEffect, useRef, useState } from 'react';
import { EXAMPLES } from '@/lib/examples';
import { mergeHls } from '@/lib/hlsClient';
import { humanSize, safeFileName } from '@/lib/util';

type Fmt = { url: string; streamUrl: string; label: string; kind: string; size: number | null; source: string };
type Extract = { site: string; pageTitle: string; thumbnail: string | null; formats: Fmt[]; diagnostics: string[] };
type CheckRow = { id: string; name: string; status: string; ms: number; formats: number };
type HistoryItem = { url: string; title: string; site: string; ts: number };

const HISTORY_KEY = 'grabtube.history.v2';

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export default function Page() {
  const [url, setUrl] = useState('');
  const [cookie, setCookie] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [diag, setDiag] = useState('');
  const [data, setData] = useState<Extract | null>(null);
  const [picked, setPicked] = useState(0);
  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showExamples, setShowExamples] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  function remember(item: HistoryItem) {
    const next = [item, ...history.filter((h) => h.url !== item.url)].slice(0, 8);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        return;
      }
    } catch {}
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand('paste');
    } catch {}
  }

  async function extract() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setDiag('');
    setData(null);
    setPicked(0);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), cookie }),
      });
      const json = await res.json();
      setDiag((json.diagnostics || []).join('  ·  '));
      if (!res.ok) {
        setError(json.error || 'Extraction failed');
        return;
      }
      if (!json.formats?.length) {
        setError(json.error || 'No playable stream found');
        return;
      }
      setData(json);
      remember({ url: url.trim(), title: json.pageTitle || url.trim(), site: json.site, ts: Date.now() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function preview() {
    if (!data?.formats.length) return;
    const fmt = data.formats[picked];
    const video = videoRef.current;
    if (!video) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (fmt.kind === 'hls') {
      const Hls = (await import('hls.js')).default;
      if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(fmt.streamUrl);
        hls.attachMedia(video);
      } else {
        video.src = fmt.streamUrl;
      }
    } else {
      video.src = fmt.streamUrl;
    }
    video.play().catch(() => undefined);
  }

  /** ONE button: direct mp4 saves instantly, HLS is merged client-side. */
  async function download() {
    if (!data?.formats.length || downloading) return;
    const fmt = data.formats[picked];
    const name = safeFileName(data.pageTitle || data.site || 'video');
    setDownloading(true);
    setError('');
    setProgress(fmt.kind === 'hls' ? '0%' : '');

    try {
      if (fmt.kind === 'mp4') {
        const a = document.createElement('a');
        a.href = fmt.streamUrl;
        a.download = `${name}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const ctl = new AbortController();
        abortRef.current = ctl;
        const { blob, extension } = await mergeHls(
          fmt.streamUrl,
          (done, total) => setProgress(`${Math.round((done / total) * 100)}%  ${done}/${total}`),
          ctl.signal,
        );
        saveBlob(blob, `${name}.${extension}`);
      }
    } catch (e) {
      setError(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
      setProgress('');
    }
  }

  async function runChecks() {
    setChecking(true);
    setChecks(null);
    try {
      const res = await fetch('/api/health');
      const json = await res.json();
      setChecks(json.results || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const sites = [...new Set(EXAMPLES.map((e) => e.site))];
  const selected = data?.formats[picked];

  return (
    <div className="wrap">
      <div className="brand">
        <h1>GrabTube</h1>
        <span>server-side extraction · same-origin proxy · one-click save</span>
      </div>

      <div className="panel">
        <div className="row">
          <div className="grow">
            <input
              ref={inputRef}
              type="text"
              placeholder="paste any tube URL, with or without https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && extract()}
            />
          </div>
          <button className="tiny" onClick={paste}>Paste</button>
          <button className="primary" onClick={extract} disabled={loading || !url.trim()}>
            {loading ? <span className="spin" /> : null}
            {loading ? 'Extracting' : 'Extract'}
          </button>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="toggle" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? '▾' : '▸'} Advanced (cookies)
          </button>
          <button className="toggle" onClick={() => setShowExamples((v) => !v)}>
            {showExamples ? '▾' : '▸'} Real example URLs
          </button>
          <button className="toggle" onClick={runChecks} disabled={checking}>
            {checking ? 'checking…' : 'Run site checks'}
          </button>
        </div>

        {advanced && (
          <textarea
            style={{ marginTop: 8 }}
            placeholder="document.cookie from the site — needed if a video is age-gated, region-locked or blurred"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
          />
        )}

        {showExamples && (
          <div style={{ marginTop: 12 }}>
            {sites.map((site) => (
              <div key={site} style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{site}</div>
                <div className="history">
                  {EXAMPLES.filter((e) => e.site === site).map((e) => (
                    <button
                      key={e.url}
                      className="tiny"
                      title={e.url}
                      onClick={() => {
                        setUrl(e.url);
                        setShowExamples(false);
                      }}
                    >
                      {e.url.split('/').filter(Boolean).pop()?.slice(0, 24)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="msg err">{error}</div>}
        {diag && <div className="msg diag">{diag}</div>}
      </div>

      {checks && (
        <div className="panel">
          <strong style={{ fontSize: 14 }}>Live parser checks</strong>
          <table>
            <thead>
              <tr><th>Site</th><th>Status</th><th>Formats</th><th>Time</th></tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`dot ${c.status === 'ok' ? 'ok' : c.status === 'blocked' ? 'bad' : 'warn'}`} />
                    {c.status}
                  </td>
                  <td>{c.formats}</td>
                  <td>{c.ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="panel">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {data.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.thumbnail} alt="" width={132} style={{ borderRadius: 10, border: '1px solid var(--border)' }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{data.pageTitle || 'Untitled'}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>
                {data.site} · {data.formats.length} stream(s)
              </div>
            </div>
          </div>

          <div className="video-box">
            <video ref={videoRef} controls playsInline poster={data.thumbnail || undefined} />
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <select value={picked} onChange={(e) => setPicked(Number(e.target.value))}>
              {data.formats.map((f, i) => (
                <option key={f.url} value={i}>
                  {f.label} · {f.kind === 'hls' ? 'adaptive' : humanSize(f.size)} · {f.kind}
                </option>
              ))}
            </select>
            <button onClick={preview}>Preview</button>
            {selected && <span className={`badge ${selected.kind}`}>{selected.kind}</span>}
          </div>

          <button className="primary big" onClick={download} disabled={downloading}>
            {downloading ? <span className="spin" /> : null}
            {downloading
              ? selected?.kind === 'hls'
                ? `Downloading ${progress}`
                : 'Downloading'
              : `Download ${selected?.label ?? ''}`}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="panel">
          <strong style={{ fontSize: 14 }}>Recent</strong>
          <div className="history">
            {history.map((h) => (
              <button key={h.ts} onClick={() => setUrl(h.url)} title={h.url}>
                {h.title.slice(0, 46)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}