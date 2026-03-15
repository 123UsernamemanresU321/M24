import React from 'react';
import { Link } from 'react-router-dom';
import CardTemplateSVG from '../components/CardTemplateSVG';

export default function StaticPreview() {
  return (
    <div className="container">
      <div className="grid home-grid">
        <section className="panel home-hero">
          <div className="hero">
            <span className="pill" style={{ background: '#3d5a80' }}>
              Two Ways To Run 24 Arena
            </span>
            <h1>Use GitHub Pages for singleplayer. Run locally for multiplayer and the full host console.</h1>
            <p>
              This repo now has a clean split. GitHub Pages serves a browser-only singleplayer mode. The local runtime
              keeps the full Fastify, SQLite, projector, dealer, and LAN multiplayer stack.
            </p>
            <div className="home-hero-actions">
              <Link className="button" to="/singleplayer">
                Play Singleplayer
              </Link>
              <Link className="button secondary" to="/card-debug">Card Debug</Link>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CardTemplateSVG numbers={[2, 4, 6, 9]} tier={3} size={320} />
          </div>
        </section>

        <section className="panel home-sessions">
          <div className="section-title">GitHub Pages Mode</div>
          <div className="recent-list">
            <div className="recent-item">
              <div>
                <div className="recent-name">Singleplayer is fully usable</div>
                <div className="recent-meta">Cards, scoring, answer checking, and history run entirely in the browser.</div>
              </div>
            </div>
            <div className="recent-item">
              <div>
                <div className="recent-name">Browser storage only</div>
                <div className="recent-meta">Progress is saved locally in that browser with no backend required.</div>
              </div>
            </div>
            <div className="recent-item">
              <div>
                <div className="recent-name">No realtime host features</div>
                <div className="recent-meta">LAN multiplayer, projector sync, exports, and SQLite-backed sessions still require the local app.</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel home-exports">
          <div className="section-title">Pick The Right Mode</div>
          <ul className="tip-list">
            <li>GitHub Pages: solo practice and lightweight sharing</li>
            <li>Local app: host sessions, multiplayer, projector, dealer mode</li>
            <li>Same shared card rules and exact expression verification</li>
          </ul>
        </aside>

        <section className="panel home-sessions" id="full-app">
          <div className="section-title">Run The Full App Locally</div>
          <div className="grid grid-2">
            <div className="stat-card">
              <div className="stat-label">1. Install dependencies</div>
              <div className="stat-sub">
                <code>npm install</code>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">2. Start development</div>
              <div className="stat-sub">
                <code>npm run dev</code>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">3. Build production</div>
              <div className="stat-sub">
                <code>npm run build</code>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">4. Run local production</div>
              <div className="stat-sub">
                <code>npm run start</code>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel home-exports">
          <div className="section-title">Published By GitHub Actions</div>
          <p className="recent-meta" style={{ margin: 0 }}>
            The Pages workflow builds the React client in static singleplayer mode, switches the router to hash routing,
            and publishes <code>client/dist</code> as the site artifact.
          </p>
        </aside>
      </div>
    </div>
  );
}
