import { describe, expect, it } from 'vitest';
import { selectRoundForOwner } from '../src/roundOwner.js';

describe('selectRoundForOwner', () => {
  it('returns the shared round when owner is null', () => {
    const rounds = [
      { id: 'shared', metadata_json: JSON.stringify({ ownerPlayerId: null }) },
      { id: 'p1', metadata_json: JSON.stringify({ ownerPlayerId: 'player-1' }) }
    ];
    const found = selectRoundForOwner(rounds, null);
    expect(found?.id).toBe('shared');
  });

  it('returns the per-player round when owner matches', () => {
    const rounds = [
      { id: 'shared', metadata_json: JSON.stringify({ ownerPlayerId: null }) },
      { id: 'p1', metadata_json: JSON.stringify({ ownerPlayerId: 'player-1' }) },
      { id: 'p2', metadata_json: JSON.stringify({ ownerPlayerId: 'player-2' }) }
    ];
    const found = selectRoundForOwner(rounds, 'player-2');
    expect(found?.id).toBe('p2');
  });
});
