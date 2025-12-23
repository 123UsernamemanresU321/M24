import type { Db } from './db.js';
import { nowIso } from './db.js';

const migrations: Array<{ id: string; up: string }> = [
  {
    id: '001_add_player_normalized',
    up: `ALTER TABLE players ADD COLUMN display_name_normalized TEXT;`
  },
  {
    id: '002_add_session_join_code',
    up: `ALTER TABLE sessions ADD COLUMN join_code TEXT;`
  },
  {
    id: '003_add_cards_stats',
    up: `
      ALTER TABLE cards ADD COLUMN attempts_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN solves_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN avg_attempts_to_solve REAL;
      ALTER TABLE cards ADD COLUMN avg_time_to_solve REAL;
      ALTER TABLE cards ADD COLUMN tags_json TEXT;
      ALTER TABLE cards ADD COLUMN hint_ops_json TEXT;
      ALTER TABLE cards ADD COLUMN hint_intermediates_json TEXT;
    `
  },
  {
    id: '004_add_round_hints',
    up: `
      ALTER TABLE rounds ADD COLUMN hint1_revealed_at TEXT;
      ALTER TABLE rounds ADD COLUMN hint2_revealed_at TEXT;
    `
  },
  {
    id: '005_add_attempt_source',
    up: `
      ALTER TABLE attempts ADD COLUMN source TEXT NOT NULL DEFAULT 'host';
      ALTER TABLE attempts ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
    `
  },
  {
    id: '006_add_join_code_index',
    up: `CREATE INDEX IF NOT EXISTS idx_sessions_join_code ON sessions(join_code);`
  },
  {
    id: '007_add_player_normalized_index',
    up: `CREATE INDEX IF NOT EXISTS idx_players_normalized ON players(display_name_normalized);`
  },
  {
    id: '008_enforce_card_dot_tier_range',
    up: `
      CREATE TABLE IF NOT EXISTS cards_new (
        id TEXT PRIMARY KEY,
        n1 INTEGER NOT NULL,
        n2 INTEGER NOT NULL,
        n3 INTEGER NOT NULL,
        n4 INTEGER NOT NULL,
        target INTEGER NOT NULL,
        difficulty_score REAL NOT NULL,
        dot_tier INTEGER NOT NULL CHECK (dot_tier BETWEEN 1 AND 4),
        solution_count INTEGER NOT NULL,
        attempts_count INTEGER NOT NULL DEFAULT 0,
        solves_count INTEGER NOT NULL DEFAULT 0,
        avg_attempts_to_solve REAL,
        avg_time_to_solve REAL,
        tags_json TEXT,
        hint_ops_json TEXT,
        hint_intermediates_json TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO cards_new (
        id,
        n1,
        n2,
        n3,
        n4,
        target,
        difficulty_score,
        dot_tier,
        solution_count,
        attempts_count,
        solves_count,
        avg_attempts_to_solve,
        avg_time_to_solve,
        tags_json,
        hint_ops_json,
        hint_intermediates_json,
        created_at
      )
      SELECT
        id,
        n1,
        n2,
        n3,
        n4,
        target,
        difficulty_score,
        CASE WHEN dot_tier BETWEEN 1 AND 4 THEN dot_tier ELSE 4 END,
        solution_count,
        attempts_count,
        solves_count,
        avg_attempts_to_solve,
        avg_time_to_solve,
        tags_json,
        hint_ops_json,
        hint_intermediates_json,
        created_at
      FROM cards;
      DROP TABLE cards;
      ALTER TABLE cards_new RENAME TO cards;
    `
  },
  {
    id: '009_add_round_metadata',
    up: `ALTER TABLE rounds ADD COLUMN metadata_json TEXT;`
  },
  {
    id: '010_add_player_lockouts',
    up: `
      CREATE TABLE IF NOT EXISTS player_lockouts (
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        locked_until TEXT NOT NULL,
        PRIMARY KEY (session_id, player_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lockouts_session ON player_lockouts(session_id);
    `
  },
  {
    id: '011_add_solution_signatures',
    up: `
      CREATE TABLE IF NOT EXISTS session_solution_signatures (
        session_id TEXT NOT NULL,
        signature TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (session_id, signature),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_solution_signatures_session ON session_solution_signatures(session_id);
    `
  },
  {
    id: '012_add_session_prank_state',
    up: `
      CREATE TABLE IF NOT EXISTS session_prank_state (
        session_id TEXT PRIMARY KEY,
        is_active INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `
  },
  {
    id: '013_add_round_skip_fields',
    up: `
      CREATE TABLE IF NOT EXISTS rounds_new (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'solved', 'skipped')),
        solved_by_player_id TEXT,
        solved_at TEXT,
        skipped_at TEXT,
        skipped_by_player_id TEXT,
        skip_reason TEXT,
        hint1_revealed_at TEXT,
        hint2_revealed_at TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
        FOREIGN KEY (solved_by_player_id) REFERENCES players(id) ON DELETE SET NULL,
        FOREIGN KEY (skipped_by_player_id) REFERENCES players(id) ON DELETE SET NULL
      );
      INSERT INTO rounds_new (
        id,
        session_id,
        card_id,
        status,
        solved_by_player_id,
        solved_at,
        skipped_at,
        skipped_by_player_id,
        skip_reason,
        hint1_revealed_at,
        hint2_revealed_at,
        metadata_json,
        created_at
      )
      SELECT
        id,
        session_id,
        card_id,
        CASE WHEN status IN ('active', 'solved', 'skipped') THEN status ELSE 'active' END,
        solved_by_player_id,
        solved_at,
        NULL,
        NULL,
        NULL,
        hint1_revealed_at,
        hint2_revealed_at,
        metadata_json,
        created_at
      FROM rounds;
      DROP TABLE rounds;
      ALTER TABLE rounds_new RENAME TO rounds;
      CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
      CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
    `
  },
  {
    id: '014_add_session_tokens_and_clients',
    up: `
      ALTER TABLE sessions ADD COLUMN session_token TEXT;
      CREATE TABLE IF NOT EXISTS session_clients (
        client_token TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_session_clients_session ON session_clients(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_clients_player ON session_clients(player_id);
    `
  }
];

export function applyMigrations(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set((db.prepare('SELECT id FROM migrations').all() as Array<{ id: string }>).map((row) => row.id));

  const insert = db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)');
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    const run = db.transaction(() => {
      db.exec(migration.up);
      insert.run(migration.id, nowIso());
    });
    if (migration.id === '008_enforce_card_dot_tier_range') {
      db.pragma('foreign_keys = OFF');
      try {
        run();
      } finally {
        db.pragma('foreign_keys = ON');
      }
    } else {
      run();
    }
  }
}
