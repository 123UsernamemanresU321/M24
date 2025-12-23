import React from 'react';
import { LeaderboardRow } from '@arena/shared';
import LeaderboardTable from './LeaderboardTable';

type LeaderboardDrawerProps = {
    open: boolean;
    onToggle: () => void;
    rows: LeaderboardRow[];
    highlightPlayerId?: string;
    isFrozen?: boolean;
};

export default function LeaderboardDrawer({ open, onToggle, rows, highlightPlayerId, isFrozen }: LeaderboardDrawerProps) {
    // Top 3 for mini view
    const top3 = rows.slice(0, 3);

    return (
        <>
            <div className={`leaderboard-drawer ${open ? 'open' : ''}`}>
                <div className="leaderboard-drawer-header" onClick={onToggle}>
                    <div className="leaderboard-drawer-title">
                        Leaderboard {isFrozen && '❄️'} {open ? '▼' : '▲'}
                    </div>
                    {!open && top3.length > 0 && (
                        <div className="mini-leaderboard">
                            {top3.map((row, idx) => (
                                <span key={row.player_id} className={idx === 0 ? 'mini-leader' : ''}>
                                    {idx + 1}. {row.display_name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="leaderboard-drawer-content">
                    <LeaderboardTable rows={rows} highlightPlayerId={highlightPlayerId} />
                </div>
            </div>
            {/* Overlay to close when clicking outside (optional, but good for drawers) */}
            {open && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 14 }}
                    onClick={onToggle}
                />
            )}
        </>
    );
}
