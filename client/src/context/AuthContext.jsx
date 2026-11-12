import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setLogoutHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const clear = useCallback(() => { setAccessToken(null); setUser(null); qc.clear(); }, [qc]);

  useEffect(() => {
    setLogoutHandler(() => setUser(null));
    // restore session from the httpOnly refresh cookie
    refreshSession().then((d) => setUser(d.user)).catch(() => {}).finally(() => setReady(true));
  }, []);

  const handle = (res) => { setAccessToken(res.data.accessToken); setUser(res.data.user); qc.invalidateQueries(); return res.data.user; };

  const value = useMemo(() => ({
    user,
    ready,
    isAdmin: user?.role === 'admin',
    login: (body) => api.post('/auth/login', body).then(handle),
    register: (body) => api.post('/auth/register', body).then(handle),
    logout: () => api.post('/auth/logout').finally(clear),
    setUser,
  }), [user, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
