import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { ensureConfig, ensureDataDirs, getConfigPath } from './config.js';
import { initSchema, nowIso, openDatabase } from './db.js';
import { applyMigrations } from './migrations.js';
import { cardSignature, generateCard } from './cardGenerator.js';
import { performSkip } from './skip.js';
import { computeColdStartRemaining, computeTimerState, shouldRevealHint } from '@arena/shared';
import { astSignature, defaultOps, findSolutionExpressionWithOps, findUnsolvableNumbers, normalizeName, planPlayerImport, solveCard, verifyExpression, type Card, type LeaderboardRow, type OpsConfig, type Player, type PlayerInput, type Round, type Session, type SessionRules } from '@arena/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultScoring: Record<'1' | '2' | '3' | '4', number> = {
  '1': 1,
  '2': 2,
  '3': 4,
  '4': 7
};

const defaultRules: SessionRules = {
  target: 24,
  scoring: defaultScoring,
  difficulty_mode: 'mixed',
  ops: { ...defaultOps },
  timer_mode: 'off',
  countdown_seconds: 60,
  hints_enabled: false,
  hint1_after_seconds: 30,
  hint2_after_seconds: 50,
  lan_enabled: false,
  lan_auto_accept: true,
  no_undo_input: false,
  scarcityEnabled: false,
  scarcityMode: 'banOneOp',
  scarcityBanSet: { add: true, sub: true, mul: true, div: true },
  shapeConstraint: null,
  mistakePenalty: { mode: 'none', lockoutSeconds: 5, minusPoints: 1, allowNegative: false },
  coldStartSeconds: 0,
  blindReveal: { enabled: false, intervalSeconds: 2, scheduleSeconds: undefined },
  uniquenessBonusPoints: 0,
  skip: {
    enabled: false,
    limit: 3,
    penaltyMode: 'none',
    penaltyPoints: 0
  }
};

const normalizeScoreValue = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
};

const normalizeScoring = (input?: SessionRules['scoring'] | SessionRules['pointsByTier']): Record<'1' | '2' | '3' | '4', number> => {
  const source = input ?? defaultScoring;
  return {
    '1': normalizeScoreValue(source?.['1'], defaultScoring['1']),
    '2': normalizeScoreValue(source?.['2'], defaultScoring['2']),
    '3': normalizeScoreValue(source?.['3'], defaultScoring['3']),
    '4': normalizeScoreValue(source?.['4'], defaultScoring['4'])
  };
};

function normalizeRules(input: SessionRules | null | undefined): SessionRules {
  const rules = input ?? {};
  const scoring = normalizeScoring(rules.scoring ?? rules.pointsByTier);
  const ops = { ...defaultOps, ...(rules.ops ?? {}) };
  const scarcityBanSet = { add: true, sub: true, mul: true, div: true, ...(rules.scarcityBanSet ?? {}) };
  const mistakePenalty = rules.mistakePenalty
    ? {
        mode: rules.mistakePenalty.mode,
        lockoutSeconds: rules.mistakePenalty.lockoutSeconds ?? defaultRules.mistakePenalty?.lockoutSeconds,
        minusPoints: rules.mistakePenalty.minusPoints ?? defaultRules.mistakePenalty?.minusPoints,
        allowNegative: rules.mistakePenalty.allowNegative ?? defaultRules.mistakePenalty?.allowNegative
      }
    : { ...(defaultRules.mistakePenalty ?? { mode: 'none' }) };
  const blindReveal = rules.blindReveal
    ? {
        enabled: rules.blindReveal.enabled ?? defaultRules.blindReveal?.enabled,
        intervalSeconds: rules.blindReveal.intervalSeconds ?? defaultRules.blindReveal?.intervalSeconds,
        scheduleSeconds: rules.blindReveal.scheduleSeconds
      }
    : { ...(defaultRules.blindReveal ?? { enabled: false }) };
  const skipDefaultLimit = defaultRules.skip?.limit ?? 3;
  const skip = rules.skip
    ? {
        enabled: rules.skip.enabled ?? defaultRules.skip?.enabled ?? false,
        limit: rules.skip.limit === null
          ? null
          : Math.max(1, Math.floor(rules.skip.limit ?? skipDefaultLimit)),
        penaltyMode: rules.skip.penaltyMode ?? defaultRules.skip?.penaltyMode ?? 'none',
        penaltyPoints: Math.max(0, Math.floor(rules.skip.penaltyPoints ?? defaultRules.skip?.penaltyPoints ?? 0))
      }
    : { ...(defaultRules.skip ?? { enabled: false, limit: 3, penaltyMode: 'none', penaltyPoints: 0 }) };
  if (!ops.add || !ops.sub || !ops.mul || !ops.div) {
    console.warn('Base operations must remain enabled; restoring + - * /.');
  }
  ops.add = true;
  ops.sub = true;
  ops.mul = true;
  ops.div = true;
  return {
    ...defaultRules,
    ...rules,
    scoring,
    ops,
    target: rules.target ?? 24,
    countdown_seconds: rules.countdown_seconds ?? defaultRules.countdown_seconds,
    hint1_after_seconds: rules.hint1_after_seconds ?? defaultRules.hint1_after_seconds,
    hint2_after_seconds: rules.hint2_after_seconds ?? defaultRules.hint2_after_seconds,
    lan_enabled: rules.lan_enabled ?? defaultRules.lan_enabled,
    lan_auto_accept: rules.lan_auto_accept ?? defaultRules.lan_auto_accept,
    no_undo_input: rules.no_undo_input ?? defaultRules.no_undo_input,
    scarcityEnabled: rules.scarcityEnabled ?? defaultRules.scarcityEnabled,
    scarcityMode: rules.scarcityMode ?? defaultRules.scarcityMode,
    scarcityBanSet,
    shapeConstraint: rules.shapeConstraint ?? defaultRules.shapeConstraint,
    mistakePenalty,
    coldStartSeconds: rules.coldStartSeconds ?? defaultRules.coldStartSeconds,
    blindReveal,
    uniquenessBonusPoints: rules.uniquenessBonusPoints ?? defaultRules.uniquenessBonusPoints,
    skip
  };
}

function parseRules(rulesJson: string): SessionRules {
  try {
    return normalizeRules(JSON.parse(rulesJson) as SessionRules);
  } catch {
    return normalizeRules(null);
  }
}

function normalizeTier(value: number, context: string): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }
  console.warn(`${context}: invalid dot_tier ${value}; defaulting to 4.`);
  return 4;
}

function safeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateJoinCode(length = 5): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function getLanUrls(port: number): string[] {
  const interfaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}/play`);
      }
    }
  }
  return urls;
}

function writeExportFile(dataDir: string, prefix: string, content: string, ext = 'csv'): { filename: string; path: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.${ext}`;
  const exportPath = path.join(dataDir, 'exports', filename);
  fs.writeFileSync(exportPath, content, 'utf-8');
  return { filename, path: exportPath };
}

async function start() {
  const { config, dataDir } = await ensureConfig(projectRoot);
  ensureDataDirs(dataDir);

  const db = openDatabase(dataDir);
  initSchema(db);
  applyMigrations(db);
  db.prepare('DELETE FROM session_prank_state').run();

  let difficultyThresholds = config.difficultyThresholds ?? { t1: 0.25, t2: 0.45, t3: 0.65 };

  const statements = {
    insertPlayer: db.prepare(
      `INSERT INTO players (id, display_name, display_name_normalized, age, ib_grade, notes, created_at)
       VALUES (@id, @display_name, @display_name_normalized, @age, @ib_grade, @notes, @created_at)`
    ),
    listPlayers: db.prepare('SELECT * FROM players ORDER BY created_at DESC'),
    getPlayerByNormalized: db.prepare('SELECT * FROM players WHERE display_name_normalized = ? LIMIT 1'),
    updatePlayer: db.prepare(
      `UPDATE players
       SET display_name = @display_name,
           display_name_normalized = @display_name_normalized,
           age = @age,
           ib_grade = @ib_grade,
           notes = @notes
       WHERE id = @id`
    ),
    deletePlayer: db.prepare('DELETE FROM players WHERE id = ?'),
    insertSession: db.prepare(
      `INSERT INTO sessions (id, title, status, rules_json, join_code, created_at)
       VALUES (@id, @title, @status, @rules_json, @join_code, @created_at)`
    ),
    listSessions: db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 20'),
    getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    getSessionByJoinCode: db.prepare('SELECT * FROM sessions WHERE join_code = ?'),
    updateSessionJoinCode: db.prepare('UPDATE sessions SET join_code = ? WHERE id = ?'),
    updateSessionStatus: db.prepare('UPDATE sessions SET status = ? WHERE id = ?'),
    listPlayerIds: db.prepare('SELECT id FROM players'),
    insertSessionPlayer: db.prepare(
      `INSERT OR IGNORE INTO session_players
       (session_id, player_id, score_total, correct_count, wrong_count, created_at)
       VALUES (@session_id, @player_id, 0, 0, 0, @created_at)`
    ),
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
    getActiveRound: db.prepare(
      `SELECT * FROM rounds
       WHERE session_id = ? AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`
    ),
    insertCard: db.prepare(
      `INSERT INTO cards
       (id, n1, n2, n3, n4, target, difficulty_score, dot_tier, solution_count, attempts_count, solves_count, avg_attempts_to_solve, avg_time_to_solve, tags_json, hint_ops_json, hint_intermediates_json, created_at)
       VALUES (@id, @n1, @n2, @n3, @n4, @target, @difficulty_score, @dot_tier, @solution_count, @attempts_count, @solves_count, @avg_attempts_to_solve, @avg_time_to_solve, @tags_json, @hint_ops_json, @hint_intermediates_json, @created_at)`
    ),
    getCard: db.prepare('SELECT * FROM cards WHERE id = ?'),
    updateCardTier: db.prepare('UPDATE cards SET dot_tier = ? WHERE id = ?'),
    insertRound: db.prepare(
      `INSERT INTO rounds
       (id, session_id, card_id, status, solved_by_player_id, solved_at, metadata_json, created_at)
       VALUES (@id, @session_id, @card_id, @status, @solved_by_player_id, @solved_at, @metadata_json, @created_at)`
    ),
    updateRoundMetadata: db.prepare(
      `UPDATE rounds SET metadata_json = ? WHERE id = ?`
    ),
    markRoundSolved: db.prepare(
      `UPDATE rounds
       SET status = 'solved', solved_by_player_id = ?, solved_at = ?
       WHERE id = ?`
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
    ),
    recentCards: db.prepare(
      `SELECT c.n1, c.n2, c.n3, c.n4
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ?
       ORDER BY r.created_at DESC
       LIMIT ?`
    ),
    insertAttempt: db.prepare(
      `INSERT INTO attempts
       (id, round_id, player_id, expression_raw, normalized_expression, evaluated_num, evaluated_den, is_correct, error_code, source, approval_status, created_at)
       VALUES (@id, @round_id, @player_id, @expression_raw, @normalized_expression, @evaluated_num, @evaluated_den, @is_correct, @error_code, @source, @approval_status, @created_at)`
    ),
    updateAttemptApproval: db.prepare(
      `UPDATE attempts SET approval_status = ? WHERE id = ?`
    ),
    incrementCorrect: db.prepare(
      `UPDATE session_players
       SET score_total = score_total + ?, correct_count = correct_count + 1
       WHERE session_id = ? AND player_id = ?`
    ),
    incrementWrong: db.prepare(
      `UPDATE session_players
       SET wrong_count = wrong_count + 1
       WHERE session_id = ? AND player_id = ?`
    ),
    incrementCardAttempts: db.prepare(
      `UPDATE cards SET attempts_count = attempts_count + 1 WHERE id = ?`
    ),
    updateCardSolveStats: db.prepare(
      `UPDATE cards
       SET solves_count = solves_count + 1,
           avg_attempts_to_solve = @avg_attempts_to_solve,
           avg_time_to_solve = @avg_time_to_solve
       WHERE id = @id`
    ),
    countAttemptsForRound: db.prepare(
      `SELECT COUNT(*) as count FROM attempts WHERE round_id = ? AND approval_status = 'approved'`
    ),
    updateRoundHint1: db.prepare(
      `UPDATE rounds SET hint1_revealed_at = ? WHERE id = ?`
    ),
    updateRoundHint2: db.prepare(
      `UPDATE rounds SET hint2_revealed_at = ? WHERE id = ?`
    ),
    getPlayerLockout: db.prepare(
      `SELECT locked_until FROM player_lockouts WHERE session_id = ? AND player_id = ?`
    ),
    setPlayerLockout: db.prepare(
      `INSERT INTO player_lockouts (session_id, player_id, locked_until)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, player_id)
       DO UPDATE SET locked_until = excluded.locked_until`
    ),
    clearPlayerLockout: db.prepare(
      `DELETE FROM player_lockouts WHERE session_id = ? AND player_id = ?`
    ),
    getSessionPlayerScore: db.prepare(
      `SELECT score_total FROM session_players WHERE session_id = ? AND player_id = ?`
    ),
    updateSessionPlayerScore: db.prepare(
      `UPDATE session_players SET score_total = ? WHERE session_id = ? AND player_id = ?`
    ),
    insertSolutionSignature: db.prepare(
      `INSERT OR IGNORE INTO session_solution_signatures (session_id, signature, created_at)
       VALUES (?, ?, ?)`
    ),
    getPrankState: db.prepare(
      `SELECT is_active FROM session_prank_state WHERE session_id = ?`
    ),
    setPrankState: db.prepare(
      `INSERT INTO session_prank_state (session_id, is_active, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id)
       DO UPDATE SET is_active = excluded.is_active, updated_at = excluded.updated_at`
    ),
    countRounds: db.prepare('SELECT COUNT(*) as count FROM rounds WHERE session_id = ?'),
    countSkipped: db.prepare('SELECT COUNT(*) as count FROM rounds WHERE session_id = ? AND status = \'skipped\''),
    countManualSkips: db.prepare(
      `SELECT COUNT(*) as count
       FROM rounds
       WHERE session_id = ?
         AND status = 'skipped'
         AND (skip_reason IS NULL OR skip_reason != 'timer_expired')`
    ),
    countHardest: db.prepare(
      `SELECT COUNT(*) as count
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ? AND r.status = 'solved' AND r.solved_by_player_id IS NOT NULL AND c.dot_tier = 4`
    ),
    listSessionRounds: db.prepare(
      `SELECT r.id, r.status, r.solved_by_player_id, r.solved_at, r.created_at, r.metadata_json,
              c.n1, c.n2, c.n3, c.n4, c.dot_tier,
              p.display_name as solved_by_name
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       LEFT JOIN players p ON r.solved_by_player_id = p.id
       WHERE r.session_id = ?
       ORDER BY r.created_at ASC`
    ),
    exportPlayers: db.prepare(
      `SELECT id, display_name, age, ib_grade, notes, created_at FROM players ORDER BY display_name ASC`
    ),
    exportSessions: db.prepare(
      `SELECT id, title, status, rules_json, created_at FROM sessions ORDER BY created_at DESC`
    ),
    exportAttempts: db.prepare(
      `SELECT a.id, a.expression_raw, a.normalized_expression, a.evaluated_num, a.evaluated_den, a.is_correct, a.error_code, a.source, a.approval_status, a.created_at,
              p.display_name as player_name,
              s.title as session_title,
              r.id as round_id,
              c.n1, c.n2, c.n3, c.n4, c.dot_tier
       FROM attempts a
       JOIN players p ON a.player_id = p.id
       JOIN rounds r ON a.round_id = r.id
       JOIN sessions s ON r.session_id = s.id
       JOIN cards c ON r.card_id = c.id
       ORDER BY a.created_at DESC`
    ),
    deleteAllSessions: db.prepare('DELETE FROM sessions'),
    deleteOrphanCards: db.prepare('DELETE FROM cards WHERE id NOT IN (SELECT DISTINCT card_id FROM rounds)'),
    listPendingAttempts: db.prepare(
      `SELECT a.id, a.round_id, a.player_id, a.expression_raw, a.normalized_expression, a.evaluated_num, a.evaluated_den, a.is_correct, a.error_code, a.created_at,
              p.display_name as player_name
       FROM attempts a
       JOIN rounds r ON a.round_id = r.id
       JOIN players p ON a.player_id = p.id
       WHERE r.session_id = ? AND a.approval_status = 'pending'
       ORDER BY a.created_at ASC`
    ),
    attemptsBySession: db.prepare(
      `SELECT a.player_id, a.is_correct, a.error_code, a.created_at
       FROM attempts a
       JOIN rounds r ON a.round_id = r.id
       WHERE r.session_id = ? AND a.approval_status = 'approved'
       ORDER BY a.created_at ASC`
    ),
    avgTierByPlayer: db.prepare(
      `SELECT r.solved_by_player_id as player_id, AVG(c.dot_tier) as avg_tier
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ? AND r.status = 'solved' AND r.solved_by_player_id IS NOT NULL
       GROUP BY r.solved_by_player_id`
    ),
    solvesByTier: db.prepare(
      `SELECT c.dot_tier as tier, COUNT(*) as count
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ? AND r.status = 'solved' AND r.solved_by_player_id IS NOT NULL
       GROUP BY c.dot_tier`
    ),
    exportSessionPlayers: db.prepare(
      `SELECT sp.player_id, p.display_name, sp.score_total, sp.correct_count, sp.wrong_count
       FROM session_players sp
       JOIN players p ON sp.player_id = p.id
       WHERE sp.session_id = ?
       ORDER BY sp.score_total DESC, p.display_name ASC`
    ),
    exportSessionAttempts: db.prepare(
      `SELECT a.id, a.expression_raw, a.normalized_expression, a.evaluated_num, a.evaluated_den, a.is_correct, a.error_code, a.source, a.approval_status, a.created_at,
              p.display_name as player_name,
              r.id as round_id,
              c.n1, c.n2, c.n3, c.n4, c.dot_tier
       FROM attempts a
       JOIN players p ON a.player_id = p.id
       JOIN rounds r ON a.round_id = r.id
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ?
       ORDER BY a.created_at ASC`
    ),
    exportSessionRounds: db.prepare(
      `SELECT r.id, r.status, r.solved_by_player_id, r.solved_at, r.created_at,
              c.n1, c.n2, c.n3, c.n4, c.dot_tier, c.difficulty_score
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ?
       ORDER BY r.created_at ASC`
    ),
    exportSessionRoundsWithMetadata: db.prepare(
      `SELECT r.id, r.status, r.solved_by_player_id, r.solved_at, r.created_at, r.metadata_json,
              c.n1, c.n2, c.n3, c.n4, c.dot_tier, c.difficulty_score
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.session_id = ?
       ORDER BY r.created_at ASC`
    )
  };

  const missingNormalized = db.prepare(
    `SELECT id, display_name FROM players WHERE display_name_normalized IS NULL OR display_name_normalized = ''`
  ).all() as Array<{ id: string; display_name: string }>;
  if (missingNormalized.length > 0) {
    const updateNormalized = db.prepare(
      `UPDATE players SET display_name_normalized = ? WHERE id = ?`
    );
    const backfill = db.transaction(() => {
      for (const row of missingNormalized) {
        updateNormalized.run(normalizeName(row.display_name), row.id);
      }
    });
    backfill();
  }

  const resolvePlayerForName = (displayName: string): Player => {
    const normalized = normalizeName(displayName);
    const existing = statements.getPlayerByNormalized.get(normalized) as Player | undefined;
    if (existing) {
      return existing;
    }
    const createdAt = nowIso();
    const player: Player = {
      id: randomUUID(),
      display_name: displayName.trim(),
      age: null,
      ib_grade: null,
      notes: null,
      created_at: createdAt
    };
    statements.insertPlayer.run({
      ...player,
      display_name_normalized: normalized
    });
    return player;
  };

  const cardCache = new Map<string, {
    numbers: [number, number, number, number];
    difficultyScore: number;
    solutionCount: number;
    tags: string[];
    hint: { op?: string; intermediate?: number } | null;
  }>();

  const rng = () => Math.random();
  const prankSessions = new Map<string, boolean>();
  const prankCache = new Map<string, Array<[number, number, number, number]>>();

  type RestrictedOp = 'add' | 'sub' | 'mul' | 'div';
  type RoundMetadata = {
    restrictedOps?: RestrictedOp[];
    revealStartAt?: string;
    revealScheduleSeconds?: number[];
    prank?: boolean;
    isImpossible?: boolean;
    timerExpiredAt?: string;
    timeoutSolution?: string | null;
  };
  type RevealState = {
    enabled: boolean;
    revealedIndices: boolean[];
    displayNumbers: Array<number | null>;
    nextRevealSeconds?: number | null;
  } | null;

  type ActiveRoundResponse = {
    round: Round;
    card: Card;
    leaderboard: LeaderboardRow[];
    skipEnabled?: boolean;
    skipsRemaining?: number | null;
    skipPenaltySummary?: {
      mode: 'none' | 'selectedPlayer' | 'leader';
      points: number;
    } | null;
    timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null;
    timer: ReturnType<typeof computeTimerState>;
    hints: {
      enabled: boolean;
      hint1: string | null;
      hint2: string | null;
      hint1_revealed_at: string | null;
      hint2_revealed_at: string | null;
    };
    activeRules?: {
      restrictedOps?: { bannedOps: RestrictedOp[] } | null;
      shapeConstraint?: 'shapeA' | 'shapeB' | null;
      coldStartRemaining?: number | null;
      reveal?: {
        enabled: boolean;
        revealedIndices: boolean[];
        displayNumbers: Array<number | null>;
        nextRevealSeconds?: number | null;
      } | null;
    };
  };

  const parseRoundMetadataJson = (metadataJson: string | null | undefined): RoundMetadata => {
    if (!metadataJson) {
      return { isImpossible: false };
    }
    try {
      const parsed = JSON.parse(metadataJson) as RoundMetadata;
      if (parsed.isImpossible === undefined) {
        parsed.isImpossible = Boolean(parsed.prank);
      } else {
        parsed.isImpossible = Boolean(parsed.isImpossible);
      }
      return parsed;
    } catch {
      return { isImpossible: false };
    }
  };

  const parseRoundMetadata = (round: Round): RoundMetadata => parseRoundMetadataJson(round.metadata_json);

  const normalizeRoundMetadataForStorage = (metadataJson: string | null | undefined) => {
    if (!metadataJson) {
      return { metadata: { isImpossible: false } as RoundMetadata, needsUpdate: true };
    }
    try {
      const parsed = JSON.parse(metadataJson) as RoundMetadata;
      const hasFlag = Object.prototype.hasOwnProperty.call(parsed, 'isImpossible');
      if (!hasFlag) {
        parsed.isImpossible = Boolean(parsed.prank);
        return { metadata: parsed, needsUpdate: true };
      }
      return { metadata: parsed, needsUpdate: false };
    } catch {
      return { metadata: { isImpossible: false } as RoundMetadata, needsUpdate: true };
    }
  };

  const stripRoundMetadata = <T extends { round: Round }>(payload: T): T => ({
    ...payload,
    round: { ...payload.round, metadata_json: null }
  });

  const stripTimeoutSolution = <T extends { timeout?: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null }>(payload: T): T => ({
    ...payload,
    timeout: payload.timeout ? { ...payload.timeout, solution: null } : payload.timeout
  });

  const roundsToNormalize = db.prepare('SELECT id, metadata_json FROM rounds').all() as Array<{
    id: string;
    metadata_json: string | null;
  }>;
  if (roundsToNormalize.length > 0) {
    const normalizeRounds = db.transaction(() => {
      for (const row of roundsToNormalize) {
        const { metadata, needsUpdate } = normalizeRoundMetadataForStorage(row.metadata_json);
        if (!needsUpdate) {
          continue;
        }
        statements.updateRoundMetadata.run(JSON.stringify(metadata), row.id);
      }
    });
    normalizeRounds();
  }

  const getRevealSchedule = (rules: SessionRules): number[] => {
    const schedule = rules.blindReveal?.scheduleSeconds;
    if (schedule && schedule.length === 4) {
      return schedule.map((value) => Math.max(0, Math.floor(value)));
    }
    const interval = Math.max(1, Math.floor(rules.blindReveal?.intervalSeconds ?? 2));
    return [0, interval, interval * 2, interval * 3];
  };

  const pickRestrictedOps = (rules: SessionRules): RestrictedOp[] => {
    if (!rules.scarcityEnabled || rules.scarcityMode !== 'banOneOp') {
      return [];
    }
    const banSet = rules.scarcityBanSet ?? { add: true, sub: true, mul: true, div: true };
    const candidates = (['add', 'sub', 'mul', 'div'] as RestrictedOp[]).filter((op) => banSet[op]);
    if (candidates.length === 0) {
      return [];
    }
    const pick = candidates[Math.floor(rng() * candidates.length)];
    return [pick];
  };

  const buildAllowedOps = (rules: SessionRules, restrictedOps: RestrictedOp[]): Partial<OpsConfig> => {
    const allowed = { ...(rules.ops ?? {}) };
    for (const op of restrictedOps) {
      allowed[op] = false;
    }
    return allowed;
  };

  const getSkipInfo = (sessionId: string, rules: SessionRules) => {
    if (!rules.skip?.enabled) {
      return { skipEnabled: false, skipsRemaining: null as number | null, skipPenaltySummary: null };
    }
    const skippedCount = (statements.countManualSkips.get(sessionId) as { count: number }).count;
    const limit = rules.skip?.limit ?? null;
    const skipsRemaining = limit === null ? null : Math.max(0, limit - skippedCount);
    const mode = rules.skip.penaltyMode ?? 'none';
    const points = Math.max(0, Math.floor(rules.skip.penaltyPoints ?? 0));
    return {
      skipEnabled: true,
      skipsRemaining,
      skipPenaltySummary: { mode, points }
    };
  };

  const hasValidSolutionForConstraints = (
    numbers: [number, number, number, number],
    allowedOps: Partial<OpsConfig>,
    shapeConstraint: SessionRules['shapeConstraint']
  ): boolean => {
    const solved = solveCard(numbers, 24);
    return solved.solutions.some((solution) => {
      const result = verifyExpression(solution.expression, numbers, {
        allowedOps,
        shapeConstraint,
        maxFactorial: 12,
        maxExponent: 6,
        maxAbsValue: 1_000_000_000,
        maxConcatDigits: 4
      });
      return result.ok;
    });
  };

  const opsKey = (allowedOps: Partial<OpsConfig>): string => {
    const normalized = { ...defaultOps, ...allowedOps };
    return [
      `add:${normalized.add}`,
      `sub:${normalized.sub}`,
      `mul:${normalized.mul}`,
      `div:${normalized.div}`,
      `pow:${normalized.pow}`,
      `fact:${normalized.fact}`,
      `sqrt:${normalized.sqrt}`,
      `concat:${normalized.concat}`
    ].join('|');
  };

  const findPrankNumbers = (allowedOps: Partial<OpsConfig>): [number, number, number, number] => {
    const key = opsKey(allowedOps);
    const cached = prankCache.get(key);
    if (cached && cached.length > 0) {
      return cached[Math.floor(rng() * cached.length)];
    }
    const baseOptions = {
      allowedOps,
      maxFactorial: 12,
      maxExponent: 6,
      maxAbsValue: 1_000_000_000,
      maxConcatDigits: 4
    };
    let found = findUnsolvableNumbers(rng, { ...baseOptions, min: 1, max: 9, attempts: 3000 });
    if (!found) {
      found = findUnsolvableNumbers(rng, { ...baseOptions, min: 1, max: 13, attempts: 3000 });
    }
    if (!found) {
      throw new Error('Unable to generate an unsolvable prank card.');
    }
    prankCache.set(key, [...(cached ?? []), found]);
    return found;
  };

  const applyMistakePenalty = (sessionId: string, playerId: string, rules: SessionRules) => {
    if (!rules.mistakePenalty || rules.mistakePenalty.mode === 'none') {
      return;
    }
    if (rules.mistakePenalty.mode === 'lockout' && rules.mistakePenalty.lockoutSeconds) {
      const lockedUntil = new Date(Date.now() + rules.mistakePenalty.lockoutSeconds * 1000).toISOString();
      statements.setPlayerLockout.run(sessionId, playerId, lockedUntil);
      return;
    }
    if (rules.mistakePenalty.mode === 'minusPoints') {
      const penalty = Math.max(0, Math.floor(rules.mistakePenalty.minusPoints ?? 0));
      if (penalty === 0) {
        return;
      }
      const row = statements.getSessionPlayerScore.get(sessionId, playerId) as { score_total: number } | undefined;
      if (!row) {
        return;
      }
      const allowNegative = Boolean(rules.mistakePenalty.allowNegative);
      const nextScore = allowNegative ? row.score_total - penalty : Math.max(0, row.score_total - penalty);
      statements.updateSessionPlayerScore.run(nextScore, sessionId, playerId);
    }
  };

  const buildActiveRoundResponse = (sessionId: string): ActiveRoundResponse | null => {
    const session = statements.getSession.get(sessionId) as Session | undefined;
    if (!session) {
      return null;
    }
    const round = statements.getActiveRound.get(sessionId) as Round | undefined;
    if (!round) {
      return null;
    }
    const card = statements.getCard.get(round.card_id) as Card | undefined;
    if (!card) {
      return null;
    }
    const normalizedTier = normalizeTier(card.dot_tier, 'buildActiveRoundResponse');
    if (normalizedTier !== card.dot_tier) {
      statements.updateCardTier.run(normalizedTier, card.id);
      card.dot_tier = normalizedTier;
    }
    const rules = parseRules(session.rules_json);
    const leaderboard = statements.leaderboard.all(sessionId) as LeaderboardRow[];
    const skipInfo = getSkipInfo(sessionId, rules);
    const timer = computeTimerState(round.created_at, rules.timer_mode ?? 'off', rules.countdown_seconds);
    const metadata = parseRoundMetadata(round);
    const restrictedOps = metadata.restrictedOps ?? [];
    const allowedOps = buildAllowedOps(rules, restrictedOps);
    const coldStartRemaining = rules.coldStartSeconds
      ? computeColdStartRemaining(round.created_at, rules.coldStartSeconds)
      : 0;

    const hintOps = card.hint_ops_json ? (JSON.parse(card.hint_ops_json) as string[]) : [];
    const hintIntermediates = card.hint_intermediates_json
      ? (JSON.parse(card.hint_intermediates_json) as Array<number>)
      : [];
    const hint1 = hintOps[0] ? `Operation: ${hintOps[0]}` : null;
    const hint2 = hintIntermediates[0] !== undefined ? `Intermediate: ${hintIntermediates[0]}` : null;

    let hint1Revealed = round.hint1_revealed_at;
    let hint2Revealed = round.hint2_revealed_at;
    if (rules.hints_enabled) {
      const elapsedSeconds = timer.elapsedSeconds;
      if (shouldRevealHint(elapsedSeconds, rules.hint1_after_seconds ?? 30, Boolean(hint1Revealed))) {
        hint1Revealed = nowIso();
        statements.updateRoundHint1.run(hint1Revealed, round.id);
      }
      if (shouldRevealHint(elapsedSeconds, rules.hint2_after_seconds ?? 50, Boolean(hint2Revealed))) {
        hint2Revealed = nowIso();
        statements.updateRoundHint2.run(hint2Revealed, round.id);
      }
    }

    let revealState: RevealState = null;
    if (rules.blindReveal?.enabled) {
      const revealStartAt = metadata.revealStartAt ?? round.created_at;
      const rawSchedule = metadata.revealScheduleSeconds ?? getRevealSchedule(rules);
      const schedule = rawSchedule.length >= 4
        ? rawSchedule.slice(0, 4)
        : [...rawSchedule, ...new Array(4 - rawSchedule.length).fill(rawSchedule[rawSchedule.length - 1] ?? 0)];
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(revealStartAt).getTime()) / 1000));
      const revealedIndices = schedule.map((value) => elapsed >= value);
      const cardNumbers = [card.n1, card.n2, card.n3, card.n4];
      const displayNumbers = cardNumbers.map((value, index) => (revealedIndices[index] ? value : null));
      const nextReveal = schedule.find((value) => value > elapsed);
      revealState = {
        enabled: true,
        revealedIndices,
        displayNumbers,
        nextRevealSeconds: nextReveal !== undefined ? Math.max(0, nextReveal - elapsed) : null
      };
    }

    let timeout: { expired: boolean; solution?: string | null; remainingSeconds?: number | null } | null = null;
    if (rules.timer_mode === 'countdown' && timer.remainingSeconds !== undefined && timer.remainingSeconds <= 0) {
      let metadataChanged = false;
      if (!metadata.timerExpiredAt) {
        metadata.timerExpiredAt = nowIso();
        metadataChanged = true;
      }
      if (metadata.timeoutSolution === undefined) {
        if (!metadata.isImpossible) {
          metadata.timeoutSolution = findSolutionExpressionWithOps(
            [card.n1, card.n2, card.n3, card.n4],
            24,
            {
              allowedOps,
              shapeConstraint: rules.shapeConstraint ?? null,
              maxFactorial: 12,
              maxExponent: 6,
              maxAbsValue: 1_000_000_000,
              maxConcatDigits: 4
            }
          );
        } else {
          metadata.timeoutSolution = null;
        }
        metadataChanged = true;
      }
      if (metadataChanged) {
        statements.updateRoundMetadata.run(JSON.stringify(metadata), round.id);
      }
      const expiredAt = new Date(metadata.timerExpiredAt ?? round.created_at).getTime();
      const elapsedExpired = Math.max(0, Math.floor((Date.now() - expiredAt) / 1000));
      const remaining = Math.max(0, 10 - elapsedExpired);
      if (remaining === 0) {
        statements.markRoundSkipped.run(nowIso(), null, 'timer_expired', round.id);
        createRoundForSession(session.id, rules, { prankMode: prankSessions.get(session.id) === true });
        const next = buildActiveRoundResponse(session.id);
        if (next) {
          return next;
        }
      }
      timeout = {
        expired: true,
        solution: metadata.timeoutSolution ?? null,
        remainingSeconds: remaining
      };
    }

    return {
      round: { ...round, hint1_revealed_at: hint1Revealed ?? null, hint2_revealed_at: hint2Revealed ?? null },
      card,
      leaderboard,
      skipEnabled: skipInfo.skipEnabled,
      skipsRemaining: skipInfo.skipsRemaining,
      skipPenaltySummary: skipInfo.skipPenaltySummary,
      timeout,
      timer,
      hints: {
        enabled: Boolean(rules.hints_enabled),
        hint1: hint1Revealed ? hint1 : null,
        hint2: hint2Revealed ? hint2 : null,
        hint1_revealed_at: hint1Revealed ?? null,
        hint2_revealed_at: hint2Revealed ?? null
      },
      activeRules: {
        restrictedOps: restrictedOps.length > 0 ? { bannedOps: restrictedOps } : null,
        shapeConstraint: rules.shapeConstraint ?? null,
        coldStartRemaining: rules.coldStartSeconds ? coldStartRemaining : null,
        reveal: revealState
      }
    };
  };

  const createRoundForSession = (sessionId: string, rules: SessionRules, options?: { prankMode?: boolean }) => {
    const recentRows = statements.recentCards.all(sessionId, 20) as Array<{
      n1: number;
      n2: number;
      n3: number;
      n4: number;
    }>;
    const recentSignatures = new Set(recentRows.map((row) => cardSignature([row.n1, row.n2, row.n3, row.n4])));

    const restrictedOps = pickRestrictedOps(rules);
    const allowedOps = buildAllowedOps(rules, restrictedOps);
    const metadata: RoundMetadata = { isImpossible: Boolean(options?.prankMode) };
    if (restrictedOps.length > 0) {
      metadata.restrictedOps = restrictedOps;
    }
    if (rules.blindReveal?.enabled) {
      metadata.revealStartAt = nowIso();
      metadata.revealScheduleSeconds = getRevealSchedule(rules);
    }
    if (options?.prankMode) {
      metadata.prank = true;
    }

    const verifyOptions = {
      maxFactorial: 12,
      maxExponent: 6,
      maxAbsValue: 1_000_000_000,
      maxConcatDigits: 4
    };

    const cardId = randomUUID();
    let card: Card;

    if (options?.prankMode) {
      let numbers: [number, number, number, number] | null = null;
      const prankKey = opsKey(allowedOps);
      const prankOptions = {
        allowedOps,
        maxFactorial: 12,
        maxExponent: 6,
        maxAbsValue: 1_000_000_000,
        maxConcatDigits: 4
      };
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const candidate = findPrankNumbers(allowedOps);
        const candidateSignature = cardSignature(candidate);
        if (!recentSignatures.has(candidateSignature)) {
          numbers = candidate;
          break;
        }
        const fresh = findUnsolvableNumbers(rng, { ...prankOptions, min: 1, max: 13, attempts: 600 });
        if (fresh && !recentSignatures.has(cardSignature(fresh))) {
          prankCache.set(prankKey, [...(prankCache.get(prankKey) ?? []), fresh]);
          numbers = fresh;
          break;
        }
      }
      numbers ??= findPrankNumbers(allowedOps);
      const randomTier = normalizeTier(Math.floor(rng() * 4) + 1, 'prankTier');
      card = {
        id: cardId,
        n1: numbers[0],
        n2: numbers[1],
        n3: numbers[2],
        n4: numbers[3],
        target: 24,
        difficulty_score: 1,
        dot_tier: randomTier,
        solution_count: 0,
        attempts_count: 0,
        solves_count: 0,
        avg_attempts_to_solve: null,
        avg_time_to_solve: null,
        tags_json: JSON.stringify([]),
        hint_ops_json: JSON.stringify([]),
        hint_intermediates_json: JSON.stringify([]),
        created_at: nowIso()
      };
    } else {
      let generated: ReturnType<typeof generateCard> | null = null;
      const rejected = new Set<string>();
      for (let attempt = 0; attempt < 300; attempt += 1) {
        generated = generateCard({
          rng,
          difficultyMode: rules.difficulty_mode ?? 'mixed',
          fixedTier: rules.fixed_tier,
          recentSignatures: new Set([...recentSignatures, ...rejected]),
          cache: cardCache,
          thresholds: difficultyThresholds,
          allowedOps,
          verifyOptions
        });
        const signature = cardSignature(generated.numbers);
        if (rules.shapeConstraint && !hasValidSolutionForConstraints(generated.numbers, allowedOps, rules.shapeConstraint)) {
          rejected.add(signature);
          generated = null;
          continue;
        }
        break;
      }

      if (!generated) {
        throw new Error('Unable to generate a valid card for the current constraints.');
      }

      const normalizedTier = normalizeTier(generated.dotTier, 'generateCard');
      card = {
        id: cardId,
        n1: generated.numbers[0],
        n2: generated.numbers[1],
        n3: generated.numbers[2],
        n4: generated.numbers[3],
        target: 24,
        difficulty_score: generated.difficultyScore,
        dot_tier: normalizedTier,
        solution_count: generated.solutionCount,
        attempts_count: 0,
        solves_count: 0,
        avg_attempts_to_solve: null,
        avg_time_to_solve: null,
        tags_json: JSON.stringify(generated.tags ?? []),
        hint_ops_json: JSON.stringify(generated.hint?.op ? [generated.hint.op] : []),
        hint_intermediates_json: JSON.stringify(
          generated.hint?.intermediate !== undefined ? [generated.hint.intermediate] : []
        ),
        created_at: nowIso()
      };
    }

    statements.insertCard.run(card);

    const roundId = randomUUID();
    const round: Round = {
      id: roundId,
      session_id: sessionId,
      card_id: cardId,
      status: 'active',
      solved_by_player_id: null,
      solved_at: null,
      metadata_json: JSON.stringify(metadata),
      created_at: nowIso()
    };
    statements.insertRound.run(round);

    return { round, card };
  };

  const handleApprovedSubmission = (args: {
    session: Session;
    active: ActiveRoundResponse;
    playerId: string;
    expressionRaw: string;
    source: 'host' | 'lan';
  }) => {
    const { session, active, playerId, expressionRaw, source } = args;
    const rules = parseRules(session.rules_json);
    const metadata = parseRoundMetadata(active.round);
    const restrictedOps = metadata.restrictedOps ?? [];
    const allowedOps = buildAllowedOps(rules, restrictedOps);
    const cardNumbers = [active.card.n1, active.card.n2, active.card.n3, active.card.n4];

    if (active.timeout?.expired) {
      const attemptId = randomUUID();
      statements.insertAttempt.run({
        id: attemptId,
        round_id: active.round.id,
        player_id: playerId,
        expression_raw: expressionRaw,
        normalized_expression: null,
        evaluated_num: null,
        evaluated_den: null,
        is_correct: 0,
        error_code: 'ROUND_TIMER_EXPIRED',
        source,
        approval_status: 'approved',
        created_at: nowIso()
      });
      return {
        result: {
          correct: false,
          error_code: 'ROUND_TIMER_EXPIRED',
          remainingSeconds: active.timeout.remainingSeconds ?? undefined
        },
        round: active.round,
        card: active.card,
        leaderboard: statements.leaderboard.all(session.id),
        skipEnabled: active.skipEnabled,
        skipsRemaining: active.skipsRemaining,
        skipPenaltySummary: active.skipPenaltySummary,
        timeout: active.timeout,
        timer: active.timer,
        hints: active.hints,
        activeRules: active.activeRules
      };
    }

    const lockoutRow = statements.getPlayerLockout.get(session.id, playerId) as { locked_until: string } | undefined;
    if (lockoutRow) {
      const lockedUntil = new Date(lockoutRow.locked_until).getTime();
      const remainingSeconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      if (remainingSeconds > 0) {
        const attemptId = randomUUID();
        statements.insertAttempt.run({
          id: attemptId,
          round_id: active.round.id,
          player_id: playerId,
          expression_raw: expressionRaw,
          normalized_expression: null,
          evaluated_num: null,
          evaluated_den: null,
          is_correct: 0,
          error_code: 'PLAYER_LOCKED_OUT',
          source,
          approval_status: 'approved',
          created_at: nowIso()
        });
        return {
          result: { correct: false, error_code: 'PLAYER_LOCKED_OUT', remainingSeconds },
          round: active.round,
          card: active.card,
          leaderboard: statements.leaderboard.all(session.id),
          skipEnabled: active.skipEnabled,
          skipsRemaining: active.skipsRemaining,
          skipPenaltySummary: active.skipPenaltySummary,
          timeout: active.timeout,
          timer: active.timer,
          hints: active.hints,
          activeRules: active.activeRules
        };
      }
      statements.clearPlayerLockout.run(session.id, playerId);
    }

    const coldStartRemaining = rules.coldStartSeconds
      ? computeColdStartRemaining(active.round.created_at, rules.coldStartSeconds)
      : 0;
    if (coldStartRemaining > 0) {
      const attemptId = randomUUID();
      statements.insertAttempt.run({
        id: attemptId,
        round_id: active.round.id,
        player_id: playerId,
        expression_raw: expressionRaw,
        normalized_expression: null,
        evaluated_num: null,
        evaluated_den: null,
        is_correct: 0,
        error_code: 'ROUND_COLD_START',
        source,
        approval_status: 'approved',
        created_at: nowIso()
      });
      return {
        result: { correct: false, error_code: 'ROUND_COLD_START', remainingSeconds: coldStartRemaining },
        round: active.round,
        card: active.card,
        leaderboard: statements.leaderboard.all(session.id),
        skipEnabled: active.skipEnabled,
        skipsRemaining: active.skipsRemaining,
        skipPenaltySummary: active.skipPenaltySummary,
        timeout: active.timeout,
        timer: active.timer,
        hints: active.hints,
        activeRules: active.activeRules
      };
    }

    const verified = verifyExpression(expressionRaw, cardNumbers, {
      allowedOps,
      shapeConstraint: rules.shapeConstraint ?? null,
      maxFactorial: 12,
      maxExponent: 6,
      maxAbsValue: 1_000_000_000,
      maxConcatDigits: 4
    });
    const attemptId = randomUUID();
    statements.insertAttempt.run({
      id: attemptId,
      round_id: active.round.id,
      player_id: playerId,
      expression_raw: expressionRaw,
      normalized_expression: verified.normalizedExpression ?? null,
      evaluated_num: verified.evaluated ? verified.evaluated.num : null,
      evaluated_den: verified.evaluated ? verified.evaluated.den : null,
      is_correct: verified.ok ? 1 : 0,
      error_code: verified.errorCode,
      source,
      approval_status: 'approved',
      created_at: nowIso()
    });
    statements.incrementCardAttempts.run(active.card.id);

    if (!verified.ok) {
      statements.incrementWrong.run(session.id, playerId);
      applyMistakePenalty(session.id, playerId, rules);
      return {
        result: { correct: false, error_code: verified.errorCode },
        round: active.round,
        card: active.card,
        leaderboard: statements.leaderboard.all(session.id),
        skipEnabled: active.skipEnabled,
        skipsRemaining: active.skipsRemaining,
        skipPenaltySummary: active.skipPenaltySummary,
        timeout: active.timeout,
        timer: active.timer,
        hints: active.hints,
        activeRules: active.activeRules
      };
    }

    const scoring = rules.scoring ?? defaultScoring;
    const basePoints = scoring[String(active.card.dot_tier) as '1' | '2' | '3' | '4'] ?? 0;
    let bonusPoints = 0;
    if (rules.uniquenessBonusPoints && rules.uniquenessBonusPoints > 0 && verified.ast) {
      const signature = astSignature(verified.ast);
      const inserted = statements.insertSolutionSignature.run(session.id, signature, nowIso()).changes;
      if (inserted > 0) {
        bonusPoints = rules.uniquenessBonusPoints;
      }
    }
    const points = basePoints + bonusPoints;
    const solvedAt = nowIso();
    const transaction = db.transaction(() => {
      statements.incrementCorrect.run(points, session.id, playerId);
      statements.markRoundSolved.run(playerId, solvedAt, active.round.id);

      const attemptsForRound = (statements.countAttemptsForRound.get(active.round.id) as { count: number }).count;
      const solvesCount = active.card.solves_count ?? 0;
      const previousAvgAttempts = active.card.avg_attempts_to_solve ?? 0;
      const previousAvgTime = active.card.avg_time_to_solve ?? 0;
      const elapsedSeconds = Math.max(
        0,
        Math.floor((new Date(solvedAt).getTime() - new Date(active.round.created_at).getTime()) / 1000)
      );
      const newAvgAttempts = (previousAvgAttempts * solvesCount + attemptsForRound) / (solvesCount + 1);
      const newAvgTime = (previousAvgTime * solvesCount + elapsedSeconds) / (solvesCount + 1);
      statements.updateCardSolveStats.run({
        id: active.card.id,
        avg_attempts_to_solve: newAvgAttempts,
        avg_time_to_solve: newAvgTime
      });
    });
    transaction();

    createRoundForSession(session.id, rules, { prankMode: prankSessions.get(session.id) === true });
    const next = buildActiveRoundResponse(session.id);
    return {
      result: { correct: true, points, error_code: 'OK', bonus_points: bonusPoints || undefined },
      round: next?.round ?? active.round,
      card: next?.card ?? active.card,
      leaderboard: next?.leaderboard ?? statements.leaderboard.all(session.id),
      skipEnabled: next?.skipEnabled ?? active.skipEnabled,
      skipsRemaining: next?.skipsRemaining ?? active.skipsRemaining,
      skipPenaltySummary: next?.skipPenaltySummary ?? active.skipPenaltySummary,
      timeout: next?.timeout ?? active.timeout,
      timer: next?.timer,
      hints: next?.hints,
      activeRules: next?.activeRules ?? active.activeRules
    };
  };

  const maybeCalibrateDifficulty = () => {
    if (!config.calibration?.enabled) {
      return;
    }
    const windowSize = config.calibration.window ?? 200;
    const rows = db.prepare(
      `SELECT c.difficulty_score as score
       FROM rounds r
       JOIN cards c ON r.card_id = c.id
       WHERE r.status = 'solved' AND r.solved_by_player_id IS NOT NULL
       ORDER BY r.solved_at DESC
       LIMIT ?`
    ).all(windowSize) as Array<{ score: number }>;

    if (rows.length < 10) {
      return;
    }
    const scores = rows.map((row) => row.score).sort((a, b) => a - b);
    const pick = (p: number) => scores[Math.min(scores.length - 1, Math.max(0, Math.floor(scores.length * p)))] ?? scores[0];
    const thresholds = {
      t1: pick(0.25),
      t2: pick(0.45),
      t3: pick(0.65)
    };
    difficultyThresholds = thresholds;
    config.difficultyThresholds = thresholds;
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  };

  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  fastify.get('/api/health', async () => ({ ok: true }));

  fastify.post('/api/boot', async () => {
    const address = fastify.server.address();
    const port = typeof address === 'object' && address ? address.port : undefined;
    return {
      dataDir,
      config,
      serverVersion: '0.2.0',
      port,
      lanUrls: port ? getLanUrls(port) : []
    };
  });

  fastify.post<{ Body: { display_name: string; age?: number | null; ib_grade?: string | null; notes?: string | null } }>(
    '/api/players',
    async (request, reply) => {
      const { display_name, age = null, ib_grade = null, notes = null } = request.body;
      if (!display_name || display_name.trim() === '') {
        reply.status(400).send({ error: 'Display name is required.' });
        return;
      }
      const player = {
        id: randomUUID(),
        display_name: display_name.trim(),
        display_name_normalized: normalizeName(display_name),
        age,
        ib_grade,
        notes,
        created_at: nowIso()
      };
      statements.insertPlayer.run(player);
      reply.send(player);
    }
  );

  fastify.get('/api/players', async () => {
    return statements.listPlayers.all();
  });

  fastify.put<{ Params: { id: string }; Body: { display_name: string; age?: number | null; ib_grade?: string | null; notes?: string | null } }>(
    '/api/players/:id',
    async (request, reply) => {
      const { display_name, age = null, ib_grade = null, notes = null } = request.body;
      if (!display_name || display_name.trim() === '') {
        reply.status(400).send({ error: 'Display name is required.' });
        return;
      }
      statements.updatePlayer.run({
        id: request.params.id,
        display_name: display_name.trim(),
        display_name_normalized: normalizeName(display_name),
        age,
        ib_grade,
        notes
      });
      reply.send({ ok: true });
    }
  );

  fastify.delete<{ Params: { id: string } }>('/api/players/:id', async (request) => {
    statements.deletePlayer.run(request.params.id);
    return { ok: true };
  });

  fastify.post<{ Body: { players: PlayerInput[]; mode: 'skip' | 'update' | 'import_anyway' } }>(
    '/api/players/import',
    async (request, reply) => {
      const { players, mode } = request.body;
      if (!players || players.length === 0) {
        reply.status(400).send({ error: 'No players to import.' });
        return;
      }
      const existing = statements.listPlayers.all() as Array<{ id: string; display_name: string }>;
      const planned = planPlayerImport(existing, players, mode);

      const insert = statements.insertPlayer;
      const update = statements.updatePlayer;
      const createdAt = nowIso();
      const run = db.transaction(() => {
        for (const entry of planned.updates) {
          update.run({
            id: entry.id,
            display_name: entry.data.display_name.trim(),
            display_name_normalized: normalizeName(entry.data.display_name),
            age: entry.data.age ?? null,
            ib_grade: entry.data.ib_grade ?? null,
            notes: entry.data.notes ?? null
          });
        }
        for (const entry of planned.inserts) {
          insert.run({
            id: randomUUID(),
            display_name: entry.display_name.trim(),
            display_name_normalized: normalizeName(entry.display_name),
            age: entry.age ?? null,
            ib_grade: entry.ib_grade ?? null,
            notes: entry.notes ?? null,
            created_at: createdAt
          });
        }
      });

      run();

      reply.send({
        inserted: planned.inserts.length,
        updated: planned.updates.length,
        skipped: planned.skipped,
        duplicates: planned.duplicates
      });
    }
  );

  fastify.post('/api/exports/players', async () => {
    const rows = statements.exportPlayers.all() as Array<{
      id: string;
      display_name: string;
      age: number | null;
      ib_grade: string | null;
      notes: string | null;
      created_at: string;
    }>;
    const lines = ['id,display_name,age,ib_grade,notes,created_at'];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          safeCsv(row.display_name),
          row.age ?? '',
          safeCsv(row.ib_grade ?? ''),
          safeCsv(row.notes ?? ''),
          row.created_at
        ].join(',')
      );
    }
    return writeExportFile(dataDir, 'players', `${lines.join('\n')}\n`);
  });

  fastify.post('/api/exports/sessions', async () => {
    const rows = statements.exportSessions.all() as Array<{
      id: string;
      title: string;
      status: string;
      rules_json: string;
      created_at: string;
    }>;
    const lines = ['id,title,status,rules_json,created_at'];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          safeCsv(row.title),
          row.status,
          safeCsv(row.rules_json),
          row.created_at
        ].join(',')
      );
    }
    return writeExportFile(dataDir, 'sessions', `${lines.join('\n')}\n`);
  });

  fastify.post('/api/exports/attempts', async () => {
    const rows = statements.exportAttempts.all() as Array<{
      id: string;
      expression_raw: string;
      normalized_expression: string | null;
      evaluated_num: number | null;
      evaluated_den: number | null;
      is_correct: number;
      error_code: string;
      source: string;
      approval_status: string;
      created_at: string;
      player_name: string;
      session_title: string;
      round_id: string;
      n1: number;
      n2: number;
      n3: number;
      n4: number;
      dot_tier: number;
    }>;
    const lines = ['id,session_title,round_id,player_name,card_numbers,dot_tier,expression_raw,normalized_expression,evaluated_num,evaluated_den,is_correct,error_code,source,approval_status,created_at'];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          safeCsv(row.session_title),
          row.round_id,
          safeCsv(row.player_name),
          safeCsv(`${row.n1} ${row.n2} ${row.n3} ${row.n4}`),
          row.dot_tier,
          safeCsv(row.expression_raw),
          safeCsv(row.normalized_expression ?? ''),
          row.evaluated_num ?? '',
          row.evaluated_den ?? '',
          row.is_correct,
          row.error_code,
          row.source,
          row.approval_status,
          row.created_at
        ].join(',')
      );
    }
    return writeExportFile(dataDir, 'attempts', `${lines.join('\n')}\n`);
  });

  fastify.post('/api/sessions/clear-history', async (request, reply) => {
    const clear = db.transaction(() => {
      const deletedSessions = statements.deleteAllSessions.run().changes;
      const deletedCards = statements.deleteOrphanCards.run().changes;
      return { deletedSessions, deletedCards };
    });
    const result = clear();
    reply.send({ ok: true, deletedSessions: result.deletedSessions, deletedCards: result.deletedCards });
  });

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/export-bundle', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }

    const leaderboard = statements.leaderboard.all(request.params.id) as LeaderboardRow[];
    const playerRows = statements.exportSessionPlayers.all(request.params.id) as Array<{
      player_id: string;
      display_name: string;
      score_total: number;
      correct_count: number;
      wrong_count: number;
    }>;
    const attemptRows = statements.exportSessionAttempts.all(request.params.id) as Array<{
      id: string;
      expression_raw: string;
      normalized_expression: string | null;
      evaluated_num: number | null;
      evaluated_den: number | null;
      is_correct: number;
      error_code: string;
      source: string;
      approval_status: string;
      created_at: string;
      player_name: string;
      round_id: string;
      n1: number;
      n2: number;
      n3: number;
      n4: number;
      dot_tier: number;
    }>;
    const roundRows = statements.exportSessionRounds.all(request.params.id) as Array<{
      id: string;
      status: string;
      solved_by_player_id: string | null;
      solved_at: string | null;
      created_at: string;
      n1: number;
      n2: number;
      n3: number;
      n4: number;
      dot_tier: number;
      difficulty_score: number;
    }>;

    const playersCsv = [
      'player_id,display_name,score_total,correct_count,wrong_count',
      ...playerRows.map((row) =>
        [row.player_id, safeCsv(row.display_name), row.score_total, row.correct_count, row.wrong_count].join(',')
      )
    ].join('\n');

    const roundsCsv = [
      'round_id,status,solved_by_player_id,solved_at,created_at,card_numbers,dot_tier,difficulty_score',
      ...roundRows.map((row) =>
        [
          row.id,
          row.status,
          row.solved_by_player_id ?? '',
          row.solved_at ?? '',
          row.created_at,
          safeCsv(`${row.n1} ${row.n2} ${row.n3} ${row.n4}`),
          row.dot_tier,
          row.difficulty_score
        ].join(',')
      )
    ].join('\n');

    const attemptsCsv = [
      'attempt_id,round_id,player_name,card_numbers,dot_tier,expression_raw,normalized_expression,evaluated_num,evaluated_den,is_correct,error_code,source,approval_status,created_at',
      ...attemptRows.map((row) =>
        [
          row.id,
          row.round_id,
          safeCsv(row.player_name),
          safeCsv(`${row.n1} ${row.n2} ${row.n3} ${row.n4}`),
          row.dot_tier,
          safeCsv(row.expression_raw),
          safeCsv(row.normalized_expression ?? ''),
          row.evaluated_num ?? '',
          row.evaluated_den ?? '',
          row.is_correct,
          row.error_code,
          row.source,
          row.approval_status,
          row.created_at
        ].join(',')
      )
    ].join('\n');

    const summary = {
      generated_at: nowIso(),
      session,
      rules: parseRules(session.rules_json),
      leaderboard,
      totals: {
        rounds: (statements.countRounds.get(request.params.id) as { count: number }).count,
        tier4_solves: (statements.countHardest.get(request.params.id) as { count: number }).count
      }
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${session.id}-${timestamp}.zip`;
    const exportPath = path.join(dataDir, 'exports', filename);

    const output = fs.createWriteStream(exportPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const done = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', (err: unknown) => reject(err));
      archive.on('error', (err: unknown) => reject(err));
    });

    archive.pipe(output);
    archive.append(`${playersCsv}\n`, { name: 'players.csv' });
    archive.append(`${roundsCsv}\n`, { name: 'rounds.csv' });
    archive.append(`${attemptsCsv}\n`, { name: 'attempts.csv' });
    archive.append(`${JSON.stringify(summary, null, 2)}\n`, { name: 'summary.json' });
    archive.finalize();

    await done;
    reply.send({ filename, path: exportPath });
  });

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/export-bundle-reality', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    if (session.status !== 'finished') {
      reply.status(409).send({ error: 'Reality Check export is only available after the session ends.' });
      return;
    }

    const leaderboard = statements.leaderboard.all(request.params.id) as LeaderboardRow[];
    const playerRows = statements.exportSessionPlayers.all(request.params.id) as Array<{
      player_id: string;
      display_name: string;
      score_total: number;
      correct_count: number;
      wrong_count: number;
    }>;
    const attemptRows = statements.exportSessionAttempts.all(request.params.id) as Array<{
      id: string;
      expression_raw: string;
      normalized_expression: string | null;
      evaluated_num: number | null;
      evaluated_den: number | null;
      is_correct: number;
      error_code: string;
      source: string;
      approval_status: string;
      created_at: string;
      player_name: string;
      round_id: string;
      n1: number;
      n2: number;
      n3: number;
      n4: number;
      dot_tier: number;
    }>;
    const roundRows = statements.exportSessionRoundsWithMetadata.all(request.params.id) as Array<{
      id: string;
      status: string;
      solved_by_player_id: string | null;
      solved_at: string | null;
      created_at: string;
      metadata_json: string | null;
      n1: number;
      n2: number;
      n3: number;
      n4: number;
      dot_tier: number;
      difficulty_score: number;
    }>;

    const playersCsv = [
      'player_id,display_name,score_total,correct_count,wrong_count',
      ...playerRows.map((row) =>
        [row.player_id, safeCsv(row.display_name), row.score_total, row.correct_count, row.wrong_count].join(',')
      )
    ].join('\n');

    const roundsCsv = [
      'round_id,status,solved_by_player_id,solved_at,created_at,card_numbers,dot_tier,difficulty_score,is_impossible',
      ...roundRows.map((row) => {
        const metadata = parseRoundMetadataJson(row.metadata_json);
        return [
          row.id,
          row.status,
          row.solved_by_player_id ?? '',
          row.solved_at ?? '',
          row.created_at,
          safeCsv(`${row.n1} ${row.n2} ${row.n3} ${row.n4}`),
          row.dot_tier,
          row.difficulty_score,
          metadata.isImpossible ? 1 : 0
        ].join(',');
      })
    ].join('\n');

    const attemptsCsv = [
      'attempt_id,round_id,player_name,card_numbers,dot_tier,expression_raw,normalized_expression,evaluated_num,evaluated_den,is_correct,error_code,source,approval_status,created_at',
      ...attemptRows.map((row) =>
        [
          row.id,
          row.round_id,
          safeCsv(row.player_name),
          safeCsv(`${row.n1} ${row.n2} ${row.n3} ${row.n4}`),
          row.dot_tier,
          safeCsv(row.expression_raw),
          safeCsv(row.normalized_expression ?? ''),
          row.evaluated_num ?? '',
          row.evaluated_den ?? '',
          row.is_correct,
          row.error_code,
          row.source,
          row.approval_status,
          row.created_at
        ].join(',')
      )
    ].join('\n');

    const summary = {
      generated_at: nowIso(),
      session,
      rules: parseRules(session.rules_json),
      leaderboard,
      totals: {
        rounds: (statements.countRounds.get(request.params.id) as { count: number }).count,
        tier4_solves: (statements.countHardest.get(request.params.id) as { count: number }).count
      }
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${session.id}-${timestamp}-reality.zip`;
    const exportPath = path.join(dataDir, 'exports', filename);

    const output = fs.createWriteStream(exportPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const done = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', (err: unknown) => reject(err));
      archive.on('error', (err: unknown) => reject(err));
    });

    archive.pipe(output);
    archive.append('This export includes Reality Check data. Some rounds were intentionally unsolvable.\n', {
      name: 'README.txt'
    });
    archive.append(`${playersCsv}\n`, { name: 'players.csv' });
    archive.append(`${roundsCsv}\n`, { name: 'rounds.csv' });
    archive.append(`${attemptsCsv}\n`, { name: 'attempts.csv' });
    archive.append(`${JSON.stringify(summary, null, 2)}\n`, { name: 'summary.json' });
    archive.finalize();

    await done;
    reply.send({ filename, path: exportPath });
  });

  fastify.post<{ Body: {
    title: string;
    difficulty_mode: 'mixed' | 'fixed';
    fixed_tier?: 1 | 2 | 3 | 4;
    scoring?: SessionRules['scoring'];
    ops?: SessionRules['ops'];
    timer_mode?: SessionRules['timer_mode'];
    countdown_seconds?: number;
    hints_enabled?: boolean;
    hint1_after_seconds?: number;
    hint2_after_seconds?: number;
    lan_enabled?: boolean;
    lan_auto_accept?: boolean;
    no_undo_input?: boolean;
    scarcityEnabled?: boolean;
    scarcityMode?: 'banOneOp';
    scarcityBanSet?: { add?: boolean; sub?: boolean; mul?: boolean; div?: boolean };
    shapeConstraint?: 'shapeA' | 'shapeB' | null;
    mistakePenalty?: SessionRules['mistakePenalty'];
    coldStartSeconds?: number;
    blindReveal?: SessionRules['blindReveal'];
    uniquenessBonusPoints?: number;
    skip?: SessionRules['skip'];
  } }>(
    '/api/sessions',
    async (request, reply) => {
    const {
      title,
      difficulty_mode,
      fixed_tier,
      scoring,
      ops,
      timer_mode,
      countdown_seconds,
        hints_enabled,
        hint1_after_seconds,
        hint2_after_seconds,
        lan_enabled,
        lan_auto_accept,
        no_undo_input,
        scarcityEnabled,
        scarcityMode,
        scarcityBanSet,
        shapeConstraint,
        mistakePenalty,
        coldStartSeconds,
        blindReveal,
        uniquenessBonusPoints,
        skip
      } = request.body;
      if (!title || title.trim() === '') {
        reply.status(400).send({ error: 'Title is required.' });
        return;
      }
      if (difficulty_mode === 'fixed' && !fixed_tier) {
        reply.status(400).send({ error: 'Fixed tier is required for fixed mode.' });
        return;
      }
      const rules = normalizeRules({
        scoring,
        difficulty_mode,
        ...(difficulty_mode === 'fixed' ? { fixed_tier } : {}),
        ops,
        timer_mode,
        countdown_seconds,
        hints_enabled,
        hint1_after_seconds,
        hint2_after_seconds,
        lan_enabled,
        lan_auto_accept,
        no_undo_input,
        scarcityEnabled,
        scarcityMode,
        scarcityBanSet,
        shapeConstraint,
        mistakePenalty,
        coldStartSeconds,
        blindReveal,
        uniquenessBonusPoints,
        skip
      });
      const join_code = generateJoinCode();
      const session = {
        id: randomUUID(),
        title: title.trim(),
        status: 'setup',
        rules_json: JSON.stringify(rules),
        join_code,
        created_at: nowIso()
      };
      statements.insertSession.run(session);
      reply.send(session);
    }
  );

  fastify.get('/api/sessions', async () => {
    return statements.listSessions.all();
  });

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    if (!session.join_code) {
      const joinCode = generateJoinCode();
      statements.updateSessionJoinCode.run(joinCode, session.id);
      session.join_code = joinCode;
    }
    reply.send(session);
  });

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/start', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    if (session.status === 'finished') {
      reply.status(400).send({ error: 'Session already finished.' });
      return;
    }
    const playerIds = statements.listPlayerIds.all() as Array<{ id: string }>;
    const createdAt = nowIso();
    for (const row of playerIds) {
      statements.insertSessionPlayer.run({ session_id: session.id, player_id: row.id, created_at: createdAt });
    }
    if (session.status !== 'live') {
      statements.updateSessionStatus.run('live', session.id);
    }
    let active = buildActiveRoundResponse(session.id);
    if (!active) {
      const rules = parseRules(session.rules_json);
      createRoundForSession(session.id, rules, { prankMode: prankSessions.get(session.id) === true });
      active = buildActiveRoundResponse(session.id);
    }
    if (!active) {
      reply.status(500).send({ error: 'Unable to create an active round.' });
      return;
    }
    reply.send(stripRoundMetadata(active));
  });

  fastify.post<{ Params: { id: string }; Body: { active: boolean } }>(
    '/api/sessions/:id/prank',
    async (request, reply) => {
      const session = statements.getSession.get(request.params.id) as Session | undefined;
      if (!session) {
        reply.status(404).send({ error: 'Session not found.' });
        return;
      }
      const activate = Boolean(request.body.active);
      prankSessions.set(session.id, activate);
      statements.setPrankState.run(session.id, activate ? 1 : 0, nowIso());

      if (activate && session.status === 'live') {
        const activeRound = statements.getActiveRound.get(session.id) as Round | undefined;
        if (activeRound) {
          statements.markRoundSolved.run(null, nowIso(), activeRound.id);
        }
        const rules = parseRules(session.rules_json);
        createRoundForSession(session.id, rules, { prankMode: true });
      }

      reply.send({ ok: true, active: activate });
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id/active-round', async (request, reply) => {
    const active = buildActiveRoundResponse(request.params.id);
    if (!active) {
      reply.status(404).send({ error: 'No active round.' });
      return;
    }
    reply.send(stripRoundMetadata(active));
  });

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id/projector', async (request, reply) => {
    const active = buildActiveRoundResponse(request.params.id);
    if (!active) {
      reply.status(404).send({ error: 'No active round.' });
      return;
    }
    reply.send(stripRoundMetadata({
      round: active.round,
      card: active.card,
      timer: active.timer,
      hints: active.hints,
      activeRules: active.activeRules,
      timeout: active.timeout
    }));
  });

  fastify.post<{ Params: { id: string }; Body: { player_id: string; expression_raw: string } }>(
    '/api/sessions/:id/submit',
    async (request, reply) => {
      const session = statements.getSession.get(request.params.id) as Session | undefined;
      if (!session) {
        reply.status(404).send({ error: 'Session not found.' });
        return;
      }
      const active = buildActiveRoundResponse(request.params.id);
      if (!active) {
        reply.status(404).send({ error: 'No active round.' });
        return;
      }
      const { player_id, expression_raw } = request.body;
      if (!player_id || !expression_raw) {
        reply.status(400).send({ error: 'player_id and expression_raw are required.' });
        return;
      }
      const membership = statements.sessionPlayerExists.get(request.params.id, player_id);
      if (!membership) {
        reply.status(400).send({ error: 'Player not in session.' });
        return;
      }
      const response = handleApprovedSubmission({
        session,
        active,
        playerId: player_id,
        expressionRaw: expression_raw,
        source: 'host'
      });
      reply.send(stripRoundMetadata(response));
    }
  );

  fastify.post<{ Params: { id: string }; Body: { reason?: string; selected_player_id?: string } }>(
    '/api/sessions/:id/skip',
    async (request, reply) => {
      const session = statements.getSession.get(request.params.id) as Session | undefined;
      if (!session) {
        reply.status(404).send({ error: 'Session not found.' });
        return;
      }
      const rules = parseRules(session.rules_json);
      const active = buildActiveRoundResponse(request.params.id);
      if (!active) {
        reply.send({ ok: false, error_code: 'NO_ACTIVE_ROUND' });
        return;
      }

      const { reason, selected_player_id } = request.body ?? {};
      const outcome = performSkip({
        sessionId: session.id,
        rules,
        activeRoundId: active.round.id,
        selectedPlayerId: selected_player_id,
        reason: reason?.trim() || null,
        statements: {
          countSkipped: statements.countManualSkips,
          sessionPlayerExists: statements.sessionPlayerExists,
          leaderboard: statements.leaderboard,
          getSessionPlayerScore: statements.getSessionPlayerScore,
          updateSessionPlayerScore: statements.updateSessionPlayerScore,
          markRoundSkipped: statements.markRoundSkipped
        },
        nowIso,
        createNextRound: () => createRoundForSession(session.id, rules, { prankMode: prankSessions.get(session.id) === true })
      });

      if (!outcome.ok) {
        reply.send({ ok: false, error_code: outcome.error_code, skipsRemaining: outcome.skipsRemaining });
        return;
      }

      const next = buildActiveRoundResponse(session.id);
      const nextInfo = getSkipInfo(session.id, rules);
      if (!next) {
        reply.status(500).send({ error: 'Unable to create a new round.' });
        return;
      }

      reply.send(stripRoundMetadata({
        ok: true,
        skipped: {
          round_id: active.round.id,
          skipped_at: outcome.skippedAt ?? nowIso(),
          reason: reason?.trim() || null
        },
        round: next.round,
        card: next.card,
        leaderboard: next.leaderboard,
        timer: next.timer,
        hints: next.hints,
        activeRules: next.activeRules,
        skipEnabled: nextInfo.skipEnabled,
        skipsRemaining: outcome.skipsRemaining ?? nextInfo.skipsRemaining,
        skipPenaltySummary: nextInfo.skipPenaltySummary
      }));
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id/leaderboard', async (request) => {
    return statements.leaderboard.all(request.params.id);
  });

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id/pending-attempts', async (request) => {
    return statements.listPendingAttempts.all(request.params.id);
  });

  fastify.post<{ Params: { id: string; attemptId: string } }>(
    '/api/sessions/:id/pending-attempts/:attemptId/approve',
    async (request, reply) => {
      const session = statements.getSession.get(request.params.id) as Session | undefined;
      if (!session) {
        reply.status(404).send({ error: 'Session not found.' });
        return;
      }
      const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(request.params.attemptId) as
        | {
            id: string;
            round_id: string;
            player_id: string;
            is_correct: number;
            error_code: string;
            approval_status: string;
            expression_raw: string;
          }
        | undefined;
      if (!attempt || attempt.approval_status !== 'pending') {
        reply.status(404).send({ error: 'Pending attempt not found.' });
        return;
      }
      const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(attempt.round_id) as Round | undefined;
      if (!round || round.status !== 'active') {
        statements.updateAttemptApproval.run('rejected', attempt.id);
        reply.status(409).send({ error: 'Round is no longer active.' });
        return;
      }
      const active = buildActiveRoundResponse(session.id);
      if (!active) {
        reply.status(404).send({ error: 'No active round.' });
        return;
      }

      if (active.timeout?.expired) {
        statements.updateAttemptApproval.run('rejected', attempt.id);
        reply.send(stripRoundMetadata({
          result: {
            correct: false,
            error_code: 'ROUND_TIMER_EXPIRED',
            remainingSeconds: active.timeout.remainingSeconds ?? undefined
          },
          round: active.round,
          card: active.card,
          leaderboard: statements.leaderboard.all(session.id),
          skipEnabled: active.skipEnabled,
          skipsRemaining: active.skipsRemaining,
          skipPenaltySummary: active.skipPenaltySummary,
          timeout: active.timeout,
          timer: active.timer,
          hints: active.hints,
          activeRules: active.activeRules
        }));
        return;
      }

      statements.updateAttemptApproval.run('approved', attempt.id);
      statements.incrementCardAttempts.run(active.card.id);

      const rules = parseRules(session.rules_json);
      const metadata = parseRoundMetadata(active.round);
      const restrictedOps = metadata.restrictedOps ?? [];
      const allowedOps = buildAllowedOps(rules, restrictedOps);

      if (attempt.is_correct !== 1) {
        statements.incrementWrong.run(session.id, attempt.player_id);
        applyMistakePenalty(session.id, attempt.player_id, rules);
        reply.send(stripRoundMetadata({
          result: { correct: false, error_code: attempt.error_code },
          round: active.round,
          card: active.card,
          leaderboard: statements.leaderboard.all(session.id),
          skipEnabled: active.skipEnabled,
          skipsRemaining: active.skipsRemaining,
          skipPenaltySummary: active.skipPenaltySummary,
          timeout: active.timeout,
          timer: active.timer,
          hints: active.hints,
          activeRules: active.activeRules
        }));
        return;
      }

      const scoring = rules.scoring ?? defaultScoring;
      const basePoints = scoring[String(active.card.dot_tier) as '1' | '2' | '3' | '4'] ?? 0;
      let bonusPoints = 0;
      if (rules.uniquenessBonusPoints && rules.uniquenessBonusPoints > 0) {
        const verified = verifyExpression(attempt.expression_raw, [active.card.n1, active.card.n2, active.card.n3, active.card.n4], {
          allowedOps,
          shapeConstraint: rules.shapeConstraint ?? null,
          maxFactorial: 12,
          maxExponent: 6,
          maxAbsValue: 1_000_000_000,
          maxConcatDigits: 4
        });
        if (verified.ok && verified.ast) {
          const signature = astSignature(verified.ast);
          const inserted = statements.insertSolutionSignature.run(session.id, signature, nowIso()).changes;
          if (inserted > 0) {
            bonusPoints = rules.uniquenessBonusPoints;
          }
        }
      }
      const points = basePoints + bonusPoints;
      const solvedAt = nowIso();
      const transaction = db.transaction(() => {
        statements.incrementCorrect.run(points, session.id, attempt.player_id);
        statements.markRoundSolved.run(attempt.player_id, solvedAt, active.round.id);

        const attemptsForRound = (statements.countAttemptsForRound.get(active.round.id) as { count: number }).count;
        const solvesCount = active.card.solves_count ?? 0;
        const previousAvgAttempts = active.card.avg_attempts_to_solve ?? 0;
        const previousAvgTime = active.card.avg_time_to_solve ?? 0;
        const elapsedSeconds = Math.max(
          0,
          Math.floor((new Date(solvedAt).getTime() - new Date(active.round.created_at).getTime()) / 1000)
        );
        const newAvgAttempts = (previousAvgAttempts * solvesCount + attemptsForRound) / (solvesCount + 1);
        const newAvgTime = (previousAvgTime * solvesCount + elapsedSeconds) / (solvesCount + 1);
        statements.updateCardSolveStats.run({
          id: active.card.id,
          avg_attempts_to_solve: newAvgAttempts,
          avg_time_to_solve: newAvgTime
        });
      });
      transaction();

      createRoundForSession(session.id, rules, { prankMode: prankSessions.get(session.id) === true });
      const next = buildActiveRoundResponse(session.id);
      reply.send(stripRoundMetadata({
        result: { correct: true, points, error_code: 'OK', bonus_points: bonusPoints || undefined },
        round: next?.round ?? active.round,
        card: next?.card ?? active.card,
        leaderboard: next?.leaderboard ?? statements.leaderboard.all(session.id),
        skipEnabled: next?.skipEnabled ?? active.skipEnabled,
        skipsRemaining: next?.skipsRemaining ?? active.skipsRemaining,
        skipPenaltySummary: next?.skipPenaltySummary ?? active.skipPenaltySummary,
        timeout: next?.timeout ?? active.timeout,
        timer: next?.timer,
        hints: next?.hints,
        activeRules: next?.activeRules ?? active.activeRules
      }));
    }
  );

  fastify.post<{ Params: { id: string; attemptId: string } }>(
    '/api/sessions/:id/pending-attempts/:attemptId/reject',
    async (request, reply) => {
      const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(request.params.attemptId) as
        | { id: string; approval_status: string }
        | undefined;
      if (!attempt || attempt.approval_status !== 'pending') {
        reply.status(404).send({ error: 'Pending attempt not found.' });
        return;
      }
      statements.updateAttemptApproval.run('rejected', attempt.id);
      reply.send({ ok: true });
    }
  );

  fastify.post<{ Body: { join_code: string; display_name?: string } }>('/api/play/join', async (request, reply) => {
    const { join_code, display_name } = request.body;
    const session = statements.getSessionByJoinCode.get(join_code) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Join code not found.' });
      return;
    }
    const rules = parseRules(session.rules_json);
    if (!rules.lan_enabled) {
      reply.status(403).send({ error: 'LAN mode is disabled for this session.' });
      return;
    }
    let player: Player | null = null;
    if (display_name) {
      player = resolvePlayerForName(display_name);
      statements.insertSessionPlayer.run({ session_id: session.id, player_id: player.id, created_at: nowIso() });
    }
    reply.send({
      session_id: session.id,
      session_title: session.title,
      join_code: session.join_code,
      lan_auto_accept: rules.lan_auto_accept,
      player
    });
  });

  fastify.post<{ Body: { join_code: string } }>('/api/play/active', async (request, reply) => {
    const session = statements.getSessionByJoinCode.get(request.body.join_code) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Join code not found.' });
      return;
    }
    const rules = parseRules(session.rules_json);
    if (!rules.lan_enabled) {
      reply.status(403).send({ error: 'LAN mode is disabled for this session.' });
      return;
    }
    const active = buildActiveRoundResponse(session.id);
    if (!active) {
      reply.status(404).send({ error: 'No active round.' });
      return;
    }
    reply.send(stripRoundMetadata({
      round: active.round,
      card: active.card,
      timer: active.timer,
      hints: active.hints,
      activeRules: active.activeRules
    }));
  });

  fastify.post<{ Body: { join_code: string; display_name: string; expression_raw: string } }>(
    '/api/play/submit',
    async (request, reply) => {
      const { join_code, display_name, expression_raw } = request.body;
      const session = statements.getSessionByJoinCode.get(join_code) as Session | undefined;
      if (!session) {
        reply.status(404).send({ error: 'Join code not found.' });
        return;
      }
      const rules = parseRules(session.rules_json);
      if (!rules.lan_enabled) {
        reply.status(403).send({ error: 'LAN mode is disabled for this session.' });
        return;
      }
      const active = buildActiveRoundResponse(session.id);
      if (!active) {
        reply.status(404).send({ error: 'No active round.' });
        return;
      }
      const player = resolvePlayerForName(display_name);
      statements.insertSessionPlayer.run({ session_id: session.id, player_id: player.id, created_at: nowIso() });

      if (rules.lan_auto_accept) {
        const response = handleApprovedSubmission({
          session,
          active,
          playerId: player.id,
          expressionRaw: expression_raw,
          source: 'lan'
        });
        reply.send(stripTimeoutSolution(stripRoundMetadata(response)));
        return;
      }

      if (active.timeout?.expired) {
        reply.send({
          error_code: 'ROUND_TIMER_EXPIRED',
          remainingSeconds: active.timeout.remainingSeconds ?? undefined
        });
        return;
      }

      const metadata = parseRoundMetadata(active.round);
      const restrictedOps = metadata.restrictedOps ?? [];
      const allowedOps = buildAllowedOps(rules, restrictedOps);

      const lockoutRow = statements.getPlayerLockout.get(session.id, player.id) as { locked_until: string } | undefined;
      if (lockoutRow) {
        const lockedUntil = new Date(lockoutRow.locked_until).getTime();
        const remainingSeconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
        if (remainingSeconds > 0) {
          reply.send({ error_code: 'PLAYER_LOCKED_OUT', remainingSeconds });
          return;
        }
        statements.clearPlayerLockout.run(session.id, player.id);
      }

      const coldStartRemaining = rules.coldStartSeconds
        ? computeColdStartRemaining(active.round.created_at, rules.coldStartSeconds)
        : 0;
      if (coldStartRemaining > 0) {
        reply.send({ error_code: 'ROUND_COLD_START', remainingSeconds: coldStartRemaining });
        return;
      }

      const cardNumbers = [active.card.n1, active.card.n2, active.card.n3, active.card.n4];
      const verified = verifyExpression(expression_raw, cardNumbers, {
        allowedOps,
        shapeConstraint: rules.shapeConstraint ?? null,
        maxFactorial: 12,
        maxExponent: 6,
        maxAbsValue: 1_000_000_000,
        maxConcatDigits: 4
      });
      const attemptId = randomUUID();
      statements.insertAttempt.run({
        id: attemptId,
        round_id: active.round.id,
        player_id: player.id,
        expression_raw,
        normalized_expression: verified.normalizedExpression ?? null,
        evaluated_num: verified.evaluated ? verified.evaluated.num : null,
        evaluated_den: verified.evaluated ? verified.evaluated.den : null,
        is_correct: verified.ok ? 1 : 0,
        error_code: verified.errorCode,
        source: 'lan',
        approval_status: 'pending',
        created_at: nowIso()
      });
      reply.send({
        status: 'pending',
        attempt_id: attemptId,
        correct: verified.ok,
        error_code: verified.errorCode
      });
    }
  );

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/end', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    statements.updateSessionStatus.run('finished', request.params.id);
    prankSessions.delete(session.id);
    statements.setPrankState.run(session.id, 0, nowIso());
    maybeCalibrateDifficulty();
    reply.send({ ok: true });
  });

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id/summary', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    const leaderboard = statements.leaderboard.all(request.params.id);
    const totalRounds = (statements.countRounds.get(request.params.id) as { count: number }).count;
    const hardestTierSolvedCount = (statements.countHardest.get(request.params.id) as { count: number }).count;
    const skippedRounds = (statements.countSkipped.get(request.params.id) as { count: number }).count;
    reply.send({ leaderboard, totalRounds, hardestTierSolvedCount, skippedRounds });
  });

  fastify.get<{ Params: { id: string }; Querystring: { reality?: string } }>(
    '/api/sessions/:id/rounds',
    async (request, reply) => {
      const session = statements.getSession.get(request.params.id) as Session | undefined;
      if (!session) {
        reply.status(404).send({ error: 'Session not found.' });
        return;
      }
      const includeReality = request.query.reality === '1' || request.query.reality === 'true';
      if (includeReality && session.status !== 'finished') {
        reply.status(409).send({ error: 'Reality Check is only available after the session ends.' });
        return;
      }
      const rows = statements.listSessionRounds.all(request.params.id) as Array<{
        id: string;
        status: string;
        solved_by_player_id: string | null;
        solved_at: string | null;
        created_at: string;
        metadata_json: string | null;
        n1: number;
        n2: number;
        n3: number;
        n4: number;
        dot_tier: number;
        solved_by_name: string | null;
      }>;
      const rounds = rows.map((row) => {
        const base = {
          id: row.id,
          status: row.status,
          solved_by_player_id: row.solved_by_player_id,
          solved_by_name: row.solved_by_name,
          solved_at: row.solved_at,
          created_at: row.created_at,
          n1: row.n1,
          n2: row.n2,
          n3: row.n3,
          n4: row.n4,
          dot_tier: row.dot_tier
        };
        if (!includeReality) {
          return base;
        }
        const metadata = parseRoundMetadataJson(row.metadata_json);
        return {
          ...base,
          isImpossible: Boolean(metadata.isImpossible)
        };
      });
      reply.send(rounds);
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/sessions/:id/analytics', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    const leaderboard = statements.leaderboard.all(request.params.id) as LeaderboardRow[];
    const attempts = statements.attemptsBySession.all(request.params.id) as Array<{
      player_id: string;
      is_correct: number;
      error_code: string;
      created_at: string;
    }>;
    const avgTierRows = statements.avgTierByPlayer.all(request.params.id) as Array<{ player_id: string; avg_tier: number }>;
    const avgTierMap = new Map(avgTierRows.map((row) => [row.player_id, row.avg_tier]));

    const accuracy = leaderboard.map((row) => {
      const total = row.correct_count + row.wrong_count;
      return {
        player_id: row.player_id,
        accuracy: total === 0 ? 0 : row.correct_count / total,
        avg_tier: avgTierMap.get(row.player_id) ?? null
      };
    });

    const errorBreakdown: Record<string, Record<string, number>> = {};
    const streaks: Record<string, { current: number; max: number }> = {};
    for (const attempt of attempts) {
      if (!streaks[attempt.player_id]) {
        streaks[attempt.player_id] = { current: 0, max: 0 };
      }
      if (!errorBreakdown[attempt.player_id]) {
        errorBreakdown[attempt.player_id] = {};
      }
      if (attempt.is_correct === 1) {
        streaks[attempt.player_id].current += 1;
        streaks[attempt.player_id].max = Math.max(
          streaks[attempt.player_id].max,
          streaks[attempt.player_id].current
        );
      } else {
        streaks[attempt.player_id].current = 0;
        errorBreakdown[attempt.player_id][attempt.error_code] =
          (errorBreakdown[attempt.player_id][attempt.error_code] ?? 0) + 1;
      }
    }

    const solvesByTier = statements.solvesByTier.all(request.params.id) as Array<{ tier: number; count: number }>;

    reply.send({
      leaderboard,
      accuracy,
      streaks,
      errorBreakdown,
      solvesByTier
    });
  });

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/export', async (request, reply) => {
    const session = statements.getSession.get(request.params.id) as Session | undefined;
    if (!session) {
      reply.status(404).send({ error: 'Session not found.' });
      return;
    }
    const leaderboard = statements.leaderboard.all(request.params.id) as Array<{
      display_name: string;
      score_total: number;
      correct_count: number;
      wrong_count: number;
    }>;
    const lines = ['rank,player,score,correct,wrong'];
    leaderboard.forEach((row, index) => {
      lines.push(
        `${index + 1},${safeCsv(row.display_name)},${row.score_total},${row.correct_count},${row.wrong_count}`
      );
    });
    const csv = `${lines.join('\n')}\n`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${request.params.id}-${timestamp}.csv`;
    const exportPath = path.join(dataDir, 'exports', filename);
    fs.writeFileSync(exportPath, csv, 'utf-8');
    reply.send({ filename, path: exportPath });
  });

  const clientDist = path.join(projectRoot, 'client', 'dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    await fastify.register(fastifyStatic, {
      root: clientDist
    });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api')) {
        reply.status(404).send({ error: 'Not found.' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  const requestedPort = process.env.ARENA_PORT ? Number(process.env.ARENA_PORT) : 0;
  await fastify.listen({ port: requestedPort, host: '127.0.0.1' });
  const address = fastify.server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const url = `http://localhost:${port}`;
  console.log(`24 Arena running at ${url}`);

  const portFile = process.env.ARENA_PORT_FILE || path.join(projectRoot, '.arena-port');
  try {
    fs.writeFileSync(portFile, JSON.stringify({ port, url }, null, 2));
  } catch {
    // Non-fatal.
  }

  const openUrl = process.env.ARENA_OPEN_URL || url;
  if (process.platform === 'darwin') {
    try {
      const child = spawn('open', [openUrl], { stdio: 'ignore', detached: true });
      child.unref();
    } catch {
      // Ignore inability to open browser.
    }
  }
}

start().catch((error) => {
  console.error('Failed to start 24 Arena:', error);
  process.exit(1);
});
