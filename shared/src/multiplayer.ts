export function computeClaimPenalty(args: {
  rank: number;
  totalPlayers: number;
  base: number;
  max: number;
}): number {
  const baseValue = Math.max(0, Math.floor(args.base));
  const maxValue = Math.max(baseValue, Math.floor(args.max));
  if (args.totalPlayers <= 1) {
    return baseValue;
  }
  const normalized = (args.totalPlayers - args.rank) / Math.max(1, args.totalPlayers - 1);
  return Math.round(baseValue + normalized * (maxValue - baseValue));
}
