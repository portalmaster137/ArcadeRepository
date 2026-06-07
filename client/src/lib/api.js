const BASE = import.meta.env.VITE_API_URL || '';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    // `include` is required so the browser sends the __session cookie on
    // cross-origin XHR (app.porta137.com → api.porta137.com). With the
    // default `same-origin`, the cookie would be silently dropped on every
    // API call and /auth/me would always return user: null.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const api = {
  getMe: () => apiFetch('/auth/me'),
  getGames: () => apiFetch('/api/games'),
  getGroup: (groupId) => apiFetch(`/api/cabinet-groups/${groupId}`),
  getQueue: (gameId) => apiFetch(`/api/games/${gameId}/queue`),
  joinQueue: (gameId, body) => apiFetch(`/api/games/${gameId}/queue/join`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  }),
  leaveQueue: (gameId) => apiFetch(`/api/games/${gameId}/queue/leave`, { method: 'POST' }),
  updateStatus: (gameId, status) => apiFetch(`/api/games/${gameId}/queue/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  }),
  markDone: (gameId) => apiFetch(`/api/games/${gameId}/queue/done`, { method: 'POST' }),
  getInvite: (gameId) => apiFetch(`/api/games/${gameId}/queue/invite`, { method: 'POST' }),
  confirmReady: (gameId) => apiFetch(`/api/games/${gameId}/queue/confirm-ready`, { method: 'POST' }),
  extendReady: (gameId) => apiFetch(`/api/games/${gameId}/queue/extend`, { method: 'POST' }),
  // Server-side lazy-void keepalive. The server uses this to void any head
  // whose readyDeadline has passed — see server/index.js GET /api/tick.
  // Polled on a 30s interval by the queue pages while open.
  tick: () => apiFetch('/api/tick'),
};
