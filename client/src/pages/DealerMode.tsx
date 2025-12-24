import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Card, Round } from '@arena/shared';
import { getDealerCurrent, dealerNext, type DealerSettings, getSession } from '../api';
import CardTemplateSVG from '../components/CardTemplateSVG';
import { normalizeTier } from '../utils/tier';

type DealerRound = Round & { shown_at?: string | null; index_in_session?: number | null };

export default function DealerMode() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [card, setCard] = useState<Card | null>(null);
    const [round, setRound] = useState<DealerRound | null>(null);
    const [settings, setSettings] = useState<DealerSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHints, setShowHints] = useState(true);
    const [advancing, setAdvancing] = useState(false);

    // Double-space tracking
    const lastSpaceRef = useRef<number>(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [overlayVisible, setOverlayVisible] = useState(true);
    const hintDismissedKey = `dealer_hint_dismissed_${id}`;

    // Check if in fullscreen mode
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Auto-hide overlay after inactivity
    useEffect(() => {
        const resetOverlayTimeout = () => {
            setOverlayVisible(true);
            if (overlayTimeoutRef.current) {
                clearTimeout(overlayTimeoutRef.current);
            }
            overlayTimeoutRef.current = setTimeout(() => {
                setOverlayVisible(false);
            }, 3000);
        };

        const handleMouseMove = () => resetOverlayTimeout();
        const handleKeyDown = () => resetOverlayTimeout();

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);
        resetOverlayTimeout();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
            if (overlayTimeoutRef.current) {
                clearTimeout(overlayTimeoutRef.current);
            }
        };
    }, []);

    // Check hint dismissed from localStorage
    useEffect(() => {
        const dismissed = localStorage.getItem(hintDismissedKey);
        if (dismissed === '1') {
            setShowHints(false);
        }
    }, [hintDismissedKey]);

    const dismissHints = useCallback(() => {
        setShowHints(false);
        localStorage.setItem(hintDismissedKey, '1');
    }, [hintDismissedKey]);

    // Load initial state and validate session is in dealer mode
    useEffect(() => {
        if (!id) return;

        const load = async () => {
            try {
                // First check that session is in dealer mode
                const session = await getSession(id);
                const rules = JSON.parse(session.rules_json || '{}');
                if (rules.mode !== 'dealer') {
                    // Redirect to live session if not dealer mode
                    navigate(`/sessions/${id}/live`);
                    return;
                }

                const data = await getDealerCurrent(id);
                setCard(data.card);
                setRound(data.round);
                setSettings(data.settings);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load dealer mode');
                setLoading(false);
            }
        };
        load();
    }, [id, navigate]);

    // WebSocket for multi-client sync
    useEffect(() => {
        if (!id) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }));
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'dealer_round' && message.payload) {
                    setCard(message.payload.card);
                    setRound(message.payload.round);
                    if (message.payload.settings) {
                        setSettings(message.payload.settings);
                    }
                }
            } catch {
                // Ignore parse errors
            }
        };

        return () => {
            ws.close();
        };
    }, [id]);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }, []);

    const advanceCard = useCallback(async () => {
        if (!id || advancing) return;

        // Check double-space requirement
        if (settings?.requireDoubleSpace) {
            const now = Date.now();
            if (now - lastSpaceRef.current > 450) {
                lastSpaceRef.current = now;
                return; // Wait for second press
            }
        }

        // Check minDwellMs client-side (server also enforces)
        if (settings?.minDwellMs && settings.minDwellMs > 0 && round?.shown_at) {
            const elapsed = Date.now() - new Date(round.shown_at).getTime();
            if (elapsed < settings.minDwellMs) {
                return;
            }
        }

        setAdvancing(true);
        setError(''); // Clear any previous error
        try {
            const data = await dealerNext(id);
            setCard(data.card);
            setRound(data.round);
            if (data.settings) {
                setSettings(data.settings);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to advance card';
            console.error('Failed to advance card:', errorMsg);
            setError(errorMsg);
        } finally {
            setAdvancing(false);
            lastSpaceRef.current = 0;
        }
    }, [id, advancing, settings, round]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Prevent default for keys we handle
            if (e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyR' || e.code === 'Backspace') {
                e.preventDefault();
            }

            if (e.code === 'Space') {
                advanceCard();
            } else if (e.code === 'KeyF') {
                toggleFullscreen();
            } else if (e.code === 'KeyR') {
                // Re-render: just trigger a state update to force re-render
                setCard((c) => (c ? { ...c } : null));
            } else if (e.code === 'Escape') {
                dismissHints();
            }
            // Backspace for going back is intentionally not implemented yet
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [advanceCard, toggleFullscreen, dismissHints]);

    if (loading) {
        return (
            <div className="dealer-page" ref={containerRef}>
                <div className="dealer-loading">Loading Dealer Mode...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dealer-page" ref={containerRef}>
                <div className="dealer-error">{error}</div>
            </div>
        );
    }

    const cardSize = Math.min(window.innerWidth * 0.85, window.innerHeight * 0.85, 800);
    const normalizedTier = card ? normalizeTier(card.dot_tier, 'DealerMode') : 1;
    const showDots = settings?.showDifficultyDots !== false;

    return (
        <div className="dealer-page" ref={containerRef} onClick={() => dismissHints()}>
            <div className="dealer-card">
                {card ? (
                    <>
                        <CardTemplateSVG
                            numbers={[card.n1, card.n2, card.n3, card.n4]}
                            tier={showDots ? normalizedTier : 1}
                            size={cardSize}
                        />
                        {settings?.showCardIndex && round?.index_in_session && (
                            <div className="dealer-index">#{round.index_in_session}</div>
                        )}
                    </>
                ) : (
                    <div className="dealer-empty">
                        <div className="dealer-empty-text">Press SPACE to start</div>
                        {error && <div className="dealer-error" style={{ marginTop: '12px', fontSize: '14px' }}>{error}</div>}
                    </div>
                )}
            </div>

            {/* Overlay with controls - auto-hides */}
            <div className={`dealer-overlay ${overlayVisible ? 'visible' : 'hidden'}`}>
                <button
                    className="dealer-fullscreen-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                    }}
                    title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                    {isFullscreen ? '⇲' : '⇱'}
                </button>

                {showHints && (
                    <div className="dealer-hints" onClick={(e) => e.stopPropagation()}>
                        <div>SPACE = next card</div>
                        <div>F = fullscreen</div>
                        <div>R = re-render</div>
                        <div className="dealer-hint-dismiss" onClick={dismissHints}>
                            (click anywhere to dismiss)
                        </div>
                    </div>
                )}
            </div>

            {advancing && <div className="dealer-loading-overlay">Loading...</div>}
        </div>
    );
}
