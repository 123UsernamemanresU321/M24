import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultOps } from '@arena/shared';
import { createSession, setPrankMode, startSession } from '../api';
import { defaultScoring } from '../utils/rules';
import { getTierLabel } from '../utils/tier';

export default function SessionSetup() {
  const [title, setTitle] = useState('');
  const [difficultyMode, setDifficultyMode] = useState<'mixed' | 'fixed'>('mixed');
  const [fixedTier, setFixedTier] = useState<1 | 2 | 3 | 4>(2);
  const [scoring, setScoring] = useState<Record<'1' | '2' | '3' | '4', number>>({ ...defaultScoring });
  const [ops, setOps] = useState({ ...defaultOps });
  const [timerMode, setTimerMode] = useState<'off' | 'countdown' | 'stopwatch'>('off');
  const [countdownSeconds, setCountdownSeconds] = useState(60);
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [hint1After, setHint1After] = useState(30);
  const [hint2After, setHint2After] = useState(50);
  const [lanEnabled, setLanEnabled] = useState(false);
  const [lanAutoAccept, setLanAutoAccept] = useState(true);
  const [multiplayerEnabled, setMultiplayerEnabled] = useState(false);
  const [cardDistribution, setCardDistribution] = useState<'shared' | 'perPlayer'>('shared');
  const [claimEnabled, setClaimEnabled] = useState(true);
  const [claimWindowSeconds, setClaimWindowSeconds] = useState(10);
  const [wrongLockoutSeconds, setWrongLockoutSeconds] = useState(10);
  const [claimPenaltyBase, setClaimPenaltyBase] = useState(0);
  const [claimPenaltyMax, setClaimPenaltyMax] = useState(2);
  const [noUndoInput, setNoUndoInput] = useState(false);
  const [scarcityEnabled, setScarcityEnabled] = useState(false);
  const [scarcityBanSet, setScarcityBanSet] = useState({ add: true, sub: true, mul: true, div: true });
  const [shapeEnabled, setShapeEnabled] = useState(false);
  const [shapeConstraint, setShapeConstraint] = useState<'shapeA' | 'shapeB'>('shapeA');
  const [mistakePenaltyMode, setMistakePenaltyMode] = useState<'none' | 'lockout' | 'minusPoints'>('none');
  const [lockoutSeconds, setLockoutSeconds] = useState(5);
  const [minusPoints, setMinusPoints] = useState(1);
  const [allowNegative, setAllowNegative] = useState(false);
  const [coldStartEnabled, setColdStartEnabled] = useState(false);
  const [coldStartSeconds, setColdStartSeconds] = useState(5);
  const [blindRevealEnabled, setBlindRevealEnabled] = useState(false);
  const [blindRevealInterval, setBlindRevealInterval] = useState(2);
  const [uniquenessBonusEnabled, setUniquenessBonusEnabled] = useState(false);
  const [uniquenessBonusPoints, setUniquenessBonusPoints] = useState(1);
  const [skipEnabled, setSkipEnabled] = useState(false);
  const [skipLimitMode, setSkipLimitMode] = useState<'unlimited' | 'limited'>('limited');
  const [skipLimit, setSkipLimit] = useState(3);
  const [skipPenaltyMode, setSkipPenaltyMode] = useState<'none' | 'selectedPlayer' | 'leader'>('none');
  const [skipPenaltyPoints, setSkipPenaltyPoints] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (multiplayerEnabled) {
      setLanEnabled(true);
      setLanAutoAccept(true);
    }
  }, [multiplayerEnabled]);

  const scoringChanged = (['1', '2', '3', '4'] as const).some(
    (tier) => scoring[tier] !== defaultScoring[tier]
  );
  const scarcityList = ['add', 'sub', 'mul', 'div']
    .filter((op) => scarcityBanSet[op as keyof typeof scarcityBanSet])
    .join(', ');
  const summaryItems = [
    scoringChanged ? `Scoring: ${scoring['1']}/${scoring['2']}/${scoring['3']}/${scoring['4']}` : null,
    noUndoInput ? 'No-undo input' : null,
    scarcityEnabled ? `Op scarcity: ban one (${scarcityList || 'none'})` : null,
    shapeEnabled ? `Shape: ${shapeConstraint === 'shapeA' ? '(a op b) op (c op d)' : 'a op (b op (c op d))'}` : null,
    mistakePenaltyMode !== 'none'
      ? mistakePenaltyMode === 'lockout'
        ? `Lockout: ${lockoutSeconds}s`
        : `Minus points: -${minusPoints}${allowNegative ? ' (allow negative)' : ''}`
      : null,
    coldStartEnabled ? `Cold start: ${coldStartSeconds}s` : null,
    blindRevealEnabled ? `Blind reveal: every ${blindRevealInterval}s` : null,
    uniquenessBonusEnabled ? `Uniqueness bonus: +${uniquenessBonusPoints}` : null,
    multiplayerEnabled
      ? `LAN multiplayer: ${cardDistribution === 'perPlayer' ? 'per-player cards' : 'shared card'}${
          claimEnabled ? `, claim ${claimWindowSeconds}s` : ''
        }`
      : null,
    skipEnabled
      ? `Skip: ${skipLimitMode === 'unlimited' ? 'unlimited' : `${skipLimit} max`}${
          skipPenaltyMode === 'none' ? '' : `, penalty -${skipPenaltyPoints} (${skipPenaltyMode === 'leader' ? 'leader' : 'selected player'})`
        }`
      : null
  ].filter((value): value is string => Boolean(value));

  const handleStart = async () => {
    setLoading(true);
    setError('');
    try {
      const mistakePenalty = mistakePenaltyMode === 'none'
        ? { mode: 'none' as const }
        : mistakePenaltyMode === 'lockout'
          ? { mode: 'lockout' as const, lockoutSeconds: Math.max(1, Math.floor(lockoutSeconds)) }
          : {
              mode: 'minusPoints' as const,
              minusPoints: Math.max(1, Math.floor(minusPoints)),
              allowNegative
            };
      const session = await createSession({
        title,
        difficulty_mode: difficultyMode,
        ...(difficultyMode === 'fixed' ? { fixed_tier: fixedTier } : {}),
        scoring,
        ops,
        timer_mode: timerMode,
        countdown_seconds: countdownSeconds,
        hints_enabled: hintsEnabled,
        hint1_after_seconds: hint1After,
        hint2_after_seconds: hint2After,
        lan_enabled: lanEnabled,
        lan_auto_accept: lanAutoAccept,
        no_undo_input: noUndoInput,
        scarcityEnabled,
        scarcityMode: 'banOneOp',
        scarcityBanSet,
        shapeConstraint: shapeEnabled ? shapeConstraint : null,
        mistakePenalty,
        coldStartSeconds: coldStartEnabled ? Math.max(1, Math.floor(coldStartSeconds)) : 0,
        blindReveal: blindRevealEnabled
          ? { enabled: true, intervalSeconds: Math.max(1, Math.floor(blindRevealInterval)) }
          : { enabled: false },
        uniquenessBonusPoints: uniquenessBonusEnabled ? Math.max(1, Math.floor(uniquenessBonusPoints)) : 0,
        skip: skipEnabled
          ? {
              enabled: true,
              limit: skipLimitMode === 'unlimited' ? null : Math.max(1, Math.floor(skipLimit)),
              penaltyMode: skipPenaltyMode,
              penaltyPoints: Math.max(0, Math.floor(skipPenaltyPoints))
            }
          : { enabled: false },
        multiplayer: multiplayerEnabled
          ? {
              enabled: true,
              cardDistribution,
              claimEnabled,
              claimWindowSeconds: Math.max(5, Math.floor(claimWindowSeconds)),
              wrongLockoutSeconds: Math.max(5, Math.floor(wrongLockoutSeconds)),
              claimPenalty: {
                mode: 'leaderboardScaled' as const,
                base: Math.max(0, Math.floor(claimPenaltyBase)),
                max: Math.max(0, Math.floor(claimPenaltyMax))
              }
            }
          : { enabled: false }
      });
      if (sessionStorage.getItem('arena_prank_arm') === '1') {
        try {
          await setPrankMode(session.id, true);
        } catch {
          // Silent fail to keep prank hidden.
        } finally {
          sessionStorage.removeItem('arena_prank_arm');
        }
      }
      await startSession(session.id);
      navigate(`/sessions/${session.id}/live`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="panel">
        <div className="section-title">Session Setup</div>
        <div className="form">
          <div>
            <label>Session Title</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <label>Difficulty Mode</label>
            <select value={difficultyMode} onChange={(event) => setDifficultyMode(event.target.value as 'mixed' | 'fixed')}>
              <option value="mixed">Mixed (weighted tiers)</option>
              <option value="fixed">Fixed Tier</option>
            </select>
          </div>
          {difficultyMode === 'fixed' && (
            <div>
              <label>Fixed Tier</label>
              <select value={fixedTier} onChange={(event) => setFixedTier(Number(event.target.value) as 1 | 2 | 3 | 4)}>
                <option value={1}>{getTierLabel(1)}</option>
                <option value={2}>{getTierLabel(2)}</option>
                <option value={3}>{getTierLabel(3)}</option>
                <option value={4}>{getTierLabel(4)}</option>
              </select>
            </div>
          )}
          <div>
            <label>Scoring (points per tier)</label>
            <div className="scoring-grid">
              {(Object.keys(defaultScoring) as Array<'1' | '2' | '3' | '4'>).map((tier) => (
                <label key={tier} className="scoring-row">
                  <span>{getTierLabel(Number(tier))}</span>
                  <input
                    className="scoring-input"
                    type="number"
                    min="0"
                    value={scoring[tier]}
                    onChange={(event) =>
                      setScoring((prev) => {
                        const next = Number(event.target.value);
                        const safe = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
                        return { ...prev, [tier]: safe };
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="helper">Customize how many points are awarded for each difficulty tier.</div>
          </div>
          <div>
            <label>Allowed operations</label>
            <div className="checkbox-grid">
              <label className="checkbox">
                <input type="checkbox" checked readOnly />
                + (add)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked readOnly />
                - (subtract)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked readOnly />
                * (multiply)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked readOnly />
                / (divide)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={ops.pow} onChange={() => setOps((prev) => ({ ...prev, pow: !prev.pow }))} />
                ^ (exponent)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={ops.fact} onChange={() => setOps((prev) => ({ ...prev, fact: !prev.fact }))} />
                ! (factorial)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={ops.sqrt} onChange={() => setOps((prev) => ({ ...prev, sqrt: !prev.sqrt }))} />
                √ (square root)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={ops.concat} onChange={() => setOps((prev) => ({ ...prev, concat: !prev.concat }))} />
                concat(a,b)
              </label>
            </div>
            <div className="helper">Concat syntax: <strong>concat(a,b)</strong>. √ can be typed as sqrt().</div>
          </div>
          <div>
            <label>Timer Mode</label>
            <select value={timerMode} onChange={(event) => setTimerMode(event.target.value as 'off' | 'countdown' | 'stopwatch')}>
              <option value="off">Off</option>
              <option value="countdown">Countdown</option>
              <option value="stopwatch">Stopwatch</option>
            </select>
            {timerMode === 'countdown' && (
              <div style={{ marginTop: '10px' }}>
                <label>Countdown Seconds</label>
                <input
                  type="number"
                  min="10"
                  value={countdownSeconds}
                  onChange={(event) => setCountdownSeconds(Number(event.target.value))}
                />
              </div>
            )}
          </div>
          <div>
            <label>Hints</label>
            <label className="checkbox">
              <input type="checkbox" checked={hintsEnabled} onChange={() => setHintsEnabled((prev) => !prev)} />
              Enable timed hints
            </label>
            {hintsEnabled && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div>
                  <label>Hint 1 after (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    value={hint1After}
                    onChange={(event) => setHint1After(Number(event.target.value))}
                  />
                </div>
                <div>
                  <label>Hint 2 after (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    value={hint2After}
                    onChange={(event) => setHint2After(Number(event.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <label>LAN Submissions</label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={lanEnabled}
                onChange={() => setLanEnabled((prev) => !prev)}
                disabled={multiplayerEnabled}
              />
              Enable LAN player submissions
            </label>
            {lanEnabled && !multiplayerEnabled && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={lanAutoAccept}
                  onChange={() => setLanAutoAccept((prev) => !prev)}
                />
                Auto-accept correct submissions
              </label>
            )}
            {multiplayerEnabled && (
              <div className="helper">LAN multiplayer uses direct submissions and join codes.</div>
            )}
          </div>
          <div>
            <label>LAN Multiplayer</label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={multiplayerEnabled}
                onChange={() => setMultiplayerEnabled((prev) => !prev)}
              />
              Enable LAN multiplayer (join code + claims)
            </label>
            {multiplayerEnabled && (
              <div className="panel subtle" style={{ marginTop: '10px' }}>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div>
                    <label>Card distribution</label>
                    <select
                      value={cardDistribution}
                      onChange={(event) => setCardDistribution(event.target.value as 'shared' | 'perPlayer')}
                    >
                      <option value="shared">Shared card (everyone)</option>
                      <option value="perPlayer">Per-player cards</option>
                    </select>
                  </div>
                  <div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={claimEnabled}
                        onChange={() => setClaimEnabled((prev) => !prev)}
                      />
                      Require claim before submit
                    </label>
                  </div>
                </div>
                {claimEnabled && (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div>
                      <label>Claim window (seconds)</label>
                      <input
                        type="number"
                        min="5"
                        value={claimWindowSeconds}
                        onChange={(event) => setClaimWindowSeconds(Number(event.target.value))}
                      />
                    </div>
                    <div>
                      <label>Wrong/timeout lockout (seconds)</label>
                      <input
                        type="number"
                        min="5"
                        value={wrongLockoutSeconds}
                        onChange={(event) => setWrongLockoutSeconds(Number(event.target.value))}
                      />
                    </div>
                    <div>
                      <label>Timeout penalty base</label>
                      <input
                        type="number"
                        min="0"
                        value={claimPenaltyBase}
                        onChange={(event) => setClaimPenaltyBase(Number(event.target.value))}
                      />
                    </div>
                    <div>
                      <label>Timeout penalty max</label>
                      <input
                        type="number"
                        min="0"
                        value={claimPenaltyMax}
                        onChange={(event) => setClaimPenaltyMax(Number(event.target.value))}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <details className="optional-modes">
            <summary>Optional Modes</summary>
            <div className="optional-body">
              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={noUndoInput} onChange={() => setNoUndoInput((prev) => !prev)} />
                  No-undo input (lock expression after submit)
                </label>
              </div>

              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={scarcityEnabled} onChange={() => setScarcityEnabled((prev) => !prev)} />
                  Operation scarcity (ban one base op per round)
                </label>
                {scarcityEnabled && (
                  <div className="checkbox-grid">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={scarcityBanSet.add}
                        onChange={() => setScarcityBanSet((prev) => ({ ...prev, add: !prev.add }))}
                      />
                      + (add)
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={scarcityBanSet.sub}
                        onChange={() => setScarcityBanSet((prev) => ({ ...prev, sub: !prev.sub }))}
                      />
                      - (subtract)
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={scarcityBanSet.mul}
                        onChange={() => setScarcityBanSet((prev) => ({ ...prev, mul: !prev.mul }))}
                      />
                      * (multiply)
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={scarcityBanSet.div}
                        onChange={() => setScarcityBanSet((prev) => ({ ...prev, div: !prev.div }))}
                      />
                      / (divide)
                    </label>
                  </div>
                )}
              </div>

              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={shapeEnabled} onChange={() => setShapeEnabled((prev) => !prev)} />
                  Solution shape constraint
                </label>
                {shapeEnabled && (
                  <select value={shapeConstraint} onChange={(event) => setShapeConstraint(event.target.value as 'shapeA' | 'shapeB')}>
                    <option value="shapeA">(a op b) op (c op d)</option>
                    <option value="shapeB">a op (b op (c op d))</option>
                  </select>
                )}
              </div>

              <div className="option-block">
                <label>Mistake Penalty</label>
                <select value={mistakePenaltyMode} onChange={(event) => setMistakePenaltyMode(event.target.value as 'none' | 'lockout' | 'minusPoints')}>
                  <option value="none">None</option>
                  <option value="lockout">Lockout (seconds)</option>
                  <option value="minusPoints">Minus points</option>
                </select>
                {mistakePenaltyMode === 'lockout' && (
                  <div>
                    <label>Lockout Seconds</label>
                    <input
                      type="number"
                      min="1"
                      value={lockoutSeconds}
                      onChange={(event) => setLockoutSeconds(Number(event.target.value))}
                    />
                  </div>
                )}
                {mistakePenaltyMode === 'minusPoints' && (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <div>
                      <label>Minus Points</label>
                      <input
                        type="number"
                        min="1"
                        value={minusPoints}
                        onChange={(event) => setMinusPoints(Number(event.target.value))}
                      />
                    </div>
                    <label className="checkbox">
                      <input type="checkbox" checked={allowNegative} onChange={() => setAllowNegative((prev) => !prev)} />
                      Allow negative scores
                    </label>
                  </div>
                )}
              </div>

              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={coldStartEnabled} onChange={() => setColdStartEnabled((prev) => !prev)} />
                  Cold start delay
                </label>
                {coldStartEnabled && (
                  <div>
                    <label>Seconds</label>
                    <input
                      type="number"
                      min="1"
                      value={coldStartSeconds}
                      onChange={(event) => setColdStartSeconds(Number(event.target.value))}
                    />
                  </div>
                )}
              </div>

              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={blindRevealEnabled} onChange={() => setBlindRevealEnabled((prev) => !prev)} />
                  Blind reveal (one number at a time)
                </label>
                {blindRevealEnabled && (
                  <div>
                    <label>Interval Seconds</label>
                    <input
                      type="number"
                      min="1"
                      value={blindRevealInterval}
                      onChange={(event) => setBlindRevealInterval(Number(event.target.value))}
                    />
                  </div>
                )}
              </div>

              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={uniquenessBonusEnabled} onChange={() => setUniquenessBonusEnabled((prev) => !prev)} />
                  Solution uniqueness bonus
                </label>
                {uniquenessBonusEnabled && (
                  <div>
                    <label>Bonus Points</label>
                    <input
                      type="number"
                      min="1"
                      value={uniquenessBonusPoints}
                      onChange={(event) => setUniquenessBonusPoints(Number(event.target.value))}
                    />
                  </div>
                )}
              </div>

              <div className="option-block">
                <label className="checkbox">
                  <input type="checkbox" checked={skipEnabled} onChange={() => setSkipEnabled((prev) => !prev)} />
                  Enable Skip Button
                </label>
                {skipEnabled && (
                  <>
                    <div style={{ marginTop: '10px' }}>
                      <label>Skip behavior</label>
                      <div className="radio-row">
                        <label className="checkbox">
                          <input
                            type="radio"
                            checked={skipLimitMode === 'unlimited'}
                            onChange={() => setSkipLimitMode('unlimited')}
                          />
                          Unlimited skips
                        </label>
                        <label className="checkbox">
                          <input
                            type="radio"
                            checked={skipLimitMode === 'limited'}
                            onChange={() => setSkipLimitMode('limited')}
                          />
                          Limit skips per session
                        </label>
                      </div>
                      {skipLimitMode === 'limited' && (
                        <input
                          type="number"
                          min="1"
                          value={skipLimit}
                          onChange={(event) => setSkipLimit(Number(event.target.value))}
                        />
                      )}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label>Skip penalty</label>
                      <select
                        value={skipPenaltyMode}
                        onChange={(event) => setSkipPenaltyMode(event.target.value as 'none' | 'selectedPlayer' | 'leader')}
                      >
                        <option value="none">None</option>
                        <option value="selectedPlayer">Deduct from selected player</option>
                        <option value="leader">Deduct from session leader</option>
                      </select>
                      {skipPenaltyMode !== 'none' && (
                        <div style={{ marginTop: '8px' }}>
                          <label>Penalty Points</label>
                          <input
                            type="number"
                            min="0"
                            value={skipPenaltyPoints}
                            onChange={(event) => setSkipPenaltyPoints(Number(event.target.value))}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {summaryItems.length > 0 && (
                <div className="panel subtle">
                  <div className="section-title">Rules Summary</div>
                  <ul className="summary-list">
                    {summaryItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
          <button className="button" onClick={handleStart} disabled={loading || !title.trim()}>
            {loading ? 'Starting...' : 'Start Session'}
          </button>
          {error && <div className="banner bad">{error}</div>}
        </div>
      </div>
    </div>
  );
}
