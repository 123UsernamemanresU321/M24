# 24 Arena (Phase 2)

Local-first host console for competitive 24-game sessions. Designed to run fully offline from a USB drive on macOS. All persistent data lives in a user-chosen folder on the USB.

## Phase 2 Highlights

- Players: modal add/edit, fast search, CSV/JSON import with duplicate handling, exports.
- Sessions: advanced operations toggles, timers, hints, LAN submissions, custom tier scoring.
- Optional modes: skip button, scarcity rounds, shape constraints, blind reveal, uniqueness bonus.
- Two-screen mode: projector view.
- Analytics dashboard + session bundle export (zip with CSV + JSON summary).
- Backward-compatible SQLite migrations.

## Prerequisites

- Node.js 18+ (recommended 20 LTS for best `better-sqlite3` support)
- npm 9+

## Setup (USB / macOS)

1. Copy this entire project folder onto your USB drive.
2. Open Terminal and `cd` into the project root on the USB.
3. Install dependencies:

```bash
npm install
```

If npm install is slow or fails to build `better-sqlite3`, run the USB-friendly helper once:

```bash
./scripts/usb-setup.sh
```

## First Run: Data Folder Selection

On first run, the server prompts for a data directory path. Press Enter to accept the default:

```
<project-root>/24-arena-data
```

A `config.json` file is created in the project root **on the USB**. It stores the chosen data folder path (absolute or relative if inside the project). The SQLite database and exports live under that data folder.

## Commands

- **Development** (server + client):

```bash
npm run dev
```

- **Build** (client + server):

```bash
npm run build
```

- **Start production locally** (serves built client):

```bash
npm run start
```

The server auto-picks a free port, prints it, and attempts to open the browser.

## Data & Persistence

All persistent data (players, sessions, rounds, attempts, scores, exports) is stored under the selected data directory on the USB.

Created structure:

```
<dataDir>/
  arena.sqlite
  backups/
  exports/
```

## Reset / Backup

- **Backup:** Copy the entire data directory to a safe location.
- **Reset:** Stop the server, then delete `arena.sqlite` in the data directory (or delete the whole data folder). If you want to re-select a new data folder, delete `config.json` from the project root.

## Running Fully Offline

No cloud services, telemetry, or external APIs are used. Once dependencies are installed, the app runs fully offline.

## Players Import Formats

CSV:

- Required column: `display_name` (or `name`)
- Optional: `age`, `ib_grade`, `notes`

Download the template from the Players page or use:

```
display_name,age,ib_grade,notes
```

JSON:

```
[
  { "display_name": "Ada", "age": 12, "ib_grade": "MYP5", "notes": "" },
  { "display_name": "Kai" }
]
```

Duplicate handling options: skip, update existing, or import anyway.

## LAN Mode (Offline, Same Wi-Fi)

1. Enable **LAN submissions** in Session Setup.
2. Start the session and read the Join Code.
3. Players open the LAN URL on their phones:

```
http://<local-ip>:PORT/play
```

The host UI shows a LAN URL when available. If needed, find the local IP on macOS:

```bash
ipconfig getifaddr en0
```

## Projector View

Open the projector view on a second display:

```
http://localhost:PORT/projector/<sessionId>
```

It shows only the current card, tier, timer, and hints (if enabled).

## Timer Expiry (Countdown)

When the countdown reaches 0, the host + projector show a sample solution for 10 seconds, then the card auto-skips (no points awarded). Submissions are blocked during the timeout window.

Analytics dashboard:

```
http://localhost:PORT/sessions/<sessionId>/analytics
```

## Exports

- Players CSV: `Players` -> `Export`
- Sessions CSV: `/api/exports/sessions`
- Attempts CSV: `/api/exports/attempts`
- Session bundle (zip): Session Summary -> `Export Session Bundle`
- Session bundle with Reality Check (zip): Session Summary -> `Export with Reality Check` (only visible after enabling Reality Check)

All exports are saved under:

```
<dataDir>/exports/
```

## Advanced Operations Rules

When enabled per session:

- Exponent `^`: integer exponents only (default max |exp| = 6).
- Factorial `!`: non-negative integers only (default max = 12!).
- Square root `√` or `sqrt()`: perfect-square integers only.
- Concatenation: `concat(a,b)` only (default max 4 digits).

## Scoring Customization

Session Setup lets you set points per tier (1-4). These values are saved in the session rules and used for all scoring and summaries.

## Skip Button (Optional)

Enable the Skip Button in Session Setup -> Optional Modes.

- Choose unlimited skips or a per-session limit (default when enabled: 3).
- Optional penalty: deduct points from a selected player or the current session leader.
- Skipped rounds are marked as **skipped** in the Session Summary and do not award points.

## Card Art Pipeline

The card background is generated from the MetaPost/LaTeX sources in `assets-src/`.
The runtime app only uses the checked-in SVG template in `client/src/assets/card-template.svg`.
Numbers and difficulty dots are intentionally **not** baked into the template; they are rendered dynamically by the app.

Rebuild the template on macOS:

```bash
./scripts/check-card-tooling.sh
./scripts/build-card-template.sh
```

Tooling notes:

- **Required:** `mpost` (from MacTeX/TeX Live).
- **Required:** `python3` (used to strip dots/text and validate the SVG).
- **Optional fallback:** `latexmk` + a PDF->SVG tool (`pdf2svg`, `inkscape`, `dvisvgm`, or `cairosvg`).
- On TeX Live 2025+, MetaPost can output SVG directly, so the PDF conversion step is skipped.

The `scripts/postprocess-card-template.py` step removes any baked-in dots and fails the build if dot-like shapes remain.

Sources:

- `assets-src/twenty-four.mp` (copied from `Cards Source/twenty-four.mp`)
- `assets-src/card-template.mp` (blank template generator)
- `assets-src/card-template.tex` (single-card PDF entrypoint)

Fonts:

- The card numbers use a bundled **Computer Modern Roman** font (`client/src/assets/fonts/computer-modern-roman.otf`) sourced from the CMU Unicode package.
- License: `client/src/assets/fonts/OFL.txt` (SIL Open Font License).

## Tests

Minimal unit tests for core logic (rational arithmetic, parser, verifier, solver):

```bash
npm test
```

## Notes

- The server uses SQLite with prepared statements and stores all writes in the selected data directory.
- Card generation uses exact rational arithmetic and strictly verifies expressions.
- Auto-picks a free port at startup and prints the URL as:

```
24 Arena running at http://localhost:PORT
```
