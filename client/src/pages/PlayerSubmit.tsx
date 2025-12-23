import React, { useEffect, useState } from 'react';
import type { Card, Round, LeaderboardRow, PowerCard } from '@arena/shared';
import { playJoin, playSubmit, getSessionState, activatePower, type ClientState, type ActiveRules } from '../api';
import CardView from '../components/CardView';
import ExpressionBuilder from '../components/ExpressionBuilder';
import PowerInventory from '../components/PowerInventory';
import LeaderboardDrawer from '../components/LeaderboardDrawer';
import { useDeviceProfile } from '../utils/useDeviceProfile';

const errorMessages: Record<string, string> = {
  OK: 'Correct! Your answer solved the card.',
  SYNTAX_ERROR: 'Syntax error.',
  SYNTAX_ERROR_UNARY_MINUS: 'Unary minus is not supported.',
  DISALLOWED_TOKEN: 'Only integers, operators, and parentheses are allowed.',
  WRONG_NUMBERS_USED: 'Use exactly the four card numbers, each once.',
  DIVISION_BY_ZERO: 'Division by zero detected.',
  NOT_EQUAL_24: 'Result is not exactly 24.',
  DISALLOWED_OPERATION: 'This operation is not allowed in this session.',
  SHAPE_CONSTRAINT_VIOLATION: 'Your expression does not match the required shape.',
  INVALID_FACTORIAL: 'Factorial must be a non-negative integer within limits.',
  INVALID_SQRT: 'Square root requires a perfect square.',
  INVALID_POWER: 'Exponent must be an integer within limits.',
  VALUE_OVERFLOW: 'Expression values grew too large.',
  PLAYER_LOCKED_OUT: 'You are locked out.',
  ROUND_COLD_START: 'Submissions are not open yet.',
  ROUND_TIMER_EXPIRED: 'Time is up for this round.'
};

const opLabels: Record<string, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/'
};

function formatResultMessage(errorCode: string, remainingSeconds?: number): string {
  const base = errorMessages[errorCode] ?? 'Result received.';
  if (remainingSeconds === undefined) {
    return base;
  }
  if (errorCode === 'PLAYER_LOCKED_OUT') {
    return `${base} Try again in ${remainingSeconds}s.`;
  }
  if (errorCode === 'ROUND_COLD_START') {
    return `${base} Opens in ${remainingSeconds}s.`;
  }
  return `${base} (${remainingSeconds}s)`;
}

export default function PlayerSubmit() {
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [joined, setJoined] = useState(false);
  const [auth, setAuth] = useState<{ sessionId: string; clientToken: string } | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [autoAccept, setAutoAccept] = useState(true);

  const [state, setState] = useState<ClientState | null>(null);

  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  // Mobile UI
  const { isMobileUI } = useDeviceProfile();
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!joined || !auth) {
      return;
    }
    const refresh = () => {
      getSessionState(auth.sessionId, auth.clientToken)
        .then((data) => {
          setState(data);
        })
        .catch(() => null);
    };
    refresh();
    const interval = setInterval(refresh, 1000); // Faster refresh for live feedback
    return () => clearInterval(interval);
  }, [joined, auth]);

  const handleJoin = async () => {
    setError('');
    if (!joinCode.trim() || !displayName.trim()) {
      setError('Enter a join code and your name.');
      return;
    }
    try {
      const response = await playJoin({ join_code: joinCode.trim().toUpperCase(), display_name: displayName.trim() });
      setSessionTitle(response.session_title);
      setAutoAccept(response.lan_auto_accept);
      if (response.session_id && response.client_token) {
        setAuth({ sessionId: response.session_id, clientToken: response.client_token });
      }
      if (response.player) {
        setPlayerId(response.player.id);
      }
      setJoined(true);
      setResult('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed');
    }
  };

  const handleActivatePower = async (powerId: string, payload: any) => {
    if (!auth) return;
    setActivating(true);
    try {
      await activatePower(auth.sessionId, powerId, payload, auth.clientToken);
      // Refresh immediately
      const data = await getSessionState(auth.sessionId, auth.clientToken);
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const handleSubmit = async () => {
    if (!joinCode || !displayName || !expression.trim()) {
      return;
    }
    setResult('');
    setError('');
    try {
      // Use existing playSubmit flow (simpler than switching entirely to submitAttempt for now)
      // Note: playSubmit keeps working via join_code/name
      const response = await playSubmit({
        join_code: joinCode.trim().toUpperCase(),
        display_name: displayName.trim(),
        expression_raw: expression.trim()
      });
      if ('result' in response) {
        // Optimistic update isn't needed as polling will catch up, but good for feedback
        const message = formatResultMessage(response.result.error_code, response.result.remainingSeconds);
        setResult(message);
      } else if (response.status === 'pending') {
        setResult('Submitted for host approval.');
      } else if (response.error_code) {
        setResult(formatResultMessage(response.error_code, response.remainingSeconds));
      }
      setExpression('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  const reset = () => {
    setJoined(false);
    setSessionTitle('');
    setAuth(null);
    setState(null);
    setExpression('');
    setResult('');
    setError('');
  };

  // Helper getters
  const card = state?.card ?? null;
  const activeRules = state?.activeRules ?? null;
  const leaderboard = state?.leaderboard ?? [];

  const displayNumbers = card
    ? activeRules?.reveal?.enabled
      ? activeRules.reveal.displayNumbers
      : [card.n1, card.n2, card.n3, card.n4]
    : [null, null, null, null];

  const bannedOps = activeRules?.restrictedOps?.bannedOps ?? [];
  const bannedOpsLabel = bannedOps.length > 0 ? bannedOps.map((op) => opLabels[op] ?? op).join(', ') : '';
  const shapeLabel = activeRules?.shapeConstraint === 'shapeA'
    ? '(a op b) op (c op d)'
    : activeRules?.shapeConstraint === 'shapeB'
      ? 'a op (b op (c op d))'
      : '';
    ?activeRules.coldStartRemaining
    : null;

  // Claim logic
  const now = Date.now();
  const claim = state?.claim;
  const claimExpiresAt = claim ? new Date(claim.expiresAt).getTime() : 0;
  const claimRemaining = Math.max(0, Math.ceil((claimExpiresAt - now) / 1000));

  const isClaimedByOther = claim && claim.playerId !== playerId && claimRemaining > 0;
  const isClaimedByMe = claim && claim.playerId === playerId && claimRemaining > 0;

  const lockoutRemaining = state?.lockoutRemaining ?? 0;
  const isLockedOut = lockoutRemaining > 0;

  const canInteract = card && !isClaimedByOther && !isLockedOut && coldStartRemaining === null;

  return (
    <div className="container" style={{ paddingBottom: '120px' }}> {/* Extra padding for drawer/sticky items */}
      <div className="panel player-join">
        <div className="section-title">Player Submit</div>
        {!joined ? (
          <div className="form">
            <div>
              <label>Join Code</label>
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="ABCDE" />
            </div>
            <div>
              <label>Your Name</label>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Enter name" />
            </div>
            <button className="button" onClick={handleJoin}>
              Join Session
            </button>
          </div>
        ) : (
          <>
            <div className="helper">Session: {sessionTitle}</div>
            {card ? (
              <>
                <CardView numbers={displayNumbers} tier={card.dot_tier} />
                {(bannedOpsLabel || shapeLabel || coldStartRemaining !== null || activeRules?.reveal?.enabled) && (
                  <div className="chip-row">
                    {bannedOpsLabel && <span className="chip warning">Restricted: {bannedOpsLabel}</span>}
                    {shapeLabel && <span className="chip">Shape: {shapeLabel}</span>}
                    {coldStartRemaining !== null && <span className="chip">Submissions open in {coldStartRemaining}s</span>}
                    {activeRules?.reveal?.enabled && <span className="chip">Blind reveal</span>}
                  </div>
                )}
              </>
            ) : (
              <div className="panel">Waiting for next round...</div>
            )}

            {/* Claim / Lockout Banners */}
            {isClaimedByOther && (
              <div className="banner lock">
                🔒 <strong>{claim?.player_name}</strong> is answering ({claimRemaining}s)
              </div>
            )}
            {isClaimedByMe && (
              <div className="banner info">
                ⚡️ <strong>You claimed it!</strong> Answer now ({claimRemaining}s)
              </div>
            )}
            {isLockedOut && (
              <div className="banner bad">
                Locked out for {lockoutRemaining}s
              </div>
            )}

            {/* Power Cards Inventory */}
            {state?.powerCards?.inventory && state.powerCards.inventory.length > 0 && (
              <div style={{ margin: '12px 0' }}>
                <PowerInventory
                  inventory={state.powerCards.inventory}
                  onActivate={handleActivatePower}
                  disabled={activating || !canInteract}
                />
              </div>
            )}

            <div className="form">
              {isMobileUI ? (
                <ExpressionBuilder
                  numbers={displayNumbers}
                  onExpressionChange={setExpression}
                  disabled={!canInteract}
                  bannedOps={bannedOps}
                />
              ) : (
                <div>
                  <label>Expression</label>
                  <input
                    value={expression}
                    onChange={(event) => setExpression(event.target.value)}
                    placeholder="(6/(1-3/4))"
                    disabled={!canInteract}
                  />
                </div>
              )}

              <button className="button" onClick={handleSubmit} disabled={!expression.trim() || !canInteract}>
                Submit
              </button>

              {autoAccept ? (
                <div className="helper">Auto-accept is on. Results appear immediately.</div>
              ) : (
                <div className="helper">Submissions require host approval.</div>
              )}
            </div>

            <button className="button secondary" onClick={reset}>
              Leave
            </button>

            {/* Mobile Leaderboard Drawer */}
            <LeaderboardDrawer
              open={leaderboardOpen}
              onToggle={() => setLeaderboardOpen(!leaderboardOpen)}
              rows={leaderboard}
              highlightPlayerId={playerId ?? undefined}
            />
          </>
        )}
        {result && <div className="banner ok">{result}</div>}
        {error && <div className="banner bad">{error}</div>}
      </div>
    </div>
  );
}
