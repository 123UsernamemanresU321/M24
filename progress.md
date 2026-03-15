Original prompt: Yes please

- 2026-03-15: implementing a two-mode split for deployment. Local mode remains the full Fastify/SQLite app. GitHub Pages mode is becoming a real browser-only singleplayer experience instead of a static placeholder.
- 2026-03-15: added a browser-only singleplayer mode for static/Page builds with localStorage persistence, custom scoring, mixed/fixed tiers, reveal/skip flow, and recent-history tracking.
- 2026-03-15: updated the static landing page and README so the deployment split is explicit: GitHub Pages for singleplayer, local runtime for multiplayer/projector/full host flow.
- 2026-03-15: verified both `npm --prefix client run build` and `env VITE_STATIC_PREVIEW=1 VITE_ROUTER_MODE=hash VITE_BASE_PATH=/M24/ npm --prefix client run build`.
- 2026-03-15: attempted the Playwright smoke test via the develop-web-game skill, but local validation is currently blocked because the `playwright` package is not installed in this environment.
