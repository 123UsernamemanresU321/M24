import React, { useEffect, useState } from 'react';
import { verifyExpression } from '@arena/shared';
import CardView from '../components/CardView';
import { getTierLabel } from '../utils/tier';
import {
  type SingleplayerCard,
  type SingleplayerHistoryEntry,
  cardSignature,
  generateSingleplayerCard,
  loadSingleplayerState,
  resetSingleplayerState,
  saveSingleplayerState
} from '../utils/singleplayer';

const errorMessages: Record<string, string> = {
  OK: 'Correct. Card solved.',
  SYNTAX_ERROR: 'Syntax error. Check operators and parentheses.',
  SYNTAX_ERROR_UNARY_MINUS: 'Unary minus is not supported.',
  DISALLOWED_TOKEN: 'Only integers, +, -, *, /, parentheses, whitespace, × and ÷ are allowed.',
  WRONG_NUMBERS_USED: 'Use exactly the four card numbers, each once.',
  DIVISION_BY_ZERO: 'Division by zero detected.',
  NOT_EQUAL_24: 'That expression does not equal 24.',
  INVALID_FACTORIAL: 'Factorial is invalid here.',
  INVALID_SQRT: 'Square root is invalid here.',
  INVALID_POWER: 'Power is invalid here.',
  DISALLOWED_OPERATION: 'That operation is not available in Pages singleplayer mode.',
  SHAPE_CONSTRAINT_VIOLATION: 'That expression shape is not allowed.',
  VALUE_OVERFLOW: 'Values became too large.'
};

type ResultBanner = {
  tone: 'ok' | 'bad' | 'warning' | 'notice';
  text: string;
};

function formatNumbers(numbers: [number, number, number, number]) {
  return numbers.join(' • ');
}

function numbersToArray(card: SingleplayerCard | null): Array<number | null> {
  if (!card) {
    return [null, null, null, null];
  }
  return [...card.numbers];
}

function historyEntryText(entry: SingleplayerHistoryEntry) {
  return `${formatNumbers(entry.numbers)} • ${getTierLabel(entry.tier)}`;
}

function buildRecentSignatures(history: SingleplayerHistoryEntry[], currentCard?: SingleplayerCard | null) {
  const signatures = new Set(history.slice(0, 20).map((entry) => cardSignature(entry.numbers)));
  if (currentCard) {
    signatures.add(cardSignature(currentCard.numbers));
  }
  return signatures;
}

export default function Singleplayer() {
  const [state, setState] = useState(() => loadSingleplayerState());
  const [expression, setExpression] = useState('');
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const [revealedSolution, setRevealedSolution] = useState<string | null>(null);
  const [error, setError] = useState('');

  const currentCard = state.currentCard;

  useEffect(() => {
    if (currentCard) {
      return;
    }
    try {
      const nextCard = generateSingleplayerCard(state.settings, buildRecentSignatures(state.history));
      setState((prev) => ({ ...prev, currentCard: nextCard }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a card.');
    }
  }, [currentCard, state.history, state.settings]);

  useEffect(() => {
    saveSingleplayerState(state);
  }, [state]);

  useEffect(() => {
    const debugWindow = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => Promise<void>;
    };
    debugWindow.render_game_to_text = () =>
      JSON.stringify({
        mode: 'singleplayer-static',
        currentCard: currentCard
          ? {
              numbers: currentCard.numbers,
              tier: currentCard.dotTier,
              attempts: currentCard.attempts,
              revealed: currentCard.revealed
            }
          : null,
        score: state.stats.score,
        streak: state.stats.currentStreak,
        historyCount: state.history.length,
        revealedSolution
      });
    debugWindow.advanceTime = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    return () => {
      delete debugWindow.render_game_to_text;
      delete debugWindow.advanceTime;
    };
  }, [currentCard, revealedSolution, state.history.length, state.stats.currentStreak, state.stats.score]);

  const applyState = (updater: typeof state | ((current: typeof state) => typeof state)) => {
    setState((prev) => (typeof updater === 'function' ? (updater as (current: typeof state) => typeof state)(prev) : updater));
  };

  const drawNextCard = (reason?: 'skipped', extraHistoryEntry?: SingleplayerHistoryEntry) => {
    try {
      const nextCard = generateSingleplayerCard(
        state.settings,
        buildRecentSignatures(
          extraHistoryEntry ? [extraHistoryEntry, ...state.history] : state.history,
          currentCard
        )
      );
      applyState((prev) => ({
        ...prev,
        currentCard: nextCard,
        history: extraHistoryEntry ? [extraHistoryEntry, ...prev.history].slice(0, 30) : prev.history,
        stats: reason === 'skipped'
          ? { ...prev.stats, skippedCount: prev.stats.skippedCount + 1, currentStreak: 0 }
          : prev.stats
      }));
      setExpression('');
      setRevealedSolution(null);
      setBanner(reason === 'skipped' ? { tone: 'notice', text: 'Card skipped. New card generated.' } : null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draw the next card.');
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentCard) {
      return;
    }
    if (currentCard.revealed) {
      setBanner({ tone: 'warning', text: 'This card was already revealed, so it can no longer award points.' });
      return;
    }
    const result = verifyExpression(expression, currentCard.numbers);
    if (!result.ok) {
      const nextAttempts = currentCard.attempts + 1;
      applyState((prev) => ({
        ...prev,
        currentCard: prev.currentCard ? { ...prev.currentCard, attempts: nextAttempts } : prev.currentCard,
        stats: {
          ...prev.stats,
          wrongCount: prev.stats.wrongCount + 1,
          currentStreak: 0
        }
      }));
      setBanner({ tone: 'bad', text: errorMessages[result.errorCode] ?? 'Incorrect.' });
      return;
    }

    const points = state.settings.scoring[String(currentCard.dotTier) as '1' | '2' | '3' | '4'] ?? 0;
    const attempts = currentCard.attempts + 1;
    const historyEntry: SingleplayerHistoryEntry = {
      id: currentCard.id,
      numbers: currentCard.numbers,
      tier: currentCard.dotTier,
      points,
      expression,
      solutionExpression: currentCard.solutionExpression,
      attempts,
      outcome: 'solved',
      createdAt: currentCard.startedAt,
      completedAt: new Date().toISOString()
    };
    const nextStreak = state.stats.currentStreak + 1;
    const nextStats = {
      ...state.stats,
      score: state.stats.score + points,
      solvedCount: state.stats.solvedCount + 1,
      currentStreak: nextStreak,
      bestStreak: Math.max(state.stats.bestStreak, nextStreak)
    };
    const nextCard = generateSingleplayerCard(
      state.settings,
      buildRecentSignatures([historyEntry, ...state.history], currentCard)
    );
    applyState((prev) => ({
      ...prev,
      stats: nextStats,
      currentCard: nextCard,
      history: [historyEntry, ...prev.history].slice(0, 30)
    }));
    setExpression('');
    setRevealedSolution(null);
    setBanner({ tone: 'ok', text: `Correct. +${points} points.` });
    setError('');
  };

  const handleReveal = () => {
    if (!currentCard) {
      return;
    }
    applyState((prev) => ({
      ...prev,
      currentCard: prev.currentCard ? { ...prev.currentCard, revealed: true } : prev.currentCard
    }));
    setRevealedSolution(currentCard.solutionExpression);
    setBanner({ tone: 'warning', text: 'Solution revealed. No points awarded for this card.' });
  };

  const handleSkipAfterReveal = () => {
    if (!currentCard) {
      return;
    }
    const entry: SingleplayerHistoryEntry = {
      id: currentCard.id,
      numbers: currentCard.numbers,
      tier: currentCard.dotTier,
      points: 0,
      solutionExpression: currentCard.solutionExpression,
      attempts: currentCard.attempts,
      outcome: 'skipped',
      createdAt: currentCard.startedAt,
      completedAt: new Date().toISOString()
    };
    drawNextCard('skipped', entry);
  };

  const handleSkipCurrent = () => {
    if (!currentCard) {
      return;
    }
    const entry: SingleplayerHistoryEntry = {
      id: currentCard.id,
      numbers: currentCard.numbers,
      tier: currentCard.dotTier,
      points: 0,
      solutionExpression: currentCard.solutionExpression,
      attempts: currentCard.attempts,
      outcome: 'skipped',
      createdAt: currentCard.startedAt,
      completedAt: new Date().toISOString()
    };
    drawNextCard('skipped', entry);
  };

  const handleReset = () => {
    const confirmed = window.confirm('Reset local singleplayer progress in this browser?');
    if (!confirmed) {
      return;
    }
    const next = resetSingleplayerState();
    setState({
      ...next,
      currentCard: generateSingleplayerCard(next.settings, new Set())
    });
    setExpression('');
    setRevealedSolution(null);
    setBanner({ tone: 'notice', text: 'Local singleplayer progress reset.' });
    setError('');
  };

  const updateScoring = (tier: '1' | '2' | '3' | '4', value: string) => {
    const parsed = Math.max(0, Math.floor(Number(value) || 0));
    applyState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        scoring: {
          ...prev.settings.scoring,
          [tier]: parsed
        }
      }
    }));
  };

  return (
    <div className="container">
      <div className="grid singleplayer-grid">
        <section className="panel singleplayer-stage fade-up">
          <div className="section-title-row">
            <div>
              <div className="section-title">Singleplayer Arena</div>
              <div className="helper">Runs entirely in your browser on GitHub Pages. Multiplayer still requires the local app.</div>
            </div>
            <div className="button-row">
              <button className="button secondary small" onClick={handleSkipCurrent}>
                Skip Card
              </button>
              <button className="button secondary small" onClick={handleReset}>
                Reset Local Progress
              </button>
            </div>
          </div>

          <div className="singleplayer-stage-grid">
            <div className="card-display">
              <CardView numbers={numbersToArray(currentCard)} tier={currentCard?.dotTier ?? 2} />
              {currentCard && (
                <div className="chip-row">
                  {currentCard.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                  {currentCard.hint?.op && <span className="chip">Hint op: {currentCard.hint.op}</span>}
                </div>
              )}
            </div>

            <div className="singleplayer-controls">
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Score</div>
                  <div className="stat-value">{state.stats.score}</div>
                  <div className="stat-sub">Custom scoring per tier</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Current streak</div>
                  <div className="stat-value">{state.stats.currentStreak}</div>
                  <div className="stat-sub">Best: {state.stats.bestStreak}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Solved / wrong</div>
                  <div className="stat-value">
                    {state.stats.solvedCount} / {state.stats.wrongCount}
                  </div>
                  <div className="stat-sub">Skipped: {state.stats.skippedCount}</div>
                </div>
              </div>

              <form className="form" onSubmit={handleSubmit}>
                <div>
                  <label>Expression</label>
                  <input
                    value={expression}
                    onChange={(event) => setExpression(event.target.value)}
                    placeholder="(8 / (3 - 8 / 3))"
                    autoComplete="off"
                    disabled={!currentCard || currentCard.revealed}
                  />
                  <div className="helper">Use exactly the four numbers on the card, each once.</div>
                </div>
                <div className="button-row">
                  <button
                    className="button"
                    type="submit"
                    disabled={!currentCard || currentCard.revealed || expression.trim().length === 0}
                  >
                    Check Answer
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={handleReveal}
                    disabled={!currentCard || currentCard.revealed}
                  >
                    Reveal Solution
                  </button>
                </div>
              </form>

              {banner && <div className={`banner ${banner.tone}`}>{banner.text}</div>}
              {error && <div className="banner bad">{error}</div>}

              {currentCard && (
                <div className="panel subtle singleplayer-meta">
                  <div className="recent-name">{getTierLabel(currentCard.dotTier)}</div>
                  <div className="recent-meta">{formatNumbers(currentCard.numbers)}</div>
                  <div className="recent-meta">
                    Attempts on this card: {currentCard.attempts}
                  </div>
                  {currentCard.revealed && <div className="recent-meta">Status: revealed and locked for scoring</div>}
                </div>
              )}

              {revealedSolution && (
                <div className="panel subtle singleplayer-meta">
                  <div className="recent-name">One valid solution</div>
                  <code className="singleplayer-solution">{revealedSolution}</code>
                  <div className="button-row">
                    <button className="button small" onClick={handleSkipAfterReveal}>
                      Draw Next Card
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="panel singleplayer-sidebar fade-up">
          <div className="section-title">Singleplayer Settings</div>
          <div className="form">
            <div>
              <label>Difficulty mode</label>
              <div className="radio-row">
                <label className="checkbox">
                  <input
                    type="radio"
                    checked={state.settings.difficultyMode === 'mixed'}
                    onChange={() =>
                      applyState((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, difficultyMode: 'mixed' }
                      }))
                    }
                  />
                  Mixed
                </label>
                <label className="checkbox">
                  <input
                    type="radio"
                    checked={state.settings.difficultyMode === 'fixed'}
                    onChange={() =>
                      applyState((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, difficultyMode: 'fixed' }
                      }))
                    }
                  />
                  Fixed tier
                </label>
              </div>
            </div>
            {state.settings.difficultyMode === 'fixed' && (
              <div>
                <label>Fixed tier</label>
                <select
                  value={state.settings.fixedTier}
                  onChange={(event) =>
                    applyState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        fixedTier: Number(event.target.value) as 1 | 2 | 3 | 4
                      }
                    }))
                  }
                >
                  <option value={1}>Tier 1</option>
                  <option value={2}>Tier 2</option>
                  <option value={3}>Tier 3</option>
                  <option value={4}>Tier 4</option>
                </select>
              </div>
            )}
            <div className="scoring-grid">
              <div className="helper">Points per tier</div>
              {(['1', '2', '3', '4'] as const).map((tier) => (
                <div key={tier} className="scoring-row">
                  <span>{getTierLabel(Number(tier))}</span>
                  <input
                    className="scoring-input"
                    type="number"
                    min={0}
                    value={state.settings.scoring[tier]}
                    onChange={(event) => updateScoring(tier, event.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="helper">
              Pages singleplayer uses the same exact parser and verifier as the main app, but it does not include LAN multiplayer,
              SQLite persistence, exports, or projector sync.
            </div>
          </div>
        </aside>

        <section className="panel singleplayer-history fade-up">
          <div className="section-title-row">
            <div className="section-title">Recent Cards</div>
            <div className="helper">{state.history.length} rounds stored in this browser</div>
          </div>
          {state.history.length === 0 ? (
            <p className="helper">Solve or skip a card to build local singleplayer history.</p>
          ) : (
            <div className="session-scroll">
              <div className="session-list">
                {state.history.map((entry) => (
                  <div key={`${entry.id}-${entry.completedAt}`} className="session-card">
                    <div className="section-title-row">
                      <div className="recent-name">{historyEntryText(entry)}</div>
                      <span className={`tag ${entry.outcome === 'skipped' ? 'alert' : ''}`}>
                        {entry.outcome === 'solved' ? `+${entry.points}` : 'Skipped'}
                      </span>
                    </div>
                    <div className="recent-meta">
                      {new Date(entry.completedAt).toLocaleString()} • attempts: {entry.attempts}
                    </div>
                    {entry.expression && <div className="recent-meta">Your answer: {entry.expression}</div>}
                    <div className="recent-meta">Solution: {entry.solutionExpression}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
