import { useState, useCallback, createContext, useMemo, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Playlists from './pages/Playlists';
import Login from './pages/Login';
import Account from './pages/Account';
import PlayerBar from './components/PlayerBar';
import { api } from './api';

export const PlayerContext = createContext(null);
export const NeteaseContext = createContext(null);

function App() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playHistory, setPlayHistory] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [playMode, setPlayMode] = useState('order'); // order | shuffle | repeat-one

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState(null);
  const [playUrl, setPlayUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [playError, setPlayError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [lyric, setLyric] = useState({ lyric: '', tlyric: '' });
  const [searchSource, setSearchSource] = useState('kuwo');
  const [quality, setQuality] = useState(320);
  const [neteaseUser, setNeteaseUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const resumeTimeRef = useRef(null);
  const resumeAutoPlayRef = useRef(false);

  const restoreNeteaseSession = useCallback(async () => {
    try {
      const cookie = localStorage.getItem('neteaseCookie');
      if (!cookie) return false;
      const res = await api.post('/api/netease/session/restore', { cookie });
      const data = res.data?.data ?? res.data;
      if (data?.account?.id || data?.profile?.userId) {
        const nextUser = {
          ...data.account,
          ...data.profile,
          nickname: data.profile?.nickname || data.account?.userName,
          avatarUrl: data.profile?.avatarUrl || '',
        };
        setNeteaseUser(nextUser);
        try {
          localStorage.setItem('neteaseUser', JSON.stringify(nextUser));
          localStorage.setItem('neteaseLoginAt', String(Date.now()));
        } catch {}
        return true;
      }
    } catch {}
    return false;
  }, []);

  const refreshNetease = useCallback(async () => {
    try {
      const res = await api.get('/api/netease/login/status');
      const data = res.data?.data ?? res.data;
      if (data?.account?.id || data?.profile?.userId) {
        const nextUser = {
          ...data.account,
          ...data.profile,
          nickname: data.profile?.nickname || data.account?.userName,
        };
        setNeteaseUser(nextUser);
        try {
          localStorage.setItem('neteaseUser', JSON.stringify(nextUser));
          localStorage.setItem('neteaseLoginAt', String(Date.now()));
        } catch {}
        return;
      }
      try {
        const accountRes = await api.get('/api/netease/user/account');
        const profile = accountRes.data?.profile || null;
        const account = accountRes.data?.account || null;
        if (profile || account) {
          const nextUser = {
            ...account,
            ...profile,
            nickname: profile?.nickname || account?.userName || '网易云用户',
            avatarUrl: profile?.avatarUrl || '',
          };
          setNeteaseUser(nextUser);
          try {
            localStorage.setItem('neteaseUser', JSON.stringify(nextUser));
            localStorage.setItem('neteaseLoginAt', String(Date.now()));
          } catch {}
          return;
        }
      } catch {}
      try {
        const cached = localStorage.getItem('neteaseUser');
        const ts = Number(localStorage.getItem('neteaseLoginAt') || 0);
        if (cached && Date.now() - ts < 10 * 60 * 1000) {
          setNeteaseUser(JSON.parse(cached));
          return;
        }
      } catch {}
      setNeteaseUser(null);
      try {
        localStorage.removeItem('neteaseUser');
        localStorage.removeItem('neteaseLoginAt');
      } catch {}
    } catch {
      try {
        const cached = localStorage.getItem('neteaseUser');
        const ts = Number(localStorage.getItem('neteaseLoginAt') || 0);
        if (cached && Date.now() - ts < 10 * 60 * 1000) {
          setNeteaseUser(JSON.parse(cached));
          return;
        }
      } catch {}
      setNeteaseUser(null);
      try {
        localStorage.removeItem('neteaseUser');
        localStorage.removeItem('neteaseLoginAt');
      } catch {}
    }
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('neteaseUser');
      if (cached) setNeteaseUser(JSON.parse(cached));
    } catch {}
    (async () => {
      await restoreNeteaseSession();
      refreshNetease();
    })();
  }, [refreshNetease, restoreNeteaseSession]);

  useEffect(() => {
    setSyncLoaded(false);
    api.get('/api/sync').then((res) => {
      const q = res.data?.queue;
      const f = res.data?.favorites;
      const lastTrack = res.data?.lastTrack;
      const lastTime = res.data?.lastTime;
      const savedMode = res.data?.playMode;
      const recent = res.data?.recent;
      if (Array.isArray(q)) setQueue(q);
      if (Array.isArray(f)) setFavorites(f);
      if (Array.isArray(recent)) setRecentTracks(recent);
      if (savedMode) setPlayMode(savedMode);
      if (lastTrack?.id && Number.isFinite(lastTime) && lastTime > 1) {
        resumeTimeRef.current = lastTime;
        resumeAutoPlayRef.current = true;
        play(lastTrack, false, { recordHistory: false, resumeTime: lastTime });
      }
      setSyncLoaded(true);
    }).catch(() => setSyncLoaded(true));
  }, [neteaseUser?.id ?? neteaseUser?.userId]);

  useEffect(() => {
    if (!syncLoaded) return;
    const timer = setTimeout(() => {
      api.post('/api/sync', { queue, favorites, playMode, recent: recentTracks }).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [syncLoaded, queue, favorites, playMode, recentTracks]);

  useEffect(() => {
    if (!audioRef || !playUrl) return;
    if (resumeTimeRef.current == null) return;
    const target = resumeTimeRef.current;
    audioRef.currentTime = target;
    setCurrentTime(target);
    if (resumeAutoPlayRef.current) {
      audioRef.play().catch(() => {});
      setIsPlaying(true);
    }
    resumeTimeRef.current = null;
    resumeAutoPlayRef.current = false;
  }, [audioRef, playUrl]);

  const setVolume = useCallback((v) => setVolumeState(Math.max(0, Math.min(1, v))), []);

  const play = useCallback(async (track, appendToQueue = false, meta = {}) => {
    if (!track?.id) return;
    setPlayError('');

    const shouldRecordHistory = meta.recordHistory !== false;
    if (shouldRecordHistory && currentTrack?.id && currentTrack.id !== track.id) {
      setPlayHistory((prev) => [...prev, currentTrack].slice(-100));
    }

    setQueue((prev) => (prev.some((t) => t.id === track.id) ? prev : [...prev, track]));

    if (appendToQueue && currentTrack?.id !== track.id) {
      setQueue((prev) => (prev.some((t) => t.id === track.id) ? prev : [...prev, track]));
    }

    setCurrentTrack(track);
    setPlayUrl('');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLyric({ lyric: '', tlyric: '' });
    setLoadingUrl(true);
    if (meta?.resumeTime != null) {
      resumeTimeRef.current = meta.resumeTime;
      resumeAutoPlayRef.current = meta.autoPlay !== false;
    }

    setRecentTracks((prev) => {
      const next = [track, ...prev.filter((t) => t.id !== track.id)];
      return next.slice(0, 50);
    });

    try {
      const res = await api.get('/api/url', {
        params: { id: track.id, source: track.source || 'kuwo', br: quality },
      });

      const url = res.data?.url;
      if (url) {
        setPlayUrl(url);
        setIsPlaying(true);
      } else {
        setPlayError('无法获取播放链接');
      }

      api.get('/api/lyric', { params: { id: track.id, source: track.source || 'kuwo' } }).then((r) => {
        const d = r.data;
        setLyric({ lyric: d?.lyric || '', tlyric: d?.tlyric || '' });
      }).catch(() => {});
    } catch {
      setPlayError('播放失败，请稍后重试');
    } finally {
      setLoadingUrl(false);
    }
  }, [currentTrack, quality]);

  const getQueueIndex = useCallback((id) => queue.findIndex((t) => t?.id === id), [queue]);

  const playNext = useCallback(() => {
    if (!currentTrack?.id) return;

    if (playMode === 'repeat-one') {
      if (audioRef) {
        audioRef.currentTime = 0;
        audioRef.play().catch(() => {});
        setCurrentTime(0);
        setIsPlaying(true);
      } else {
        play(currentTrack, false, { recordHistory: false });
      }
      return;
    }

    if (!queue.length) {
      setIsPlaying(false);
      return;
    }

    if (playMode === 'shuffle') {
      const candidates = queue.filter((t) => t.id !== currentTrack.id);
      if (!candidates.length) return;
      const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
      play(nextTrack, false, { recordHistory: true });
      return;
    }

    const idx = getQueueIndex(currentTrack.id);
    if (idx >= 0 && idx < queue.length - 1) {
      play(queue[idx + 1], false, { recordHistory: true });
    } else {
      setIsPlaying(false);
    }
  }, [audioRef, currentTrack, getQueueIndex, play, playMode, queue]);

  const playPrev = useCallback(() => {
    if (audioRef && currentTime > 5) {
      audioRef.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    setPlayHistory((prev) => {
      if (prev.length) {
        const lastTrack = prev[prev.length - 1];
        const rest = prev.slice(0, -1);
        play(lastTrack, false, { recordHistory: false });
        return rest;
      }
      const idx = currentTrack?.id ? getQueueIndex(currentTrack.id) : -1;
      if (idx > 0) play(queue[idx - 1], false, { recordHistory: false });
      return prev;
    });
  }, [audioRef, currentTime, currentTrack?.id, getQueueIndex, play, queue]);

  const handleTrackEnded = useCallback(() => {
    playNext();
  }, [playNext]);

  const addToQueue = useCallback((track) => {
    if (!track?.id) return;
    setQueue((prev) => (prev.some((t) => t.id === track.id) ? prev : [...prev, track]));
  }, []);

  const addAllToQueue = useCallback((tracks) => {
    const list = Array.isArray(tracks) ? tracks : [];
    if (!list.length) return;
    setQueue((prev) => {
      const ids = new Set(prev.map((t) => t.id));
      const toAdd = list.filter((t) => t?.id && !ids.has(t.id));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, []);

  const removeFromQueue = useCallback((trackId) => {
    setQueue((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  const playList = useCallback((tracks) => {
    const list = Array.isArray(tracks) ? tracks.filter((t) => t?.id) : [];
    if (!list.length) return;
    setQueue(list);
    play(list[0], false, { recordHistory: true });
  }, [play]);

  const addToFavorites = useCallback((track) => {
    if (!track?.id) return;
    setFavorites((prev) => (prev.some((t) => t.id === track.id) ? prev : [...prev, track]));
  }, []);

  const removeFromFavorites = useCallback((trackId) => {
    setFavorites((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  const isFavorite = useCallback((trackId) => favorites.some((t) => t.id === trackId), [favorites]);

  const addToNeteaseLike = useCallback(async (trackId) => {
    const res = await api.post('/api/netease/like', { id: trackId, like: true });
    return res.data;
  }, []);

  const playerValue = useMemo(() => ({
    currentTrack,
    setCurrentTrack,
    queue,
    setQueue,
    playHistory,
    recentTracks,
    playMode,
    setPlayMode,
    isPlaying,
    setIsPlaying,
    playUrl,
    setPlayUrl,
    loadingUrl,
    playError,
    setPlayError,
    play,
    audioRef,
    setAudioRef,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    volume,
    setVolume,
    lyric,
    searchSource,
    setSearchSource,
    quality,
    setQuality,
    playNext,
    playPrev,
    handleTrackEnded,
    addToQueue,
    addAllToQueue,
    removeFromQueue,
    playList,
    favorites,
    setFavorites,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
  }), [
    currentTrack,
    queue,
    playHistory,
    recentTracks,
    playMode,
    isPlaying,
    playUrl,
    loadingUrl,
    playError,
    play,
    audioRef,
    currentTime,
    duration,
    volume,
    lyric,
    searchSource,
    quality,
    playNext,
    playPrev,
    handleTrackEnded,
    addToQueue,
    addAllToQueue,
    removeFromQueue,
    playList,
    favorites,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
  ]);

  const neteaseValue = useMemo(() => ({
    neteaseUser,
    setNeteaseUser,
    playlists,
    setPlaylists,
    addToNeteaseLike,
  }), [neteaseUser, playlists, addToNeteaseLike]);

  useEffect(() => {
    if (!syncLoaded || !currentTrack?.id) return;
    const saveState = (time) => {
      api.post('/api/sync', { lastTrack: currentTrack, lastTime: time, playMode, recent: recentTracks }).catch(() => {});
    };
    if (isPlaying) {
      const id = setInterval(() => {
        const t = audioRef?.currentTime ?? currentTime;
        if (Number.isFinite(t)) saveState(t);
      }, 5000);
      return () => clearInterval(id);
    }
    if (currentTime > 1) saveState(currentTime);
  }, [syncLoaded, currentTrack?.id, currentTime, isPlaying, playMode, audioRef, recentTracks]);

  return (
    <PlayerContext.Provider value={playerValue}>
      <NeteaseContext.Provider value={neteaseValue}>
        <BrowserRouter>
          <div className="app-shell">
            <header className="app-header">
              <div className="app-header-inner">
                <NavLink to="/" className="brand">Nianyu</NavLink>
                <nav className="top-nav">
                  <NavLink to="/" className={({ isActive }) => (isActive ? 'top-nav-link top-nav-link-active' : 'top-nav-link')}>
                    首页
                  </NavLink>
                  <NavLink to="/playlists" className={({ isActive }) => (isActive ? 'top-nav-link top-nav-link-active' : 'top-nav-link')}>
                    歌单
                  </NavLink>
                  <NavLink to="/account" className={({ isActive }) => (isActive ? 'top-nav-link top-nav-link-active' : 'top-nav-link')}>
                    账号
                  </NavLink>
                  {neteaseUser ? (
                    <NavLink to="/account" className="account-chip">
                      <span className="account-avatar">
                        {neteaseUser.avatarUrl ? (
                          <img src={neteaseUser.avatarUrl} alt="" />
                        ) : (
                          <span>{(neteaseUser.nickname || '云').slice(0, 1)}</span>
                        )}
                      </span>
                      <span className="account-meta">
                        <span className="account-name">{neteaseUser.nickname || '网易云用户'}</span>
                        <span className="account-bind is-bound">网易云已登录</span>
                      </span>
                    </NavLink>
                  ) : (
                    <NavLink to="/login" className="top-nav-cta">登录网易云</NavLink>
                  )}
                </nav>
              </div>
            </header>

            <main className="app-main">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/login" element={<Login onLogin={setNeteaseUser} onNeteaseRefresh={refreshNetease} />} />
                <Route path="/account" element={<Account onNeteaseRefresh={refreshNetease} />} />
              </Routes>
            </main>

            <PlayerBar />
          </div>
        </BrowserRouter>
      </NeteaseContext.Provider>
    </PlayerContext.Provider>
  );
}

export default App;
