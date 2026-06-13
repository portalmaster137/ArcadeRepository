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
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/discord`;
  };

  const logout = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/logout`;
  };

  // POSTs to /auth/guest with a chosen name, then synchronously updates local
  // user state so the caller (e.g. GuestModal) can immediately proceed with
  // queue actions in the same tick — no waiting for a window-focus refetch.
  const loginAsGuest = useCallback(async (name) => {
    const { user } = await api.guestLogin(name);
    setUser(user);
    setLoading(false);
    return user;
  }, []);

  return { user, loading, login, logout, loginAsGuest, refetch: fetchMe };
}
