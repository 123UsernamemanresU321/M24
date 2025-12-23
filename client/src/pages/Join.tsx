import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { joinSession, resolveSession } from '../api';
import { setClientToken, setPlayerId, setPlayerName } from '../utils/tokens';

export default function Join() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState(searchParams.get('code') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setJoinCode(code);
    }
  }, [searchParams]);

  const handleJoin = async () => {
    setError('');
    const code = joinCode.trim().toUpperCase();
    const name = displayName.trim();
    if (!code || !name) {
      setError('Enter a join code and your name.');
      return;
    }
    setLoading(true);
    try {
      const resolved = await resolveSession(code);
      if (resolved.status === 'finished') {
        setError('This session has ended.');
        return;
      }
      const response = await joinSession(resolved.session_id, code, name);
      setSessionTitle(response.session_title);
      setClientToken(resolved.session_id, response.client_token);
      setPlayerId(resolved.session_id, response.player_id);
      setPlayerName(resolved.session_id, name);
      navigate(`/play/${resolved.session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="panel join-panel">
        <div className="section-title">Join 24 Arena</div>
        {sessionTitle && <div className="helper">Session: {sessionTitle}</div>}
        <div className="form">
          <div>
            <label>Join Code</label>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="ABCD"
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label>Your Name</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Enter name"
            />
          </div>
          <button className="button" onClick={handleJoin} disabled={loading}>
            {loading ? 'Joining...' : 'Join Session'}
          </button>
        </div>
        {error && <div className="banner bad">{error}</div>}
      </div>
    </div>
  );
}
