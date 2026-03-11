import { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlayerContext, NeteaseContext } from '../App';
import { api } from '../api';
import CoverImage from '../components/CoverImage';
import { parseLrc } from '../components/LyricsPanel';
import LyricsPanel from '../components/LyricsPanel';

const SOURCE_OPTIONS = [
  { value: 'kuwo', label: '酷我' },
  { value: 'netease', label: '网易云' },
  { value: 'joox', label: 'JOOX' },
];

export default function Home() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchSourceLabel, setSearchSourceLabel] = useState(null);
  const [playlistModal, setPlaylistModal] = useState(null);
  const [localPlaylists, setLocalPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [neteasePlaylistsHome, setNeteasePlaylistsHome] = useState([]);
  const [dailyRecs, setDailyRecs] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const queueItemRefs = useRef({});
  const [neteasePlaylistModal, setNeteasePlaylistModal] = useState(null);
  const [neteasePlaylistsAll, setNeteasePlaylistsAll] = useState([]);
  const [neteasePlaylistLoading, setNeteasePlaylistLoading] = useState(false);
  const [homePlaylistDetail, setHomePlaylistDetail] = useState(null);
  const [homePlaylistLoading, setHomePlaylistLoading] = useState(false);
  const [homePlaylistSearch, setHomePlaylistSearch] = useState('');
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [recentCollapsed, setRecentCollapsed] = useState(false);

  const {
    play,
    currentTrack,
    queue,
    setQueue,
    searchSource,
    setSearchSource,
    currentTime,
    lyric,
    addToQueue,
    addAllToQueue,
    removeFromQueue,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    recentTracks,
    playList,
  } = useContext(PlayerContext);

  const { neteaseUser } = useContext(NeteaseContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (!neteaseUser) {
      setNeteasePlaylistsHome([]);
      setDailyRecs([]);
      return;
    }

    api.get('/api/netease/playlist').then((res) => {
      const list = res.data?.playlist ?? res.data ?? [];
      setNeteasePlaylistsHome(Array.isArray(list) ? list.slice(0, 6) : []);
    }).catch(() => setNeteasePlaylistsHome([]));

    api.get('/api/netease/recommend/resource').then((res) => {
      const list = res.data?.recommend ?? res.data?.data ?? res.data ?? [];
      setDailyRecs(Array.isArray(list) ? list.slice(0, 6) : []);
    }).catch(() => setDailyRecs([]));
  }, [neteaseUser]);

  const doSearch = async (page = 1, append = false) => {
    if (!keyword.trim()) return;

    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setSelectedIds(new Set());
    }

    setSearchError('');

    try {
      const res = await api.get('/api/search', {
        params: { name: keyword.trim(), count: 30, source: searchSource, pages: page },
      });

      const list = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
      const validList = Array.isArray(list) ? list : [];

      setSearchSourceLabel(res.data?.source || searchSource);
      if (res.data?.error) setSearchError(res.data.error);

      if (append) setResults((prev) => [...prev, ...validList]);
      else setResults(validList);

      setSearchPage(page);
    } catch {
      if (!append) setResults([]);
      setSearchError('搜索失败，请稍后重试');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const search = async (e) => {
    e?.preventDefault();
    await doSearch(1, false);
  };

  const loadMore = async () => {
    if (loadingMore || !keyword.trim()) return;
    await doSearch(searchPage + 1, true);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTracks = useMemo(() => results.filter((t) => selectedIds.has(t.id)), [results, selectedIds]);
  const queueList = queue;
  const lyricLines = parseLrc(lyric?.lyric || '');
  const scrollToCurrent = () => {
    if (!currentTrack?.id) return;
    const el = queueItemRefs.current[currentTrack.id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleDragStart = (index) => setDragIndex(index);
  const handleDrop = (index) => {
    if (dragIndex == null || dragIndex === index) return;
    setQueue((prev) => {
      const list = [...prev];
      const [moved] = list.splice(dragIndex, 1);
      list.splice(index, 0, moved);
      return list;
    });
    setDragIndex(null);
  };
  const handleDragOver = (e) => e.preventDefault();
  const showToast = (message, tone = 'success') => {
    setToast({ message, tone });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  };
  const openAddToPlaylist = (tracks) => {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    setPlaylistModal(list);
    setNewPlaylistName('');

    api.get('/api/playlists').then((r) => setLocalPlaylists(Array.isArray(r.data) ? r.data : [])).catch(() => setLocalPlaylists([]));
  };

  const openAddToNeteasePlaylist = async (tracks) => {
    if (!neteaseUser) {
      showToast('请先登录网易云', 'info');
      return;
    }
    const list = Array.isArray(tracks) ? tracks : [tracks];
    const neteaseTracks = list.filter((t) => (t.source || searchSource) === 'netease');
    if (!neteaseTracks.length) {
      showToast('仅支持添加网易云来源歌曲', 'info');
      return;
    }
    setNeteasePlaylistModal(neteaseTracks);
    setNeteasePlaylistsAll([]);
    setNeteasePlaylistLoading(true);
    try {
      const res = await api.get('/api/netease/playlist');
      const pl = res.data?.playlist ?? res.data ?? [];
      setNeteasePlaylistsAll(Array.isArray(pl) ? pl : []);
    } catch {
      setNeteasePlaylistsAll([]);
    } finally {
      setNeteasePlaylistLoading(false);
    }
  };

  const addTracksToNeteasePlaylist = async (plId) => {
    if (!neteasePlaylistModal?.length) return;
    try {
      const trackIds = neteasePlaylistModal.map((t) => t.id);
      const res = await api.post('/api/netease/playlist/tracks', { pid: plId, tracks: trackIds });
      if (res.data?.code === 200) {
        const target = neteasePlaylistsAll.find((pl) => pl.id === plId);
        showToast(`已加入网易云歌单：${target?.name || '歌单'}`);
        setNeteasePlaylistModal(null);
      } else {
        showToast(res.data?.msg || '加入网易云歌单失败', 'error');
      }
    } catch {
      showToast('加入网易云歌单失败', 'error');
    }
  };

  const addTracksToPlaylist = async (plId) => {
    if (!playlistModal?.length) return;

    const tracks = playlistModal.map((t) => ({
      id: t.id,
      name: t.name,
      artist: t.artist,
      album: t.album,
      pic_id: t.pic_id,
      source: t.source || searchSource,
    }));

    try {
      await api.post(`/api/playlists/${plId}/tracks`, { tracks });
      setPlaylistModal(null);
      const target = localPlaylists.find((pl) => pl.id === plId);
      showToast(`已加入歌单：${target?.name || '歌单'}`);
    } catch {
      showToast('加入歌单失败', 'error');
    }
  };

  const createPlaylistAndAdd = async () => {
    if (!newPlaylistName.trim() || !playlistModal?.length) return;

    try {
      const res = await api.post('/api/playlists', { name: newPlaylistName.trim() });
      const pl = res.data;

      if (pl?.id) {
        await addTracksToPlaylist(pl.id);
        setNewPlaylistName('');
      }
    } catch {
      showToast('新建歌单失败', 'error');
    }
  };

  const openHomePlaylistDetail = async (pl) => {
    if (!pl?.id) return;
    setHomePlaylistDetail(null);
    setHomePlaylistLoading(true);
    setHomePlaylistSearch('');
    try {
      const res = await api.get('/api/netease/playlist/detail', { params: { id: pl.id } });
      const d = res.data?.playlist ?? res.data;
      setHomePlaylistDetail(d || null);
    } finally {
      setHomePlaylistLoading(false);
    }
  };

  const currentItem = currentTrack;

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
      <aside className="surface flex min-h-0 flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">正在播放</p>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">Now</span>
        </div>

        {currentTrack ? (
          <>
            <CoverImage track={currentTrack} size={220} className="h-56 w-full" />
            <p className="mt-3 truncate text-base font-semibold text-slate-800">{currentTrack.name}</p>
            <p className="truncate text-sm text-slate-500">
              {Array.isArray(currentTrack.artist) ? currentTrack.artist.join(' / ') : currentTrack.artist}
            </p>
          </>
        ) : (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-slate-400">请选择歌曲</div>
        )}

        {neteaseUser && neteasePlaylistsHome.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">网易云歌单</p>
              <Link to="/playlists" className="text-xs text-blue-600 hover:underline">查看更多</Link>
            </div>
            <div className="space-y-2">
              {neteasePlaylistsHome.slice(0, 3).map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => openHomePlaylistDetail(pl)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:border-blue-300"
                >
                  {pl.coverImgUrl ? (
                    <img src={pl.coverImgUrl} alt="" className="h-10 w-10 rounded-lg object-cover shadow-sm" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-400">?</div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-700">{pl.name}</p>
                    <p className="text-xs text-slate-400">{pl.trackCount ?? 0} 首</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {neteaseUser && dailyRecs.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">每日推荐</p>
              <span className="text-xs text-slate-400">网易云</span>
            </div>
            <div className="space-y-2">
              {dailyRecs.slice(0, 3).map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => openHomePlaylistDetail(pl)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:border-blue-300"
                >
                  {pl.picUrl || pl.coverImgUrl ? (
                    <img src={pl.picUrl || pl.coverImgUrl} alt="" className="h-10 w-10 rounded-lg object-cover shadow-sm" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-400">♪</div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-700">{pl.name}</p>
                    <p className="text-xs text-slate-400">{pl.copywriter || '每日推荐歌单'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <section className="surface flex min-h-0 flex-col">
        <div className="border-b border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">音乐搜索</h2>
              <p className="text-xs text-slate-500">多源聚合搜索，快速加入队列</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">来源：{SOURCE_OPTIONS.find((s) => s.value === searchSource)?.label}</div>
          </div>
          <form onSubmit={search} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索歌曲 / 歌手"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />

            <select value={searchSource} onChange={(e) => setSearchSource(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
              {loading ? '搜索中...' : '搜索'}
            </button>
          </form>
          {searchError && <p className="mt-2 text-sm text-amber-600">{searchError}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="sticky-bar mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">搜索结果 {searchSourceLabel ? <span className="text-blue-600">({searchSourceLabel})</span> : null}</h2>
            {results.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => selectedIds.size === results.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(results.map((t) => t.id)))}
                  className="btn-secondary py-1"
                >
                  {selectedIds.size === results.length ? '取消全选' : '全选'}
                </button>

                {selectedIds.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        addAllToQueue(selectedTracks);
                        setSelectedIds(new Set());
                        showToast(`已加入 ${selectedTracks.length} 首到队列`);
                      }}
                      className="btn-primary py-1"
                    >
                      加入队列 ({selectedIds.size})
                    </button>
                    <button type="button" onClick={() => openAddToPlaylist(selectedTracks)} className="btn-secondary py-1">加入歌单 ({selectedIds.size})</button>
                    {neteaseUser && (
                      <button type="button" onClick={() => openAddToNeteasePlaylist(selectedTracks)} className="btn-secondary py-1">加入网易云歌单</button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    addAllToQueue(results);
                    showToast(`已加入 ${results.length} 首到队列`);
                  }}
                  className="btn-secondary py-1"
                >
                  全部加入队列
                </button>
              </div>
            )}
          </div>

          <ul className="space-y-2">
            {results.map((track, idx) => {
              const checked = selectedIds.has(track.id);
              const current = currentTrack?.id === track.id;

              return (
                <li key={`${track.id}-${idx}`} className={`group flex items-center gap-3 rounded-xl border p-2 transition ${current ? 'border-blue-300 bg-blue-50' : checked ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSelect(track.id)} className="h-4 w-4" />
                  <span className="w-5 text-center text-xs text-slate-400">{idx + 1}</span>
                  <CoverImage track={track} size={44} className="h-11 w-11" />

                  <button type="button" onClick={() => play(track, true)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-slate-800">{track.name}</p>
                    <p className="truncate text-xs text-slate-500">{Array.isArray(track.artist) ? track.artist.join(' / ') : track.artist}</p>
                  </button>

                  <div className="flex items-center gap-1 opacity-90 transition group-hover:opacity-100">
                    <button type="button" onClick={() => { addToQueue(track); showToast('已加入队列'); }} className="btn-secondary py-1 text-xs">加队列</button>
                    <button type="button" onClick={() => openAddToPlaylist(track)} className="btn-secondary py-1 text-xs">加歌单</button>
                    {neteaseUser && (track.source || searchSource) === 'netease' && (
                      <button type="button" onClick={() => openAddToNeteasePlaylist(track)} className="btn-secondary py-1 text-xs">加网易云</button>
                    )}
                    <button
                      type="button"
                      onClick={() => { if (isFavorite(track.id)) { removeFromFavorites(track.id); showToast('已取消收藏', 'info'); } else { addToFavorites(track); showToast('已加入收藏'); } }}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ${isFavorite(track.id) ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
                    >
                      收藏
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {results.length > 0 && (
            <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-secondary mt-3 w-full">
              {loadingMore ? '加载中...' : '加载更多'}
            </button>
          )}

          {!loading && results.length === 0 && <p className="py-10 text-center text-sm text-slate-500">暂无搜索结果</p>}
        </div>

        <div className={`queue-panel border-t border-slate-200 p-4 ${queueCollapsed ? 'is-collapsed' : ''}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700">播放队列 ({queueList.length})</h3>
              <button type="button" onClick={() => setQueueCollapsed((v) => !v)} className="text-xs text-slate-500 hover:text-blue-600">
                {queueCollapsed ? '展开' : '收起'}
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {currentItem && (
                <button type="button" onClick={scrollToCurrent} className="text-xs text-blue-600 hover:underline">定位当前</button>
              )}
              {queueList.length > 0 && <button type="button" onClick={() => setQueue([])} className="text-xs text-rose-500 hover:underline">清空</button>}
            </div>
          </div>

          {!queueCollapsed && currentItem && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5">
              <span className="text-xs text-blue-600">正在播放</span>
              <p className="truncate text-sm font-semibold text-blue-700">{currentItem.name}</p>
            </div>
          )}

          {!queueCollapsed && (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {queueList.map((track, idx) => (
                <li
                  key={`${track.id}-q-${idx}`}
                  ref={(el) => {
                    if (el) queueItemRefs.current[track.id] = el;
                    else delete queueItemRefs.current[track.id];
                  }}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(idx)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:border hover:border-blue-200 ${currentTrack?.id === track.id ? 'border border-blue-200 bg-blue-50' : 'bg-slate-50'}`}
                >
                  <span className="cursor-grab text-xs text-slate-400">拖</span>
                  <span className="w-5 text-xs text-slate-400">{idx + 1}</span>
                  <button type="button" onClick={() => play(track)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm text-slate-700">{track.name}</p>
                  </button>
                  <button type="button" onClick={() => removeFromQueue(track.id)} className="text-xs text-rose-500 hover:underline">移除</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`border-t border-slate-200 p-4 ${recentCollapsed ? 'is-collapsed' : ''}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-700">最近播放</h3>
              <button type="button" onClick={() => setRecentCollapsed((v) => !v)} className="text-xs text-slate-500 hover:text-blue-600">
                {recentCollapsed ? '展开' : '收起'}
              </button>
            </div>
            {recentTracks?.length > 0 && <span className="text-xs text-slate-400">{recentTracks.length} 首</span>}
          </div>
          {!recentCollapsed && (!recentTracks || recentTracks.length === 0) ? (
            <p className="text-sm text-slate-500">暂无最近播放</p>
          ) : !recentCollapsed ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {recentTracks.slice(0, 10).map((track, idx) => (
                <li key={`${track.id}-r-${idx}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                  <span className="w-5 text-xs text-slate-400">{idx + 1}</span>
                  <button type="button" onClick={() => play(track)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm text-slate-700">{track.name}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <aside className="surface min-h-0 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">歌词</div>
        <LyricsPanel lines={lyricLines} currentTime={currentTime ?? 0} className="h-[calc(100%-44px)]" />
      </aside>

      {playlistModal && playlistModal.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setPlaylistModal(null)}>
          <div className="surface w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-slate-800">加入歌单</h3>

            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="新歌单名称"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800"
              />
              <button type="button" onClick={createPlaylistAndAdd} disabled={!newPlaylistName.trim()} className="btn-primary disabled:opacity-50">新建</button>
            </div>

            <p className="mb-2 text-xs text-slate-500">已有歌单</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {localPlaylists.map((pl) => (
                <li key={pl.id}>
                  <button type="button" onClick={() => addTracksToPlaylist(pl.id)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:border-blue-300">
                    {pl.name} <span className="text-slate-400">({pl.tracks?.length ?? 0})</span>
                  </button>
                </li>
              ))}
            </ul>

            <button type="button" onClick={() => setPlaylistModal(null)} className="btn-secondary mt-4 w-full">关闭</button>
          </div>
        </div>
      )}

      {neteasePlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setNeteasePlaylistModal(null)}>
          <div className="surface w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-slate-800">加入网易云歌单</h3>
            {neteasePlaylistLoading ? (
              <p className="text-sm text-slate-500">正在加载歌单...</p>
            ) : neteasePlaylistsAll.length === 0 ? (
              <p className="text-sm text-slate-500">暂无网易云歌单</p>
            ) : (
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {neteasePlaylistsAll.map((pl) => (
                  <li key={pl.id}>
                    <button type="button" onClick={() => addTracksToNeteasePlaylist(pl.id)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:border-blue-300">
                      {pl.name} <span className="text-slate-400">({pl.trackCount ?? 0})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" onClick={() => setNeteasePlaylistModal(null)} className="btn-secondary mt-4 w-full">关闭</button>
          </div>
        </div>
      )}

      {homePlaylistDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setHomePlaylistDetail(null)}>
          <div className="surface max-h-[80vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4 border-b border-slate-200 p-4">
              {homePlaylistDetail.coverImgUrl ? (
                <img src={homePlaylistDetail.coverImgUrl} alt="" className="h-20 w-20 rounded-xl object-cover shadow-sm" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-400">♪</div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-slate-800">{homePlaylistDetail.name}</h2>
                <p className="mt-1 text-xs text-slate-500">{homePlaylistDetail.description || '网易云歌单'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>曲目 {homePlaylistDetail.trackCount ?? '-'}</span>
                  <span>收藏 {homePlaylistDetail.subscribedCount ?? '-'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const list = (homePlaylistDetail.tracks || []).map((t) => {
                      const track = t.track || t;
                      return {
                        id: track.id,
                        name: track.name,
                        artist: track.ar?.map((a) => a.name) || track.artists?.map((a) => a.name) || [],
                        pic_id: track.al?.pic_str || track.al?.pic,
                        source: 'netease',
                      };
                    });
                    if (list.length) playList(list);
                  }}
                  className="btn-primary py-1 text-sm"
                >
                  全部播放
                </button>
                <button type="button" onClick={() => setHomePlaylistDetail(null)} className="btn-secondary py-1 text-sm">关闭</button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {homePlaylistLoading ? (
                <p className="text-sm text-slate-500">加载详情中...</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={homePlaylistSearch}
                      onChange={(e) => setHomePlaylistSearch(e.target.value)}
                      placeholder="歌单内搜索（歌名 / 歌手）"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    />
                    {homePlaylistSearch && (
                      <button type="button" onClick={() => setHomePlaylistSearch('')} className="btn-secondary py-1 text-xs">清空</button>
                    )}
                    <button type="button" onClick={() => navigate('/playlists')} className="btn-secondary py-1 text-xs">去歌单页</button>
                  </div>

                  <ul className="space-y-2">
                    {(homePlaylistDetail.tracks || []).filter((t) => {
                      if (!homePlaylistSearch.trim()) return true;
                      const track = t.track || t;
                      const name = String(track.name || '').toLowerCase();
                      const artists = (track.ar || track.artists || []).map((a) => a.name).join(' / ').toLowerCase();
                      const key = homePlaylistSearch.trim().toLowerCase();
                      return name.includes(key) || artists.includes(key);
                    }).map((t, i) => {
                      const track = t.track || t;
                      const item = {
                        id: track.id,
                        name: track.name,
                        artist: track.ar?.map((a) => a.name) || track.artists?.map((a) => a.name) || [],
                        pic_id: track.al?.pic_str || track.al?.pic,
                        source: 'netease',
                      };
                      return (
                        <li key={track.id || i}>
                          <button type="button" onClick={() => play(item, true)} className="flex w-full items-center gap-3 rounded-lg bg-slate-50 px-2 py-2 text-left">
                            <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-slate-800">{track.name}</p>
                              <p className="truncate text-xs text-slate-500">{(track.ar || track.artists || []).map((a) => a.name).filter(Boolean).join(' / ') || '-'}</p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.tone || 'success'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
