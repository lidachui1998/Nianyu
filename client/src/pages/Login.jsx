import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export default function Login({ onLogin, onNeteaseRefresh }) {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'netease' ? 'netease' : 'netease';
  const [tab, setTab] = useState(defaultTab); // keep for compatibility

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(null);
  const [neteaseTab, setNeteaseTab] = useState('qr');
  const [qrImg, setQrImg] = useState('');
  const [qrKey, setQrKey] = useState('');
  const [qrStatus, setQrStatus] = useState('等待扫码');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const qrTimerRef = useRef(null);

  const navigate = useNavigate();

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    api.get('/api/netease/configured').then((res) => {
      setConfigured(res.data?.configured ?? false);
    }).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    return () => {
      if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (tab !== 'netease' || neteaseTab !== 'qr') {
      if (qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
        qrTimerRef.current = null;
      }
      return;
    }
    if (configured && !qrImg && !qrLoading) fetchQr();
  }, [tab, neteaseTab, configured, qrImg, qrLoading]);

  const stopQrPolling = () => {
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current);
      qrTimerRef.current = null;
    }
  };

  const persistNetease = (payload) => {
    try {
      localStorage.setItem('neteaseUser', JSON.stringify(payload));
      localStorage.setItem('neteaseLoginAt', String(Date.now()));
    } catch {}
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
            onLogin?.(payload);
            persistNetease(payload);
          }
          await onNeteaseRefresh?.();
          navigate('/playlists');
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
      setQrKey(key);

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

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!phone.trim()) {
      setError('请输入手机号');
      return;
    }
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/netease/login', {
        phone: phone.trim(),
        password: password.trim(),
      });

      const data = res.data;
      if (data.code === 200 && (data.account || data.profile)) {
        const rawCookie = data.normalizedCookie || data.cookie;
        if (rawCookie) {
          try {
            localStorage.setItem('neteaseCookie', rawCookie);
          } catch {}
        }
        const payload = {
          ...data.account,
          ...data.profile,
          nickname: data.profile?.nickname || data.account?.userName,
          avatarUrl: data.profile?.avatarUrl || '',
        };
        onLogin?.(payload);
        persistNetease(payload);
        onNeteaseRefresh?.();
        navigate('/playlists');
        return;
      }

      setError(data.msg || data.message || '登录失败，请检查账号信息');
    } catch {
      setError('网络请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const notConfigured = configured === false;

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="surface w-full max-w-md p-6 sm:p-7">
        <h1 className="text-2xl font-bold text-slate-800">网易云登录</h1>
        <p className="mt-1 text-sm text-slate-500">登录后会在本地保存你的账号信息。</p>

        {notConfigured && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            当前服务端未配置 `NETEASE_API`，请先配置后再登录。
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-full bg-slate-100 p-1 text-xs">
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
          <div className="mt-4 space-y-3">
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
                disabled={qrLoading || notConfigured}
                className="btn-secondary py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {qrLoading ? '生成中...' : '刷新二维码'}
              </button>
            </div>
            {qrError && <p className="text-sm text-rose-500">{qrError}</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-700">手机号</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                autoComplete="tel"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || notConfigured}
              className="btn-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '登录中...' : notConfigured ? '请先配置 NETEASE_API' : '登录'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
