import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Settings() {
  const [gdApi, setGdApi] = useState('');
  const [neteaseApi, setNeteaseApi] = useState('');
  const [backgroundPlay, setBackgroundPlay] = useState(() => {
    try {
      return localStorage.getItem('backgroundPlay') === '1';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/config');
      setGdApi(res.data?.gdApi || '');
      setNeteaseApi(res.data?.neteaseApi || '');
    } catch {
      setError('获取配置失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('backgroundPlay', backgroundPlay ? '1' : '0');
    } catch {}
    window?.nianyu?.setCloseBehavior?.(backgroundPlay ? 'background' : 'quit');
  }, [backgroundPlay]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!gdApi.trim()) {
      setError('请输入 GD API 地址。');
      return;
    }
    if (!neteaseApi.trim()) {
      setError('请输入网易云 API 地址。');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/api/config', {
        gdApi: gdApi.trim(),
        neteaseApi: neteaseApi.trim(),
      });
      if (res.data?.ok) {
        setMessage('保存成功，已生效。');
      } else {
        setError(res.data?.error || '保存失败，请稍后重试。');
      }
    } catch (e2) {
      setError(e2?.message || '保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface p-6 glass-header">
        <h1 className="text-2xl font-bold text-slate-800">接口配置</h1>
        <p className="mt-2 text-sm text-slate-600">
          修改 GD API 和网易云 API 地址，保存后即时生效。
        </p>
      </section>

      <section className="surface p-6">
        <h2 className="text-lg font-semibold text-slate-800">后台播放</h2>
        <p className="mt-1 text-xs text-slate-500">控制点击关闭按钮时的行为。</p>
        <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={backgroundPlay}
            onChange={(e) => setBackgroundPlay(e.target.checked)}
            className="h-4 w-4 accent-red-500"
          />
          关闭窗口时继续播放（最小化到托盘）
        </label>
        <p className="mt-2 text-xs text-slate-500">
          开启后，点击关闭会隐藏到托盘；需要退出请使用托盘菜单或任务栏右键。
        </p>
      </section>

      <section className="surface p-6">
        {loading ? (
          <div className="text-sm text-slate-500">正在加载配置...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-700">GD API 地址</label>
              <input
                type="text"
                value={gdApi}
                onChange={(e) => setGdApi(e.target.value)}
                placeholder="https://music-api.gdstudio.xyz/api.php"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">网易云 API 地址</label>
              <input
                type="text"
                value={neteaseApi}
                onChange={(e) => setNeteaseApi(e.target.value)}
                placeholder="https://netease-api.bjca.xyz"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
            {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
            {message && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                type="button"
                onClick={loadConfig}
                disabled={saving}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                重新加载
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
