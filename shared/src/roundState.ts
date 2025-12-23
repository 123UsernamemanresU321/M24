export type TimerMode = 'off' | 'countdown' | 'stopwatch';

export type TimerState = {
  mode: TimerMode;
  elapsedSeconds: number;
  remainingSeconds?: number;
  countdownSeconds?: number;
};

export function computeElapsedSeconds(startIso: string, now: Date = new Date()): number {
  const start = new Date(startIso).getTime();
  const end = now.getTime();
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function computeTimerState(startIso: string, mode: TimerMode, countdownSeconds?: number, now: Date = new Date()): TimerState {
  const elapsedSeconds = computeElapsedSeconds(startIso, now);
  if (mode === 'countdown') {
    const total = countdownSeconds ?? 60;
    const remainingSeconds = Math.max(0, total - elapsedSeconds);
    return { mode, elapsedSeconds, remainingSeconds, countdownSeconds: total };
  }
  return { mode, elapsedSeconds };
}

export function shouldRevealHint(elapsedSeconds: number, revealAfterSeconds: number, alreadyRevealed: boolean): boolean {
  if (alreadyRevealed) {
    return false;
  }
  return elapsedSeconds >= revealAfterSeconds;
}

export function computeColdStartRemaining(startIso: string, coldStartSeconds: number, now: Date = new Date()): number {
  if (coldStartSeconds <= 0) {
    return 0;
  }
  const elapsed = computeElapsedSeconds(startIso, now);
  return Math.max(0, coldStartSeconds - elapsed);
}
