import React, { useEffect, useRef } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { setPrankMode } from './api';
import { STATIC_PREVIEW } from './env';
import Home from './pages/Home';
import Players from './pages/Players';
import SessionSetup from './pages/SessionSetup';
import LiveSession from './pages/LiveSession';
import SessionSummary from './pages/SessionSummary';
import Analytics from './pages/Analytics';
import Projector from './pages/Projector';
import Join from './pages/Join';
import Play from './pages/Play';
import CardDebug from './pages/CardDebug';
import DealerMode from './pages/DealerMode';
import StaticPreview from './pages/StaticPreview';
import Singleplayer from './pages/Singleplayer';

export default function App() {
  const location = useLocation();
  if (STATIC_PREVIEW) {
    return (
      <div className="app">
        <header className="header">
          <div className="brand">
            24 <span>Arena</span>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/singleplayer">Singleplayer</NavLink>
            <NavLink to="/card-debug">Card Debug</NavLink>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<StaticPreview />} />
          <Route path="/singleplayer" element={<Singleplayer />} />
          <Route path="/card-debug" element={<CardDebug />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    );
  }

  const hideChrome =
    location.pathname.startsWith('/projector') ||
    location.pathname.startsWith('/play') ||
    location.pathname.startsWith('/join') ||
    /\/sessions\/[^/]+\/dealer/.test(location.pathname);
  const clickTimes = useRef<number[]>([]);
  const prankArmKey = 'arena_prank_arm';
  const sessionMatch = location.pathname.match(/^\/sessions\/([^/]+)/);
  const sessionId = sessionMatch && sessionMatch[1] !== 'new' ? sessionMatch[1] : null;

  const armPrank = () => {
    sessionStorage.setItem(prankArmKey, '1');
  };

  const clearPrankArm = () => {
    sessionStorage.removeItem(prankArmKey);
  };

  const triggerPrank = async (active: boolean) => {
    if (sessionId) {
      try {
        await setPrankMode(sessionId, active);
      } catch {
        // Silent fail to keep prank hidden.
      }
    } else if (active) {
      armPrank();
    } else {
      clearPrankArm();
    }
  };

  const handleBrandClick = () => {
    const now = Date.now();
    clickTimes.current = clickTimes.current.filter((time) => now - time <= 3000);
    clickTimes.current.push(now);
    if (clickTimes.current.length >= 5) {
      clickTimes.current = [];
      triggerPrank(true);
    }
  };

  useEffect(() => {
    if (hideChrome) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        triggerPrank(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hideChrome, sessionId]);

  return (
    <div className="app">
      {!hideChrome && (
        <header className="header">
          <div className="brand" onClick={handleBrandClick} role="button" tabIndex={0}>
            24 <span>Arena</span>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/sessions/new">Session Setup</NavLink>
            <NavLink to="/players">Players</NavLink>
          </nav>
        </header>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/players" element={<Players />} />
        <Route path="/sessions/new" element={<SessionSetup />} />
        <Route path="/sessions/:id/live" element={<LiveSession />} />
        <Route path="/sessions/:id/summary" element={<SessionSummary />} />
        <Route path="/sessions/:id/analytics" element={<Analytics />} />
        <Route path="/projector/:id" element={<Projector />} />
        <Route path="/join" element={<Join />} />
        <Route path="/play/:id" element={<Play />} />
        <Route path="/play" element={<Join />} />
        <Route path="/sessions/:id/dealer" element={<DealerMode />} />
        <Route path="/card-debug" element={<CardDebug />} />
      </Routes>
    </div>
  );
}
