import React, { useState, useEffect } from 'react';
import { Box, LogIn, UserPlus, Home, History, LogOut, Zap } from 'lucide-react';

// Types
interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

interface Solve {
  id: number;
  state: string;
  numMoves: number;
  source: string;
  createdAt: string;
}

// API Base URL - adjust this to your backend URL
const API_BASE = 'http://localhost:5000/api';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'login' | 'signup' | 'home' | 'solves'>('login');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [solves, setSolves] = useState<Solve[]>([]);
  const [cubeState, setCubeState] = useState<string>('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser();
      setCurrentPage('home');
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  };

  const fetchSolves = async () => {
    try {
      const res = await fetch(`${API_BASE}/solves`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSolves(data);
      }
    } catch (err) {
      console.error('Error fetching solves:', err);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        setCurrentPage('home');
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Account created! Please login.');
        setCurrentPage('login');
      } else {
        alert(data.error || 'Signup failed');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSolve = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/solve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ state: cubeState, source: 'manual' })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Solution found! Moves: ${data.moves.join(' ')} (${data.numMoves} moves)`);
      } else {
        alert(data.error || 'Solve failed');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setCurrentPage('login');
  };

  if (!token) {
    return currentPage === 'login' ? (
      <LoginPage onLogin={handleLogin} onSwitchToSignup={() => setCurrentPage('signup')} isLoading={isLoading} />
    ) : (
      <SignupPage onSignup={handleSignup} onSwitchToLogin={() => setCurrentPage('login')} isLoading={isLoading} />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      <nav className="bg-gray-800/50 backdrop-blur-lg border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <Box className="w-8 h-8 text-cyan-400" />
                <span className="text-xl font-bold text-white">CubeSolver</span>
              </div>
              <div className="hidden md:flex space-x-4">
                <button
                  onClick={() => setCurrentPage('home')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentPage === 'home' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <Home className="w-4 h-4 inline mr-2" />
                  Home
                </button>
                <button
                  onClick={() => {
                    setCurrentPage('solves');
                    fetchSolves();
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentPage === 'solves' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <History className="w-4 h-4 inline mr-2" />
                  History
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-300 text-sm hidden sm:block">Hey, {user?.name}!</span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'home' ? (
          <HomePage cubeState={cubeState} setCubeState={setCubeState} onSolve={handleSolve} isLoading={isLoading} />
        ) : (
          <SolvesPage solves={solves} />
        )}
      </main>
    </div>
  );
};

const LoginPage: React.FC<{ onLogin: (e: string, p: string) => void; onSwitchToSignup: () => void; isLoading: boolean }> = ({
  onLogin,
  onSwitchToSignup,
  isLoading
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Box className="w-16 h-16 text-cyan-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">CubeSolver</h1>
          <p className="text-gray-400">Solve any Rubik's cube instantly</p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-gray-700/50">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <LogIn className="w-6 h-6 mr-2 text-cyan-400" />
            Login
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              onClick={() => onLogin(email, password)}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Don't have an account?{' '}
              <button onClick={onSwitchToSignup} className="text-cyan-400 hover:text-cyan-300 font-medium">
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const SignupPage: React.FC<{ onSignup: (n: string, e: string, p: string) => void; onSwitchToLogin: () => void; isLoading: boolean }> = ({
  onSignup,
  onSwitchToLogin,
  isLoading
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Box className="w-16 h-16 text-cyan-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">CubeSolver</h1>
          <p className="text-gray-400">Create your account</p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-gray-700/50">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <UserPlus className="w-6 h-6 mr-2 text-cyan-400" />
            Sign Up
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              onClick={() => onSignup(name, email, password)}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Sign Up'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Already have an account?{' '}
              <button onClick={onSwitchToLogin} className="text-cyan-400 hover:text-cyan-300 font-medium">
                Login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const HomePage: React.FC<{ cubeState: string; setCubeState: (s: string) => void; onSolve: () => void; isLoading: boolean }> = ({
  cubeState,
  setCubeState,
  onSolve,
  isLoading
}) => {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Solve Your Cube</h1>
        <p className="text-gray-400">Enter your cube state and get the optimal solution</p>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-gray-700/50">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Cube State (54 characters: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB)
            </label>
            <textarea
              value={cubeState}
              onChange={(e) => setCubeState(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all font-mono text-sm"
              rows={3}
              placeholder="Enter 54-character cube state..."
            />
            <p className="text-sm text-gray-500 mt-2">
              Current length: {cubeState.length}/54
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Color Code:</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-white rounded"></div>
                <span className="text-gray-400">U = White (Up)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-gray-400">R = Red (Right)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-gray-400">F = Green (Front)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-400 rounded"></div>
                <span className="text-gray-400">D = Yellow (Down)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span className="text-gray-400">L = Orange (Left)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-gray-400">B = Blue (Back)</span>
              </div>
            </div>
          </div>

          <button
            onClick={onSolve}
            disabled={isLoading || cubeState.length !== 54}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-4 rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <Zap className="w-5 h-5" />
            <span>{isLoading ? 'Solving...' : 'Solve Cube'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const SolvesPage: React.FC<{ solves: Solve[] }> = ({ solves }) => {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Solve History</h1>
        <p className="text-gray-400">Your recent cube solutions</p>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-gray-700/50">
        {solves.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No solves yet</p>
            <p className="text-gray-500 text-sm mt-2">Start solving cubes to see your history here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {solves.map((solve) => (
              <div
                key={solve.id}
                className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 hover:border-cyan-500/50 transition-all"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-xs font-semibold text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded">
                        {solve.source}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(solve.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 font-mono break-all">{solve.state}</p>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-2xl font-bold text-white">{solve.numMoves}</div>
                    <div className="text-xs text-gray-500">moves</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;