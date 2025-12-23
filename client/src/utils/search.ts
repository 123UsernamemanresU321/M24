import { normalizeName } from '@arena/shared';

export type QueryScore = {
  match: boolean;
  rank: number;
  index: number;
};

export function scoreByQuery(query: string, value: string): QueryScore {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) {
    return { match: true, rank: 0, index: 0 };
  }
  const normalizedValue = normalizeName(value);
  const index = normalizedValue.indexOf(normalizedQuery);
  if (index === -1) {
    return { match: false, rank: 99, index: 999 };
  }
  return { match: true, rank: index === 0 ? 0 : 1, index };
}
