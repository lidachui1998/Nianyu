import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GD_API = process.env.GD_API || 'https://music-api.gdstudio.xyz/api.php';
const NETEASE_API = process.env.NETEASE_API || 'https://netease-api.bjca.xyz';
const PORT = parseInt(process.env.PORT || '13007', 10);

const PLAYLISTS_FILE = path.join(__dirname, '..', 'data', 'playlists.json');
const SYNC_FILE = path.join(__dirname, '..', 'data', 'sync.json');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const NETEASE_USERS_FILE = path.join(__dirname, '..', 'data', 'netease-users.json');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'nianyu-secret-change-in-prod',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const GD_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://music.gdstudio.xyz/',
};

async function proxyGD(params) {
  const url = new URL(GD_API);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { method: 'GET', headers: GD_REQUEST_HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.msg || body?.error || body?.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(`GD API: ${msg}`);
  }
  return body;
}

async function proxyNetease(method, pathname, body = null, cookie = null) {
  if (!NETEASE_API) {
    return { code: -1, msg: 'NETEASE_API is not configured' };
  }

  let url = `${NETEASE_API.replace(/\/$/, '')}${pathname}`;
  const opts = { method, headers: {} };

  if (method === 'POST') opts.headers['Content-Type'] = 'application/json';
  if (cookie) opts.headers.Cookie = cookie;

  if (body && Object.keys(body).length) {
    if (method === 'GET') {
      const search = new URLSearchParams(body).toString();
      url += (url.includes('?') ? '&' : '?') + search;
    } else {
      opts.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, opts);
  return res.json().catch(() => ({}));
}

const GD_STABLE_SOURCES = ['netease', 'kuwo', 'joox'];

function normalizeNeteaseCookie(raw) {
  if (!raw) return '';
  const str = Array.isArray(raw) ? raw.join('; ') : String(raw);
  const parts = str.split(';');
  const blocked = new Set(['Path', 'Expires', 'Max-Age', 'Domain', 'HttpOnly', 'Secure', 'SameSite']);
  const map = new Map();
  for (const part of parts) {
    const t = part.trim();
    if (!t || !t.includes('=')) continue;
    const [name, ...rest] = t.split('=');
    const key = name.trim();
    if (!key || blocked.has(key)) continue;
    const value = rest.join('=').trim();
    if (!value) continue;
    map.set(key, value);
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchNeteaseProfile(cookie) {
  const status = await proxyNetease('GET', '/login/status', null, cookie);
  let data = status?.data ?? status;
  let profile = data?.profile || null;
  let account = data?.account || null;

  if (!profile && !account) {
    const accountRes = await proxyNetease('GET', '/user/account', null, cookie);
    const accountData = accountRes?.data ?? accountRes;
    profile = accountData?.profile || profile;
    account = accountData?.account || account;
    data = { ...data, profile, account };
  }

  if (profile?.userId || account?.id) {
    const uid = profile?.userId || account?.id;
    neteaseUsersStore.usersByUid = neteaseUsersStore.usersByUid || {};
    neteaseUsersStore.usersByUid[String(uid)] = {
      profile,
      account,
      updatedAt: new Date().toISOString(),
    };
    saveNeteaseUsers();
  }

  return { data, profile, account };
}

function normalizeSearchResult(raw) {
  if (Array.isArray(raw)) return { data: raw, source: raw[0]?.source ?? null };
  if (raw && Array.isArray(raw.data)) return { data: raw.data, source: raw.data[0]?.source ?? null };
  return { data: [], source: null };
}

function isValidSearchResponse(raw) {
  const normalized = normalizeSearchResult(raw);
  return normalized.data.length > 0;
}

let localPlaylists = { byUser: {} };
let usersStore = { users: [] };
let syncStore = { byUser: {} };
let neteaseUsersStore = { usersByUid: {} };

function loadPlaylists() {
  try {
    ensureDir(PLAYLISTS_FILE);
    if (fs.existsSync(PLAYLISTS_FILE)) {
      const raw = fs.readFileSync(PLAYLISTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.byUser) {
        localPlaylists = parsed;
      } else if (parsed && Array.isArray(parsed.playlists)) {
        localPlaylists = { byUser: { s_legacy: parsed.playlists } };
      } else {
        localPlaylists = { byUser: {} };
      }
    }
  } catch (e) {
    console.warn('[playlists] load failed:', e.message);
    localPlaylists = { byUser: {} };
  }
}

function savePlaylists() {
  try {
    ensureDir(PLAYLISTS_FILE);
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(localPlaylists, null, 2), 'utf8');
  } catch (e) {
    console.warn('[playlists] save failed:', e.message);
  }
}

function loadUsers() {
  try {
    ensureDir(USERS_FILE);
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      usersStore = parsed && Array.isArray(parsed.users) ? parsed : { users: [] };
    }
  } catch (e) {
    console.warn('[users] load failed:', e.message);
    usersStore = { users: [] };
  }
}

function saveUsers() {
  try {
    ensureDir(USERS_FILE);
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('[users] save failed:', e.message);
  }
}

function loadNeteaseUsers() {
  try {
    ensureDir(NETEASE_USERS_FILE);
    if (fs.existsSync(NETEASE_USERS_FILE)) {
      const raw = fs.readFileSync(NETEASE_USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      neteaseUsersStore = parsed && parsed.usersByUid ? parsed : { usersByUid: {} };
    }
  } catch (e) {
    console.warn('[netease-users] load failed:', e.message);
    neteaseUsersStore = { usersByUid: {} };
  }
}

function saveNeteaseUsers() {
  try {
    ensureDir(NETEASE_USERS_FILE);
    fs.writeFileSync(NETEASE_USERS_FILE, JSON.stringify(neteaseUsersStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('[netease-users] save failed:', e.message);
  }
}

function hashPassword(password, salt = null) {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, usedSalt, 120000, 32, 'sha256').toString('hex');
  return { salt: usedSalt, hash };
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || '',
    createdAt: user.createdAt,
    neteaseUid: user.neteaseUid || null,
  };
}

function loadSync() {
  try {
    ensureDir(SYNC_FILE);
    if (fs.existsSync(SYNC_FILE)) {
      const raw = fs.readFileSync(SYNC_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      syncStore = parsed && parsed.byUser ? parsed : { byUser: {} };
    }
  } catch (e) {
    console.warn('[sync] load failed:', e.message);
    syncStore = { byUser: {} };
  }
}

function saveSync() {
  try {
    ensureDir(SYNC_FILE);
    fs.writeFileSync(SYNC_FILE, JSON.stringify(syncStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('[sync] save failed:', e.message);
  }
}

function getSyncKey(req) {
  const localId = req.session?.localUserId;
  if (localId != null) return `u_${String(localId)}`;
  const uid = req.session?.neteaseUid;
  if (uid != null) return `n_${String(uid)}`;
  return `s_${req.sessionID || req.session?.id || 'anon'}`;
}

function getPlaylistKey(req) {
  const localId = req.session?.localUserId;
  if (localId != null) return `u_${String(localId)}`;
  const uid = req.session?.neteaseUid;
  if (uid != null) return `n_${String(uid)}`;
  return `s_${req.sessionID || req.session?.id || 'anon'}`;
}

loadPlaylists();
loadSync();
loadUsers();
loadNeteaseUsers();

app.get('/api/search', async (req, res) => {
  const name = req.query.name || req.query.keyword || '';
  const count = req.query.count || 20;
  const pages = req.query.pages || 1;
  const preferredSource = req.query.source || '';

  const sourcesToTry = preferredSource
    ? [preferredSource, ...GD_STABLE_SOURCES.filter((s) => s !== preferredSource)]
    : GD_STABLE_SOURCES;

  let lastError = null;

  for (const source of sourcesToTry) {
    try {
      const raw = await proxyGD({ types: 'search', source, name, count, pages });
      if (isValidSearchResponse(raw)) {
        const out = normalizeSearchResult(raw);
        return res.json({ data: out.data, source: out.source });
      }
      if (source === sourcesToTry[0] && raw && (raw.msg || raw.error || raw.message)) {
        lastError = raw.msg || raw.error || raw.message;
      }
    } catch (e) {
      lastError = e.message;
      console.warn(`[search] source=${source} failed:`, e.message);
    }
  }

  const errMsg = lastError || 'Search failed on all sources';
  console.warn('[search] all sources failed. lastError:', errMsg);
  return res.json({ data: [], error: errMsg });
});

app.get('/api/url', async (req, res) => {
  const source = req.query.source || 'kuwo';
  try {
    const raw = await proxyGD({
      types: 'url',
      source,
      id: req.query.id,
      br: req.query.br || 320,
    });

    const url = raw?.url ?? (Array.isArray(raw) ? raw[0]?.url : undefined) ?? raw?.data?.[0]?.url;

    if (url) return res.json({ url, br: raw?.br, size: raw?.size });
    return res.status(404).json({ error: 'Play URL not found' });
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/pic', async (req, res) => {
  try {
    const data = await proxyGD({
      types: 'pic',
      source: req.query.source || 'kuwo',
      id: req.query.id,
      size: req.query.size || 300,
    });

    const picUrl = data?.url;
    if (picUrl && req.query.redirect === '1') return res.redirect(302, picUrl);
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/lyric', async (req, res) => {
  try {
    const data = await proxyGD({
      types: 'lyric',
      source: req.query.source || 'kuwo',
      id: req.query.id,
    });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/configured', (req, res) => {
  res.json({ configured: !!NETEASE_API });
});

app.get('/api/auth/status', (req, res) => {
  const userId = req.session?.localUserId;
  const user = (usersStore.users || []).find((u) => u.id === userId);
  res.json({ user: safeUser(user) });
});

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const exists = (usersStore.users || []).some((u) => u.username === username);
  if (exists) return res.status(409).json({ error: 'username already exists' });

  const { salt, hash } = hashPassword(password);
  const user = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username,
    displayName: username,
    avatarUrl: '',
    hash,
    salt,
    createdAt: new Date().toISOString(),
    neteaseUid: null,
  };
  usersStore.users = usersStore.users || [];
  usersStore.users.push(user);
  saveUsers();
  req.session.localUserId = user.id;
  res.json({ user: safeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const user = (usersStore.users || []).find((u) => u.username === username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(401).json({ error: 'invalid credentials' });
  req.session.localUserId = user.id;
  res.json({ user: safeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.localUserId = null;
  res.json({ ok: true });
});

app.post('/api/auth/update-profile', (req, res) => {
  const userId = req.session?.localUserId;
  const user = (usersStore.users || []).find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'not logged in' });

  const displayName = String(req.body?.displayName || '').trim();
  const avatarUrl = String(req.body?.avatarUrl || '').trim();

  if (displayName && displayName.length > 40) return res.status(400).json({ error: 'displayName too long' });
  if (avatarUrl && avatarUrl.length > 500000) return res.status(400).json({ error: 'avatarUrl too long' });

  if (displayName) user.displayName = displayName;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  saveUsers();
  res.json({ user: safeUser(user) });
});

app.post('/api/auth/change-password', (req, res) => {
  const userId = req.session?.localUserId;
  const user = (usersStore.users || []).find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'not logged in' });

  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'oldPassword and newPassword required' });

  const { hash } = hashPassword(oldPassword, user.salt);
  if (hash !== user.hash) return res.status(401).json({ error: 'invalid password' });

  const next = hashPassword(newPassword);
  user.salt = next.salt;
  user.hash = next.hash;
  saveUsers();
  res.json({ ok: true });
});

app.post('/api/auth/unbind-netease', (req, res) => {
  const userId = req.session?.localUserId;
  const user = (usersStore.users || []).find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'not logged in' });
  user.neteaseUid = null;
  req.session.neteaseUid = null;
  req.session.neteaseCookie = null;
  saveUsers();
  res.json({ ok: true });
});

app.post('/api/auth/bind-netease', (req, res) => {
  const userId = req.session?.localUserId;
  const user = (usersStore.users || []).find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'not logged in' });
  const neteaseUid = req.session?.neteaseUid;
  if (!neteaseUid) return res.status(400).json({ error: 'netease not logged in' });
  user.neteaseUid = neteaseUid;
  saveUsers();
  res.json({ ok: true, user: safeUser(user) });
});

app.post('/api/auth/delete', (req, res) => {
  const userId = req.session?.localUserId;
  const user = (usersStore.users || []).find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'not logged in' });

  const password = String(req.body?.password || '');
  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(401).json({ error: 'invalid password' });

  usersStore.users = (usersStore.users || []).filter((u) => u.id !== userId);
  saveUsers();

  const key = `u_${String(userId)}`;
  if (syncStore.byUser?.[key]) delete syncStore.byUser[key];
  saveSync();

  req.session.localUserId = null;
  req.session.neteaseUid = null;
  req.session.neteaseCookie = null;
  res.json({ ok: true });
});

// ---- 网易云登录 ----
app.post('/api/netease/login', async (req, res) => {
  const { phone, password, captcha } = req.body || {};
  if (!NETEASE_API) {
    return res.json({ code: -1, msg: 'NETEASE_API is not configured' });
  }

  try {
    const result = await proxyNetease('POST', '/login/cellphone', {
      phone,
      password: password || captcha,
      captcha: captcha || undefined,
    });

    if (result.code === 200) {
      const cookie = normalizeNeteaseCookie(result.cookie);
      if (cookie) result.normalizedCookie = cookie;
      if (cookie) {
        req.session.neteaseCookie = cookie;
        req.session.neteaseUid = result.account?.id || result.profile?.userId;
        const localId = req.session?.localUserId;
        if (localId) {
          const user = (usersStore.users || []).find((u) => u.id === localId);
          if (user) {
            user.neteaseUid = req.session.neteaseUid;
            saveUsers();
          }
        }
      }
    }

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

// ---- 网易云二维码登录 ----
app.get('/api/netease/qr/key', async (req, res) => {
  try {
    const result = await proxyNetease('GET', '/login/qr/key', { timestamp: Date.now() });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/qr/create', async (req, res) => {
  try {
    const key = req.query.key;
    const qrimg = req.query.qrimg ?? 'true';
    if (!key) return res.status(400).json({ code: 400, msg: 'key is required' });
    const result = await proxyNetease('GET', '/login/qr/create', { key, qrimg, timestamp: Date.now() });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/qr/check', async (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json({ code: 400, msg: 'key is required' });
    const result = await proxyNetease('GET', '/login/qr/check', { key, timestamp: Date.now() });
    if (result.code === 803 && result.cookie) {
      const cookie = normalizeNeteaseCookie(result.cookie);
      if (cookie) result.normalizedCookie = cookie;
      req.session.neteaseCookie = cookie;
      let neteaseUid = result.profile?.userId;
      try {
        const statusPack = await fetchNeteaseProfile(cookie);
        const statusData = statusPack.data;
        neteaseUid = statusPack.profile?.userId || statusPack.account?.id || neteaseUid;
        result.loginStatus = statusData;
        if (!result.profile && statusPack.profile) result.profile = statusPack.profile;
        if (!result.account && statusPack.account) result.account = statusPack.account;
      } catch {}
      req.session.neteaseUid = neteaseUid;
      const localId = req.session?.localUserId;
      if (localId) {
        const user = (usersStore.users || []).find((u) => u.id === localId);
        if (user) {
          user.neteaseUid = req.session.neteaseUid || user.neteaseUid;
          saveUsers();
        }
      }
    }
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/login/status', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  if (!cookie) return res.json({ code: 200, data: { account: null } });

  try {
    const statusPack = await fetchNeteaseProfile(cookie);
    const result = statusPack.data;
    if (result.code !== 200 && statusPack.profile == null && statusPack.account == null) req.session.neteaseCookie = null;
    const uid = statusPack.profile?.userId || statusPack.account?.id;
    if (uid) {
      req.session.neteaseUid = uid;
      const localId = req.session?.localUserId;
      if (localId) {
        const user = (usersStore.users || []).find((u) => u.id === localId);
        if (user && !user.neteaseUid) {
          user.neteaseUid = uid;
          saveUsers();
        }
      }
    }
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.post('/api/netease/session/restore', async (req, res) => {
  const cookie = normalizeNeteaseCookie(req.body?.cookie);
  if (!cookie) return res.json({ code: 400, msg: 'cookie is required' });
  try {
    req.session.neteaseCookie = cookie;
    const statusPack = await fetchNeteaseProfile(cookie);
    const result = statusPack.data;
    const uid = statusPack.profile?.userId || statusPack.account?.id;
    if (uid) req.session.neteaseUid = uid;
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.post('/api/netease/logout', (req, res) => {
  req.session.neteaseCookie = null;
  req.session.neteaseUid = null;
  res.json({ ok: true });
});

app.get('/api/netease/user/account', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  if (!cookie) return res.json({ code: 200, account: null, profile: null });
  try {
    const accountRes = await proxyNetease('GET', '/user/account', null, cookie);
    const data = accountRes?.data ?? accountRes;
    const profile = data?.profile || null;
    const account = data?.account || null;
    if (profile?.userId || account?.id) {
      const uid = profile?.userId || account?.id;
      req.session.neteaseUid = uid;
      neteaseUsersStore.usersByUid = neteaseUsersStore.usersByUid || {};
      neteaseUsersStore.usersByUid[String(uid)] = {
        profile,
        account,
        updatedAt: new Date().toISOString(),
      };
      saveNeteaseUsers();
    }
    res.json({ code: 200, profile, account });
  } catch (e) {
    res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/user/detail', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  const uid = req.query.uid || req.session?.neteaseUid;
  if (!cookie || !uid) return res.json({ code: 301, msg: 'Please login first' });
  try {
    const result = await proxyNetease('GET', '/user/detail', { uid }, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/user/subcount', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  if (!cookie) return res.json({ code: 301, msg: 'Please login first' });
  try {
    const result = await proxyNetease('GET', '/user/subcount', null, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/recommend/resource', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  if (!cookie) return res.json({ code: 301, msg: 'Please login first' });
  try {
    const result = await proxyNetease('GET', '/recommend/resource', null, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/playlist', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  const uid = req.query.uid || req.session?.neteaseUid;

  if (!uid) return res.json({ code: 401, msg: 'Not logged in' });

  try {
    const result = await proxyNetease('GET', '/user/playlist', { uid }, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.post('/api/netease/like', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  if (!cookie) return res.json({ code: 301, msg: 'Please login first' });

  const { id, like = true } = req.body || {};
  if (!id) return res.json({ code: 400, msg: 'Track id is required' });

  try {
    const result = await proxyNetease('GET', '/like', { id, like: like ? 'true' : 'false' }, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.get('/api/netease/playlist/detail', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  const id = req.query.id;

  if (!id) return res.json({ code: 400, msg: 'Playlist id is required' });

  try {
    const result = await proxyNetease('GET', '/playlist/detail', { id }, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

app.post('/api/netease/playlist/tracks', async (req, res) => {
  const cookie = req.session?.neteaseCookie;
  if (!cookie) return res.json({ code: 301, msg: 'Please login first' });

  const { pid, tracks } = req.body || {};
  if (!pid || !tracks) return res.json({ code: 400, msg: 'pid and tracks are required' });
  const ids = Array.isArray(tracks) ? tracks.join(',') : String(tracks);

  try {
    const result = await proxyNetease('GET', '/playlist/tracks', { op: 'add', pid, tracks: ids }, cookie);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ code: -1, msg: String(e.message) });
  }
});

// ---- 本地歌单 ----
app.get('/api/playlists', (req, res) => {
  const key = getPlaylistKey(req);
  res.json((localPlaylists.byUser?.[key]) || []);
});

app.post('/api/playlists', (req, res) => {
  const name = String(req.body?.name || 'New Playlist').trim();
  const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pl = { id, name: name || 'New Playlist', tracks: [] };

  const key = getPlaylistKey(req);
  if (!localPlaylists.byUser) localPlaylists.byUser = {};
  localPlaylists.byUser[key] = localPlaylists.byUser[key] || [];
  localPlaylists.byUser[key].push(pl);
  savePlaylists();

  res.json(pl);
});

app.get('/api/playlists/:id', (req, res) => {
  const key = getPlaylistKey(req);
  const pl = (localPlaylists.byUser?.[key] || []).find((p) => p.id === req.params.id);
  if (!pl) return res.status(404).json({ error: 'Playlist not found' });
  return res.json(pl);
});

app.post('/api/playlists/:id/tracks', (req, res) => {
  const key = getPlaylistKey(req);
  const pl = (localPlaylists.byUser?.[key] || []).find((p) => p.id === req.params.id);
  if (!pl) return res.status(404).json({ error: 'Playlist not found' });

  const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : req.body ? [req.body] : [];
  const existingIds = new Set((pl.tracks || []).map((t) => String(t.id)));

  for (const t of tracks) {
    if (t?.id && !existingIds.has(String(t.id))) {
      pl.tracks = pl.tracks || [];
      pl.tracks.push({
        id: t.id,
        name: t.name,
        artist: t.artist,
        album: t.album,
        pic_id: t.pic_id,
        source: t.source || 'kuwo',
      });
      existingIds.add(String(t.id));
    }
  }

  savePlaylists();
  return res.json(pl);
});

app.delete('/api/playlists/:id/tracks/:trackId', (req, res) => {
  const key = getPlaylistKey(req);
  const pl = (localPlaylists.byUser?.[key] || []).find((p) => p.id === req.params.id);
  if (!pl) return res.status(404).json({ error: 'Playlist not found' });

  const trackId = decodeURIComponent(req.params.trackId);
  if (pl.tracks) pl.tracks = pl.tracks.filter((t) => String(t.id) !== trackId);

  savePlaylists();
  return res.json(pl);
});

app.get('/api/sync', (req, res) => {
  const key = getSyncKey(req);
  const data = syncStore.byUser[key] || { queue: [], favorites: [], lastTrack: null, lastTime: 0, playMode: 'order', recent: [] };

  res.json({
    queue: Array.isArray(data.queue) ? data.queue : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    lastTrack: data.lastTrack || null,
    lastTime: Number.isFinite(data.lastTime) ? data.lastTime : 0,
    playMode: data.playMode || 'order',
    recent: Array.isArray(data.recent) ? data.recent : [],
  });
});

app.post('/api/sync', (req, res) => {
  const key = getSyncKey(req);
  if (!syncStore.byUser[key]) syncStore.byUser[key] = { queue: [], favorites: [], lastTrack: null, lastTime: 0, playMode: 'order', recent: [] };

  const cur = syncStore.byUser[key];
  if (req.body?.queue !== undefined) cur.queue = Array.isArray(req.body.queue) ? req.body.queue : [];
  if (req.body?.favorites !== undefined) cur.favorites = Array.isArray(req.body.favorites) ? req.body.favorites : [];
  if (req.body?.lastTrack !== undefined) cur.lastTrack = req.body.lastTrack || null;
  if (req.body?.lastTime !== undefined) cur.lastTime = Number(req.body.lastTime) || 0;
  if (req.body?.playMode !== undefined) cur.playMode = req.body.playMode || 'order';
  if (req.body?.recent !== undefined) cur.recent = Array.isArray(req.body.recent) ? req.body.recent : [];

  saveSync();
  res.json({
    queue: cur.queue,
    favorites: cur.favorites,
    lastTrack: cur.lastTrack,
    lastTime: cur.lastTime,
    playMode: cur.playMode,
    recent: cur.recent,
  });
});

app.get('/api/stream', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const r = await fetch(url, { redirect: 'follow', headers });
    if (!r.ok) return res.status(r.status).end();

    const contentType = r.headers.get('content-type') || 'audio/mpeg';
    const contentLength = r.headers.get('content-length');
    const contentRange = r.headers.get('content-range');
    const acceptRanges = r.headers.get('accept-ranges') || 'bytes';

    res.status(r.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (!r.body) return res.end();
    r.body.on('error', () => res.end());
    r.body.pipe(res);
    return;
  } catch (e) {
    return res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/download', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return res.status(r.status).end();

    const rawName = String(req.query.name || 'audio');
    const safeName = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    const name = `${(safeName || 'audio').slice(0, 120)}.mp3`;
    const buf = await r.arrayBuffer();

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    return res.send(Buffer.from(buf));
  } catch (e) {
    return res.status(500).json({ error: String(e.message) });
  }
});

const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).end();
  return res.sendFile(path.join(dist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Music-GD server running at http://0.0.0.0:${PORT}`);
  if (!NETEASE_API) console.log('Warning: NETEASE_API is not configured.');
});
