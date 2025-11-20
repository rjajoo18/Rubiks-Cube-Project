import React, { useState } from 'react';
import { solveCube, SolveResponse } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const COLORS = ['W', 'Y', 'R', 'O', 'B', 'G'];
const COLOR_CLASSES = {
  W: 'bg-cube-white text-black',
  Y: 'bg-cube-yellow text-black',
  R: 'bg-cube-red text-white',
  O: 'bg-cube-orange text-white',
  B: 'bg-cube-blue text-white',
  G: 'bg-cube-green text-white',
};

const FACE_NAMES = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'];

export const SolverPage: React.FC = () => {
  const [cubeState, setCubeState] = useState<string[]>(
    Array(54).fill('W')
  );
  const [solution, setSolution] = useState<SolveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStickerClick = (index: number) => {
    const currentColorIndex = COLORS.indexOf(cubeState[index]);
    const nextColorIndex = (currentColorIndex + 1) % COLORS.length;
    const newState = [...cubeState];
    newState[index] = COLORS[nextColorIndex];
    setCubeState(newState);
  };

  const validateCubeState = (state: string[]): string | null => {
    if (state.length !== 54) {
      return 'Invalid cube state: must have exactly 54 stickers';
    }

    const colorCounts: Record<string, number> = {};
    state.forEach(color => {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    });

    for (const color of COLORS) {
      if (colorCounts[color] !== 9) {
        return `Invalid cube state: each color must appear exactly 9 times (${color} appears ${colorCounts[color] || 0} times)`;
      }
    }

    return null;
  };

  const handleSolve = async () => {
    setError('');
    setLoading(true);
    setSolution(null);

    const validationError = validateCubeState(cubeState);
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    try {
      const stateString = cubeState.join('');
      const result = await solveCube(stateString, 'manual');
      setSolution(result);
    } 
    catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { data?: { error?: string; message?: string } } }).response;
        const msg = response?.data?.error || response?.data?.message;
        setError(msg || 'Failed to solve cube. Please check your input.');
      } else {
        setError('Failed to solve cube. Please check your input.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCubeState(Array(54).fill('W'));
    setSolution(null);
    setError('');
  };

  const renderFace = (faceIndex: number) => {
    const startIndex = faceIndex * 9;
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400 text-center">{FACE_NAMES[faceIndex]}</p>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => {
            const index = startIndex + i;
            const color = cubeState[index];
            return (
              <button
                key={index}
                onClick={() => handleStickerClick(index)}
                className={`w-10 h-10 rounded border-2 border-slate-700 ${COLOR_CLASSES[color as keyof typeof COLOR_CLASSES]} hover:opacity-80 transition-opacity duration-150 font-mono text-xs font-bold`}
              >
                {color}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold mb-2">Cube Solver</h1>
        <p className="text-slate-400">Input your cube state and get the solution</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="animate-scale-in">
          <h2 className="text-xl font-semibold mb-4">Cube Input</h2>
          <p className="text-sm text-slate-400 mb-6">
            Click each sticker to cycle through colors: W (White), Y (Yellow), R (Red), O (Orange), B (Blue), G (Green)
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>{renderFace(i)}</div>
            ))}
          </div>

          <div className="flex gap-4">
            <Button
              variant="primary"
              onClick={handleSolve}
              loading={loading}
              className="flex-1"
            >
              Solve Cube
            </Button>
            <Button variant="secondary" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          {error && (
            <Card className="bg-red-900/20 border-red-800 animate-scale-in">
              <p className="text-red-400">{error}</p>
            </Card>
          )}

          {solution && (
            <Card className="animate-scale-in">
              <h2 className="text-xl font-semibold mb-4">Solution</h2>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="info">{solution.numMoves} moves</Badge>
                  <span className="text-sm text-slate-400">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>

                <div className="p-4 bg-slate-950/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-2">Move Sequence</p>
                  <code className="text-base text-slate-100 font-mono break-all leading-relaxed">
                    {solution.moves}
                  </code>
                </div>

                <div className="p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-300">
                    <span className="font-semibold">Note:</span> Follow the move sequence from left to right. 
                    Standard notation: U (Up), D (Down), L (Left), R (Right), F (Front), B (Back). 
                    ' means counter-clockwise, 2 means 180 degrees.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {!solution && !error && (
            <Card className="text-center py-12 animate-fade-in">
              <div className="w-16 h-16 bg-gradient-to-br from-cube-red via-cube-blue to-cube-green rounded-2xl mx-auto mb-4 opacity-50"></div>
              <p className="text-slate-400">
                Configure your cube and click "Solve Cube" to see the solution
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
export default SolverPage;