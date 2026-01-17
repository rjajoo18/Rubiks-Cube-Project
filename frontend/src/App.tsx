import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { LoginPage } from '@/routes/Auth/LoginPage';
import { SignupPage } from '@/routes/Auth/SignupPage';
import { DashboardPage } from '@/routes/Dashboard/DashboardPage';
import { SolverPage } from '@/routes/Solver/SolverPage';
import { HistoryPage } from '@/routes/Solver/HistoryPage';
import FriendsPage from '@/routes/Friends/FriendsPage';
import { NotFoundPage } from '@/NotFoundPage';

const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <SignupPage />} />
      
      <Route
        path="/"
        element={
          user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
        }
      />
      
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell>
              <DashboardPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/solve"
        element={
          <ProtectedRoute>
            <AppShell>
              <SolverPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <AppShell>
              <HistoryPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <AppShell>
              <FriendsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;