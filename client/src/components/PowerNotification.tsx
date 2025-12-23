import React, { useEffect, useState } from 'react';
import { PowerCard } from '@arena/shared';

const powerIcons: Record<string, string> = {
    shield: '🛡️',
    double: '✨',
    swap: '🔀',
    reroll: '🎲',
    freeze: '❄️',
    steal: '💰',
    lockOp: '🔒'
};

const powerLabels: Record<string, string> = {
    shield: 'Shield',
    double: 'Double Points',
    swap: 'Swap Numbers',
    reroll: 'Reroll Card',
    freeze: 'Freeze Leaderboard',
    steal: 'Steal Points',
    lockOp: 'Lock Operation'
};

interface PowerNotificationProps {
    powerType: string;
    onClose: () => void;
}

export default function PowerNotification({ powerType, onClose }: PowerNotificationProps) {
    useEffect(() => {
        // Auto-dismiss after animation
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="power-notification-overlay">
            <div className="power-notification-card">
                <div className="power-icon-large">{powerIcons[powerType] ?? '⚡️'}</div>
                <div className="power-title">Power Unlocked!</div>
                <div className="power-name">{powerLabels[powerType] ?? powerType}</div>
            </div>
        </div>
    );
}
