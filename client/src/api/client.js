import axios from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

let accessToken = null;
let onLogout = () => {};
export const setAccessToken = (t) => { accessToken = t; };
export const setLogoutHandler = (fn) => { onLogout = fn; };

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Single-flight refresh: concurrent 401s share one /auth/refresh call.
let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios.post('/api/auth/refresh', null, { withCredentials: true })
      .then((res) => { setAccessToken(res.data.accessToken); return res.data; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url.startsWith('/auth/')) {
      original._retry = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onLogout();
      }
    }
    return Promise.reject(error);
  },
);

export const errorMessage = (err) => {
  const e = err?.response?.data?.error;
  if (e?.details) return Object.entries(e.details).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ');
  return e?.message || err?.message || 'Something went wrong';
};
