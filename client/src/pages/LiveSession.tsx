import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { computeTimerState } from '@arena/shared';
import type { Card, LeaderboardRow, Round, Session } from '@arena/shared';
import {
  approvePendingAttempt,
  boot,
  endSession,
  getActiveRound,
  getPendingAttempts,
  getSession,
  rejectPendingAttempt,
  skipRound,
  submitAttempt
} from '../api';
import type { ActiveRules, SkipInfo } from '../api';
import CardView from '../components/CardView';
import LeaderboardTable from '../components/LeaderboardTable';
import Modal from '../components/Modal';
import PlayerSelect from '../components/PlayerSelect';
import { parseRulesJson } from '../utils/rules';

const errorMessages: Record<string, string> = {
  OK: 'Correct! You solved the card.',
  SYNTAX_ERROR: 'Syntax error. Check your operators and parentheses.',
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
  PLAYER_LOCKED_OUT: 'Player is locked out.',
  ROUND_COLD_START: 'Submissions are not open yet.',
  ROUND_TIMER_EXPIRED: 'Time is up for this round.'
};

const skipErrorMessages: Record<string, string> = {
  SKIP_DISABLED: 'Skip is disabled for this session.',
  SKIP_LIMIT_REACHED: 'No skips remaining.',
  NO_ACTIVE_ROUND: 'No active round to skip.',
  SKIP_PLAYER_REQUIRED: 'Select a player for the skip penalty.'
};

function formatTimer(seconds?: number): string {
  if (seconds === undefined) {
    return '--:--';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

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

export default function LiveSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [activeRules, setActiveRules] = useState<ActiveRules | null>(null);
  const [timeout, setTimeout] = useState<{ expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null>(null);
  const [skipInfo, setSkipInfo] = useState<SkipInfo | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [expression, setExpression] = useState('');
  const [inputLocked, setInputLocked] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; message: string; points?: number } | null>(null);
  const [skipNotice, setSkipNotice] = useState('');
  const [skipModalOpen, setSkipModalOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [skipPenaltyPlayerId, setSkipPenaltyPlayerId] = useState('');
  const [skipError, setSkipError] = useState('');
  const [pendingAttempts, setPendingAttempts] = useState<Array<{
    id: string;
    player_name: string;
    expression_raw: string;
    is_correct: number;
    error_code: string;
  }>>([]);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const rules = useMemo(() => parseRulesJson(session?.rules_json), [session]);

  useEffect(() => {
    if (!id) {
      return;
    }
    getSession(id)
      .then(setSession)
      .catch((err) => setError(err.message));
    getActiveRound(id)
      .then((data) => {
        setRound(data.round);
        setCard(data.card);
        setLeaderboard(data.leaderboard);
        setActiveRules(data.activeRules ?? null);
        setTimeout(data.timeout ?? null);
        setSkipInfo({
          skipEnabled: data.skipEnabled,
          skipsRemaining: data.skipsRemaining ?? null,
          skipPenaltySummary: data.skipPenaltySummary ?? null
        });
        if (data.leaderboard.length > 0) {
          setPlayerId(data.leaderboard[0].player_id);
        }
      })
      .catch((err) => setError(err.message));

    boot().then((data) => setLanUrls(data.lanUrls ?? [])).catch(() => null);
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }
    const refresh = () => {
      getActiveRound(id)
        .then((data) => {
          setRound(data.round);
          setCard(data.card);
          setLeaderboard(data.leaderboard);
          setActiveRules(data.activeRules ?? null);
          setTimeout(data.timeout ?? null);
          setSkipInfo({
            skipEnabled: data.skipEnabled,
            skipsRemaining: data.skipsRemaining ?? null,
            skipPenaltySummary: data.skipPenaltySummary ?? null
          });
        })
        .catch(() => null);
    };
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setResult(null);
    setInputLocked(false);
    setExpression('');
    setSkipNotice('');
    setSkipReason('');
    setSkipPenaltyPlayerId('');
    setSkipError('');
    setTimeout(null);
  }, [round?.id]);

  useEffect(() => {
    if (!id || !rules.lan_enabled || rules.lan_auto_accept) {
      setPendingAttempts([]);
      return;
    }
    const refresh = () => {
      getPendingAttempts(id)
        .then((rows) => setPendingAttempts(rows))
        .catch(() => null);
    };
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [id, rules.lan_enabled, rules.lan_auto_accept]);

  useEffect(() => {
    if (!playerId && leaderboard.length > 0) {
      setPlayerId(leaderboard[0].player_id);
    }
  }, [leaderboard, playerId]);

  const handleSubmit = async () => {
    if (!id || !playerId) {
      return;
    }
    try {
      const response = await submitAttempt(id, { player_id: playerId, expression_raw: expression });
      setRound(response.round);
      setCard(response.card);
      setLeaderboard(response.leaderboard);
      setActiveRules(response.activeRules ?? null);
      setTimeout(response.timeout ?? null);
      setSkipInfo({
        skipEnabled: response.skipEnabled,
        skipsRemaining: response.skipsRemaining ?? null,
        skipPenaltySummary: response.skipPenaltySummary ?? null
      });
      const message = formatResultMessage(response.result.error_code, response.result.remainingSeconds);
      setResult({ correct: response.result.correct, message, points: response.result.points });
      if (rules.no_undo_input) {
        setInputLocked(true);
      } else {
        setExpression('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit attempt');
    }
  };

  const handleNewAttempt = () => {
    setExpression('');
    setInputLocked(false);
  };

  const handleEnd = async () => {
    if (!id) {
      return;
    }
    await endSession(id);
    navigate(`/sessions/${id}/summary`);
  };

  const handleApprove = async (attemptId: string) => {
    if (!id) {
      return;
    }
    try {
      const response = await approvePendingAttempt(id, attemptId);
      setRound(response.round);
      setCard(response.card);
      setLeaderboard(response.leaderboard);
      setActiveRules(response.activeRules ?? null);
      setTimeout(response.timeout ?? null);
      setSkipInfo({
        skipEnabled: response.skipEnabled,
        skipsRemaining: response.skipsRemaining ?? null,
        skipPenaltySummary: response.skipPenaltySummary ?? null
      });
      const message = formatResultMessage(response.result.error_code, response.result.remainingSeconds);
      setResult({ correct: response.result.correct, message, points: response.result.points });
      setPendingAttempts((prev) => prev.filter((entry) => entry.id !== attemptId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleSkip = async () => {
    if (!id) {
      return;
    }
    setSkipError('');
    const penaltyMode = skipInfo?.skipPenaltySummary?.mode ?? 'none';
    if (penaltyMode === 'selectedPlayer' && !skipPenaltyPlayerId) {
      setSkipError(skipErrorMessages.SKIP_PLAYER_REQUIRED);
      return;
    }
    try {
      const response = await skipRound(id, {
        reason: skipReason.trim() || undefined,
        selected_player_id: penaltyMode === 'selectedPlayer' ? skipPenaltyPlayerId : undefined
      });
      if (!response.ok) {
        const message = response.error_code ? skipErrorMessages[response.error_code] ?? 'Skip failed.' : 'Skip failed.';
        setSkipError(message);
        return;
      }
      if (response.round && response.card && response.leaderboard) {
        setRound(response.round);
        setCard(response.card);
        setLeaderboard(response.leaderboard);
        setActiveRules(response.activeRules ?? null);
        setTimeout(response.timeout ?? null);
        setSkipInfo({
          skipEnabled: response.skipEnabled,
          skipsRemaining: response.skipsRemaining ?? null,
          skipPenaltySummary: response.skipPenaltySummary ?? null
        });
      }
      setSkipModalOpen(false);
      setSkipReason('');
      setSkipPenaltyPlayerId('');
      setSkipNotice('Card skipped. New card generated.');
      window.setTimeout(() => setSkipNotice(''), 2500);
    } catch (err) {
      setSkipError(err instanceof Error ? err.message : 'Skip failed');
    }
  };

  const handleReject = async (attemptId: string) => {
    if (!id) {
      return;
    }
    try {
      await rejectPendingAttempt(id, attemptId);
      setPendingAttempts((prev) => prev.filter((entry) => entry.id !== attemptId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    }
  };

  const opLabels: Record<string, string> = {
    add: '+',
    sub: '-',
    mul: '*',
    div: '/',
    pow: '^',
    fact: '!',
    sqrt: '√',
    concat: 'concat'
  };
  const bannedOps = activeRules?.restrictedOps?.bannedOps ?? [];
  const bannedSet = new Set(bannedOps);
  const allowedOps = Object.entries(rules.ops)
    .filter(([op, enabled]) => enabled && !bannedSet.has(op))
    .map(([op]) => opLabels[op] ?? op);
  const bannedOpsLabel = bannedOps.length > 0
    ? bannedOps.map((op) => opLabels[op] ?? op).join(', ')
    : '';
  const shapeLabel = activeRules?.shapeConstraint === 'shapeA'
    ? '(a op b) op (c op d)'
    : activeRules?.shapeConstraint === 'shapeB'
      ? 'a op (b op (c op d))'
      : '';
  const coldStartRemaining = activeRules?.coldStartRemaining && activeRules.coldStartRemaining > 0
    ? activeRules.coldStartRemaining
    : null;
  const displayNumbers = card
    ? activeRules?.reveal?.enabled
      ? activeRules.reveal.displayNumbers
      : [card.n1, card.n2, card.n3, card.n4]
    : [null, null, null, null];

  const timeoutRemaining = timeout?.expired ? timeout.remainingSeconds ?? null : null;
  const timeoutMessage = timeout?.expired
    ? timeout.solution
      ? `Time's up. Example: ${timeout.solution}`
      : "Time's up. Next card soon."
    : '';

  const skipPenaltySummary = skipInfo?.skipPenaltySummary;
  const skipEnabled = Boolean(skipInfo?.skipEnabled);
  const skipsRemaining = skipInfo?.skipsRemaining;
  const skipLimitLabel = skipEnabled
    ? skipsRemaining === null
      ? 'Skips: unlimited'
      : `Skips remaining: ${skipsRemaining}`
    : '';
  const skipPenaltyLabel = skipPenaltySummary && skipPenaltySummary.mode !== 'none'
    ? `Penalty: -${skipPenaltySummary.points} (${skipPenaltySummary.mode === 'leader' ? 'leader' : 'selected player'})`
    : 'Penalty: none';

  const timer = round && rules.timer_mode !== 'off'
    ? computeTimerState(round.created_at, rules.timer_mode, rules.countdown_seconds)
    : null;

  const hints = useMemo(() => {
    if (!round || !card || !rules.hints_enabled) {
      return [];
    }
    const available: string[] = [];
    if (round.hint1_revealed_at) {
      const hintOps = card.hint_ops_json ? (JSON.parse(card.hint_ops_json) as string[]) : [];
      if (hintOps[0]) {
        available.push(`Hint 1: Operation ${hintOps[0]}`);
      }
    }
    if (round.hint2_revealed_at) {
      const hintIntermediates = card.hint_intermediates_json ? (JSON.parse(card.hint_intermediates_json) as number[]) : [];
      if (hintIntermediates[0] !== undefined) {
        available.push(`Hint 2: Intermediate ${hintIntermediates[0]}`);
      }
    }
    return available;
  }, [round, card, rules.hints_enabled, tick]);

  return (
    <div className="container">
      <div className="grid" style={{ gap: '24px' }}>
        <div className="panel">
          <div className="session-header">
            <div>
              <div className="section-title">Live Session</div>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{session?.title ?? 'Loading...'}</div>
              {session?.join_code && rules.lan_enabled && (
                <div className="helper">Join code: <strong>{session.join_code}</strong></div>
              )}
              {rules.lan_enabled && lanUrls.length > 0 && (
                <div className="helper">LAN URL: {lanUrls[0]}</div>
              )}
            </div>
            <div className="session-actions">
              <Link className="button ghost" to={`/projector/${id ?? ''}`} target="_blank" rel="noreferrer">
                Projector View
              </Link>
              <Link className="button ghost" to={`/sessions/${id ?? ''}/analytics`}>
                Analytics
              </Link>
              <button className="button secondary" onClick={handleEnd}>
                End Session
              </button>
            </div>
          </div>
          <div className="chip-row">
            <span className="chip">Ops: {allowedOps.join(', ')}</span>
            {rules.timer_mode !== 'off' && timer && (
              <span className="chip">Timer: {rules.timer_mode} ({formatTimer(timer.remainingSeconds ?? timer.elapsedSeconds)})</span>
            )}
            {rules.hints_enabled && <span className="chip">Hints enabled</span>}
            {rules.lan_enabled && <span className="chip">LAN mode</span>}
            {bannedOpsLabel && <span className="chip warning">Restricted: {bannedOpsLabel}</span>}
            {shapeLabel && <span className="chip">Shape: {shapeLabel}</span>}
            {coldStartRemaining !== null && <span className="chip">Submissions open in {coldStartRemaining}s</span>}
            {activeRules?.reveal?.enabled && <span className="chip">Blind reveal</span>}
            {skipEnabled && <span className="chip">{skipLimitLabel}</span>}
          </div>
        </div>

        {card && (
          <div className="panel">
            <CardView numbers={displayNumbers} tier={card.dot_tier} />
            {hints.length > 0 && (
              <div className="hint-list">
                {hints.map((hint, index) => (
                  <div key={`${hint}-${index}`} className="banner ok">
                    {hint}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="panel">
          <div className="section-title">Check Answer</div>
          <div className="form">
            <div>
              <label>Player</label>
              <PlayerSelect players={leaderboard} value={playerId} onChange={setPlayerId} />
            </div>
            <div>
              <label>Expression</label>
              <input
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                placeholder="(6/(1-3/4)) or concat(1,2)*2"
                readOnly={rules.no_undo_input && inputLocked}
              />
            </div>
            <div className="button-row">
              <button
                className="button"
                onClick={handleSubmit}
                disabled={!expression || !playerId || (rules.no_undo_input && inputLocked) || coldStartRemaining !== null || timeout?.expired}
              >
                Check Answer
              </button>
              {rules.no_undo_input && (
                <button className="button secondary" onClick={handleNewAttempt} disabled={!expression && !inputLocked}>
                  New attempt
                </button>
              )}
              {skipEnabled && (
                <button
                  className="button ghost"
                  onClick={() => setSkipModalOpen(true)}
                  disabled={skipsRemaining === 0}
                >
                  Skip
                </button>
              )}
            </div>
            {skipNotice && <div className="banner ok">{skipNotice}</div>}
            {timeout?.expired && (
              <div className="banner warning">
                {timeoutMessage} {timeoutRemaining !== null ? `Auto-skip in ${timeoutRemaining}s.` : ''}
              </div>
            )}
            {result && (
              <div className={`banner ${result.correct ? 'ok' : 'bad'}`}>
                {result.message} {result.correct && result.points ? `(+${result.points} pts)` : ''}
              </div>
            )}
            {error && <div className="banner bad">{error}</div>}
          </div>
        </div>

        {rules.lan_enabled && !rules.lan_auto_accept && (
          <div className="panel">
            <div className="section-title">Pending LAN Submissions</div>
            {pendingAttempts.length === 0 ? (
              <p>No pending submissions.</p>
            ) : (
              <div className="table-scroll" style={{ maxHeight: '240px' }}>
                <table className="table sticky">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Expression</th>
                      <th>Result</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{attempt.player_name}</td>
                        <td>{attempt.expression_raw}</td>
                        <td>{attempt.is_correct === 1 ? 'Correct' : attempt.error_code}</td>
                        <td className="table-actions">
                          <button className="button" onClick={() => handleApprove(attempt.id)}>
                            Approve
                          </button>
                          <button className="button ghost" onClick={() => handleReject(attempt.id)}>
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="panel">
          <div className="section-title">Leaderboard</div>
          <LeaderboardTable rows={leaderboard} />
        </div>
      </div>
      <Modal open={skipModalOpen} title="Skip this card?" onClose={() => setSkipModalOpen(false)}>
        <div className="form">
          <p style={{ marginTop: 0 }}>
            This will discard the current card and generate a new one. No points awarded.
          </p>
          {skipEnabled && (
            <p style={{ marginTop: '4px', color: 'var(--muted)' }}>{skipLimitLabel}</p>
          )}
          <p style={{ marginTop: '4px', color: 'var(--muted)' }}>{skipPenaltyLabel}</p>
          <div>
            <label>Reason (optional)</label>
            <input value={skipReason} onChange={(event) => setSkipReason(event.target.value)} />
          </div>
          {skipPenaltySummary?.mode === 'selectedPlayer' && (
            <div>
              <label>Penalty Player</label>
              <PlayerSelect players={leaderboard} value={skipPenaltyPlayerId} onChange={setSkipPenaltyPlayerId} />
            </div>
          )}
          <div className="button-row">
            <button className="button" onClick={handleSkip}>
              Confirm Skip
            </button>
            <button className="button secondary" onClick={() => setSkipModalOpen(false)}>
              Cancel
            </button>
          </div>
          {skipError && <div className="banner bad">{skipError}</div>}
        </div>
      </Modal>
    </div>
  );
}
