const baseURL = '';

export const api = {
  async get(url, config = {}) {
    const params = config.params ? '?' + new URLSearchParams(config.params).toString() : '';
    const res = await fetch(baseURL + url + params, { credentials: 'include', ...config });
    const data = await res.json().catch(() => ({}));
    return { data, status: res.status };
  },
  async post(url, body, config = {}) {
    const res = await fetch(baseURL + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      ...config,
    });
    const data = await res.json().catch(() => ({}));
    return { data, status: res.status };
  },
  async delete(url) {
    const res = await fetch(baseURL + url, { method: 'DELETE', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    return { data, status: res.status };
  },
};
