import { useRef, useEffect, useMemo } from 'react';

export function parseLrc(lrcStr) {
  if (!lrcStr || typeof lrcStr !== 'string') return [];

  const lines = lrcStr.split(/\r?\n/);
  const out = [];
  const timeTag = /^\[(\d+):(\d+)\.?([\d]*)\]\s*(.*)$/;

  for (const line of lines) {
    const m = line.match(timeTag);
    if (!m) continue;

    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const ms = (m[3] || '0').padEnd(3, '0').slice(0, 3);
    const time = min * 60 + sec + parseInt(ms, 10) / 1000;
    out.push({ time, text: m[4].trim() });
  }

  out.sort((a, b) => a.time - b.time);
  return out;
}

export default function LyricsPanel({ lines, currentTime, className = '' }) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);
  const lastScrolledIndexRef = useRef(-1);

  const currentIndex = useMemo(() => {
    let i = 0;
    for (let j = 0; j < lines.length; j += 1) {
      if (lines[j].time <= currentTime) i = j;
    }
    return i;
  }, [lines, currentTime]);

  useEffect(() => {
    lastScrolledIndexRef.current = -1;
  }, [lines.length]);

  useEffect(() => {
    if (currentIndex === lastScrolledIndexRef.current) return;
    lastScrolledIndexRef.current = currentIndex;

    const active = activeRef.current;
    const container = containerRef.current;
    if (!active || !container) return;

    const offset = active.offsetTop - container.clientHeight / 2 + active.getBoundingClientRect().height / 2;
    container.scrollTo({ top: Math.max(0, offset - 30), behavior: 'smooth' });
  }, [currentIndex]);

  if (!lines.length) {
    return (
      <div className={`flex h-full items-center justify-center px-4 text-sm text-slate-500 ${className}`}>
        暂无歌词
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`h-full overflow-y-auto py-6 ${className}`}>
      <div className="space-y-3 px-4">
        {lines.map((line, i) => (
          <p
            key={`${line.time}-${i}`}
            ref={i === currentIndex ? activeRef : null}
            className={`text-center text-sm transition-all duration-300 ${
              i === currentIndex
                ? 'scale-105 font-semibold text-blue-600'
                : 'text-slate-500'
            }`}
          >
            {line.text || ' '}
          </p>
        ))}
      </div>
    </div>
  );
}

