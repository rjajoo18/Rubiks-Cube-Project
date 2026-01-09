import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/api/client';
import { Solve, LiveStats } from '@/types/api';
import { formatDisplayTime, formatMs } from '@/utils/time';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

type TimerState = 'idle' | 'ready' | 'running' | 'stopped';

export const SolverPage: React.FC = () => {
  const [scramble, setScramble] = useState<string>('');
  const [scrambleState, setScrambleState] = useState<string>(''); // 54-char URFDLB
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [lastSolve, setLastSolve] = useState<Solve | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  // penalty/notes UI
  const [penalty, setPenalty] = useState<string>('OK');
  const [notes, setNotes] = useState<string>('');

  // NEW: pending time to save after user chooses penalty/notes
  const [pendingTimeMs, setPendingTimeMs] = useState<number | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Optimal solution UI
  const [optimalSolutionMoves, setOptimalSolutionMoves] = useState<string[] | null>(null);
  const [solutionLoading, setSolutionLoading] = useState<boolean>(false);

  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const spaceDownTimeRef = useRef<number>(0);

  const timerStateRef = useRef<TimerState>('idle');
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const loadNewScramble = useCallback(async () => {
    try {
      setError('');
      setOptimalSolutionMoves(null);

      const data = await apiClient.getScramble('3x3');
      setScramble(data.scramble);
      setScrambleState(data.state);
    } catch {
      setError('Failed to load scramble');
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const stats = await apiClient.getLiveStats('3x3');
      setLiveStats(stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  useEffect(() => {
    void loadNewScramble();
    void loadStats();
  }, [loadNewScramble, loadStats]);

  const saveSolve = useCallback(
    async (timeMs: number) => {
      setLoading(true);
      setError('');
      try {
        // IMPORTANT:
        // Keep penalty consistent with backend + ML pipeline:
        // send "OK" / "+2" / "DNF" (not null)
        const response = await apiClient.createSolve({
          scramble,
          timeMs,
          penalty: penalty === 'OK' ? null : penalty,
          source: 'timer',
          notes: notes || undefined,
          event: '3x3',
          state: scrambleState || undefined,
        });

        // Show solve immediately
        setLastSolve(response.solve);
        setLiveStats(response.liveStats);

        // Clear UI after successful save
        setNotes('');
        setPenalty('OK');
        setPendingTimeMs(null);

        // Kick off scoring in the background (do NOT block UX)
        // If this fails, the "Score This Solve" button still works.
        try {
          const scoreRes = await apiClient.scoreSolve(response.solve.id);
          setLastSolve((prev) =>
            prev && prev.id === response.solve.id
              ? {
                  ...prev,
                  mlScore: scoreRes.mlScore,
                  scoreVersion: scoreRes.scoreVersion,
                  expectedTimeMs: scoreRes.expectedTimeMs,
                  dnfRisk: scoreRes.dnfRisk,
                  plus2Risk: scoreRes.plus2Risk,
                }
              : prev
          );

          // (optional) refresh stats so avgScore updates quickly
          // If your live stats already include scoreStats, this keeps it fresh:
          void loadStats();
        } catch (err) {
          console.error('Auto-scoring failed:', err);
          // Don't hard-error; user can manually score
        }

        await loadNewScramble();
      } catch {
        setError('Failed to save solve');
      } finally {
        setLoading(false);
      }
    },
    [scramble, penalty, notes, scrambleState, loadNewScramble, loadStats]
  );

  const startTimer = useCallback(() => {
    if (loadingRef.current) return;

    // starting a new solve should clear any pending unsaved solve state
    setPendingTimeMs(null);
    setPenalty('OK');
    setNotes('');

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    startTimeRef.current = performance.now();
    setTimerState('running');
    setCurrentTime(0);

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      setCurrentTime(Math.floor(elapsed));
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // UPDATED: stop timer no longer saves immediately.
  // Instead it sets pendingTimeMs and shows penalty/notes + Save Solve button.
  const stopTimer = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    const finalTime = Math.floor(performance.now() - startTimeRef.current);
    setCurrentTime(finalTime);
    setTimerState('stopped');

    setPendingTimeMs(finalTime);
  }, []);

  const handleSpaceDown = useCallback(() => {
    if (loadingRef.current) return;

    const state = timerStateRef.current;
    if (state === 'idle') {
      spaceDownTimeRef.current = Date.now();
      setTimerState('ready');
    } else if (state === 'running') {
      stopTimer();
    }
  }, [stopTimer]);

  const handleSpaceUp = useCallback(() => {
    if (loadingRef.current) return;

    const state = timerStateRef.current;
    if (state === 'ready') {
      const holdTime = Date.now() - spaceDownTimeRef.current;
      if (holdTime >= 300) startTimer();
      else setTimerState('idle');
    }
  }, [startTimer]);

  // key listeners once
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleSpaceDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleSpaceUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleSpaceDown, handleSpaceUp]);

  // cancel RAF on unmount only
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
    };
  }, []);

  const handleManualStart = () => {
    if (loading) return;
    if (timerState === 'idle') startTimer();
    else if (timerState === 'running') stopTimer();
  };

  const handleSavePendingSolve = useCallback(() => {
    if (pendingTimeMs == null) return;
    void saveSolve(pendingTimeMs);
  }, [pendingTimeMs, saveSolve]);

  const handleScoreSolve = async (solveId: number) => {
    try {
      const result = await apiClient.scoreSolve(solveId);
      setLastSolve((prev) =>
        prev && prev.id === solveId
          ? {
              ...prev,
              mlScore: result.mlScore,
              scoreVersion: result.scoreVersion,
              expectedTimeMs: result.expectedTimeMs,
              dnfRisk: result.dnfRisk,
              plus2Risk: result.plus2Risk,
            }
          : prev
      );
      void loadStats();
    } catch {
      setError('Failed to score solve');
    }
  };

  const handleRevealOptimalSolution = async () => {
    if (timerState === 'running' || loading || solutionLoading) return;

    const ok = window.confirm(
      'Reveal the optimal (Kociemba) solution for this scramble? This will spoil the solve.'
    );
    if (!ok) return;

    if (!scrambleState || scrambleState.length !== 54) {
      setError('Missing cube state for this scramble. (Expected 54 chars.)');
      return;
    }

    setSolutionLoading(true);
    setError('');

    try {
      const res = await apiClient.getOptimalSolution({ state: scrambleState, event: '3x3' });
      setOptimalSolutionMoves(res.solutionMoves);
    } catch {
      setError('Failed to compute optimal solution.');
    } finally {
      setSolutionLoading(false);
    }
  };

  const handleCopySolution = async () => {
    if (!optimalSolutionMoves) return;
    try {
      await navigator.clipboard.writeText(optimalSolutionMoves.join(' '));
    } catch {
      // ignore
    }
  };

  const getTimerColor = () => {
    if (timerState === 'ready') return 'text-green-400';
    if (timerState === 'running') return 'text-white';
    if (timerState === 'stopped') return 'text-blue-400';
    return 'text-muted-foreground';
  };

  // UPDATED: banner should show while saving a stopped/pending solve
  const showSavingBanner = loading && timerState === 'stopped';

  const handleReset = () => {
    if (loading) return;
    setTimerState('idle');
    setPendingTimeMs(null);
    setPenalty('OK');
    setNotes('');
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6 animate-fade-in">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Timer</h1>
            <p className="text-muted-foreground">Press and hold spacebar to start</p>
          </div>

          {error && (
            <Card className="bg-destructive/10 border-destructive/40 border">
              <p className="text-destructive">{error}</p>
            </Card>
          )}

          {showSavingBanner && (
            <Card className="border border-border/50 bg-card/60 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-foreground">Saving solve...</p>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="text-center border border-border/50 bg-card/60 backdrop-blur">
                <div className="mb-8">
                  <p className="text-sm text-muted-foreground mb-3">Scramble</p>
                  <p className="text-lg md:text-xl font-mono text-foreground leading-relaxed">
                    {scramble}
                  </p>

                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <Button
                      variant="ghost"
                      onClick={loadNewScramble}
                      disabled={timerState === 'running' || loading || solutionLoading}
                    >
                      {loading ? 'Saving...' : 'New Scramble'}
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={handleRevealOptimalSolution}
                      disabled={timerState === 'running' || loading || solutionLoading}
                    >
                      {solutionLoading ? 'Computing...' : 'Reveal Optimal Solution'}
                    </Button>

                    {optimalSolutionMoves && (
                      <Button variant="ghost" onClick={handleCopySolution} disabled={solutionLoading}>
                        Copy
                      </Button>
                    )}
                  </div>

                  {optimalSolutionMoves && (
                    <div className="mt-4 text-left">
                      <p className="text-sm text-muted-foreground mb-2">
                        Optimal solution (Kociemba) • {optimalSolutionMoves.length} moves
                      </p>
                      <div className="rounded-lg border border-border/50 bg-background/40 p-3 font-mono text-sm break-words">
                        {optimalSolutionMoves.join(' ')}
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className={`text-7xl md:text-8xl font-bold mb-8 transition-colors ${getTimerColor()}`}
                >
                  {formatMs(currentTime)}
                </div>

                <div className="flex justify-center gap-3 mb-6">
                  <Button
                    variant={timerState === 'running' ? 'secondary' : 'primary'}
                    onClick={handleManualStart}
                    disabled={timerState === 'stopped' || loading}
                  >
                    {timerState === 'running' ? 'Stop' : 'Start'}
                  </Button>

                  {timerState === 'stopped' && (
                    <Button variant="ghost" onClick={handleReset} disabled={loading}>
                      Reset
                    </Button>
                  )}
                </div>

                {timerState === 'stopped' && (
                  <div className="space-y-4 pt-6 border-t border-border/50">
                    <div className="grid grid-cols-3 gap-3">
                      <Button
                        variant={penalty === 'OK' ? 'primary' : 'ghost'}
                        onClick={() => setPenalty('OK')}
                        disabled={loading}
                      >
                        OK
                      </Button>
                      <Button
                        variant={penalty === '+2' ? 'primary' : 'ghost'}
                        onClick={() => setPenalty('+2')}
                        disabled={loading}
                      >
                        +2
                      </Button>
                      <Button
                        variant={penalty === 'DNF' ? 'primary' : 'ghost'}
                        onClick={() => setPenalty('DNF')}
                        disabled={loading}
                      >
                        DNF
                      </Button>
                    </div>

                    <Input
                      placeholder="Notes (optional)"
                      value={notes}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
                      disabled={loading}
                    />

                    <Button
                      variant="primary"
                      onClick={handleSavePendingSolve}
                      disabled={loading || pendingTimeMs == null}
                      className="w-full"
                    >
                      Save Solve
                    </Button>
                  </div>
                )}
              </Card>

              {lastSolve && (
                <Card className="border border-border/50 bg-card/60 backdrop-blur">
                  <h3 className="text-lg font-semibold mb-4">Last Solve</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Time</span>
                      <Badge variant="info">
                        {formatDisplayTime(lastSolve.timeMs, lastSolve.penalty)}
                      </Badge>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Date</span>
                      <span className="text-sm text-foreground">
                        {new Date(lastSolve.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {lastSolve.mlScore !== null && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Score</span>
                        <Badge variant="success">{lastSolve.mlScore.toFixed(2)}</Badge>
                      </div>
                    )}

                    {lastSolve.mlScore === null && (
                      <Button
                        variant="secondary"
                        onClick={() => void handleScoreSolve(lastSolve.id)}
                        className="w-full mt-2"
                        disabled={loading}
                      >
                        Score This Solve
                      </Button>
                    )}

                    {lastSolve.expectedTimeMs != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Expected</span>
                        <Badge variant="info">{formatMs(lastSolve.expectedTimeMs)}</Badge>
                      </div>
                    )}

                    {lastSolve.dnfRisk != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">DNF Risk</span>
                        <Badge variant="default">{Math.round(lastSolve.dnfRisk * 100)}%</Badge>
                      </div>
                    )}

                    {lastSolve.plus2Risk != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">+2 Risk</span>
                        <Badge variant="default">{Math.round(lastSolve.plus2Risk * 100)}%</Badge>
                      </div>
                    )}

                    {lastSolve.scoreVersion && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Model</span>
                        <span className="text-sm text-foreground">{lastSolve.scoreVersion}</span>
                      </div>
                    )}

                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="border border-border/50 bg-card/60 backdrop-blur">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Live Stats</h3>
                  <Button
                    variant="ghost"
                    onClick={loadStats}
                    className="text-xs h-8 px-3"
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                </div>

                {liveStats && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">Count</span>
                      <span className="text-sm font-medium text-foreground">{liveStats.count}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Best</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMs(liveStats.bestMs)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Worst</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMs(liveStats.worstMs)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Ao5</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMs(liveStats.ao5Ms)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Ao12</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMs(liveStats.ao12Ms)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">Average</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMs(liveStats.avgMs)}
                      </span>
                    </div>
                    {liveStats.avgScore !== null && (
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-sm text-muted-foreground">Avg Score</span>
                        <span className="text-sm font-medium text-foreground">
                          {liveStats.avgScore.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SolverPage;
