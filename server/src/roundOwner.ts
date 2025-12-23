export function getOwnerFromMetadata(metadataJson?: string | null): string | null {
  if (!metadataJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(metadataJson) as { ownerPlayerId?: string | null };
    return parsed.ownerPlayerId ?? null;
  } catch {
    return null;
  }
}

export function selectRoundForOwner<T extends { metadata_json?: string | null }>(
  rounds: T[],
  ownerPlayerId: string | null
): T | null {
  for (const round of rounds) {
    const owner = getOwnerFromMetadata(round.metadata_json);
    if (owner === ownerPlayerId) {
      return round;
    }
  }
  return null;
}
