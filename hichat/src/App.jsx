import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Login from './pages/Login';
import Chat from './pages/Chat';

// Premium Navigation Bar (Global for Chat/Login)
function Navigation({ isLoggedIn, username, onLogout }) {
  return (
    <nav className="flex justify-between items-center px-8 py-4 bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-lg w-full">
      <div className="flex items-center gap-8">
        <Link to="/welcome" className="text-2xl font-extrabold tracking-tighter text-white hover:text-purple-300 transition">hichat</Link>
        <div className="flex gap-6">
          <Link to="/" className="text-white/80 hover:text-white transition">Home</Link>
          <Link to="/chat" className="text-white/80 hover:text-white transition">Chat</Link>
          <Link to="/login" className="text-white/80 hover:text-white font-semibold transition">
            {isLoggedIn ? 'Vault Profile' : 'Login'}
          </Link>
        </div>
      </div>
      
      {isLoggedIn && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/60">
            Secure Session: <strong className="text-white">{username}</strong>
          </span>
          <button 
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm transition"
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}

function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col overflow-x-hidden">
      {/* Navigation Header */}
      <nav className="w-full flex justify-between items-center px-8 py-4 bg-gradient-to-r from-purple-900 to-indigo-900">
        <Link to="/welcome" className="text-2xl font-bold text-white cursor-pointer">hichat</Link>
        <div className="space-x-6">
          <Link to="/" className="text-white hover:text-purple-300">Home</Link>
          <Link to="/chat" className="text-white hover:text-purple-300">Chat</Link>
          <Link to="/login" className="text-white hover:text-purple-300 font-semibold">Login</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-6xl font-extrabold text-white mb-6 tracking-tight">Welcome to hichat</h1>
        <p className="text-xl text-gray-400 max-w-2xl mb-10 leading-relaxed">
          Experience the future of real-time messaging. End-to-end encrypted, high-performance, and beautifully designed.
        </p>
        <div className="flex space-x-4">
          <Link to="/chat" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition">
            Launch Chat Stream
          </Link>
          <Link to="/login" className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition">
            Unlock Key Vault
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-6 bg-[#0a0a0f] text-gray-600 text-sm border-t border-gray-800">
        © 2025 hichat Enterprise. All rights reserved.
      </footer>
    </div>
  );
}

function WelcomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col overflow-x-hidden">
      {/* Navigation Header */}
      <nav className="w-full flex justify-between items-center px-8 py-4 bg-gradient-to-r from-purple-900 to-indigo-900">
        <Link to="/welcome" className="text-2xl font-bold text-white cursor-pointer">hichat</Link>
        <div className="space-x-6">
          <Link to="/" className="text-white hover:text-purple-300">Home</Link>
          <Link to="/chat" className="text-white hover:text-purple-300">Chat</Link>
          <Link to="/login" className="text-white hover:text-purple-300 font-semibold">Login</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-6xl font-extrabold text-white mb-6 tracking-tight">Welcome to hichat</h1>
        <p className="text-xl text-gray-400 max-w-2xl mb-10 leading-relaxed">
          Experience the future of real-time messaging. End-to-end encrypted, high-performance, and beautifully designed.
        </p>
        <div className="flex space-x-4">
          <Link to="/chat" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition">
            Launch Chat Stream
          </Link>
          <Link to="/login" className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition">
            Unlock Key Vault
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-6 bg-[#0a0a0f] text-gray-600 text-sm border-t border-gray-800">
        © 2025 hichat Enterprise. All rights reserved.
      </footer>
    </div>
  );
}

// Footer Component (Global for Chat/Login)
function Footer() {
  return (
    <footer className="py-8 text-center text-gray-500 text-sm border-t border-white/5 w-full">
      <p>© 2025 hichat Enterprise. All rights reserved.</p>
    </footer>
  );
}

export default function App() {
  const [session, setSession] = useState({
    isLoggedIn: false,
    username: '',
  });

  const syncSession = () => {
    const token = localStorage.getItem('hichat_jwt_token');
    const userStr = localStorage.getItem('hichat_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setSession({ isLoggedIn: true, username: user.username });
      } catch (e) {
        setSession({ isLoggedIn: false, username: '' });
      }
    } else {
      setSession({ isLoggedIn: false, username: '' });
    }
  };

  useEffect(() => {
    syncSession();
    const interval = setInterval(syncSession, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('hichat_jwt_token');
    localStorage.removeItem('hichat_user');
    setSession({ isLoggedIn: false, username: '' });
    window.location.href = '/login';
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        
        {/* For Chat and Login, we use the standard layout with global nav/footer */}
        <Route path="/chat" element={
          <div className="min-h-screen bg-gray-950 text-white flex flex-col">
            <Navigation isLoggedIn={session.isLoggedIn} username={session.username} onLogout={handleLogout} />
            <main className="flex-grow flex flex-col"><Chat /></main>
            <Footer />
          </div>
        } />
        
        <Route path="/login" element={
          <div className="min-h-screen bg-gray-950 text-white flex flex-col">
            <Navigation isLoggedIn={session.isLoggedIn} username={session.username} onLogout={handleLogout} />
            <main className="flex-grow flex flex-col"><Login /></main>
            <Footer />
          </div>
        } />

        <Route path="*" element={
          <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
            <h2 className="text-4xl font-bold mb-4">404 - Not Found</h2>
            <Link to="/" className="text-indigo-400 hover:underline">Return Home</Link>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}