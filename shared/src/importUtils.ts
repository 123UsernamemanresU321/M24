import type { PlayerInput } from './players.js';
import { normalizeName } from './players.js';

export type ImportMode = 'skip' | 'update' | 'import_anyway';

export type ExistingPlayer = {
  id: string;
  display_name: string;
};

export type PlannedImport = {
  inserts: PlayerInput[];
  updates: Array<{ id: string; data: PlayerInput }>;
  skipped: number;
  duplicates: number;
};

export function planPlayerImport(
  existingPlayers: ExistingPlayer[],
  incoming: PlayerInput[],
  mode: ImportMode
): PlannedImport {
  const existingByName = new Map<string, ExistingPlayer>();
  for (const player of existingPlayers) {
    existingByName.set(normalizeName(player.display_name), player);
  }

  const inserts: PlayerInput[] = [];
  const updates: Array<{ id: string; data: PlayerInput }> = [];
  let skipped = 0;
  let duplicates = 0;

  for (const player of incoming) {
    const normalized = normalizeName(player.display_name);
    const existing = existingByName.get(normalized);
    if (existing) {
      duplicates += 1;
      if (mode === 'skip') {
        skipped += 1;
        continue;
      }
      if (mode === 'update') {
        updates.push({ id: existing.id, data: player });
        continue;
      }
    }
    inserts.push(player);
  }

  return { inserts, updates, skipped, duplicates };
}
