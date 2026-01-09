import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import logo from '@/assets/logo.jpg';

type SkillMode = 'later' | 'wca' | 'self';

export const SignupPage: React.FC = () => {
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const [skillMode, setSkillMode] = useState<SkillMode>('later');
  const [wcaId, setWcaId] = useState<string>('');
  const [selfAvgSeconds, setSelfAvgSeconds] = useState<string>(''); // store as string for input UX

  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const { signup } = useAuth();
  const navigate = useNavigate();

  const selfAvgSecondsNumber = useMemo(() => {
    const x = Number(selfAvgSeconds);
    if (!Number.isFinite(x)) return null;
    return x;
  }, [selfAvgSeconds]);

  const validateSkillInputs = (): string | null => {
    if (skillMode === 'wca') {
      if (!wcaId.trim()) return 'Please enter your WCA ID (example: 2019DOEJ01).';
      if (wcaId.trim().length < 6) return 'That WCA ID looks too short.';
    }
    if (skillMode === 'self') {
      if (!selfAvgSeconds.trim()) return 'Please enter your average time in seconds.';
      if (selfAvgSecondsNumber == null) return 'Average must be a number (in seconds).';
      if (selfAvgSecondsNumber <= 0) return 'Average must be greater than 0.';
      if (selfAvgSecondsNumber > 300) return 'That average seems too high. Enter seconds (example: 18.5).';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const skillErr = validateSkillInputs();
    if (skillErr) {
      setError(skillErr);
      return;
    }

    setLoading(true);

    try {
      // 1) Create account (your AuthContext should also store token if that's how you implemented it)
      await signup(email, password, name);

      // 2) Optional: set skill data right away
      // If this fails because token isn't available yet, we fall back to onboarding.
      try {
        if (skillMode === 'wca') {
          await apiClient.linkWca(wcaId.trim());
          navigate('/dashboard');
          return;
        }

        if (skillMode === 'self' && selfAvgSecondsNumber != null) {
          await apiClient.setSelfReportedAverage(selfAvgSecondsNumber);
          navigate('/dashboard');
          return;
        }
      } catch (err) {
        // If skill endpoints fail for any reason, still allow user to continue.
        console.warn('Skill setup failed, sending to onboarding:', err);
      }

      // 3) If they chose "later" or skill setup failed, go to onboarding
      navigate('/onboarding');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response;
        setError(response?.data?.message || 'Signup failed. Please try again.');
      } else {
        setError('Signup failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-[1px] rounded-[1.75rem] bg-gradient-to-r from-cube-red/20 via-cube-blue/20 to-cube-green/20 blur opacity-60" />

          <Card className="relative rounded-[1.75rem] border border-border/70 shadow-2xl backdrop-blur animate-scale-in p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <img src={logo} alt="CubeIQ logo" className="w-12 h-12 rounded-xl object-cover mb-3" />
              <h1 className="text-2xl font-semibold">Create your account</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Track solves, stats, and improvement over time.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Input
                label="Name"
                type="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="John Doe"
                autoComplete="name"
                required
              />

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />

              {/* Skill setup */}
              <div className="pt-2">
                <p className="text-sm font-medium mb-2">Skill setup (optional)</p>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setSkillMode('later')}
                    className={`h-10 rounded-lg border px-3 text-sm text-left transition-colors ${
                      skillMode === 'later'
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:bg-muted/30'
                    }`}
                  >
                    Set up later
                  </button>

                  <button
                    type="button"
                    onClick={() => setSkillMode('wca')}
                    className={`h-10 rounded-lg border px-3 text-sm text-left transition-colors ${
                      skillMode === 'wca'
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:bg-muted/30'
                    }`}
                  >
                    Use my WCA profile
                  </button>

                  <button
                    type="button"
                    onClick={() => setSkillMode('self')}
                    className={`h-10 rounded-lg border px-3 text-sm text-left transition-colors ${
                      skillMode === 'self'
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:bg-muted/30'
                    }`}
                  >
                    Enter my average manually
                  </button>
                </div>

                {skillMode === 'wca' && (
                  <div className="mt-3">
                    <Input
                      label="WCA ID"
                      type="text"
                      value={wcaId}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWcaId(e.target.value)}
                      placeholder="2019DOEJ01"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This lets us set a better baseline for scoring.
                    </p>
                  </div>
                )}

                {skillMode === 'self' && (
                  <div className="mt-3">
                    <Input
                      label="3x3 average (seconds)"
                      type="number"
                      value={selfAvgSeconds}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelfAvgSeconds(e.target.value)}
                      placeholder="18.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter your typical average in seconds (example: 18.5).
                    </p>
                  </div>
                )}
              </div>

              <Button type="submit" variant="primary" loading={loading} className="w-full mt-2">
                Create account
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border/50">
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary hover:underline transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </Card>
        </div>

        <Card className="mt-4 border border-border/50 bg-card/70 p-4 backdrop-blur">
          <p className="text-xs text-center text-muted-foreground">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default SignupPage;
