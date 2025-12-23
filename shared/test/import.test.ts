import { describe, expect, test } from 'vitest';
import { planPlayerImport } from '../src/importUtils.js';

const existing = [
  { id: '1', display_name: 'Ada Lovelace' },
  { id: '2', display_name: 'Grace Hopper' }
];

const incoming = [
  { display_name: 'Ada   Lovelace', age: 12 },
  { display_name: 'Katherine Johnson', age: 13 }
];

describe('planPlayerImport', () => {
  test('skips duplicates', () => {
    const result = planPlayerImport(existing, incoming, 'skip');
    expect(result.inserts).toHaveLength(1);
    expect(result.updates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  test('updates duplicates', () => {
    const result = planPlayerImport(existing, incoming, 'update');
    expect(result.inserts).toHaveLength(1);
    expect(result.updates).toHaveLength(1);
  });
});
