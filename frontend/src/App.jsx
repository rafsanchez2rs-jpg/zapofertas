import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import NewAd from './pages/NewAd';
import Groups from './pages/Groups';
import History from './pages/History';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import Help from './pages/Help';

function FloatingSupport() {
  return (
    <a
      href="https://wa.me/5555999964716"
      target="_blank"
      rel="noreferrer"
      title="Suporte via WhatsApp"
      className="fixed bottom-6 right-6 z-50 w-13 h-13 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
      style={{ width: 52, height: 52, background: '#00d96c' }}
    >
      <MessageCircle size={24} className="text-black" />
    </a>
  );
}

function PrivateLayout({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-text-secondary text-sm">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-bg flex">
      <Navbar />
      <main className="flex-1 ml-64 p-6 overflow-auto animate-fade-in">
        {children}
      </main>
      <FloatingSupport />
    </div>
  );
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="min-h-screen bg-bg flex">
      <Navbar />
      <main className="flex-1 ml-64 p-6 overflow-auto animate-fade-in">
        {children}
      </main>
      <FloatingSupport />
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading, setupRequired } = useAuth();
  if (loading) return null;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <PrivateLayout>
                <Dashboard />
              </PrivateLayout>
            }
          />
          <Route
            path="/novo-anuncio"
            element={
              <PrivateLayout>
                <NewAd />
              </PrivateLayout>
            }
          />
          <Route
            path="/grupos"
            element={
              <PrivateLayout>
                <Groups />
              </PrivateLayout>
            }
          />
          <Route
            path="/historico"
            element={
              <PrivateLayout>
                <History />
              </PrivateLayout>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <PrivateLayout>
                <Settings />
              </PrivateLayout>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route
            path="/ajuda"
            element={
              <PrivateLayout>
                <Help />
              </PrivateLayout>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
