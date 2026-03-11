import { useContext, useRef, useEffect, useState } from 'react';
import { PlayerContext } from '../App';
import CoverImage from './CoverImage';

function formatTime(s) {
  if (!s || Number.isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatArtists(artist) {
  if (!artist) return '未知歌手';
  if (Array.isArray(artist)) {
    const names = artist
      .map((a) => (typeof a === 'string' ? a : a?.name || a?.artist || ''))
      .filter(Boolean);
    return names.length ? names.join(' / ') : '未知歌手';
  }
  if (typeof artist === 'object') return artist.name || artist.artist || '未知歌手';
  return String(artist);
}

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    playUrl,
    loadingUrl,
    playError,
    setPlayError,
    setAudioRef,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    volume,
    setVolume,
    quality,
    setQuality,
    playMode,
    setPlayMode,
    playNext,
    playPrev,
    handleTrackEnded,
  } = useContext(PlayerContext);

  const audio = useRef(null);
  const seekRef = useRef(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const [hoverTime, setHoverTime] = useState(0);
  const [hoverX, setHoverX] = useState(0);
  const [showHover, setShowHover] = useState(false);

  useEffect(() => {
    setAudioRef(audio.current);
    return () => setAudioRef(null);
  }, [setAudioRef]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!isSeeking) setSeekTime(currentTime || 0);
  }, [currentTime, isSeeking]);

  useEffect(() => {
    const el = audio.current;
    if (!el || !playUrl || !isPlaying) return;

    const onCanPlay = () => {
      setPlayError?.('');
      el.play().catch(() => {});
    };
    el.addEventListener('canplay', onCanPlay);
    return () => el.removeEventListener('canplay', onCanPlay);
  }, [playUrl, isPlaying]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;

    const onTimeUpdate = () => {
      if (!isSeeking) setCurrentTime(el.currentTime);
    };
    const onDurationChange = () => setDuration(el.duration);
    const onEnded = () => {
      setIsPlaying(false);
      handleTrackEnded();
    };
    const onPlay = () => setIsPlaying(true);
    const onPlaying = () => setPlayError?.('');
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      setIsPlaying(false);
      setPlayError?.('播放失败');
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('ended', onEnded);
    el.addEventListener('play', onPlay);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onError);
    };
  }, [isSeeking, setCurrentTime, setDuration, setIsPlaying, setPlayError, handleTrackEnded]);

  const handleSeekChange = (value) => {
    const el = audio.current;
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;

    setIsSeeking(true);
    setSeekTime(nextTime);
    if (el) {
      el.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
  };

  const handleSeekCommit = () => {
    const el = audio.current;
    if (!el || !Number.isFinite(seekTime)) return;
    el.currentTime = seekTime;
    setCurrentTime(seekTime);
    setIsSeeking(false);
  };

  const updateHover = (clientX) => {
    const el = seekRef.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = ratio * duration;
    setHoverTime(time);
    setHoverX(ratio * 100);
    setShowHover(true);
  };

  const handleDownload = () => {
    if (!playUrl || !currentTrack?.name) return;

    const artistText = formatArtists(currentTrack.artist).replace(/\s+/g, ' ').trim();
    const name = `${currentTrack.name}-${artistText}`.replace(/[/\\?*:|"]/g, '_');

    const url = `/api/download?url=${encodeURIComponent(playUrl)}&name=${encodeURIComponent(name)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.mp3`;
    a.click();
  };

  const audioSrc = !playUrl ? '' : playUrl.startsWith('http') ? `/api/stream?url=${encodeURIComponent(playUrl)}` : playUrl;

  return (
    <>
      <audio ref={audio} src={audioSrc} />

      <div className="m-3 mt-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="mb-2 flex items-center gap-2">
          <span className="w-12 text-center text-xs text-slate-500">{formatTime(isSeeking ? seekTime : currentTime)}</span>
          <div className="relative flex-1">
            {showHover && duration > 0 && (
              <div
                className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow"
                style={{ left: `${hoverX}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={duration ? (isSeeking ? seekTime : currentTime) : 0}
            onMouseDown={() => setIsSeeking(true)}
            onTouchStart={() => setIsSeeking(true)}
            onChange={(e) => handleSeekChange(e.target.value)}
            onInput={(e) => handleSeekChange(e.currentTarget.value)}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            onMouseMove={(e) => updateHover(e.clientX)}
            onMouseLeave={() => setShowHover(false)}
            onTouchMove={(e) => updateHover(e.touches[0]?.clientX || 0)}
            className="h-1.5 w-full cursor-pointer accent-blue-500"
          />
          </div>
          <span className="w-12 text-center text-xs text-slate-500">{formatTime(duration)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {currentTrack ? (
              <>
                <CoverImage track={currentTrack} size={44} className="h-11 w-11" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{currentTrack.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {formatArtists(currentTrack.artist)}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">暂无播放歌曲</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={playPrev} className="btn-secondary p-2" title="上一首">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>

            <button
              type="button"
              onClick={() => {
                if (audio.current) {
                  if (isPlaying) audio.current.pause();
                  else audio.current.play();
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            <button type="button" onClick={playNext} className="btn-secondary p-2" title="下一首">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>

          {loadingUrl && <span className="text-xs text-slate-500">加载中...</span>}
          {!loadingUrl && playError && <span className="text-xs text-rose-500">{playError}</span>}

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setPlayMode('order')}
              className={`rounded px-2 py-1 ${playMode === 'order' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              顺序
            </button>
            <button
              type="button"
              onClick={() => setPlayMode('shuffle')}
              className={`rounded px-2 py-1 ${playMode === 'shuffle' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              随机
            </button>
            <button
              type="button"
              onClick={() => setPlayMode('repeat-one')}
              className={`rounded px-2 py-1 ${playMode === 'repeat-one' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              单曲
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setQualityOpen((o) => !o)}
              className="btn-secondary py-1 text-xs"
            >
              音质 {quality}k
            </button>

            {qualityOpen && (
              <ul className="absolute bottom-full right-0 mb-2 min-w-28 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {[128, 192, 320].map((br) => (
                  <li key={br}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuality(br);
                        setQualityOpen(false);
                      }}
                      className="w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                    >
                      {br}k {quality === br ? '✓' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex w-24 items-center gap-2">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3z" />
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="h-1 w-full cursor-pointer accent-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!playUrl || !currentTrack}
            className="btn-secondary py-1 text-xs disabled:opacity-40"
          >
            下载
          </button>
        </div>
      </div>
    </>
  );
}
