import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activatePower, claimRound, getSessionState, submitAttempt, type ClientState } from '../api';
import CardView from '../components/CardView';
import ExpressionBuilder from '../components/ExpressionBuilder';
import PowerInventory from '../components/PowerInventory';
import LeaderboardDrawer from '../components/LeaderboardDrawer';
import LeaderboardTable from '../components/LeaderboardTable';
import { useDeviceProfile } from '../utils/useDeviceProfile';
import { clearPlayerAuth, getClientToken, getPlayerName } from '../utils/tokens';

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
  ROUND_TIMER_EXPIRED: 'Time is up for this round.',
  CLAIM_REQUIRED: 'Claim the answer first.',
  CLAIM_ACTIVE: 'Someone else is answering.',
  CLAIM_EXPIRED: 'Claim window expired.',
  EXPRESSION_TOO_LONG: 'Expression is too long.'
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
  if (errorCode === 'CLAIM_ACTIVE') {
    return `${base} (${remainingSeconds}s left).`;
  }
  return `${base} (${remainingSeconds}s)`;
}

export default function Play() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ClientState | null>(null);
  const [stateAt, setStateAt] = useState(Date.now());
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [inputMode, setInputMode] = useState<'builder' | 'keyboard'>('builder');
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const { isMobileUI } = useDeviceProfile();

  const clientToken = id ? getClientToken(id) : null;
  const [activating, setActivating] = useState(false);

  const handleActivatePower = async (powerId: string, payload: any) => {
    if (!id || !clientToken) return;
    setActivating(true);
    try {
      await activatePower(id, powerId, payload, clientToken);
      // Refresh state immediately
      const data = await getSessionState(id, clientToken);
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!id || !clientToken) {
      return;
    }
    getSessionState(id, clientToken)
      .then((data) => {
        setState(data);
        setStateAt(Date.now());
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load session'));
  }, [id, clientToken]);

  useEffect(() => {
    if (!id || !clientToken) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    let pollTimer: number | null = null;

    const startFallbackPoll = () => {
      if (pollTimer) {
        return;
      }
      pollTimer = window.setInterval(() => {
        getSessionState(id, clientToken)
          .then((data) => {
            setState(data);
            setStateAt(Date.now());
          })
          .catch(() => null);
      }, 5000);
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          sessionId: id,
          clientToken
        })
      );
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          setState(message.payload as ClientState);
          setStateAt(Date.now());
        }
      } catch {
        // ignore parse errors
      }
    };
    socket.onclose = () => {
      startFallbackPoll();
    };
    socket.onerror = () => {
      startFallbackPoll();
    };

    return () => {
      socket.close();
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [id, clientToken]);

  useEffect(() => {
    if (id && !clientToken) {
      navigate('/join');
    }
  }, [id, clientToken, navigate]);

  const elapsedSinceState = Math.floor((Date.now() - stateAt) / 1000);
  const lockoutRemaining = Math.max(0, (state?.lockoutRemaining ?? 0) - elapsedSinceState);
  const claim = state?.claim ?? null;
  const claimRemaining = claim?.expires_at
    ? Math.max(0, Math.ceil((new Date(claim.expires_at).getTime() - Date.now()) / 1000))
    : null;
  const claimActive = Boolean(claim?.active);
  const playerId = state?.player?.id ?? null;
  const isClaimer = claimActive && claim?.player_id === playerId;
  const multiplayer = state?.multiplayer;
  const claimRequired = Boolean(multiplayer?.enabled && multiplayer?.claimEnabled);

  const coldStartRemaining = state?.activeRules?.coldStartRemaining
    ? Math.max(0, state.activeRules.coldStartRemaining - elapsedSinceState)
    : null;

  const displayNumbers = state?.card
    ? state.activeRules?.reveal?.enabled
      ? state.activeRules.reveal.displayNumbers
      : [state.card.n1, state.card.n2, state.card.n3, state.card.n4]
    : [null, null, null, null];

  const bannedOps = state?.activeRules?.restrictedOps?.bannedOps ?? [];
  const bannedOpsLabel = bannedOps.length > 0 ? bannedOps.map((op) => opLabels[op] ?? op).join(', ') : '';
  const shapeLabel = state?.activeRules?.shapeConstraint === 'shapeA'
    ? '(a op b) op (c op d)'
    : state?.activeRules?.shapeConstraint === 'shapeB'
      ? 'a op (b op (c op d))'
      : '';

  const canSubmit = !lockoutRemaining
    && !coldStartRemaining
    && (!claimRequired || isClaimer);

  const handleClaim = async () => {
    if (!id || !clientToken) {
      return;
    }
    setError('');
    setResult('');
    try {
      const response = await claimRound(id, clientToken);
      if (response?.error_code) {
        setResult(formatResultMessage(response.error_code, response.remainingSeconds));
        return;
      }
      if (response?.state) {
        setState(response.state);
        setStateAt(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to claim');
    }
  };

  const handleSubmit = async () => {
    if (!id || !clientToken || !expression.trim()) {
      return;
    }
    setError('');
    setResult('');
    try {
      const response = await submitAttempt(id, { expression_raw: expression.trim() }, clientToken);
      const message = formatResultMessage(response.result.error_code, response.result.remainingSeconds);
      setResult(message);
      setExpression('');
      setState((prev) => (prev ? {
        ...prev,
        round: response.round,
        card: response.card,
        leaderboard: response.leaderboard,
        activeRules: response.activeRules ?? prev.activeRules,
        timeout: response.timeout ?? prev.timeout,
        timer: response.timer ?? prev.timer,
        hints: response.hints ?? prev.hints,
        claim: response.claim ?? prev.claim,
        multiplayer: response.multiplayer ?? prev.multiplayer
      } : prev));
      setStateAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  const handleLeave = () => {
    if (!id) {
      return;
    }
    clearPlayerAuth(id);
    navigate('/join');
  };

  if (state?.session.status === 'finished') {
    return (
      <div className="container">
        <div className="panel join-panel">
          <div className="section-title">Session ended</div>
          <div className="helper">This session has finished.</div>
          <button className="button ghost" onClick={handleLeave}>
            Leave session
          </button>
        </div>
      </div>
    );
  }

  if (!state || !state.card) {
    return (
      <div className="container">
        <div className="panel join-panel">
          <div className="section-title">Waiting for session...</div>
          {error && <div className="banner bad">{error}</div>}
        </div>
      </div>
    );
  }

  const playerName = getPlayerName(id ?? '') ?? state.player?.display_name ?? 'Player';

  return (
    <div className="container">
      <div className="panel player-play">
        <div className="section-title">Now Playing</div>
        <div className="helper">Welcome, {playerName}</div>

        {state.card && (
          <>
            <CardView numbers={displayNumbers} tier={state.card.dot_tier} />
            {(bannedOpsLabel || shapeLabel || coldStartRemaining) && (
              <div className="chip-row">
                {bannedOpsLabel && <span className="chip warning">Restricted: {bannedOpsLabel}</span>}
                {shapeLabel && <span className="chip">Shape: {shapeLabel}</span>}
                {coldStartRemaining ? <span className="chip">Submissions open in {coldStartRemaining}s</span> : null}
              </div>
            )}
          </>
        )}

        {claimRequired && (
          <div className="banner subtle">
            {claimActive ? (
              isClaimer ? (
                <>You are answering… {claimRemaining !== null ? `${claimRemaining}s left` : ''}</>
              ) : (
                <>{state.claim?.player_name ?? 'Another player'} is answering…</>
              )
            ) : (
              <>Claim the answer to unlock submission.</>
            )}
          </div>
        )}

        {lockoutRemaining > 0 && (
          <div className="banner warning">Locked out: {lockoutRemaining}s</div>
        )}

        {claimRequired && (
          <button
            className="button secondary"
            onClick={handleClaim}
            disabled={claimActive || lockoutRemaining > 0 || Boolean(coldStartRemaining)}
          >
            I think I have the answer
          </button>
        )}

        <div className="form">
          {/* Input mode toggle for mobile */}
          {isMobileUI && (
            <div className="button-row" style={{ marginBottom: '8px' }}>
              <button
                className={`button ${inputMode === 'builder' ? '' : 'secondary'}`}
                onClick={() => setInputMode('builder')}
                style={{ flex: 1 }}
              >
                Tap Build
              </button>
              <button
                className={`button ${inputMode === 'keyboard' ? '' : 'secondary'}`}
                onClick={() => setInputMode('keyboard')}
                style={{ flex: 1 }}
              >
                Keyboard
              </button>
            </div>
          )}

          {/* Expression Builder for mobile tap mode */}
          {isMobileUI && inputMode === 'builder' && state.card ? (
            <ExpressionBuilder
              numbers={displayNumbers}
              onExpressionChange={setExpression}
              disabled={!canSubmit}
              bannedOps={bannedOps}
            />
          ) : (
            <div>
              <label>Expression</label>
              <input
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                placeholder="(6/(1-3/4))"
                disabled={!canSubmit}
              />
            </div>
          )}
          <button className="button" onClick={handleSubmit} disabled={!canSubmit || !expression.trim()}>
            Submit
          </button>
        </div>

        {result && <div className="banner ok">{result}</div>}
        {error && <div className="banner bad">{error}</div>}

        {/* Power Cards Inventory */}
        {state.powerCards?.inventory && clientToken && (
          <PowerInventory
            inventory={state.powerCards.inventory}
            onActivate={handleActivatePower}
            disabled={!canSubmit || activating}
          />
        )}

        {/* Leaderboard Section */}
        {!isMobileUI ? (
          <div className="panel" style={{ marginTop: '16px' }}>
            <div
              className="section-title"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setLeaderboardOpen(!leaderboardOpen)}
            >
              Leaderboard {leaderboardOpen ? '▲' : '▼'}
            </div>
            {leaderboardOpen && (
              <LeaderboardTable rows={state.leaderboard} highlightPlayerId={playerId ?? undefined} />
            )}
            {!leaderboardOpen && state.leaderboard.length > 0 && (
              <div className="mini-leaderboard">
                {state.leaderboard.slice(0, 3).map((row, idx) => (
                  <span key={row.player_id} className={idx === 0 ? 'mini-leader' : ''}>
                    {idx + 1}. {row.display_name}: {row.score_total}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <LeaderboardDrawer
            open={leaderboardOpen}
            onToggle={() => setLeaderboardOpen(!leaderboardOpen)}
            rows={state.leaderboard}
            highlightPlayerId={playerId ?? undefined}
          />
        )}

        <div className="helper">Session: {state.session.title}</div>
        <button className="button ghost" onClick={handleLeave}>
          Leave session
        </button>
      </div>
    </div>
  );
}
