import React, { useState, useCallback } from 'react';

type Token =
    | { type: 'number'; value: number; used: boolean }
    | { type: 'op'; value: '+' | '-' | '*' | '/' }
    | { type: 'paren'; value: '(' | ')' };

type ExpressionBuilderProps = {
    numbers: (number | null)[];
    onExpressionChange: (expression: string) => void;
    disabled?: boolean;
    bannedOps?: Array<'add' | 'sub' | 'mul' | 'div'>;
};

const OP_MAP: Record<'+' | '-' | '*' | '/', 'add' | 'sub' | 'mul' | 'div'> = {
    '+': 'add',
    '-': 'sub',
    '*': 'mul',
    '/': 'div'
};

function tokensToString(tokens: Token[]): string {
    return tokens.map(t => {
        if (t.type === 'number') return String(t.value);
        return t.value;
    }).join(' ').replace(/\s+/g, ' ').trim();
}

function canAddToken(tokens: Token[], nextToken: Token): boolean {
    if (tokens.length === 0) {
        // First token must be ( or number
        return nextToken.type === 'number' || (nextToken.type === 'paren' && nextToken.value === '(');
    }

    const last = tokens[tokens.length - 1];

    if (nextToken.type === 'number') {
        // Number can follow: ( or op
        return (last.type === 'paren' && last.value === '(') || last.type === 'op';
    }

    if (nextToken.type === 'op') {
        // Op can follow: number or )
        return last.type === 'number' || (last.type === 'paren' && last.value === ')');
    }

    if (nextToken.type === 'paren') {
        if (nextToken.value === '(') {
            // ( can follow: ( or op or be first
            return (last.type === 'paren' && last.value === '(') || last.type === 'op';
        } else {
            // ) can follow: number or )
            // Also need to check balance
            const openCount = tokens.filter(t => t.type === 'paren' && t.value === '(').length;
            const closeCount = tokens.filter(t => t.type === 'paren' && t.value === ')').length;
            if (closeCount >= openCount) return false;
            return last.type === 'number' || (last.type === 'paren' && last.value === ')');
        }
    }

    return false;
}

export default function ExpressionBuilder({
    numbers,
    onExpressionChange,
    disabled = false,
    bannedOps = []
}: ExpressionBuilderProps) {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());

    const updateExpression = useCallback((newTokens: Token[]) => {
        setTokens(newTokens);
        onExpressionChange(tokensToString(newTokens));
    }, [onExpressionChange]);

    const handleNumberClick = (num: number, index: number) => {
        if (disabled || usedIndices.has(index)) return;

        const token: Token = { type: 'number', value: num, used: true };
        if (!canAddToken(tokens, token)) return;

        setUsedIndices(prev => new Set([...prev, index]));
        updateExpression([...tokens, token]);
    };

    const handleOpClick = (op: '+' | '-' | '*' | '/') => {
        if (disabled) return;
        if (bannedOps.includes(OP_MAP[op])) return;

        const token: Token = { type: 'op', value: op };
        if (!canAddToken(tokens, token)) return;

        updateExpression([...tokens, token]);
    };

    const handleParenClick = (paren: '(' | ')') => {
        if (disabled) return;

        const token: Token = { type: 'paren', value: paren };
        if (!canAddToken(tokens, token)) return;

        updateExpression([...tokens, token]);
    };

    const handleBackspace = () => {
        if (disabled || tokens.length === 0) return;

        const lastToken = tokens[tokens.length - 1];
        const newTokens = tokens.slice(0, -1);

        // If removing a number, free up that index
        if (lastToken.type === 'number') {
            const idx = numbers.findIndex((n, i) => n === lastToken.value && usedIndices.has(i));
            if (idx >= 0) {
                setUsedIndices(prev => {
                    const next = new Set(prev);
                    next.delete(idx);
                    return next;
                });
            }
        }

        updateExpression(newTokens);
    };

    const handleClear = () => {
        if (disabled) return;
        setTokens([]);
        setUsedIndices(new Set());
        onExpressionChange('');
    };

    const displayNumbers = numbers.filter((n): n is number => n !== null);
    const expression = tokensToString(tokens);
    const openParens = tokens.filter(t => t.type === 'paren' && t.value === '(').length;
    const closeParens = tokens.filter(t => t.type === 'paren' && t.value === ')').length;
    const canClose = openParens > closeParens;

    return (
        <div className="expression-builder">
            {/* Expression display */}
            <div className="builder-display">
                <span className="builder-expression">{expression || 'Tap numbers and ops...'}</span>
            </div>

            {/* Number buttons */}
            <div className="builder-numbers">
                {displayNumbers.map((num, idx) => (
                    <button
                        key={idx}
                        className={`builder-btn builder-number ${usedIndices.has(idx) ? 'used' : ''}`}
                        onClick={() => handleNumberClick(num, idx)}
                        disabled={disabled || usedIndices.has(idx)}
                    >
                        {num}
                    </button>
                ))}
            </div>

            {/* Operation buttons */}
            <div className="builder-ops">
                {(['+', '-', '*', '/'] as const).map((op) => (
                    <button
                        key={op}
                        className={`builder-btn builder-op ${bannedOps.includes(OP_MAP[op]) ? 'banned' : ''}`}
                        onClick={() => handleOpClick(op)}
                        disabled={disabled || bannedOps.includes(OP_MAP[op])}
                    >
                        {op === '*' ? '×' : op === '/' ? '÷' : op}
                    </button>
                ))}
            </div>

            {/* Parentheses and control buttons */}
            <div className="builder-controls">
                <button
                    className="builder-btn builder-paren"
                    onClick={() => handleParenClick('(')}
                    disabled={disabled}
                >
                    (
                </button>
                <button
                    className="builder-btn builder-paren"
                    onClick={() => handleParenClick(')')}
                    disabled={disabled || !canClose}
                >
                    )
                </button>
                <button
                    className="builder-btn builder-action"
                    onClick={handleBackspace}
                    disabled={disabled || tokens.length === 0}
                >
                    ⌫
                </button>
                <button
                    className="builder-btn builder-action"
                    onClick={handleClear}
                    disabled={disabled || tokens.length === 0}
                >
                    Clear
                </button>
            </div>
        </div>
    );
}
