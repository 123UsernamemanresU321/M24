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

        // Validation for powers requiring input
        if (selectedPower.power_type === 'lockOp' && !targetOp) {
            return; // UI should disable button
        }

        setIsActivating(true);
        try {
            await onActivate(selectedPower.id, {
                targetOp: targetOp || undefined
            });
            setSelectedPowerId(null);
        } catch (err) {
            console.error('Failed to activate power:', err);
            // Optional: show error toast?
        } finally {
            setIsActivating(false);
        }
    };

    if (inventory.length === 0) return null;

    return (
        <div className="power-inventory">
            <h3 className="text-sm font-bold uppercase text-gray-500 mb-2">Power Cards</h3>
            <div className="flex flex-wrap gap-2">
                {inventory.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleClick(item.id)}
                        className={`
              relative flex items-center justify-center w-12 h-16 border-2 rounded-lg transition-all
              ${selectedPowerId === item.id ? 'border-blue-500 bg-blue-50 -translate-y-1 shadow-md' : 'border-gray-300 bg-white hover:border-gray-400'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
                        title={POWER_DESCRIPTIONS[item.power_type]}
                    >
                        <span className="text-2xl">{POWER_ICONS[item.power_type] ?? '?'}</span>
                        {item.state_json && JSON.parse(item.state_json).activated && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {selectedPower && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div className="font-bold capitalize">{selectedPower.power_type}</div>
                            <div className="text-xs text-gray-500">{POWER_DESCRIPTIONS[selectedPower.power_type]}</div>
                        </div>
                        <button
                            onClick={() => setSelectedPowerId(null)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    </div>

                    {selectedPower.power_type === 'lockOp' && (
                        <div className="flex gap-2 mb-3">
                            {['add', 'sub', 'mul', 'div'].map(op => (
                                <button
                                    key={op}
                                    onClick={() => setTargetOp(op)}
                                    className={`w-8 h-8 rounded flex items-center justify-center font-bold ${targetOp === op ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    {{ add: '+', sub: '-', mul: '×', div: '÷' }[op]}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={handleActivate}
                        disabled={isActivating || (selectedPower.power_type === 'lockOp' && !targetOp)}
                        className={`
              w-full py-1.5 rounded font-bold text-white text-sm
              ${isActivating ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
                    >
                        {isActivating ? 'Activating...' : 'Activate'}
                    </button>
                </div>
            )}
        </div>
    );
}
