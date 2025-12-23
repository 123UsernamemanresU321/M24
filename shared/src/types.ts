export type SessionStatus = 'setup' | 'live' | 'finished';
export type RoundStatus = 'active' | 'solved' | 'skipped';

export type PowerCardType = 'shield' | 'double' | 'swap' | 'reroll' | 'freeze' | 'steal' | 'lockOp';

export type PowerCard = {
  id: string;
  session_id: string;
  player_id: string;
  power_type: PowerCardType;
  acquired_at: string;
  consumed_at: string | null;
  state_json: string | null;
};

export type PlayerPowerEffects = {
  shieldActive?: boolean;
  doubleActive?: boolean;
  swapIndices?: [number, number] | null;
};

export type Player = {
  id: string;
  display_name: string;
  age: number | null;
  ib_grade: string | null;
  notes: string | null;
  created_at: string;
};

export type SessionRules = {
  target?: number;
  scoring?: Record<'1' | '2' | '3' | '4', number>;
  pointsByTier?: Record<'1' | '2' | '3' | '4', number>;
  difficulty_mode?: 'mixed' | 'fixed';
  fixed_tier?: 1 | 2 | 3 | 4;
  ops?: {
    add?: boolean;
    sub?: boolean;
    mul?: boolean;
    div?: boolean;
    pow?: boolean;
    fact?: boolean;
    sqrt?: boolean;
    concat?: boolean;
  };
  timer_mode?: 'off' | 'countdown' | 'stopwatch';
  countdown_seconds?: number;
  hints_enabled?: boolean;
  hint1_after_seconds?: number;
  hint2_after_seconds?: number;
  lan_enabled?: boolean;
  lan_auto_accept?: boolean;
  no_undo_input?: boolean;
  scarcityEnabled?: boolean;
  scarcityMode?: 'banOneOp';
  scarcityBanSet?: {
    add?: boolean;
    sub?: boolean;
    mul?: boolean;
    div?: boolean;
  };
  shapeConstraint?: 'shapeA' | 'shapeB' | null;
  mistakePenalty?: {
    mode: 'none' | 'lockout' | 'minusPoints';
    lockoutSeconds?: number;
    minusPoints?: number;
    allowNegative?: boolean;
  };
  coldStartSeconds?: number;
  blindReveal?: {
    enabled?: boolean;
    intervalSeconds?: number;
    scheduleSeconds?: number[];
  };
  uniquenessBonusPoints?: number;
  skip?: {
    enabled?: boolean;
    limit?: number | null;
    penaltyMode?: 'none' | 'selectedPlayer' | 'leader';
    penaltyPoints?: number;
  };
  multiplayer?: {
    enabled?: boolean;
    cardDistribution?: 'shared' | 'perPlayer';
    claimEnabled?: boolean;
    claimWindowSeconds?: number;
    wrongLockoutSeconds?: number;
    claimPenalty?: {
      mode: 'leaderboardScaled';
      base?: number;
      max?: number;
    };
  };
  powerCards?: {
    enabled?: boolean;
    dropRateByTier?: Record<'1' | '2' | '3' | '4', number>;
    maxHeld?: number;
    awardRule?: 'roundStart' | 'onSolve';
    allowed?: {
      shield?: boolean;
      double?: boolean;
      swap?: boolean;
      reroll?: boolean;
      freeze?: boolean;
      steal?: boolean;
      lockOp?: boolean;
    };
    stealPoints?: number;
    freezeRounds?: 1 | 2;
    lockOpDurationRounds?: number;
    rerollAuthority?: 'hostOnly' | 'playerWithHostApprove';
  };
};

export type Session = {
  id: string;
  title: string;
  status: SessionStatus;
  rules_json: string;
  join_code?: string | null;
  session_token?: string | null;
  created_at: string;
};

export type Card = {
  id: string;
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  target: number;
  difficulty_score: number;
  dot_tier: 1 | 2 | 3 | 4;
  solution_count: number;
  attempts_count?: number;
  solves_count?: number;
  avg_attempts_to_solve?: number | null;
  avg_time_to_solve?: number | null;
  tags_json?: string | null;
  hint_ops_json?: string | null;
  hint_intermediates_json?: string | null;
  created_at: string;
};

export type Round = {
  id: string;
  session_id: string;
  card_id: string;
  status: RoundStatus;
  solved_by_player_id: string | null;
  solved_at: string | null;
  skipped_at?: string | null;
  skipped_by_player_id?: string | null;
  skip_reason?: string | null;
  hint1_revealed_at?: string | null;
  hint2_revealed_at?: string | null;
  metadata_json?: string | null;
  created_at: string;
};

export type Attempt = {
  id: string;
  round_id: string;
  player_id: string;
  expression_raw: string;
  normalized_expression: string | null;
  evaluated_num: number | null;
  evaluated_den: number | null;
  is_correct: 0 | 1;
  error_code: string;
  source?: string;
  approval_status?: string;
  created_at: string;
};

export type LeaderboardRow = {
  player_id: string;
  display_name: string;
  score_total: number;
  correct_count: number;
  wrong_count: number;
};

export type ActiveRoundResponse = {
  session: Session;
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
  claim?: {
    active: boolean;
    player_id: string | null;
    player_name?: string | null;
    started_at?: string | null;
    expires_at?: string | null;
  } | null;
  multiplayer?: {
    enabled: boolean;
    cardDistribution: 'shared' | 'perPlayer';
    claimEnabled: boolean;
    claimWindowSeconds: number;
    wrongLockoutSeconds: number;
    claimPenalty: { mode: 'leaderboardScaled'; base: number; max: number };
  };
  activeRules?: {
    restrictedOps?: { bannedOps: Array<'add' | 'sub' | 'mul' | 'div'> } | null;
    shapeConstraint?: 'shapeA' | 'shapeB' | null;
    coldStartRemaining?: number | null;
    reveal?: {
      enabled: boolean;
      revealedIndices: boolean[];
      displayNumbers: Array<number | null>;
      nextRevealSeconds?: number | null;
    } | null;
  };
  timer?: {
    mode: 'off' | 'countdown' | 'stopwatch';
    elapsedSeconds: number;
    remainingSeconds?: number;
    countdownSeconds?: number;
  };
  hints?: {
    enabled: boolean;
    hint1?: string | null;
    hint2?: string | null;
    hint1_revealed_at?: string | null;
    hint2_revealed_at?: string | null;
  };
  powerCards?: {
    enabled: boolean;
    inventory?: PowerCard[];
    activeEffects?: {
      lockedOps?: Array<'add' | 'sub' | 'mul' | 'div'>;
      frozenUntilRound?: number;
      playerEffects?: Record<string, PlayerPowerEffects>;
    };
  };
};
