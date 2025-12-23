import type { Card, LeaderboardRow, Player, Round, Session, SessionRules } from '@arena/shared';
import { getHostToken, setHostToken } from './utils/tokens';

export type ActiveRules = {
  restrictedOps?: { bannedOps: Array<'add' | 'sub' | 'mul' | 'div'> } | null;
  shapeConstraint?: 'shapeA' | 'shapeB' | null;
  coldStartRemaining?: number | null;
  reveal?: {
    enabled: boolean;
    revealedIndices: boolean[];
    displayNumbers: Array<number | null>;
    nextRevealSeconds?: number | null;
  } | null;
};

export type SkipInfo = {
  skipEnabled?: boolean;
  skipsRemaining?: number | null;
  skipPenaltySummary?: { mode: 'none' | 'selectedPlayer' | 'leader'; points: number } | null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers ?? {})
    }
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function hostHeaders() {
  const token = getHostToken();
  if (!token) return undefined;
  return { 'x-host-token': token };
}

function clientHeaders(clientToken?: string | null) {
  if (!clientToken) return undefined;
  return { 'x-client-token': clientToken };
}

export async function boot() {
  const data = await request<{ dataDir: string; serverVersion: string; port?: number; lanUrls?: string[]; hostToken?: string }>(
    `/api/boot`,
    { method: 'POST' }
  );
  if (data.hostToken) {
    setHostToken(data.hostToken);
  }
  return data;
}

export function getNetworkInfo() {
  return request<{ hostname: string; lanIPv4: string | null; port?: number }>(`/api/network-info`, {
    method: 'GET',
    headers: hostHeaders()
  });
}

export function listPlayers() {
  return request<Player[]>('/api/players');
}

export function importPlayers(input: {
  players: Array<{
    display_name: string;
    age?: number | null;
    ib_grade?: string | null;
    notes?: string | null;
  }>; mode: 'skip' | 'update' | 'import_anyway'
}) {
  return request<{ inserted: number; updated: number; skipped: number; duplicates: number }>(
    '/api/players/import',
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export function createPlayer(input: {
  display_name: string;
  age?: number | null;
  ib_grade?: string | null;
  notes?: string | null;
}) {
  return request<Player>('/api/players', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePlayer(id: string, input: {
  display_name: string;
  age?: number | null;
  ib_grade?: string | null;
  notes?: string | null;
}) {
  return request<{ ok: true }>(`/api/players/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deletePlayer(id: string) {
  return request<{ ok: true }>(`/api/players/${id}`, { method: 'DELETE' });
}

export function exportPlayers() {
  return request<{ filename: string; path: string }>('/api/exports/players', { method: 'POST' });
}

export function exportSessions() {
  return request<{ filename: string; path: string }>('/api/exports/sessions', { method: 'POST' });
}

export function exportAttempts() {
  return request<{ filename: string; path: string }>('/api/exports/attempts', { method: 'POST' });
}

export function listSessions() {
  return request<Session[]>('/api/sessions');
}

export function resolveSession(joinCode: string) {
  return request<{ session_id: string; session_title: string; status: string }>(`/api/sessions/resolve`, {
    method: 'POST',
    body: JSON.stringify({ joinCode })
  });
}

export function joinSession(sessionId: string, joinCode: string, displayName: string) {
  return request<{ session_id: string; session_title: string; player_id: string; client_token: string }>(
    `/api/sessions/${sessionId}/join`,
    { method: 'POST', body: JSON.stringify({ joinCode, displayName }) }
  );
}

export type ClientState = {
  session: Session;
  player: Player | null;
  lockoutRemaining: number;
  round: Round;
  card: Card;
  leaderboard: LeaderboardRow[];
  skipEnabled?: boolean;
  skipsRemaining?: number | null;
  skipPenaltySummary?: SkipInfo['skipPenaltySummary'];
  timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
  claim?: {
    active: boolean;
    player_id: string | null;
    player_name?: string | null;
    started_at?: string | null;
    expires_at?: string | null;
  } | null;
  multiplayer?: SessionRules['multiplayer'] & {
    enabled: boolean;
    cardDistribution: 'shared' | 'perPlayer';
    claimEnabled: boolean;
    claimWindowSeconds: number;
    wrongLockoutSeconds: number;
    claimPenalty: { mode: 'leaderboardScaled'; base: number; max: number };
  };
  activeRules?: ActiveRules;
  timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
  hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
  powerCards?: {
    enabled: boolean;
    inventory?: Array<{ id: string; power_type: string; acquired_at: string; state_json?: string | null }>;
    activeEffects?: {
      lockedOps?: Array<'add' | 'sub' | 'mul' | 'div'>;
      frozenUntilRound?: number;
      playerEffects?: Record<string, {
        shieldActive?: boolean;
        doubleActive?: boolean;
        swapIndices?: [number, number] | null;
      }>;
    };
  };
};

export function getSessionState(sessionId: string, clientToken: string) {
  return request<ClientState>(`/api/sessions/${sessionId}/state`, {
    method: 'GET',
    headers: clientHeaders(clientToken)
  });
}

export function activatePower(
  sessionId: string,
  powerId: string,
  payload: { targetPlayerId?: string; targetOp?: string; swapIndices?: [number, number] },
  clientToken: string
) {
  return request<{ ok: true; result: { ok: true; effect: string; powerId: string } }>(
    `/api/sessions/${sessionId}/powers/${powerId}/activate`,
    {
      method: 'POST',
      headers: clientHeaders(clientToken),
      body: JSON.stringify(payload)
    }
  );
}

export function claimRound(sessionId: string, clientToken: string) {
  return request<{ ok?: boolean; error_code?: string; remainingSeconds?: number; state?: ClientState }>(
    `/api/sessions/${sessionId}/claim`,
    { method: 'POST', headers: clientHeaders(clientToken), body: JSON.stringify({}) }
  );
}

export function kickPlayer(sessionId: string, playerId: string) {
  return request<{ ok: boolean }>(`/api/sessions/${sessionId}/kick`, {
    method: 'POST',
    headers: hostHeaders(),
    body: JSON.stringify({ player_id: playerId })
  });
}

export function clearSessionHistory() {
  return request<{ ok: true; deletedSessions: number; deletedCards: number }>('/api/sessions/clear-history', {
    method: 'POST'
  });
}

export function createSession(input: {
  title: string;
  difficulty_mode: 'mixed' | 'fixed';
  fixed_tier?: 1 | 2 | 3 | 4;
  scoring?: SessionRules['scoring'];
  ops?: SessionRules['ops'];
  timer_mode?: SessionRules['timer_mode'];
  countdown_seconds?: number;
  hints_enabled?: boolean;
  hint1_after_seconds?: number;
  hint2_after_seconds?: number;
  lan_enabled?: boolean;
  lan_auto_accept?: boolean;
  no_undo_input?: boolean;
  scarcityEnabled?: boolean;
  scarcityMode?: 'banOneOp';
  scarcityBanSet?: { add?: boolean; sub?: boolean; mul?: boolean; div?: boolean };
  shapeConstraint?: 'shapeA' | 'shapeB' | null;
  mistakePenalty?: SessionRules['mistakePenalty'];
  coldStartSeconds?: number;
  blindReveal?: SessionRules['blindReveal'];
  uniquenessBonusPoints?: number;
  skip?: SessionRules['skip'];
  multiplayer?: SessionRules['multiplayer'];
  powerCards?: SessionRules['powerCards'];
}) {
  return request<Session>('/api/sessions', { method: 'POST', body: JSON.stringify(input) });
}

export function getSession(id: string) {
  return request<Session>(`/api/sessions/${id}`);
}

export function setPrankMode(id: string, active: boolean) {
  return request<{ ok: true; active: boolean }>(`/api/sessions/${id}/prank`, {
    method: 'POST',
    body: JSON.stringify({ active })
  });
}

export function startSession(id: string) {
  return request<{
    round: Round;
    card: Card;
    leaderboard: LeaderboardRow[];
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
  } & SkipInfo>(`/api/sessions/${id}/start`, { method: 'POST' });
}

export function getActiveRound(id: string, playerId?: string) {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  return request<{
    round: Round;
    card: Card;
    leaderboard: LeaderboardRow[];
    claim?: ClientState['claim'];
    multiplayer?: ClientState['multiplayer'];
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
  } & SkipInfo>(`/api/sessions/${id}/active-round${query}`, {
    method: 'GET',
    headers: playerId ? hostHeaders() : undefined
  });
}

export function submitAttempt(
  id: string,
  input: { player_id?: string; expression_raw: string },
  clientToken?: string
) {
  return request<{
    result: { correct: boolean; error_code: string; points?: number; remainingSeconds?: number; bonus_points?: number };
    round: Round;
    card: Card;
    leaderboard: LeaderboardRow[];
    claim?: ClientState['claim'];
    multiplayer?: ClientState['multiplayer'];
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
  } & SkipInfo>(`/api/sessions/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: clientToken ? clientHeaders(clientToken) : hostHeaders()
  });
}

export function skipRound(id: string, input?: { reason?: string; selected_player_id?: string; owner_player_id?: string }) {
  return request<{
    ok: boolean;
    error_code?: string;
    skipsRemaining?: number | null;
    skipped?: { round_id: string; skipped_at: string; reason?: string | null };
    round?: Round;
    card?: Card;
    leaderboard?: LeaderboardRow[];
    claim?: ClientState['claim'];
    multiplayer?: ClientState['multiplayer'];
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
    skipEnabled?: boolean;
    skipPenaltySummary?: SkipInfo['skipPenaltySummary'];
  }>(`/api/sessions/${id}/skip`, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
    headers: hostHeaders()
  });
}

export function getLeaderboard(id: string) {
  return request<LeaderboardRow[]>(`/api/sessions/${id}/leaderboard`);
}

export function endSession(id: string) {
  return request<{ ok: true }>(`/api/sessions/${id}/end`, { method: 'POST' });
}

export function getSummary(id: string) {
  return request<{ leaderboard: LeaderboardRow[]; totalRounds: number; hardestTierSolvedCount: number; skippedRounds: number }>(
    `/api/sessions/${id}/summary`
  );
}

export function exportSession(id: string) {
  return request<{ filename: string; path: string }>(`/api/sessions/${id}/export`, { method: 'POST' });
}

export function exportSessionBundle(id: string) {
  return request<{ filename: string; path: string }>(`/api/sessions/${id}/export-bundle`, { method: 'POST' });
}

export function exportSessionBundleReality(id: string) {
  return request<{ filename: string; path: string }>(`/api/sessions/${id}/export-bundle-reality`, { method: 'POST' });
}

export function getAnalytics(id: string) {
  return request<{
    leaderboard: LeaderboardRow[];
    accuracy: Array<{ player_id: string; accuracy: number; avg_tier: number | null }>;
    streaks: Record<string, { current: number; max: number }>;
    errorBreakdown: Record<string, Record<string, number>>;
    solvesByTier: Array<{ tier: number; count: number }>;
  }>(`/api/sessions/${id}/analytics`);
}

export type SessionRoundSummary = {
  id: string;
  status: string;
  solved_by_player_id: string | null;
  solved_by_name: string | null;
  solved_at: string | null;
  created_at: string;
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  dot_tier: number;
  isImpossible?: boolean;
};

export function getSessionRounds(id: string, options?: { reality?: boolean }) {
  const query = options?.reality ? '?reality=1' : '';
  return request<SessionRoundSummary[]>(`/api/sessions/${id}/rounds${query}`);
}

export function getProjector(id: string) {
  return request<{
    round: Round;
    card: Card;
    claim?: ClientState['claim'];
    multiplayer?: ClientState['multiplayer'];
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
  }>(`/api/sessions/${id}/projector`);
}

export function getPendingAttempts(id: string) {
  return request<Array<{
    id: string;
    round_id: string;
    player_id: string;
    player_name: string;
    expression_raw: string;
    normalized_expression: string | null;
    evaluated_num: number | null;
    evaluated_den: number | null;
    is_correct: number;
    error_code: string;
    created_at: string;
  }>>(`/api/sessions/${id}/pending-attempts`);
}

export function approvePendingAttempt(id: string, attemptId: string) {
  return request<{
    result: { correct: boolean; error_code: string; points?: number; remainingSeconds?: number; bonus_points?: number };
    round: Round;
    card: Card;
    leaderboard: LeaderboardRow[];
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
  } & SkipInfo>(`/api/sessions/${id}/pending-attempts/${attemptId}/approve`, { method: 'POST' });
}

export function rejectPendingAttempt(id: string, attemptId: string) {
  return request<{ ok: true }>(`/api/sessions/${id}/pending-attempts/${attemptId}/reject`, { method: 'POST' });
}

export function playJoin(input: { join_code: string; display_name?: string }) {
  return request<{
    session_id: string;
    session_title: string;
    join_code: string;
    lan_auto_accept: boolean;
    player: Player | null;
    client_token: string;
  }>('/api/play/join', { method: 'POST', body: JSON.stringify(input) });
}

export function playActive(input: { join_code: string }) {
  return request<{
    round: Round;
    card: Card;
    timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
    hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
    activeRules?: ActiveRules;
  }>('/api/play/active', { method: 'POST', body: JSON.stringify(input) });
}

export function playSubmit(input: { join_code: string; display_name: string; expression_raw: string }) {
  return request<
    | {
      status?: string;
      attempt_id?: string;
      correct?: boolean;
      error_code?: string;
      remainingSeconds?: number;
    }
    | {
      result: { correct: boolean; error_code: string; points?: number; remainingSeconds?: number; bonus_points?: number };
      round: Round;
      card: Card;
      leaderboard: LeaderboardRow[];
      timer?: { mode: 'off' | 'countdown' | 'stopwatch'; elapsedSeconds: number; remainingSeconds?: number };
      hints?: { enabled: boolean; hint1?: string | null; hint2?: string | null };
      activeRules?: ActiveRules;
    }
  >('/api/play/submit', { method: 'POST', body: JSON.stringify(input) });
}
