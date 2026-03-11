import { useEffect, useState, useRef } from 'react';
import { api } from '../api';

export default function Account({ onNeteaseRefresh }) {
  const [neteasePhone, setNeteasePhone] = useState('');
  const [neteasePassword, setNeteasePassword] = useState('');
  const [neteaseError, setNeteaseError] = useState('');
  const [neteaseLoading, setNeteaseLoading] = useState(false);
  const [neteaseConfigured, setNeteaseConfigured] = useState(true);
  const [neteaseTab, setNeteaseTab] = useState('qr');
  const [qrImg, setQrImg] = useState('');
  const [qrStatus, setQrStatus] = useState('等待扫码');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [neteaseProfile, setNeteaseProfile] = useState(null);
  const [neteaseSubcount, setNeteaseSubcount] = useState(null);
  const [neteaseDetail, setNeteaseDetail] = useState(null);
  const qrTimerRef = useRef(null);

  const formatDate = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatGender = (v) => {
    if (v === 1) return '男';
    if (v === 2) return '女';
    return '未知';
  };

  const fetchNeteaseStatus = async () => {
    try {
      const res = await api.get('/api/netease/login/status');
      const data = res.data?.data ?? res.data;
      const profile = data?.profile || null;
      const account = data?.account || null;
      if (profile || account) {
        const next = {
          ...account,
          ...profile,
          nickname: profile?.nickname || account?.userName || '网易云用户',
          avatarUrl: profile?.avatarUrl || '',
        };
        setNeteaseProfile(next);
        try {
          localStorage.setItem('neteaseUser', JSON.stringify(next));
          localStorage.setItem('neteaseLoginAt', String(Date.now()));
        } catch {}
      } else {
        setNeteaseProfile(null);
      }
    } catch {
      setNeteaseProfile(null);
    }
  };

  const persistNetease = (payload) => {
    try {
      localStorage.setItem('neteaseUser', JSON.stringify(payload));
      localStorage.setItem('neteaseLoginAt', String(Date.now()));
    } catch {}
  };

  useEffect(() => {
    fetchNeteaseStatus();
    api.get('/api/netease/configured').then((res) => {
      setNeteaseConfigured(res.data?.configured ?? false);
    }).catch(() => setNeteaseConfigured(false));
  }, []);

  useEffect(() => {
    if (!neteaseProfile) {
      setNeteaseSubcount(null);
      setNeteaseDetail(null);
      return;
    }
    api.get('/api/netease/user/subcount').then((res) => {
      if (res.data?.code === 200) setNeteaseSubcount(res.data);
    }).catch(() => setNeteaseSubcount(null));

    const uid = neteaseProfile?.userId || neteaseProfile?.id;
    if (uid) {
      api.get('/api/netease/user/detail', { params: { uid } }).then((res) => {
        const data = res.data?.data ?? res.data;
        setNeteaseDetail(data || null);
      }).catch(() => setNeteaseDetail(null));
    }
  }, [neteaseProfile?.userId, neteaseProfile?.id]);

  useEffect(() => () => {
    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
  }, []);

  const handleNeteaseLogin = async (e) => {
    e.preventDefault();
    setNeteaseError('');
    if (!neteasePhone.trim()) {
      setNeteaseError('请输入手机号');
      return;
    }
    if (!neteasePassword.trim()) {
      setNeteaseError('请输入密码');
      return;
    }
    setNeteaseLoading(true);
    try {
      const res = await api.post('/api/netease/login', {
        phone: neteasePhone.trim(),
        password: neteasePassword.trim(),
      });
      const data = res.data;
      if (data.code === 200 && (data.account || data.profile)) {
        const rawCookie = data.normalizedCookie || data.cookie;
        if (rawCookie) {
          try {
            localStorage.setItem('neteaseCookie', rawCookie);
          } catch {}
        }
        setNeteasePhone('');
        setNeteasePassword('');
        const payload = {
          ...data.account,
          ...data.profile,
          nickname: data.profile?.nickname || data.account?.userName || '网易云用户',
          avatarUrl: data.profile?.avatarUrl || '',
        };
        setNeteaseProfile(payload);
        persistNetease(payload);
        fetchNeteaseStatus();
        onNeteaseRefresh?.();
        return;
      }
      setNeteaseError(data.msg || data.message || '登录失败，请检查账号信息');
    } catch {
      setNeteaseError('网络请求失败，请稍后重试');
    } finally {
      setNeteaseLoading(false);
    }
  };

  const stopQrPolling = () => {
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current);
      qrTimerRef.current = null;
    }
  };

  const startQrPolling = (key) => {
    stopQrPolling();
    qrTimerRef.current = setInterval(async () => {
      try {
        const res = await api.get('/api/netease/qr/check', { params: { key } });
        const data = res.data || {};
        if (data.code === 800) {
          setQrStatus('二维码已过期，请刷新');
          stopQrPolling();
        } else if (data.code === 801) {
          setQrStatus('等待扫码');
        } else if (data.code === 802) {
          setQrStatus('已扫码，等待确认');
        } else if (data.code === 803) {
          setQrStatus('登录成功');
          stopQrPolling();
          const status = data.loginStatus || data;
          const rawCookie = data.normalizedCookie || data.cookie;
          if (rawCookie) {
            try {
              localStorage.setItem('neteaseCookie', rawCookie);
            } catch {}
          }
          const payload = status.profile || status.account ? {
            ...status.account,
            ...status.profile,
            nickname: status.profile?.nickname || status.account?.userName || '网易云用户',
            avatarUrl: status.profile?.avatarUrl || '',
          } : null;
          if (payload) {
            setNeteaseProfile(payload);
            persistNetease(payload);
          } else {
            fetchNeteaseStatus();
          }
          onNeteaseRefresh?.();
        } else {
          setQrStatus(data.message || '等待扫码');
        }
      } catch {
        setQrStatus('检查失败，请稍后重试');
      }
    }, 2000);
  };

  const fetchQr = async () => {
    setQrError('');
    setQrLoading(true);
    try {
      const keyRes = await api.get('/api/netease/qr/key');
      const key = keyRes.data?.data?.unikey || keyRes.data?.unikey || '';
      if (!key) throw new Error('获取二维码 key 失败');

      const qrRes = await api.get('/api/netease/qr/create', { params: { key, qrimg: 'true' } });
      const img = qrRes.data?.data?.qrimg || qrRes.data?.qrimg || '';
      if (!img) throw new Error('获取二维码失败');
      setQrImg(img);
      setQrStatus('等待扫码');
      startQrPolling(key);
    } catch (e) {
      setQrError(e?.message || '获取二维码失败');
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (neteaseTab !== 'qr') {
      stopQrPolling();
      return;
    }
    if (neteaseProfile) {
      stopQrPolling();
      return;
    }
    if (neteaseConfigured && !qrImg && !qrLoading) {
      fetchQr();
    }
  }, [neteaseTab, neteaseConfigured, neteaseProfile, qrImg, qrLoading]);

  const handleLogout = async () => {
    await api.post('/api/netease/logout').catch(() => {});
    setNeteaseProfile(null);
    setNeteaseSubcount(null);
    setNeteaseDetail(null);
    try {
      localStorage.removeItem('neteaseUser');
      localStorage.removeItem('neteaseLoginAt');
      localStorage.removeItem('neteaseCookie');
    } catch {}
    onNeteaseRefresh?.();
  };

  const detailProfile = neteaseDetail?.profile || neteaseProfile || {};
  const level = neteaseDetail?.level ?? '-';
  const listenSongs = neteaseDetail?.listenSongs ?? '-';
  const registerAt = neteaseDetail?.createTime || detailProfile?.createTime || null;

  return (
    <div className="space-y-4">
      <section className="surface p-6 glass-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {detailProfile.avatarUrl ? (
                <img src={detailProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">云</div>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-500">网易云账号</div>
              <div className="text-lg font-semibold text-slate-800">
                {detailProfile.nickname || '未登录'}
              </div>
              <div className="text-xs text-slate-500">
                UID：{detailProfile.userId || detailProfile.id || '-'}
              </div>
              {detailProfile.signature && (
                <div className="text-xs text-slate-500">签名：{detailProfile.signature}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs ${neteaseProfile ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
              {neteaseProfile ? '网易云已登录' : '未登录'}
            </span>
          </div>
        </div>
      </section>

      <div className="card-grid">
        <section className="surface card p-6">
          <h2 className="text-lg font-semibold text-slate-800">网易云信息</h2>
          <p className="mt-2 text-sm text-slate-600">登录后会在本地保存你的网易云信息，用于歌单与播放同步。</p>
          {!neteaseConfigured && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              当前服务端未配置 `NETEASE_API`，请先配置后再登录。
            </div>
          )}

          {neteaseProfile ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-xs text-slate-600">
                <div className="rounded-lg bg-slate-50 p-2">等级 {level}</div>
                <div className="rounded-lg bg-slate-50 p-2">听歌量 {listenSongs}</div>
                <div className="rounded-lg bg-slate-50 p-2">注册 {formatDate(registerAt)}</div>
                <div className="rounded-lg bg-slate-50 p-2">性别 {formatGender(detailProfile.gender)}</div>
              </div>
              {neteaseSubcount && (
                <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
                  <div className="rounded-lg bg-slate-50 p-2">歌单 {neteaseSubcount?.playlistCount ?? '-'}</div>
                  <div className="rounded-lg bg-slate-50 p-2">收藏 {neteaseSubcount?.subCount ?? '-'}</div>
                  <div className="rounded-lg bg-slate-50 p-2">专辑 {neteaseSubcount?.albumCount ?? '-'}</div>
                </div>
              )}
              <button type="button" onClick={handleLogout} className="btn-secondary">退出网易云</button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setNeteaseTab('qr')}
                  className={`rounded-full px-3 py-1 ${neteaseTab === 'qr' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}
                >
                  二维码登录
                </button>
                <button
                  type="button"
                  onClick={() => setNeteaseTab('password')}
                  className={`rounded-full px-3 py-1 ${neteaseTab === 'password' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}
                >
                  密码登录
                </button>
              </div>

              {neteaseTab === 'qr' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {qrImg ? (
                      <img src={qrImg} alt="网易云二维码" className="h-36 w-36 rounded-xl bg-white p-2" />
                    ) : (
                      <div className="flex h-36 w-36 items-center justify-center text-xs text-slate-400">未生成二维码</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{qrStatus}</span>
                    <button
                      type="button"
                      onClick={fetchQr}
                      disabled={qrLoading || !neteaseConfigured}
                      className="btn-secondary py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {qrLoading ? '生成中...' : '刷新二维码'}
                    </button>
                  </div>
                  {qrError && <p className="text-sm text-rose-500">{qrError}</p>}
                </div>
              ) : (
                <form onSubmit={handleNeteaseLogin} className="space-y-3">
                  <input
                    type="text"
                    value={neteasePhone}
                    onChange={(e) => setNeteasePhone(e.target.value)}
                    placeholder="手机号"
                    autoComplete="tel"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800"
                  />
                  <input
                    type="password"
                    value={neteasePassword}
                    onChange={(e) => setNeteasePassword(e.target.value)}
                    placeholder="密码"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800"
                  />
                  {neteaseError && <p className="text-sm text-rose-500">{neteaseError}</p>}
                  <button
                    type="submit"
                    disabled={neteaseLoading || !neteaseConfigured}
                    className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {neteaseLoading ? '登录中...' : '登录网易云'}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
