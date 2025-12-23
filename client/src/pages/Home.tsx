import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@arena/shared';
import { clearSessionHistory, exportAttempts, exportSessions, listSessions, startSession } from '../api';

const statusLabel: Record<Session['status'], string> = {
  setup: 'Setup',
  live: 'Live',
  finished: 'Finished'
};

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');
  const [sessionsExportPath, setSessionsExportPath] = useState('');
  const [attemptsExportPath, setAttemptsExportPath] = useState('');
  const [clearInfo, setClearInfo] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((err) => setError(err.message));
  }, []);

  const handleStart = async (sessionId: string) => {
    try {
      await startSession(sessionId);
      navigate(`/sessions/${sessionId}/live`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    }
  };

  const handleExportSessions = async () => {
    try {
      const result = await exportSessions();
      setSessionsExportPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleExportAttempts = async () => {
    try {
      const result = await exportAttempts();
      setAttemptsExportPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleClearHistory = async () => {
    const confirmed = window.confirm(
      'Clear all session history? This removes sessions, rounds, and attempts. Players are kept.'
    );
    if (!confirmed) {
      return;
    }
    try {
      const result = await clearSessionHistory();
      setSessions([]);
      setSessionsExportPath('');
      setAttemptsExportPath('');
      setClearInfo(`Cleared ${result.deletedSessions} sessions.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    }
  };

  return (
    <div className="container home">
      <div className="grid home-grid">
        <div className="panel home-hero fade-up">
          <div className="home-hero-copy">
            <h1>Host the 24 Arena showdown.</h1>
            <p>
              Local-first host console for competitive 24-game rounds. Generate solvable cards, track
              scores, and keep the arena moving.
            </p>
          </div>
          <div className="home-hero-actions">
            <Link to="/sessions/new" className="button">
              Create Session
            </Link>
            <Link to="/players" className="button secondary">
              Manage Players
            </Link>
          </div>
          {error && <p className="banner bad">{error}</p>}
        </div>

        <div className="panel fade-up home-sessions">
          <div className="section-title-row">
            <div className="section-title">Recent Sessions</div>
            <button className="button secondary small" onClick={handleClearHistory}>
              Clear History
            </button>
          </div>
          {sessions.length === 0 ? (
            <p>No sessions yet. Start one to begin the arena.</p>
          ) : (
            <div className="session-scroll">
              <div className="session-list">
                {sessions.map((session) => (
                  <div key={session.id} className="session-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{session.title}</strong>
                      <span className="tag">{statusLabel[session.status]}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                      {new Date(session.created_at).toLocaleString()}
                    </div>
                    <div className="session-actions">
                      {session.status === 'setup' && (
                        <button className="button small" onClick={() => handleStart(session.id)}>
                          Start
                        </button>
                      )}
                      {session.status === 'live' && (
                        <Link className="button small" to={`/sessions/${session.id}/live`}>
                          Resume
                        </Link>
                      )}
                      {session.status === 'finished' && (
                        <Link className="button secondary small" to={`/sessions/${session.id}/summary`}>
                          Summary
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {clearInfo && <div className="helper">{clearInfo}</div>}
        </div>

        <div className="panel fade-up home-exports">
          <div className="section-title">Exports</div>
          <div className="grid" style={{ gap: '10px' }}>
            <button className="button secondary" onClick={handleExportAttempts}>
              Export Attempts CSV
            </button>
            {attemptsExportPath && <div className="helper">Saved: {attemptsExportPath}</div>}
            <button className="button secondary" onClick={handleExportSessions}>
              Export Sessions CSV
            </button>
            {sessionsExportPath && <div className="helper">Saved: {sessionsExportPath}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
