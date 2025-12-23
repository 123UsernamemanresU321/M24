import React from 'react';
import type { LeaderboardRow } from '@arena/shared';

export default function LeaderboardTable({
  rows,
  onKick
}: {
  rows: LeaderboardRow[];
  onKick?: (playerId: string) => void;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Score</th>
          <th>Correct</th>
          <th>Wrong</th>
          {onKick && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.player_id}>
            <td>{index + 1}</td>
            <td>{row.display_name}</td>
            <td>{row.score_total}</td>
            <td>{row.correct_count}</td>
            <td>{row.wrong_count}</td>
            {onKick && (
              <td>
                <button className="button ghost small" onClick={() => onKick(row.player_id)}>
                  Kick
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
