import Database from 'better-sqlite3';
import path from 'path';

export type Db = Database.Database;

export function openDatabase(dataDir: string): Db {
  const dbPath = path.join(dataDir, 'arena.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function initSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      age INTEGER,
      ib_grade TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('setup', 'live', 'finished')),
      rules_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_players (
      session_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      score_total INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, player_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      n1 INTEGER NOT NULL,
      n2 INTEGER NOT NULL,
      n3 INTEGER NOT NULL,
      n4 INTEGER NOT NULL,
      target INTEGER NOT NULL,
      difficulty_score REAL NOT NULL,
      dot_tier INTEGER NOT NULL CHECK (dot_tier BETWEEN 1 AND 4),
      solution_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'solved', 'skipped')),
      solved_by_player_id TEXT,
      solved_at TEXT,
      skipped_at TEXT,
      skipped_by_player_id TEXT,
      skip_reason TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY (solved_by_player_id) REFERENCES players(id) ON DELETE SET NULL,
      FOREIGN KEY (skipped_by_player_id) REFERENCES players(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      expression_raw TEXT NOT NULL,
      normalized_expression TEXT,
      evaluated_num INTEGER,
      evaluated_den INTEGER,
      is_correct INTEGER NOT NULL,
      error_code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_lockouts (
      session_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      locked_until TEXT NOT NULL,
      PRIMARY KEY (session_id, player_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_solution_signatures (
      session_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, signature),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_prank_state (
      session_id TEXT PRIMARY KEY,
      is_active INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_session_players_session ON session_players(session_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
    CREATE INDEX IF NOT EXISTS idx_attempts_round ON attempts(round_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_player ON attempts(player_id);
    CREATE INDEX IF NOT EXISTS idx_lockouts_session ON player_lockouts(session_id);
    CREATE INDEX IF NOT EXISTS idx_solution_signatures_session ON session_solution_signatures(session_id);
  `);
}

export function nowIso(): string {
  return new Date().toISOString();
}
