const BASE = import.meta.env.VITE_API_URL || '';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin':'https://api.porta137.com', ...options.headers },
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
};
