import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { SessionRules } from '@arena/shared';
import { initSchema, nowIso } from '../src/db.js';
import { applyMigrations } from '../src/migrations.js';
import { performSkip } from '../src/skip.js';

type SeedResult = {
  db: Database.Database;
  sessionId: string;
  roundId: string;
  playerA: string;
  playerB: string;
  statements: {
    countSkipped: Database.Statement;
    sessionPlayerExists: Database.Statement;
    leaderboard: Database.Statement;
    getSessionPlayerScore: Database.Statement;
    updateSessionPlayerScore: Database.Statement;
    markRoundSkipped: Database.Statement;
  };
};

function seedDb(rules: SessionRules, scores: { a: number; b: number } = { a: 0, b: 0 }): SeedResult {
  const db = new Database(':memory:');
  initSchema(db);
  applyMigrations(db);

  const sessionId = 'session-1';
  const playerA = 'player-a';
  const playerB = 'player-b';
  const cardId = 'card-1';
  const roundId = 'round-1';
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO sessions (id, title, status, rules_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, 'Test', 'live', JSON.stringify(rules), createdAt);

  db.prepare(
    `INSERT INTO players (id, display_name, age, ib_grade, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(playerA, 'Alpha', null, null, null, createdAt);

  db.prepare(
    `INSERT INTO players (id, display_name, age, ib_grade, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(playerB, 'Beta', null, null, null, createdAt);

  db.prepare(
    `INSERT INTO session_players (session_id, player_id, score_total, correct_count, wrong_count, created_at)
     VALUES (?, ?, ?, 0, 0, ?)`
  ).run(sessionId, playerA, scores.a, createdAt);

  db.prepare(
    `INSERT INTO session_players (session_id, player_id, score_total, correct_count, wrong_count, created_at)
     VALUES (?, ?, ?, 0, 0, ?)`
  ).run(sessionId, playerB, scores.b, createdAt);

  db.prepare(
    `INSERT INTO cards (id, n1, n2, n3, n4, target, difficulty_score, dot_tier, solution_count, created_at)
     VALUES (?, 1, 2, 3, 4, 24, 0.5, 2, 1, ?)`
  ).run(cardId, createdAt);

  db.prepare(
    `INSERT INTO rounds (id, session_id, card_id, status, solved_by_player_id, solved_at, created_at)
     VALUES (?, ?, ?, 'active', NULL, NULL, ?)`
  ).run(roundId, sessionId, cardId, createdAt);

  const statements = {
    countSkipped: db.prepare(`SELECT COUNT(*) as count FROM rounds WHERE session_id = ? AND status = 'skipped'`),
    sessionPlayerExists: db.prepare(
      'SELECT 1 FROM session_players WHERE session_id = ? AND player_id = ? LIMIT 1'
    ),
    leaderboard: db.prepare(
      `SELECT sp.player_id, p.display_name, sp.score_total, sp.correct_count, sp.wrong_count
       FROM session_players sp
       JOIN players p ON sp.player_id = p.id
       WHERE sp.session_id = ?
       ORDER BY sp.score_total DESC, sp.correct_count DESC, sp.wrong_count ASC, p.display_name ASC`
    ),
    getSessionPlayerScore: db.prepare(
      `SELECT score_total FROM session_players WHERE session_id = ? AND player_id = ?`
    ),
    updateSessionPlayerScore: db.prepare(
      `UPDATE session_players SET score_total = ? WHERE session_id = ? AND player_id = ?`
    ),
    markRoundSkipped: db.prepare(
      `UPDATE rounds
       SET status = 'skipped',
           skipped_at = ?,
           skipped_by_player_id = ?,
           skip_reason = ?,
           solved_by_player_id = NULL,
           solved_at = NULL
       WHERE id = ?`
    )
  };

  return { db, sessionId, roundId, playerA, playerB, statements };
}

describe('performSkip', () => {
  it('marks the active round skipped and creates a new active round', () => {
    const rules: SessionRules = {
      skip: { enabled: true, limit: 3, penaltyMode: 'none', penaltyPoints: 0 }
    };
    const { db, sessionId, roundId, statements } = seedDb(rules);
    let created = 0;
    const createNextRound = () => {
      const cardId = `card-${created + 2}`;
      const roundIdNew = `round-${created + 2}`;
      db.prepare(
        `INSERT INTO cards (id, n1, n2, n3, n4, target, difficulty_score, dot_tier, solution_count, created_at)
         VALUES (?, 2, 3, 4, 5, 24, 0.6, 2, 1, ?)`
      ).run(cardId, nowIso());
      db.prepare(
        `INSERT INTO rounds (id, session_id, card_id, status, solved_by_player_id, solved_at, created_at)
         VALUES (?, ?, ?, 'active', NULL, NULL, ?)`
      ).run(roundIdNew, sessionId, cardId, nowIso());
      created += 1;
    };

    const result = performSkip({
      sessionId,
      rules,
      activeRoundId: roundId,
      statements,
      nowIso,
      createNextRound
    });

    expect(result.ok).toBe(true);
    expect(created).toBe(1);
    const skipped = db.prepare('SELECT status, solved_by_player_id, solved_at, skipped_at FROM rounds WHERE id = ?').get(roundId) as {
      status: string;
      solved_by_player_id: string | null;
      solved_at: string | null;
      skipped_at: string | null;
    };
    expect(skipped.status).toBe('skipped');
    expect(skipped.solved_by_player_id).toBeNull();
    expect(skipped.solved_at).toBeNull();
    expect(skipped.skipped_at).toBeTruthy();
    const activeCount = (db.prepare(`SELECT COUNT(*) as count FROM rounds WHERE status = 'active'`).get() as { count: number }).count;
    expect(activeCount).toBe(1);
  });

  it('enforces skip limits', () => {
    const rules: SessionRules = {
      skip: { enabled: true, limit: 1, penaltyMode: 'none', penaltyPoints: 0 }
    };
    const { db, sessionId, roundId, statements } = seedDb(rules);
    db.prepare(
      `UPDATE rounds SET status = 'skipped', skipped_at = ?, solved_by_player_id = NULL, solved_at = NULL WHERE id = ?`
    ).run(nowIso(), roundId);

    db.prepare(
      `INSERT INTO rounds (id, session_id, card_id, status, solved_by_player_id, solved_at, created_at)
       VALUES ('round-active', ?, 'card-1', 'active', NULL, NULL, ?)`
    ).run(sessionId, nowIso());

    let created = 0;
    const result = performSkip({
      sessionId,
      rules,
      activeRoundId: 'round-active',
      statements,
      nowIso,
      createNextRound: () => {
        created += 1;
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe('SKIP_LIMIT_REACHED');
    expect(created).toBe(0);
    const activeStatus = db.prepare(`SELECT status FROM rounds WHERE id = 'round-active'`).get() as { status: string };
    expect(activeStatus.status).toBe('active');
  });

  it('applies penalty to selected player', () => {
    const rules: SessionRules = {
      skip: { enabled: true, limit: 3, penaltyMode: 'selectedPlayer', penaltyPoints: 2 }
    };
    const { db, sessionId, roundId, playerA, statements } = seedDb(rules, { a: 5, b: 1 });
    const result = performSkip({
      sessionId,
      rules,
      activeRoundId: roundId,
      selectedPlayerId: playerA,
      statements,
      nowIso,
      createNextRound: () => null
    });
    expect(result.ok).toBe(true);
    const score = db.prepare(`SELECT score_total FROM session_players WHERE session_id = ? AND player_id = ?`).get(sessionId, playerA) as {
      score_total: number;
    };
    expect(score.score_total).toBe(3);
  });

  it('applies penalty to leader', () => {
    const rules: SessionRules = {
      skip: { enabled: true, limit: 3, penaltyMode: 'leader', penaltyPoints: 2 }
    };
    const { db, sessionId, roundId, playerA, statements } = seedDb(rules, { a: 6, b: 2 });
    const result = performSkip({
      sessionId,
      rules,
      activeRoundId: roundId,
      statements,
      nowIso,
      createNextRound: () => null
    });
    expect(result.ok).toBe(true);
    const score = db.prepare(`SELECT score_total FROM session_players WHERE session_id = ? AND player_id = ?`).get(sessionId, playerA) as {
      score_total: number;
    };
    expect(score.score_total).toBe(4);
  });
});
