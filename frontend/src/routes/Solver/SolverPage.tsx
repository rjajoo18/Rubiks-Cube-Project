import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/api/client';
import { Solve, LiveStats } from '@/types/api';
import { formatDisplayTime, formatMs } from '@/utils/time';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type TimerState = 'idle' | 'arming' | 'ready' | 'inspection' | 'running' | 'stopped';

const INSPECTION_MS = 15000;
const LATE_PLUS2_MS = 2000;
const ARMING_THRESHOLD_MS = 500; // Hold space for 500ms to arm

export const SolverPage: React.FC = () => {
  const [scramble, setScramble] = useState<string>('');
  const [scrambleState, setScrambleState] = useState<string>(''); 
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [lastSolve, setLastSolve] = useState<Solve | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  // Inspection setting
  const [inspectionEnabled, setInspectionEnabled] = useState<boolean>(true);

  // Last solve penalty state (for after-save editing)
  const [lastSolvePenalty, setLastSolvePenalty] = useState<string>('OK');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [savingMessage, setSavingMessage] = useState<string>('');

  // Optimal solution UI
  const [optimalSolutionMoves, setOptimalSolutionMoves] = useState<string[] | null>(null);
  const [solutionLoading, setSolutionLoading] = useState<boolean>(false);

  // Inspection UI
  const [inspectionMsLeft, setInspectionMsLeft] = useState<number>(INSPECTION_MS);
  const [inspectionOverMs, setInspectionOverMs] = useState<number>(0);

  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const spaceDownTimeRef = useRef<number>(0);
  const armingTimeoutRef = useRef<number>(0);

  const inspectionStartRef = useRef<number>(0);
  const inspectionRafRef = useRef<number>(0);

  const timerStateRef = useRef<TimerState>('idle');
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Load inspection preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('inspectionEnabled');
    if (stored !== null) {
      setInspectionEnabled(stored === 'true');
    }
  }, []);

  // Save inspection preference
  const toggleInspection = useCallback(() => {
    setInspectionEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('inspectionEnabled', String(next));
      return next;
    });
  }, []);

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

  // AUTO-SAVE: Save solve immediately when timer stops
  const saveSolveImmediately = useCallback(
    async (timeMs: number, autoPenalty: string = 'OK') => {
      setLoading(true);
      setSavingMessage('Saving...');
      setError('');
      
      try {
        const response = await apiClient.createSolve({
          scramble,
          timeMs,
          penalty: autoPenalty === 'OK' ? null : autoPenalty,
          source: 'timer',
          event: '3x3',
          state: scrambleState || undefined,
        });

        setLastSolve(response.solve);
        setLastSolvePenalty(autoPenalty);
        setLiveStats(response.liveStats);
        setSavingMessage('Saved ✓');

        // Auto-score in background
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
          void loadStats();
        } catch (err) {
          console.error('Auto-scoring failed:', err);
        }

        await loadNewScramble();

        // Clear saving message after delay
        setTimeout(() => setSavingMessage(''), 2000);
      } catch {
        setError('Failed to save solve');
        setSavingMessage('');
      } finally {
        setLoading(false);
      }
    },
    [scramble, scrambleState, loadNewScramble, loadStats]
  );

  const stopInspection = useCallback(() => {
    if (inspectionRafRef.current) {
      cancelAnimationFrame(inspectionRafRef.current);
      inspectionRafRef.current = 0;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (loadingRef.current) return;

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

  const startInspection = useCallback(() => {
    if (loadingRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    stopInspection();

    inspectionStartRef.current = performance.now();
    setInspectionMsLeft(INSPECTION_MS);
    setInspectionOverMs(0);
    setTimerState('inspection');

    const tick = () => {
      const now = performance.now();
      const elapsed = now - inspectionStartRef.current;

      const left = Math.max(0, INSPECTION_MS - elapsed);
      setInspectionMsLeft(left);

      const over = Math.max(0, elapsed - INSPECTION_MS);
      setInspectionOverMs(over);

      inspectionRafRef.current = requestAnimationFrame(tick);
    };

    inspectionRafRef.current = requestAnimationFrame(tick);
  }, [stopInspection]);

  const beginSolveFromInspection = useCallback(() => {
    if (loadingRef.current) return;

    stopInspection();
    startTimer();
  }, [stopInspection, startTimer]);

  // UPDATED: Auto-save and auto-reset on timer stop
  const stopTimer = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    const finalTime = Math.floor(performance.now() - startTimeRef.current);
    
    // Determine auto-penalty from inspection
    let autoPenalty = 'OK';
    if (inspectionEnabled && inspectionOverMs > LATE_PLUS2_MS) {
      autoPenalty = 'DNF';
    } else if (inspectionEnabled && inspectionOverMs > 0) {
      autoPenalty = '+2';
    }

    // Save immediately and reset to idle
    void saveSolveImmediately(finalTime, autoPenalty);
    
    // Reset timer to 0.0 immediately for next solve
    setCurrentTime(0);
    setTimerState('idle');
  }, [saveSolveImmediately, inspectionOverMs, inspectionEnabled]);

  const handleSpaceDown = useCallback(() => {
    if (loadingRef.current) return;

    const state = timerStateRef.current;
    
    if (state === 'idle') {
      spaceDownTimeRef.current = Date.now();
      setTimerState('arming');
      
      // Start arming timeout
      armingTimeoutRef.current = window.setTimeout(() => {
        if (timerStateRef.current === 'arming') {
          setTimerState('ready');
        }
      }, ARMING_THRESHOLD_MS);
    } else if (state === 'inspection') {
      beginSolveFromInspection();
    } else if (state === 'running') {
      stopTimer();
    }
  }, [stopTimer, beginSolveFromInspection]);

  const handleSpaceUp = useCallback(() => {
    if (loadingRef.current) return;

    const state = timerStateRef.current;
    
    // Clear arming timeout if we release early
    if (armingTimeoutRef.current) {
      clearTimeout(armingTimeoutRef.current);
      armingTimeoutRef.current = 0;
    }
    
    if (state === 'arming') {
      // Released too early - go back to idle
      setTimerState('idle');
    } else if (state === 'ready') {
      // Released after arming - start inspection or timer
      if (inspectionEnabled) {
        startInspection();
      } else {
        startTimer();
      }
    }
  }, [startInspection, startTimer, inspectionEnabled]);

  // Key listeners
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

  // Cancel RAF on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
      if (inspectionRafRef.current) {
        cancelAnimationFrame(inspectionRafRef.current);
        inspectionRafRef.current = 0;
      }
      if (armingTimeoutRef.current) {
        clearTimeout(armingTimeoutRef.current);
        armingTimeoutRef.current = 0;
      }
    };
  }, []);

  const handleManualStart = () => {
    if (loading) return;

    if (timerState === 'idle') {
      if (inspectionEnabled) startInspection();
      else startTimer();
    } else if (timerState === 'inspection') {
      beginSolveFromInspection();
    } else if (timerState === 'running') {
      stopTimer();
    }
  };

  const handleUpdateLastSolvePenalty = async (newPenalty: string) => {
    if (!lastSolve) return;
    
    setLoading(true);
    setError('');
    
    try {
      await apiClient.updateSolve(lastSolve.id, {
        penalty: newPenalty === 'OK' ? null : newPenalty,
      });
      
      setLastSolvePenalty(newPenalty);
      void loadStats();
    } catch {
      setError('Failed to update penalty');
    } finally {
      setLoading(false);
    }
  };

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
    if (timerState === 'arming') return 'text-yellow-500';
    if (timerState === 'ready') return 'text-green-400';
    if (timerState === 'inspection') return 'text-yellow-300';
    if (timerState === 'running') return 'text-white';
    return 'text-muted-foreground';
  };

  const renderMainTime = () => {
    if (timerState === 'inspection') {
      if (inspectionMsLeft > 0) return (inspectionMsLeft / 1000).toFixed(2);
      return `+${(inspectionOverMs / 1000).toFixed(2)}`;
    }
    return formatMs(currentTime);
  };

  const getTimerInstruction = () => {
    if (timerState === 'arming') return 'Keep holding...';
    if (timerState === 'ready') return 'Release to start';
    if (timerState === 'inspection') return 'Press space to solve';
    if (timerState === 'running') return 'Press space to stop';
    return inspectionEnabled ? 'Hold space to start' : 'Hold space to start';
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6 animate-fade-in">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Timer</h1>
              <p className="text-muted-foreground">{getTimerInstruction()}</p>
            </div>
            
            <Button
              variant={inspectionEnabled ? 'primary' : 'secondary'}
              onClick={toggleInspection}
              disabled={timerState === 'running'}
            >
              Inspection: {inspectionEnabled ? 'ON' : 'OFF'}
            </Button>
          </div>

          {error && (
            <Card className="bg-destructive/10 border-destructive/40 border">
              <p className="text-destructive">{error}</p>
            </Card>
          )}

          {savingMessage && (
            <Card className="border border-border/50 bg-card/60 backdrop-blur">
              <p className="text-foreground">{savingMessage}</p>
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
                  {renderMainTime()}
                </div>

                <div className="flex justify-center gap-3 mb-6">
                  <Button
                    variant={timerState === 'running' ? 'secondary' : 'primary'}
                    onClick={handleManualStart}
                    disabled={loading}
                  >
                    {timerState === 'running' ? 'Stop' : 'Start'}
                  </Button>
                </div>
              </Card>

              {lastSolve && (
                <Card className="border border-border/50 bg-card/60 backdrop-blur">
                  <h3 className="text-lg font-semibold mb-4">Last Solve</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Time</span>
                      <Badge variant="info">
                        {formatDisplayTime(lastSolve.timeMs, lastSolvePenalty)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Button
                        variant={lastSolvePenalty === 'OK' ? 'primary' : 'ghost'}
                        onClick={() => void handleUpdateLastSolvePenalty('OK')}
                        disabled={loading}
                        className="h-9"
                      >
                        OK
                      </Button>
                      <Button
                        variant={lastSolvePenalty === '+2' ? 'primary' : 'ghost'}
                        onClick={() => void handleUpdateLastSolvePenalty('+2')}
                        disabled={loading}
                        className="h-9"
                      >
                        +2
                      </Button>
                      <Button
                        variant={lastSolvePenalty === 'DNF' ? 'primary' : 'ghost'}
                        onClick={() => void handleUpdateLastSolvePenalty('DNF')}
                        disabled={loading}
                        className="h-9"
                      >
                        DNF
                      </Button>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Date</span>
                      <span className="text-sm text-foreground">
                        {new Date(lastSolve.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {lastSolve.mlScore !== null && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Score</span>
                          <Badge variant="success">{lastSolve.mlScore.toFixed(2)}</Badge>
                        </div>
                        
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
                      </>
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