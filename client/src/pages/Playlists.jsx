import { useState, useEffect, useContext } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PlayerContext, NeteaseContext } from '../App';
import { api } from '../api';
import CoverImage from '../components/CoverImage';

export default function Playlists() {
  const [neteasePlaylists, setNeteasePlaylists] = useState([]);
  const [localPlaylists, setLocalPlaylists] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailType, setDetailType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');
  const location = useLocation();

  const { neteaseUser, setPlaylists: setCtxPlaylists } = useContext(NeteaseContext);
  const { play, playList, favorites, addAllToQueue, removeFromFavorites } = useContext(PlayerContext);

  useEffect(() => {
    api.get('/api/playlists').then((r) => setLocalPlaylists(Array.isArray(r.data) ? r.data : [])).catch(() => setLocalPlaylists([]));
  }, []);

  useEffect(() => {
    if (!neteaseUser) {
      setNeteasePlaylists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.get('/api/netease/playlist').then((res) => {
      const list = res.data?.playlist ?? res.data ?? [];
      const valid = Array.isArray(list) ? list : [];
      setNeteasePlaylists(valid);
      setCtxPlaylists(valid);
    }).catch(() => setNeteasePlaylists([])).finally(() => setLoading(false));
  }, [neteaseUser, setCtxPlaylists]);

  const openNeteaseDetail = (pl) => {
    setDetail(null);
    setDetailType('netease');
    setDetailLoading(true);
    setDetailSearch('');

    api.get('/api/netease/playlist/detail', { params: { id: pl.id } }).then((res) => {
      const d = res.data?.playlist ?? res.data;
      setDetail(d || null);
    }).finally(() => setDetailLoading(false));
  };

  const openNeteaseDetailById = (id) => {
    if (!id) return;
    setDetail(null);
    setDetailType('netease');
    setDetailLoading(true);
    setDetailSearch('');
    api.get('/api/netease/playlist/detail', { params: { id } }).then((res) => {
      const d = res.data?.playlist ?? res.data;
      setDetail(d || null);
    }).finally(() => setDetailLoading(false));
  };

  const openLocalDetail = (pl) => {
    setDetailType('local');
    setDetailLoading(true);

    api.get(`/api/playlists/${pl.id}`).then((res) => {
      if (res.data && res.status === 200) setDetail(res.data);
    }).catch(() => {}).finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailType(null);
    setDetailSearch('');
  };

  useEffect(() => {
    const state = location.state || {};
    if (!state.openPlaylistId || state.openPlaylistType !== 'netease') return;
    if (!neteaseUser) return;
    openNeteaseDetailById(state.openPlaylistId);
  }, [location.state, neteaseUser]);

  const removeLocalTrack = async (plId, trackId) => {
    await api.delete(`/api/playlists/${plId}/tracks/${encodeURIComponent(trackId)}`);
    const res = await api.get(`/api/playlists/${plId}`);
    if (detail?.id === plId) setDetail(res.data);
    setLocalPlaylists((prev) => prev.map((p) => (p.id === plId ? res.data : p)));
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <section className="surface mb-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">歌单中心</h1>
            <p className="mt-1 text-sm text-slate-500">查看网易云歌单、本地歌单和收藏歌曲。</p>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600">我的收藏：{favorites?.length || 0} 首</div>
        </div>
      </section>

      {neteaseUser && (
        <section className="surface mb-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">网易云歌单</h2>
            <span className="text-xs text-slate-400">{neteasePlaylists.length} 个</span>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">加载中...</p>
          ) : neteasePlaylists.length === 0 ? (
            <p className="text-sm text-slate-500">暂无网易云歌单</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {neteasePlaylists.map((pl) => (
                <button key={pl.id} type="button" onClick={() => openNeteaseDetail(pl)} className="group rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50/30">
                  <div className="mb-2 flex items-center gap-2">
                    {pl.coverImgUrl ? (
                      <img src={pl.coverImgUrl} alt="" className="h-12 w-12 rounded-lg object-cover shadow-sm" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200 text-slate-400">♪</div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{pl.name}</p>
                      <p className="text-xs text-slate-400">{pl.trackCount ?? 0} 首</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="surface mb-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">我的收藏</h2>
          {favorites?.length > 0 && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => playList(favorites)} className="btn-primary py-1 text-xs">全部播放</button>
              <button type="button" onClick={() => addAllToQueue(favorites)} className="btn-secondary py-1 text-xs">全部加到队列</button>
            </div>
          )}
        </div>

        {!favorites?.length ? (
          <p className="text-sm text-slate-500">你还没有收藏歌曲</p>
        ) : (
          <ul className="space-y-2">
            {favorites.map((track, i) => (
              <li key={track.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                <CoverImage track={track} size={40} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{track.name}</p>
                  <p className="truncate text-xs text-slate-500">{Array.isArray(track.artist) ? track.artist.join(' / ') : track.artist}</p>
                </div>
                <button type="button" onClick={() => play(track, true)} className="btn-secondary py-1 text-xs">播放</button>
                <button type="button" onClick={() => removeFromFavorites(track.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600">取消收藏</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface mb-4 p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">本地歌单</h2>

        {!Array.isArray(localPlaylists) || localPlaylists.length === 0 ? (
          <p className="text-sm text-slate-500">暂无本地歌单</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {localPlaylists.map((pl) => (
              <button key={pl.id} type="button" onClick={() => openLocalDetail(pl)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50/30">
                <p className="truncate text-sm font-medium text-slate-800">{pl.name}</p>
                <p className="text-xs text-slate-400">{pl.tracks?.length ?? 0} 首</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {!neteaseUser && (
        <section className="surface p-5 text-center">
          <p className="text-sm text-slate-500">登录后可查看网易云歌单。</p>
          <NavLink to="/login" className="btn-primary mt-3 inline-block">去登录</NavLink>
        </section>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={closeDetail}>
          <div className="surface max-h-[80vh] w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4 border-b border-slate-200 p-4">
              {detail.coverImgUrl ? (
                <img src={detail.coverImgUrl} alt="" className="h-20 w-20 rounded-xl object-cover shadow-sm" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-400">♪</div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-slate-800">{detail.name}</h2>
                <p className="mt-1 text-xs text-slate-500">{detail.description || '网易云歌单'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>曲目 {detail.trackCount ?? '-'}</span>
                  <span>收藏 {detail.subscribedCount ?? '-'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {detail.tracks?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (detailType === 'local') {
                        playList(detail.tracks || []);
                      } else {
                        const list = (detail.tracks || []).map((t) => {
                          const track = t.track || t;
                          return {
                            id: track.id,
                            name: track.name,
                            artist: track.ar?.map((a) => a.name) || track.artists?.map((a) => a.name) || [],
                            pic_id: track.al?.pic_str || track.al?.pic,
                            source: 'netease',
                          };
                        });
                        playList(list);
                      }
                      closeDetail();
                    }}
                    className="btn-primary py-1 text-sm"
                  >
                    全部播放
                  </button>
                )}
                <button type="button" onClick={closeDetail} className="btn-secondary py-1 text-sm">关闭</button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto p-4">
              {detailLoading ? (
                <p className="text-sm text-slate-500">加载详情中...</p>
              ) : detailType === 'local' ? (
                <ul className="space-y-2">
                  {(detail.tracks || []).map((t, i) => (
                    <li key={t.id || i} className="group flex items-center gap-3 rounded-lg bg-slate-50 px-2 py-2">
                      <button type="button" onClick={() => play(t, true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                        <CoverImage track={t} size={36} className="h-9 w-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">{t.name}</p>
                          <p className="truncate text-xs text-slate-500">{Array.isArray(t.artist) ? t.artist.join(' / ') : t.artist}</p>
                        </div>
                      </button>
                      <button type="button" onClick={() => removeLocalTrack(detail.id, t.id)} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600 opacity-0 group-hover:opacity-100">移除</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={detailSearch}
                      onChange={(e) => setDetailSearch(e.target.value)}
                      placeholder="歌单内搜索（歌名 / 歌手）"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    />
                    {detailSearch && (
                      <button type="button" onClick={() => setDetailSearch('')} className="btn-secondary py-1 text-xs">清空</button>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {(detail.tracks || []).filter((t) => {
                      if (!detailSearch.trim()) return true;
                      const track = t.track || t;
                      const name = String(track.name || '').toLowerCase();
                      const artists = (track.ar || track.artists || []).map((a) => a.name).join(' / ').toLowerCase();
                      const key = detailSearch.trim().toLowerCase();
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
    </div>
  );
}

