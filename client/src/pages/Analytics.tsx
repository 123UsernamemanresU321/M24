import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LeaderboardRow, Session } from '@arena/shared';
import { getAnalytics, getSession } from '../api';
import { getTierLabel } from '../utils/tier';

export default function Analytics() {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [accuracy, setAccuracy] = useState<Array<{ player_id: string; accuracy: number; avg_tier: number | null }>>([]);
  const [streaks, setStreaks] = useState<Record<string, { current: number; max: number }>>({});
  const [errorBreakdown, setErrorBreakdown] = useState<Record<string, Record<string, number>>>({});
  const [solvesByTier, setSolvesByTier] = useState<Array<{ tier: number; count: number }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      return;
    }
    getSession(id)
      .then(setSession)
      .catch((err) => setError(err.message));
    getAnalytics(id)
      .then((data) => {
        setLeaderboard(data.leaderboard);
        setAccuracy(data.accuracy);
        setStreaks(data.streaks);
        setErrorBreakdown(data.errorBreakdown);
        setSolvesByTier(data.solvesByTier);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const accuracyMap = useMemo(() => new Map(accuracy.map((row) => [row.player_id, row])), [accuracy]);

  const rows = leaderboard.map((row) => {
    const metrics = accuracyMap.get(row.player_id);
    const streak = streaks[row.player_id] ?? { current: 0, max: 0 };
    return {
      ...row,
      accuracy: metrics?.accuracy ?? 0,
      avg_tier: metrics?.avg_tier ?? null,
      streakMax: streak.max
    };
  });

  const errorRows = leaderboard.map((row) => {
    const breakdown = errorBreakdown[row.player_id] ?? {};
    const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    return {
      player: row.display_name,
      topError: entries[0]?.[0] ?? '-',
      count: entries[0]?.[1] ?? 0
    };
  });

  return (
    <div className="container">
      <div className="panel">
        <div className="section-title">Analytics</div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{session?.title ?? 'Session'}</div>
        <div className="grid" style={{ marginTop: '20px', gap: '24px' }}>
          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Leaderboard Metrics</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Avg Tier</th>
                  <th>Best Streak</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.player_id}>
                    <td>{index + 1}</td>
                    <td>{row.display_name}</td>
                    <td>{row.score_total}</td>
                    <td>{Math.round(row.accuracy * 100)}%</td>
                    <td>{row.avg_tier ? row.avg_tier.toFixed(2) : '-'}</td>
                    <td>{row.streakMax}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Error Breakdown</div>
            {errorRows.length === 0 ? (
              <p>No attempts yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Most Common Error</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((row) => (
                    <tr key={row.player}>
                      <td>{row.player}</td>
                      <td>{row.topError}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Solves by Tier</div>
            {solvesByTier.length === 0 ? (
              <p>No solved rounds yet.</p>
            ) : (
              <div className="bar-list">
                {solvesByTier.map((row) => (
                  <div key={row.tier} className="bar-row">
                    <span>{getTierLabel(row.tier)}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.min(100, row.count * 10)}%` }} />
                    </div>
                    <span>{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <div className="banner bad">{error}</div>}
        <div style={{ marginTop: '16px' }}>
          <Link to={id ? `/sessions/${id}/summary` : '/'} className="button secondary">
            Back to Summary
          </Link>
        </div>
      </div>
    </div>
  );
}
