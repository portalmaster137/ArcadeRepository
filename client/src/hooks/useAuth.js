import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export function useAuth() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
    // Re-check on window focus (after OAuth redirect back)
    window.addEventListener('focus', fetchMe);
    return () => window.removeEventListener('focus', fetchMe);
  }, [fetchMe]);

  const login = () => {
    window.location.href = '/auth/discord';
  };

  const logout = () => {
    window.location.href = '/auth/logout';
  };

  return { user, loading, login, logout, refetch: fetchMe };
}
