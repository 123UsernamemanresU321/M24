import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Card, Round } from '@arena/shared';
import { getProjector, type ActiveRules } from '../api';
import { getTierLabel, normalizeTier } from '../utils/tier';
import CardTemplateSVG from '../components/CardTemplateSVG';

function formatTimer(seconds?: number): string {
  if (seconds === undefined) {
    return '--:--';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const opLabels: Record<string, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/'
};

export default function Projector() {
  const { id } = useParams();
  const [card, setCard] = useState<Card | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [timer, setTimer] = useState<{ remainingSeconds?: number; elapsedSeconds: number; mode: string } | null>(null);
  const [hints, setHints] = useState<{ hint1?: string | null; hint2?: string | null; enabled: boolean } | null>(null);
  const [activeRules, setActiveRules] = useState<ActiveRules | null>(null);
  const [timeout, setTimeout] = useState<{ expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null>(null);
  const [claim, setClaim] = useState<{ active: boolean; player_name?: string | null; expires_at?: string | null } | null>(null);
  const [multiplayer, setMultiplayer] = useState<{ enabled: boolean; cardDistribution: 'shared' | 'perPlayer' } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      return;
    }
    const refresh = () => {
      getProjector(id)
        .then((data) => {
          setCard(data.card);
          setRound(data.round);
          setTimer(data.timer ?? null);
          setHints(data.hints ?? null);
          setActiveRules(data.activeRules ?? null);
          setTimeout(data.timeout ?? null);
          setClaim(data.claim ?? null);
          setMultiplayer(data.multiplayer ?? null);
        })
        .catch((err) => setError(err.message));
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [id]);

  const hintList = hints?.enabled
    ? [hints.hint1, hints.hint2].filter((hint): hint is string => Boolean(hint))
    : [];

  if (!card) {
    return (
      <div className="projector">
        <div className="projector-title">24 Arena</div>
        {error && <div className="banner bad">{error}</div>}
        <div className="panel">Waiting for next round...</div>
      </div>
    );
  }

  const normalizedTier = normalizeTier(card.dot_tier, 'Projector');
  const displayNumbers = activeRules?.reveal?.enabled
    ? activeRules.reveal.displayNumbers
    : [card.n1, card.n2, card.n3, card.n4];
  const bannedOps = activeRules?.restrictedOps?.bannedOps ?? [];
  const bannedOpsLabel = bannedOps.length > 0
    ? `No ${bannedOps.map((op) => opLabels[op] ?? op).join(', ')}`
    : '';
  const shapeLabel = activeRules?.shapeConstraint === 'shapeA'
    ? '(a op b) op (c op d)'
    : activeRules?.shapeConstraint === 'shapeB'
      ? 'a op (b op (c op d))'
      : '';
  const coldStartRemaining = activeRules?.coldStartRemaining && activeRules.coldStartRemaining > 0
    ? activeRules.coldStartRemaining
    : null;
  const timeoutMessage = timeout?.expired
    ? timeout.solution
      ? `Time's up. Example: ${timeout.solution}`
      : "Time's up. Next card soon."
    : '';
  const timeoutRemaining = timeout?.expired ? timeout.remainingSeconds ?? null : null;
  const claimRemaining = claim?.expires_at
    ? Math.max(0, Math.ceil((new Date(claim.expires_at).getTime() - Date.now()) / 1000))
    : null;

  return (
    <div className="projector">
      <div className="projector-title">24 Arena</div>
      {error && <div className="banner bad">{error}</div>}
      <div className="projector-card">
        <div className="projector-card-art">
          <CardTemplateSVG numbers={[
            displayNumbers[0] ?? null,
            displayNumbers[1] ?? null,
            displayNumbers[2] ?? null,
            displayNumbers[3] ?? null
          ]} tier={normalizedTier} size={520} />
          <div className="card-tier-label">{getTierLabel(normalizedTier)}</div>
        </div>
        {(bannedOpsLabel || shapeLabel || coldStartRemaining !== null || activeRules?.reveal?.enabled) && (
          <div className="projector-constraints">
            {bannedOpsLabel && <div className="chip warning">Restricted: {bannedOpsLabel}</div>}
            {shapeLabel && <div className="chip">Shape: {shapeLabel}</div>}
            {coldStartRemaining !== null && (
              <div className="chip">Submissions open in {coldStartRemaining}s</div>
            )}
            {activeRules?.reveal?.enabled && <div className="chip">Blind reveal</div>}
          </div>
        )}
        {multiplayer?.enabled && multiplayer.cardDistribution === 'perPlayer' && (
          <div className="banner subtle">Per-player cards active</div>
        )}
        {claim?.active && (
          <div className="banner warning">
            Now answering: {claim.player_name ?? 'Player'} {claimRemaining !== null ? `(${claimRemaining}s)` : ''}
          </div>
        )}
        {timer && timer.mode !== 'off' && (
          <div className="chip">Timer: {formatTimer(timer.remainingSeconds ?? timer.elapsedSeconds)}</div>
        )}
        {timeout?.expired && (
          <div className="banner warning">
            {timeoutMessage} {timeoutRemaining !== null ? `Auto-skip in ${timeoutRemaining}s.` : ''}
          </div>
        )}
        {hintList.length > 0 && (
          <div className="projector-hints">
            {hintList.map((hint, index) => (
              <div key={`${hint}-${index}`}>{hint}</div>
            ))}
          </div>
        )}
        {round?.status === 'solved' && <div className="banner ok">Solved!</div>}
      </div>
    </div>
  );
}
