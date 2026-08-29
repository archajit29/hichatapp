import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WelcomePage from './pages/WelcomePage';
import Login from './pages/Login';
import Chat from './pages/Chat';
import { ShieldCheck, LogOut, Key, User } from 'lucide-react';
import { useAuthStore } from './store/auth.store';
import ProtectedRoute from './routes/ProtectedRoute';

// Sleek Glassmorphism Navigation Bar
function Navigation({ isLoggedIn, username, onLogout }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 md:px-12 py-4 bg-[#070913]/90 backdrop-blur-xl border-b border-white/10 text-white shadow-2xl w-full">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-600/30 group-hover:scale-105 transition-transform">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-white group-hover:text-purple-300 transition">
            hichat <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-400">E2EE</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1.5 bg-gray-900/70 p-1 rounded-xl border border-white/5">
          <Link
            to="/"
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isActive('/') || isActive('/home')
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Home
          </Link>
          <Link
            to="/welcome"
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isActive('/welcome')
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Security & Docs
          </Link>
          <Link
            to="/chat"
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isActive('/chat')
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Chat Stream
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <Link
              to="/chat"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 text-xs text-purple-200 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <User className="w-3.5 h-3.5 text-purple-400" />
              <strong className="text-white font-semibold">{username}</strong>
            </Link>
            <button
              className="flex items-center gap-1.5 bg-gray-900 hover:bg-rose-950/50 border border-white/10 hover:border-rose-500/40 text-gray-300 hover:text-rose-300 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
              onClick={onLogout}
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/25 transition-all transform hover:-translate-y-0.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Unlock Vault</span>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

// Global Footer Component
function Footer() {
  return (
    <footer className="py-8 text-center text-gray-500 text-xs border-t border-white/5 w-full bg-[#070913]">
      <p>© 2026 hichat Enterprise Platform. Zero-Knowledge E2EE Architecture.</p>
    </footer>
  );
}

// Layout wrapper
function MainLayout() {
  const location = useLocation();
  const isChatRoute = location.pathname === '/chat';
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="min-h-screen bg-[#070913] text-white flex flex-col font-sans w-full">
      {!isChatRoute && (
        <Navigation 
          isLoggedIn={isAuthenticated} 
          username={user?.username} 
          onLogout={logout} 
        />
      )}
      
      <main className="flex-1 flex flex-col w-full">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/chat" element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          } />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
              <h2 className="text-5xl font-extrabold text-purple-400 mb-4">404</h2>
              <p className="text-gray-400 mb-6">Page Not Found</p>
              <Link to="/" className="px-6 py-2.5 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-purple-500 transition">
                Return Home
              </Link>
            </div>
          } />
        </Routes>
      </main>
      
      {!isChatRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MainLayout />
    </BrowserRouter>
  );
}
