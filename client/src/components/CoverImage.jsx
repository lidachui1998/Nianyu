import { useState, useEffect } from 'react';

export default function CoverImage({ track, size = 96, className = '' }) {
  const [failed, setFailed] = useState(false);
  const directUrl = track?.picUrl || track?.coverUrl || (typeof track?.pic_id === 'string' && /^https?:\/\//i.test(track.pic_id) ? track.pic_id : '');

  useEffect(() => {
    setFailed(false);
  }, [track?.pic_id, track?.picUrl, track?.coverUrl]);

  if ((!track?.pic_id && !directUrl) || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-400 ${className}`}
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }

  const src = directUrl
    ? directUrl
    : `/api/pic?${new URLSearchParams({
      id: String(track.pic_id),
      source: track.source || 'kuwo',
      size: String(size),
      redirect: '1',
    }).toString()}`;

  return (
    <img
      src={src}
      alt={track.name || 'cover'}
      className={`shrink-0 rounded-xl object-cover ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

