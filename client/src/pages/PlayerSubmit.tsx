import React, { useEffect, useState } from 'react';
import type { Card, Round } from '@arena/shared';
import { playActive, playJoin, playSubmit, type ActiveRules } from '../api';
import CardView from '../components/CardView';

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
  const [autoAccept, setAutoAccept] = useState(true);
  const [card, setCard] = useState<Card | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [activeRules, setActiveRules] = useState<ActiveRules | null>(null);
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!joined || !joinCode) {
      return;
    }
    const refresh = () => {
      playActive({ join_code: joinCode })
        .then((data) => {
          setCard(data.card);
          setRound(data.round);
          setActiveRules(data.activeRules ?? null);
        })
        .catch(() => null);
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [joined, joinCode]);

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
      setJoined(true);
      setResult('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed');
    }
  };

  const handleSubmit = async () => {
    if (!joinCode || !displayName || !expression.trim()) {
      return;
    }
    setResult('');
    setError('');
    try {
      const response = await playSubmit({
        join_code: joinCode.trim().toUpperCase(),
        display_name: displayName.trim(),
        expression_raw: expression.trim()
      });
      if ('result' in response) {
        setCard(response.card);
        setRound(response.round);
        setActiveRules(response.activeRules ?? null);
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
    setCard(null);
    setRound(null);
    setActiveRules(null);
    setExpression('');
    setResult('');
    setError('');
  };

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
  const coldStartRemaining = activeRules?.coldStartRemaining && activeRules.coldStartRemaining > 0
    ? activeRules.coldStartRemaining
    : null;

  return (
    <div className="container">
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
            <div className="form">
              <div>
                <label>Expression</label>
                <input
                  value={expression}
                  onChange={(event) => setExpression(event.target.value)}
                  placeholder="(6/(1-3/4))"
                />
              </div>
              <button className="button" onClick={handleSubmit} disabled={!expression.trim() || coldStartRemaining !== null}>
                Submit
              </button>
              {autoAccept ? (
                <div className="helper">Auto-accept is on. Results appear immediately.</div>
              ) : (
                <div className="helper">Submissions require host approval.</div>
              )}
            </div>
            <button className="button secondary" onClick={reset}>
              Change Session
            </button>
          </>
        )}
        {result && <div className="banner ok">{result}</div>}
        {error && <div className="banner bad">{error}</div>}
      </div>
    </div>
  );
}
