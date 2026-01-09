import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import logo from '@/assets/logo.jpg';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response;
        setError(response?.data?.message || 'Login failed. Please try again.');
      } else {
        setError('Login failed. Please try again.');
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

          <Card className="relative rounded-[1.75rem] border border-border/70 shadow-2xl backdrop-blur animate-scale-in">
            <div className="text-center space-y-3 mb-8">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center">
                <img
                  src={logo}
                  alt="CubeIQ logo"
                  className="h-12 w-12 rounded-xl object-cover shadow-lg"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
                <p className="text-muted-foreground">Sign in to continue solving cubes</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

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
                autoComplete="current-password"
                required
              />

              <Button type="submit" variant="primary" loading={loading} className="w-full mt-6">
                Sign in
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border/50">
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/signup" className="font-medium text-primary hover:underline transition-colors">
                  Sign up
                </Link>
              </p>
            </div>
          </Card>
        </div>

        <Card className="mt-4 border border-border/50 bg-card/70 p-4 backdrop-blur">
          <p className="text-xs text-center text-muted-foreground">
            Secure login powered by industry-standard encryption
          </p>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
