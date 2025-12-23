import React, { useMemo, useState } from 'react';
import type { Player } from '@arena/shared';
import { scoreByQuery } from '../utils/search';

type PlayerOption = Pick<Player, 'id' | 'display_name'> | { player_id: string; display_name: string };

type PlayerSelectProps = {
  players: PlayerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function asOption(player: PlayerOption): { id: string; name: string } {
  if ('player_id' in player) {
    return { id: player.player_id, name: player.display_name };
  }
  return { id: player.id, name: player.display_name };
}

export default function PlayerSelect({ players, value, onChange, placeholder = 'Search players' }: PlayerSelectProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return players.map(asOption);
    }
    const scored = players
      .map((player) => {
        const option = asOption(player);
        const score = scoreByQuery(query, option.name);
        return score.match ? { option, score } : null;
      })
      .filter((entry): entry is { option: { id: string; name: string }; score: { rank: number; index: number } } => Boolean(entry))
      .sort((a, b) => a.score.rank - b.score.rank || a.score.index - b.score.index || a.option.name.localeCompare(b.option.name));
    return scored.map((entry) => entry.option);
  }, [players, query]);

  return (
    <div className="search-select">
      <input
        className="search-input"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select player</option>
        {filtered.map((player) => (
          <option key={player.id} value={player.id}>
            {player.name}
          </option>
        ))}
      </select>
    </div>
  );
}
