import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { PowerCardType, PowerCard, SessionRules, LeaderboardRow } from '@arena/shared';
import { nowIso } from './db.js';

// Default power card configuration
export const defaultPowerCardsConfig = {
    enabled: false,
    dropRateByTier: { '1': 5, '2': 10, '3': 15, '4': 25 } as Record<'1' | '2' | '3' | '4', number>,
    maxHeld: 1,
    awardRule: 'onSolve' as const,
    allowed: {
        shield: true,
        double: true,
        swap: true,
        reroll: true,
        freeze: true,
        steal: true,
        lockOp: true
    },
    stealPoints: 1,
    freezeRounds: 1 as 1 | 2,
    lockOpDurationRounds: 1,
    rerollAuthority: 'hostOnly' as const
};

export type PowerCardsConfig = Required<NonNullable<SessionRules['powerCards']>>;

export function normalizePowerCardsConfig(input?: SessionRules['powerCards']): PowerCardsConfig {
    if (!input || !input.enabled) {
        return { ...defaultPowerCardsConfig, enabled: false };
    }
    return {
        enabled: true,
        dropRateByTier: {
            '1': input.dropRateByTier?.['1'] ?? defaultPowerCardsConfig.dropRateByTier['1'],
            '2': input.dropRateByTier?.['2'] ?? defaultPowerCardsConfig.dropRateByTier['2'],
            '3': input.dropRateByTier?.['3'] ?? defaultPowerCardsConfig.dropRateByTier['3'],
            '4': input.dropRateByTier?.['4'] ?? defaultPowerCardsConfig.dropRateByTier['4']
        },
        maxHeld: Math.min(3, Math.max(1, input.maxHeld ?? defaultPowerCardsConfig.maxHeld)),
        awardRule: input.awardRule ?? defaultPowerCardsConfig.awardRule,
        allowed: {
            shield: input.allowed?.shield ?? defaultPowerCardsConfig.allowed.shield,
            double: input.allowed?.double ?? defaultPowerCardsConfig.allowed.double,
            swap: input.allowed?.swap ?? defaultPowerCardsConfig.allowed.swap,
            reroll: input.allowed?.reroll ?? defaultPowerCardsConfig.allowed.reroll,
            freeze: input.allowed?.freeze ?? defaultPowerCardsConfig.allowed.freeze,
            steal: input.allowed?.steal ?? defaultPowerCardsConfig.allowed.steal,
            lockOp: input.allowed?.lockOp ?? defaultPowerCardsConfig.allowed.lockOp
        },
        stealPoints: Math.max(1, input.stealPoints ?? defaultPowerCardsConfig.stealPoints),
        freezeRounds: input.freezeRounds === 2 ? 2 : 1,
        lockOpDurationRounds: Math.max(1, input.lockOpDurationRounds ?? defaultPowerCardsConfig.lockOpDurationRounds),
        rerollAuthority: input.rerollAuthority ?? defaultPowerCardsConfig.rerollAuthority
    };
}

export type PowerCardsStatements = {
    getPlayerPowers: Database.Statement;
    getPlayerPowerById: Database.Statement;
    insertPower: Database.Statement;
    consumePower: Database.Statement;
    countPlayerHeldPowers: Database.Statement;
    getSessionPowers: Database.Statement;
    updatePowerState: Database.Statement;
    getPendingDeltas: Database.Statement;
    insertPendingDelta: Database.Statement;
    applyPendingDelta: Database.Statement;
};

export function preparePowerCardsStatements(db: Database.Database): PowerCardsStatements {
    return {
        getPlayerPowers: db.prepare(
            `SELECT * FROM player_powers WHERE session_id = ? AND player_id = ? AND consumed_at IS NULL ORDER BY acquired_at DESC`
        ),
        getPlayerPowerById: db.prepare(`SELECT * FROM player_powers WHERE id = ?`),
        insertPower: db.prepare(
            `INSERT INTO player_powers (id, session_id, player_id, power_type, acquired_at, consumed_at, state_json)
       VALUES (@id, @session_id, @player_id, @power_type, @acquired_at, @consumed_at, @state_json)`
        ),
        consumePower: db.prepare(`UPDATE player_powers SET consumed_at = ? WHERE id = ?`),
        countPlayerHeldPowers: db.prepare(
            `SELECT COUNT(*) as count FROM player_powers WHERE session_id = ? AND player_id = ? AND consumed_at IS NULL`
        ),
        getSessionPowers: db.prepare(
            `SELECT * FROM player_powers WHERE session_id = ? AND consumed_at IS NULL ORDER BY acquired_at DESC`
        ),
        updatePowerState: db.prepare(`UPDATE player_powers SET state_json = ? WHERE id = ?`),
        getPendingDeltas: db.prepare(
            `SELECT * FROM pending_score_deltas WHERE session_id = ? AND applied_at IS NULL ORDER BY created_at ASC`
        ),
        insertPendingDelta: db.prepare(
            `INSERT INTO pending_score_deltas (id, session_id, player_id, delta, reason, frozen_until_round, created_at, applied_at)
       VALUES (@id, @session_id, @player_id, @delta, @reason, @frozen_until_round, @created_at, @applied_at)`
        ),
        applyPendingDelta: db.prepare(`UPDATE pending_score_deltas SET applied_at = ? WHERE id = ?`)
    };
}

const ALL_POWER_TYPES: PowerCardType[] = ['shield', 'double', 'swap', 'reroll', 'freeze', 'steal', 'lockOp'];

export function getEnabledPowerTypes(config: PowerCardsConfig): PowerCardType[] {
    return ALL_POWER_TYPES.filter((type) => config.allowed[type]);
}

export function pickRandomPowerType(config: PowerCardsConfig, rng: () => number): PowerCardType | null {
    const enabled = getEnabledPowerTypes(config);
    if (enabled.length === 0) return null;
    return enabled[Math.floor(rng() * enabled.length)];
}

export function shouldAwardPower(
    tier: 1 | 2 | 3 | 4,
    config: PowerCardsConfig,
    rng: () => number
): boolean {
    if (!config.enabled) return false;
    const rate = config.dropRateByTier[String(tier) as '1' | '2' | '3' | '4'];
    return rng() * 100 < rate;
}

export type AwardPowerResult =
    | { awarded: true; power: PowerCard }
    | { awarded: false; reason: 'disabled' | 'maxHeld' | 'noPowerTypes' | 'rngFailed' };

export function awardPower(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string,
    tier: 1 | 2 | 3 | 4,
    config: PowerCardsConfig,
    rng: () => number
): AwardPowerResult {
    if (!config.enabled) {
        return { awarded: false, reason: 'disabled' };
    }

    // Check maxHeld
    const heldCount = (statements.countPlayerHeldPowers.get(sessionId, playerId) as { count: number }).count;
    if (heldCount >= config.maxHeld) {
        return { awarded: false, reason: 'maxHeld' };
    }

    // Check RNG
    if (!shouldAwardPower(tier, config, rng)) {
        return { awarded: false, reason: 'rngFailed' };
    }

    // Pick random power type
    const powerType = pickRandomPowerType(config, rng);
    if (!powerType) {
        return { awarded: false, reason: 'noPowerTypes' };
    }

    const power: PowerCard = {
        id: randomUUID(),
        session_id: sessionId,
        player_id: playerId,
        power_type: powerType,
        acquired_at: nowIso(),
        consumed_at: null,
        state_json: null
    };

    statements.insertPower.run(power);
    return { awarded: true, power };
}

export function getPlayerInventory(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string
): PowerCard[] {
    return statements.getPlayerPowers.all(sessionId, playerId) as PowerCard[];
}

export function getSessionInventories(
    statements: PowerCardsStatements,
    sessionId: string
): Map<string, PowerCard[]> {
    const all = statements.getSessionPowers.all(sessionId) as PowerCard[];
    const byPlayer = new Map<string, PowerCard[]>();
    for (const power of all) {
        const existing = byPlayer.get(power.player_id) ?? [];
        existing.push(power);
        byPlayer.set(power.player_id, existing);
    }
    return byPlayer;
}

export function consumePower(
    statements: PowerCardsStatements,
    powerId: string
): boolean {
    const result = statements.consumePower.run(nowIso(), powerId);
    return result.changes > 0;
}

export type ActivatePowerResult =
    | { ok: true; effect: string; powerId: string }
    | { ok: false; error: string };

export type PowerActivationContext = {
    statements: PowerCardsStatements;
    sessionId: string;
    playerId: string;
    powerId: string;
    config: PowerCardsConfig;
    leaderboard: LeaderboardRow[];
    currentRoundNumber: number;
    payload?: {
        targetPlayerId?: string;
        targetOp?: 'add' | 'sub' | 'mul' | 'div';
        swapIndices?: [number, number];
    };
    // Callbacks for external effects
    onScoreChange?: (playerId: string, delta: number, reason: string) => void;
    onLockedOpSet?: (op: 'add' | 'sub' | 'mul' | 'div', roundId: string) => void;
    onRerollRound?: () => void;
    onFreezeSet?: (untilRound: number) => void;
};

export function activatePower(ctx: ActivatePowerContext): ActivatePowerResult {
    const power = ctx.statements.getPlayerPowerById.get(ctx.powerId) as PowerCard | undefined;

    if (!power) {
        return { ok: false, error: 'Power not found' };
    }

    if (power.player_id !== ctx.playerId) {
        return { ok: false, error: 'Power belongs to another player' };
    }

    if (power.consumed_at) {
        return { ok: false, error: 'Power already used' };
    }

    // Handle each power type
    switch (power.power_type) {
        case 'shield': {
            // Shield doesn't consume immediately - it's consumed when negating a penalty
            // Set state to mark it as activated
            ctx.statements.updatePowerState.run(JSON.stringify({ activated: true }), power.id);
            return { ok: true, effect: 'Shield activated - will negate next penalty', powerId: power.id };
        }

        case 'double': {
            // Double doesn't consume immediately - consumed on next correct solve
            ctx.statements.updatePowerState.run(JSON.stringify({ activated: true }), power.id);
            return { ok: true, effect: 'Double Points activated - next correct solve awards 2x', powerId: power.id };
        }

        case 'swap': {
            // Swap requires indices payload, doesn't consume until solve attempt
            const indices = ctx.payload?.swapIndices;
            if (!indices || indices.length !== 2) {
                return { ok: false, error: 'Swap requires two indices (0-3)' };
            }
            if (indices[0] < 0 || indices[0] > 3 || indices[1] < 0 || indices[1] > 3) {
                return { ok: false, error: 'Swap indices must be 0-3' };
            }
            ctx.statements.updatePowerState.run(JSON.stringify({ activated: true, swapIndices: indices }), power.id);
            return { ok: true, effect: `Swap activated - positions ${indices[0] + 1} and ${indices[1] + 1}`, powerId: power.id };
        }

        case 'reroll': {
            // Reroll consumes immediately and triggers new card
            consumePower(ctx.statements, power.id);
            ctx.onRerollRound?.();
            return { ok: true, effect: 'Reroll activated - new card generated', powerId: power.id };
        }

        case 'freeze': {
            // Freeze consumes immediately and sets frozen state
            const untilRound = ctx.currentRoundNumber + ctx.config.freezeRounds;
            consumePower(ctx.statements, power.id);
            ctx.onFreezeSet?.(untilRound);
            return { ok: true, effect: `Leaderboard frozen for ${ctx.config.freezeRounds} round(s)`, powerId: power.id };
        }

        case 'steal': {
            // Steal doesn't consume immediately - triggers on next correct solve
            const targetId = ctx.payload?.targetPlayerId;
            if (!targetId) {
                return { ok: false, error: 'Steal requires target player' };
            }
            // Verify target exists in session
            const targetExists = ctx.leaderboard.some(row => row.player_id === targetId);
            if (!targetExists) {
                return { ok: false, error: 'Target player not in session' };
            }
            if (targetId === ctx.playerId) {
                return { ok: false, error: 'Cannot steal from yourself' };
            }
            ctx.statements.updatePowerState.run(JSON.stringify({ activated: true, targetPlayerId: targetId }), power.id);
            return { ok: true, effect: `Steal activated - will take ${ctx.config.stealPoints} points on next solve`, powerId: power.id };
        }

        case 'lockOp': {
            // Lock Op consumes immediately and bans an operation
            const op = ctx.payload?.targetOp;
            if (!op || !['add', 'sub', 'mul', 'div'].includes(op)) {
                return { ok: false, error: 'Lock Op requires valid operation: add, sub, mul, div' };
            }
            consumePower(ctx.statements, power.id);
            ctx.onLockedOpSet?.(op, '');
            return { ok: true, effect: `${op} operation locked for this round`, powerId: power.id };
        }

        default:
            return { ok: false, error: 'Unknown power type' };
    }
}

// Check if player has an active shield, and if so consume it
export function tryConsumeShield(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string
): boolean {
    const powers = getPlayerInventory(statements, sessionId, playerId);
    const shield = powers.find(p => {
        if (p.power_type !== 'shield') return false;
        if (!p.state_json) return false;
        try {
            const state = JSON.parse(p.state_json);
            return state.activated === true;
        } catch {
            return false;
        }
    });

    if (shield) {
        consumePower(statements, shield.id);
        return true;
    }
    return false;
}

// Check if player has active double points, and if so consume and return multiplier
export function tryConsumeDouble(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string
): number {
    const powers = getPlayerInventory(statements, sessionId, playerId);
    const doublePower = powers.find(p => {
        if (p.power_type !== 'double') return false;
        if (!p.state_json) return false;
        try {
            const state = JSON.parse(p.state_json);
            return state.activated === true;
        } catch {
            return false;
        }
    });

    if (doublePower) {
        consumePower(statements, doublePower.id);
        return 2;
    }
    return 1;
}

// Check if player has active steal, execute it, and consume
export function tryExecuteSteal(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string,
    config: PowerCardsConfig,
    leaderboard: LeaderboardRow[],
    allowNegative: boolean,
    getScore: (playerId: string) => number,
    setScore: (playerId: string, score: number) => void
): { stolen: boolean; fromPlayerId?: string; amount?: number } {
    const powers = getPlayerInventory(statements, sessionId, playerId);
    const stealPower = powers.find(p => {
        if (p.power_type !== 'steal') return false;
        if (!p.state_json) return false;
        try {
            const state = JSON.parse(p.state_json);
            return state.activated === true && state.targetPlayerId;
        } catch {
            return false;
        }
    });

    if (!stealPower || !stealPower.state_json) {
        return { stolen: false };
    }

    const state = JSON.parse(stealPower.state_json);
    const targetId = state.targetPlayerId as string;

    // Verify target still in session
    const target = leaderboard.find(row => row.player_id === targetId);
    if (!target) {
        consumePower(statements, stealPower.id);
        return { stolen: false };
    }

    const stealAmount = Math.min(config.stealPoints, target.score_total);
    const actualSteal = allowNegative ? config.stealPoints : Math.max(0, stealAmount);

    if (actualSteal > 0) {
        const targetScore = getScore(targetId);
        const newTargetScore = allowNegative ? targetScore - actualSteal : Math.max(0, targetScore - actualSteal);
        setScore(targetId, newTargetScore);

        const playerScore = getScore(playerId);
        setScore(playerId, playerScore + actualSteal);
    }

    consumePower(statements, stealPower.id);
    return { stolen: true, fromPlayerId: targetId, amount: actualSteal };
}

// Get active swap indices for player if any
export function getActiveSwapIndices(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string
): [number, number] | null {
    const powers = getPlayerInventory(statements, sessionId, playerId);
    const swapPower = powers.find(p => {
        if (p.power_type !== 'swap') return false;
        if (!p.state_json) return false;
        try {
            const state = JSON.parse(p.state_json);
            return state.activated === true && state.swapIndices;
        } catch {
            return false;
        }
    });

    if (!swapPower || !swapPower.state_json) {
        return null;
    }

    const state = JSON.parse(swapPower.state_json);
    return state.swapIndices as [number, number];
}

// Consume swap power after solve attempt
export function consumeSwapPower(
    statements: PowerCardsStatements,
    sessionId: string,
    playerId: string
): void {
    const powers = getPlayerInventory(statements, sessionId, playerId);
    const swapPower = powers.find(p => {
        if (p.power_type !== 'swap') return false;
        if (!p.state_json) return false;
        try {
            const state = JSON.parse(p.state_json);
            return state.activated === true;
        } catch {
            return false;
        }
    });

    if (swapPower) {
        consumePower(statements, swapPower.id);
    }
}

export type ActivatePowerContext = PowerActivationContext;
