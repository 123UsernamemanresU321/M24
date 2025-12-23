export type Tier = 1 | 2 | 3 | 4;

export const tierColors: Record<Tier, string> = {
  1: '#F6D32D',
  2: '#F29F05',
  3: '#E85D04',
  4: '#D00000'
};

const tierNames: Record<Tier, string> = {
  1: 'Easy',
  2: 'Moderate',
  3: 'Challenging',
  4: 'Hard'
};

export function normalizeTier(value: number, context?: string): Tier {
  const normalized: Tier = value === 1 || value === 2 || value === 3 || value === 4 ? value : 4;
  if (import.meta.env.DEV && context && normalized !== value) {
    console.warn(`${context}: invalid tier ${value}; defaulting to ${normalized}.`);
  }
  return normalized;
}

export function getTierLabel(value: number): string {
  const tier = normalizeTier(value);
  const dotLabel = tier === 1 ? '1 dot' : `${tier} dots`;
  return `Tier ${tier} (${tierNames[tier]}) \u2022 ${dotLabel}`;
}
