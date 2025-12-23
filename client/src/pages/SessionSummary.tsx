import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LeaderboardRow, Session } from '@arena/shared';
import {
  exportSession,
  exportSessionBundle,
  exportSessionBundleReality,
  getSession,
  getSessionRounds,
  getSummary,
  type SessionRoundSummary
} from '../api';
import LeaderboardTable from '../components/LeaderboardTable';
import { getTierLabel } from '../utils/tier';

export default function SessionSummary() {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [hardestTierSolvedCount, setHardestTierSolvedCount] = useState(0);
  const [skippedRounds, setSkippedRounds] = useState(0);
  const [exportPath, setExportPath] = useState('');
  const [bundlePath, setBundlePath] = useState('');
  const [realityBundlePath, setRealityBundlePath] = useState('');
  const [rounds, setRounds] = useState<SessionRoundSummary[]>([]);
  const [realityCheckOn, setRealityCheckOn] = useState(false);
  const [realityLoaded, setRealityLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      return;
    }
    setRounds([]);
    setRealityCheckOn(false);
    setRealityLoaded(false);
    setRealityBundlePath('');
    setExportPath('');
    setBundlePath('');
    setError('');
    setSkippedRounds(0);
    getSession(id)
      .then(setSession)
      .catch((err) => setError(err.message));
    getSummary(id)
      .then((data) => {
        setLeaderboard(data.leaderboard);
        setTotalRounds(data.totalRounds);
        setHardestTierSolvedCount(data.hardestTierSolvedCount);
        setSkippedRounds(data.skippedRounds ?? 0);
      })
      .catch((err) => setError(err.message));
    getSessionRounds(id)
      .then(setRounds)
      .catch((err) => setError(err.message));
  }, [id]);

  const winner = leaderboard[0];

  const handleExport = async () => {
    if (!id) {
      return;
    }
    try {
      const result = await exportSession(id);
      setExportPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleBundleExport = async () => {
    if (!id) {
      return;
    }
    try {
      const result = await exportSessionBundle(id);
      setBundlePath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bundle export failed');
    }
  };

  const handleRealityToggle = async () => {
    if (!id) {
      return;
    }
    if (!realityCheckOn) {
      if (!realityLoaded) {
        try {
          const result = await getSessionRounds(id, { reality: true });
          setRounds(result);
          setRealityLoaded(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Reality Check failed');
          return;
        }
      }
      setRealityCheckOn(true);
      return;
    }
    setRealityCheckOn(false);
  };

  const handleRealityBundleExport = async () => {
    if (!id) {
      return;
    }
    try {
      const result = await exportSessionBundleReality(id);
      setRealityBundlePath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reality Check export failed');
    }
  };

  return (
    <div className="container">
      <div className="panel">
        <div className="section-title">Session Summary</div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{session?.title ?? 'Session'}</div>
        {session?.status === 'finished' && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="button secondary" onClick={handleRealityToggle}>
              {realityCheckOn ? 'Reality Check: ON' : 'Reality Check'}
            </button>
          </div>
        )}
        {realityCheckOn && (
          <div className="banner notice" style={{ marginTop: '12px' }}>
            Reality Check enabled. Some rounds in this session were intentionally unsolvable.
          </div>
        )}
        {winner && (
          <p>
            Winner: <strong>{winner.display_name}</strong> with {winner.score_total} points.
          </p>
        )}
        <div className="grid grid-2" style={{ marginTop: '20px' }}>
          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Stats</div>
            <div>Total rounds: {totalRounds}</div>
            <div>Skipped rounds: {skippedRounds}</div>
            <div>{getTierLabel(4)} solves: {hardestTierSolvedCount}</div>
          </div>
          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Export</div>
            <button className="button" onClick={handleExport}>
              Export CSV to USB
            </button>
            {exportPath && <p style={{ fontSize: '12px' }}>Saved to: {exportPath}</p>}
            <button className="button secondary" style={{ marginTop: '10px' }} onClick={handleBundleExport}>
              Export Session Bundle (zip)
            </button>
            {bundlePath && <p style={{ fontSize: '12px' }}>Bundle saved to: {bundlePath}</p>}
            {realityCheckOn && (
              <>
                <button className="button secondary" style={{ marginTop: '10px' }} onClick={handleRealityBundleExport}>
                  Export with Reality Check
                </button>
                {realityBundlePath && <p style={{ fontSize: '12px' }}>Reality bundle saved to: {realityBundlePath}</p>}
              </>
            )}
          </div>
        </div>
        <div style={{ marginTop: '24px' }}>
          <div className="section-title">Final Leaderboard</div>
          <LeaderboardTable rows={leaderboard} />
        </div>
        <div style={{ marginTop: '24px' }}>
          <div className="section-title">Rounds</div>
          {rounds.length === 0 ? (
            <p className="muted">No rounds recorded yet.</p>
          ) : (
            <div className="table-scroll" style={{ maxHeight: '320px' }}>
              <table className="table sticky">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Card</th>
                    <th>Tier</th>
                    <th>Solved By</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((round, index) => {
                    const cardNumbers = `${round.n1} ${round.n2} ${round.n3} ${round.n4}`;
                    const isImpossible = Boolean(round.isImpossible);
                    const isSkipped = round.status === 'skipped';
                    return (
                      <tr key={round.id}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="round-card">
                            <div className="round-card-numbers">{cardNumbers}</div>
                            {isSkipped && <span className="tag">Skipped</span>}
                            {realityCheckOn && isImpossible && (
                              <span className="tag alert">Impossible round</span>
                            )}
                          </div>
                        </td>
                        <td>{getTierLabel(round.dot_tier)}</td>
                        <td>{round.solved_by_name ?? '--'}</td>
                        <td>{isSkipped ? 'skipped' : round.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {error && <div className="banner bad">{error}</div>}
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/" className="button secondary">
              Back to Home
            </Link>
            {id && (
              <Link to={`/sessions/${id}/analytics`} className="button ghost">
                View Analytics
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
