import { useState, useEffect } from 'react';

export default function CoverImage({ track, size = 96, className = '' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [track?.pic_id]);

  if (!track?.pic_id || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-400 ${className}`}
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }

  const params = new URLSearchParams({
    id: String(track.pic_id),
    source: track.source || 'kuwo',
    size: String(size),
    redirect: '1',
  });

  return (
    <img
      src={`/api/pic?${params.toString()}`}
      alt={track.name || 'cover'}
      className={`shrink-0 rounded-xl object-cover ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

