import React, { useState } from 'react';
import type { ClientState } from '../api';

type PowerInventoryProps = {
    inventory: NonNullable<NonNullable<ClientState['powerCards']>['inventory']>;
    onActivate: (powerId: string, payload: { targetPlayerId?: string; targetOp?: string; swapIndices?: [number, number] }) => Promise<void>;
    disabled?: boolean;
};

const POWER_ICONS: Record<string, string> = {
    shield: '🛡️',
    double: 'x2',
    swap: '⇄',
    reroll: '🎲',
    lockOp: '🔒',
    freeze: '❄️',
    steal: '🦹'
};

const POWER_DESCRIPTIONS: Record<string, string> = {
    shield: 'Protects from one penalty.',
    double: 'Doubles points for next solve.',
    swap: 'Swap two numbers in the card.',
    reroll: 'Reroll the current card.',
    lockOp: 'Ban an operation for others.',
    freeze: 'Freeze leaderboard for a round.',
    steal: 'Steal points if you solve first.'
};

export default function PowerInventory({ inventory, onActivate, disabled }: PowerInventoryProps) {
    const [selectedPowerId, setSelectedPowerId] = useState<string | null>(null);
    const [targetOp, setTargetOp] = useState<string>('');
    const [isActivating, setIsActivating] = useState(false);

    const selectedPower = inventory.find((p) => p.id === selectedPowerId);

    const handleClick = (powerId: string) => {
        if (disabled || isActivating) return;
        if (selectedPowerId === powerId) {
            setSelectedPowerId(null);
            setTargetOp('');
        } else {
            setSelectedPowerId(powerId);
            setTargetOp('');
        }
    };

    const handleActivate = async () => {
        if (!selectedPower || isActivating) return;

        if (selectedPower.power_type === 'lockOp' && !targetOp) {
            return;
        }

        setIsActivating(true);
        try {
            await onActivate(selectedPower.id, {
                targetOp: targetOp || undefined
            });
            setSelectedPowerId(null);
        } catch (err) {
            console.error('Failed to activate power:', err);
        } finally {
            setIsActivating(false);
        }
    };

    if (inventory.length === 0) return null;

    return (
        <div className="power-inventory-container">
            <div className="section-title" style={{ fontSize: '11px', opacity: 0.7, marginBottom: '8px' }}>Your Power Inventory</div>
            <div className="power-cards-row">
                {inventory.map((item) => {
                    const isActivated = item.state_json && JSON.parse(item.state_json).activated;
                    return (
                        <button
                            key={item.id}
                            onClick={() => handleClick(item.id)}
                            className={`power-card-slot ${selectedPowerId === item.id ? 'selected' : ''} ${isActivated ? 'active' : ''}`}
                            disabled={disabled}
                            title={POWER_DESCRIPTIONS[item.power_type]}
                        >
                            <span className="power-icon">{POWER_ICONS[item.power_type] ?? '?'}</span>
                            {isActivated && <div className="power-active-pulse" />}
                        </button>
                    );
                })}
            </div>

            {selectedPower && (
                <div className="power-activation-panel panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 800, textTransform: 'capitalize' }}>{selectedPower.power_type}</div>
                        <button className="button ghost small" onClick={() => setSelectedPowerId(null)}>✕</button>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                        {POWER_DESCRIPTIONS[selectedPower.power_type]}
                    </div>

                    {selectedPower.power_type === 'lockOp' && (
                        <div className="op-selector" style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}>Select operation to lock:</div>
                            <div className="button-row">
                                {['add', 'sub', 'mul', 'div'].map(op => (
                                    <button
                                        key={op}
                                        onClick={() => setTargetOp(op)}
                                        className={`button small ${targetOp === op ? '' : 'ghost'}`}
                                    >
                                        {{ add: '+', sub: '-', mul: '×', div: '÷' }[op]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        className="button primary w-full"
                        onClick={handleActivate}
                        disabled={isActivating || (selectedPower.power_type === 'lockOp' && !targetOp)}
                        style={{ width: '100%' }}
                    >
                        {isActivating ? 'Activating...' : 'Activate Power'}
                    </button>
                </div>
            )}
        </div>
    );
}
