import React from 'react';
import type { LeaderboardRow } from '@arena/shared';

export default function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Score</th>
          <th>Correct</th>
          <th>Wrong</th>
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
