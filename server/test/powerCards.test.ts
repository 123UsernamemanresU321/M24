import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { SessionRules } from '@arena/shared';
import { initSchema, nowIso } from '../src/db.js';
import { applyMigrations } from '../src/migrations.js';
import {
    preparePowerCardsStatements,
    awardPower,
    getPlayerInventory,
    activatePower,
    type PowerCardsConfig
} from '../src/powerCards.js';

function seedDb(rules: SessionRules) {
    const db = new Database(':memory:');
    initSchema(db);
    applyMigrations(db);

    const sessionId = 'session-1';
    const playerA = 'player-a';
    const playerB = 'player-b';
    const createdAt = nowIso();

    db.prepare(
        `INSERT INTO sessions (id, title, status, rules_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, 'Test', 'live', JSON.stringify(rules), createdAt);

    db.prepare(
        `INSERT INTO players (id, display_name, created_at) VALUES (?, ?, ?)`
    ).run(playerA, 'Alpha', createdAt);

    db.prepare(
        `INSERT INTO players (id, display_name, created_at) VALUES (?, ?, ?)`
    ).run(playerB, 'Beta', createdAt);

    const powerStmts = preparePowerCardsStatements(db);

    return { db, sessionId, playerA, playerB, powerStmts };
}

describe('Power Cards System', () => {
    const baseConfig: PowerCardsConfig = {
        enabled: true,
        dropRateByTier: { '1': 100, '2': 100, '3': 100, '4': 100 }, // 100% drop
        maxHeld: 3,
        awardRule: 'onSolve',
        allowed: {
            shield: true, double: true, swap: true, reroll: true,
            lockOp: true, freeze: true, steal: true
        },
        stealPoints: 2,
        freezeRounds: 1,
        lockOpDurationRounds: 1,
        rerollAuthority: 'playerWithHostApprove'
    };

    it('awards power cards correctly', () => {
        const { powerStmts, sessionId, playerA } = seedDb({ powerCards: baseConfig });

        // Deterministic RNG for testing
        const mockRng = () => 0.1; // Should pick first available power if configured logic allows

        const result = awardPower(powerStmts, sessionId, playerA, 1, baseConfig, mockRng);
        expect(result.awarded).toBe(true);
        expect(result.power).toBeDefined();

        const inventory = getPlayerInventory(powerStmts, sessionId, playerA);
        expect(inventory).toHaveLength(1);
        expect(inventory[0].id).toBe(result.power!.id);
    });

    it('respects maxHeld limit', () => {
        const { powerStmts, sessionId, playerA } = seedDb({ powerCards: { ...baseConfig, maxHeld: 1 } });
        const mockRng = () => 0.5;

        // Award first
        awardPower(powerStmts, sessionId, playerA, 1, baseConfig, mockRng);
        expect(getPlayerInventory(powerStmts, sessionId, playerA)).toHaveLength(1);

        // Award second - should fail
        const limitedConfig = { ...baseConfig, maxHeld: 1 };
        const result2 = awardPower(powerStmts, sessionId, playerA, 1, limitedConfig, mockRng);
        expect(result2.awarded).toBe(false);
        expect(result2.reason).toBe('maxHeld');
        expect(getPlayerInventory(powerStmts, sessionId, playerA)).toHaveLength(1);
    });

    it('activates shield power', () => {
        const { powerStmts, sessionId, playerA } = seedDb({ powerCards: baseConfig });

        // Manually insert a shield power
        const powerId = 'power-1';
        powerStmts.insertPower.run({
            id: powerId,
            session_id: sessionId,
            player_id: playerA,
            power_type: 'shield',
            acquired_at: nowIso(),
            consumed_at: null,
            state_json: null
        });

        const result = activatePower({
            statements: powerStmts,
            sessionId,
            playerId: playerA,
            powerId,
            config: baseConfig,
            leaderboard: [],
            currentRoundNumber: 1,
            // Callbacks
            onScoreChange: () => { },
            onLockedOpSet: () => { },
            onRerollRound: () => { },
            onFreezeSet: () => { }
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.effect).toContain('Shield activated');

        // Verify state in DB
        const inventory = getPlayerInventory(powerStmts, sessionId, playerA);
        expect(inventory[0].state_json).toContain('"activated":true');
    });

    it('activates lockOp power and triggers callback', () => {
        const { powerStmts, sessionId, playerA } = seedDb({ powerCards: baseConfig });

        const powerId = 'power-2';
        powerStmts.insertPower.run({
            id: powerId,
            session_id: sessionId,
            player_id: playerA,
            power_type: 'lockOp',
            acquired_at: nowIso(),
            consumed_at: null,
            state_json: null
        });

        let callbackOp: string | undefined;
        const result = activatePower({
            statements: powerStmts,
            sessionId,
            playerId: playerA,
            powerId,
            config: baseConfig,
            leaderboard: [],
            currentRoundNumber: 1,
            payload: { targetOp: 'div' },
            onLockedOpSet: (op) => { callbackOp = op; }
        });

        expect(result.ok).toBe(true);
        expect(callbackOp).toBe('div');

        // Power should be consumed immediately for one-shot effects
        const inventory = getPlayerInventory(powerStmts, sessionId, playerA);
        expect(inventory).toHaveLength(0); // Consumed
    });
});
