'use client';

import { useEffect, useRef, useState } from 'react';
import { mergeHls } from '@/lib/hlsClient';
import { humanSize, safeFileName } from '@/lib/util';

type Fmt = { url: string; streamUrl: string; label: string; kind: string; size: number | null; source: string };
type Extract = { site: string; pageTitle: string; thumbnail: string | null; formats: Fmt[]; diagnostics: string[] };
type CheckRow = { id: string; name: string; status: string; ms: number; formats: number; diagnostics: string[] };
type HistoryItem = { url: string; title: string; site: string; ts: number };

const HISTORY_KEY = 'grabtube.history.v1';

export default function Page() {
  const [url, setUrl] = useState('');
  const [cookie, setCookie] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [diag, setDiag] = useState('');
  const [data, setData] = useState<Extract | null>(null);
  const [active, setActive] = useState<Fmt | null>(null);
  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function remember(item: HistoryItem) {
    const next = [item, ...history.filter((h) => h.url !== item.url)].slice(0, 8);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        return;
      }
    } catch {
      /* fall through */
    }
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand('paste');
    } catch {
      /* user presses Ctrl+V */
    }
  }

  async function extract() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setDiag('');
    setData(null);
    setActive(null);
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

  async function play(fmt: Fmt) {
    setActive(fmt);
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

  async function download(fmt: Fmt) {
    if (fmt.kind === 'mp4') {
      const a = document.createElement('a');
      a.href = fmt.streamUrl;
      a.download = safeFileName(data?.pageTitle || 'video') + '.mp4';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    setMerging(fmt.url);
    setProgress('0%');
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const blob = await mergeHls(
        fmt.streamUrl,
        (done, total) => setProgress(`${Math.round((done / total) * 100)}% (${done}/${total})`),
        ctl.signal,
      );
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = safeFileName(data?.pageTitle || 'video') + '.ts';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      setError(`Merge failed: ${(e as Error).message}`);
    } finally {
      setMerging(null);
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

  return (
    <div className="wrap">
      <div className="brand">
        <h1>GrabTube</h1>
        <span>server-side extraction · same-origin proxy · HLS merge</span>
      </div>

      <div className="panel">
        <div className="row">
          <div className="grow">
            <input
              ref={inputRef}
              type="text"
              placeholder="https://www.pornhub.com/view_video.php?viewkey=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && extract()}
            />
          </div>
          <button className="tiny" onClick={paste} title="Read clipboard">
            Paste
          </button>
          <button className="primary" onClick={extract} disabled={loading || !url.trim()}>
            {loading ? <span className="spin" /> : null}
            {loading ? 'Extracting' : 'Extract'}
          </button>
        </div>

        <button className="toggle" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? '▾' : '▸'} Advanced (cookies)
        </button>

        {advanced && (
          <div style={{ marginTop: 8 }}>
            <textarea
              placeholder="document.cookie from the site — paste here if a video is age-gated, region-locked or blurred"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
            />
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="tiny" onClick={runChecks} disabled={checking}>
            {checking ? <span className="spin" /> : null}
            {checking ? 'Checking' : 'Run site checks'}
          </button>
        </div>

        {error && <div className="msg err">{error}</div>}
        {diag && <div className="msg diag">{diag}</div>}
      </div>

      {checks && (
        <div className="panel">
          <strong style={{ fontSize: 14 }}>Live parser checks</strong>
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Status</th>
                <th>Anchor</th>
                <th>Formats</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span
                      className={`dot ${c.status === 'ok' ? 'ok' : c.status === 'blocked' ? 'bad' : 'warn'}`}
                    />
                    {c.status}
                  </td>
                  <td>{c.status === 'ok' ? 'found' : c.status === 'blocked' ? '—' : 'check diagnostics'}</td>
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
              <img
                src={data.thumbnail}
                alt=""
                width={132}
                style={{ borderRadius: 10, border: '1px solid var(--border)' }}
              />
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

          {data.formats.map((f) => (
            <div className="fmt" key={f.url}>
              <span className="label">{f.label}</span>
              <span className={`badge ${f.kind}`}>{f.kind}</span>
              <span className="meta">
                {f.kind === 'mp4' ? humanSize(f.size) : 'adaptive'} · via {f.source}
              </span>
              <button className="tiny" onClick={() => play(f)}>
                {active?.url === f.url ? 'Playing' : 'Play'}
              </button>
              <button className="tiny" onClick={() => download(f)} disabled={merging === f.url}>
                {merging === f.url ? progress || 'Merging' : f.kind === 'hls' ? 'Merge + save' : 'Download'}
              </button>
              <button className="tiny" onClick={() => navigator.clipboard.writeText(f.url)}>
                Copy
              </button>
            </div>
          ))}
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