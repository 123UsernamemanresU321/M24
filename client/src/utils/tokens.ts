const HOST_TOKEN_KEY = 'arena_host_token';
const CLIENT_TOKEN_PREFIX = 'arena_client_token_';
const PLAYER_ID_PREFIX = 'arena_player_id_';
const PLAYER_NAME_PREFIX = 'arena_player_name_';

export function getHostToken(): string | null {
  return localStorage.getItem(HOST_TOKEN_KEY);
}

export function setHostToken(token?: string | null) {
  if (!token) {
    return;
  }
  localStorage.setItem(HOST_TOKEN_KEY, token);
}

export function getClientToken(sessionId: string): string | null {
  return localStorage.getItem(`${CLIENT_TOKEN_PREFIX}${sessionId}`);
}

export function setClientToken(sessionId: string, token: string) {
  localStorage.setItem(`${CLIENT_TOKEN_PREFIX}${sessionId}`, token);
}

export function getPlayerId(sessionId: string): string | null {
  return localStorage.getItem(`${PLAYER_ID_PREFIX}${sessionId}`);
}

export function setPlayerId(sessionId: string, playerId: string) {
  localStorage.setItem(`${PLAYER_ID_PREFIX}${sessionId}`, playerId);
}

export function getPlayerName(sessionId: string): string | null {
  return localStorage.getItem(`${PLAYER_NAME_PREFIX}${sessionId}`);
}

export function setPlayerName(sessionId: string, name: string) {
  localStorage.setItem(`${PLAYER_NAME_PREFIX}${sessionId}`, name);
}

export function clearPlayerAuth(sessionId: string) {
  localStorage.removeItem(`${CLIENT_TOKEN_PREFIX}${sessionId}`);
  localStorage.removeItem(`${PLAYER_ID_PREFIX}${sessionId}`);
  localStorage.removeItem(`${PLAYER_NAME_PREFIX}${sessionId}`);
}
