import React, { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Premium Navigation Bar (using simple state-based navigation)
function Navigation({ currentPath, navigateTo }) {
  return (
    <nav className="premium-nav">
      <div className="nav-container">
        <div className="nav-logo" style={{ cursor: 'pointer' }} onClick={() => navigateTo('/chat')}>
          <span className="logo-text">HiChat</span>
        </div>
        <div className="nav-links">
          <button 
            className={`nav-link ${currentPath === '/chat' ? 'active' : ''}`}
            onClick={() => navigateTo('/chat')}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Chat
          </button>
          <button 
            className={`nav-link ${currentPath === '/dashboard' ? 'active' : ''}`}
            onClick={() => navigateTo('/dashboard')}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Dashboard
          </button>
          <button 
            className={`nav-link ${currentPath === '/login' ? 'active' : ''}`}
            onClick={() => navigateTo('/login')}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Login
          </button>
        </div>
      </div>
    </nav>
  );
}

// Premium Dashboard
function Dashboard() {
  return (
    <div className="page-container">
      <div className="premium-card">
        <h2>Enterprise Dashboard</h2>
        <p>Advanced analytics and workspace management coming soon.</p>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Active Users</span>
            <span className="stat-value">--</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Messages</span>
            <span className="stat-value">--</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Login page with username and password form
function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Placeholder action: you could add auth logic here
    alert(`Logging in as ${username}`);
  };

  return (
    <div className="login-page" style={{ padding: '2rem', maxWidth: '400px', margin: 'auto' }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>
        <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
          Sign In
        </button>
      </form>
    </div>
  );
}

// Main application component handling routing
function Main() {
  // Use location path, defaulting to /chat
  const [currentPath, setCurrentPath] = useState(() => {
    const path = window.location.pathname;
    return path === '/' || path === '' ? '/chat' : path;
  });

  // Handle navigation
  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/chat');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="app-shell">
      {/* Navigation is always rendered */}
      <Navigation currentPath={currentPath} navigateTo={navigateTo} />

      {/* Route specific content */}
      {currentPath === '/chat' && <App currentPath={currentPath} navigateTo={navigateTo} />}
      {currentPath === '/dashboard' && (
        <>
          <Navigation currentPath={currentPath} navigateTo={navigateTo} />
          <Dashboard />
        </>
      )}
      {currentPath === '/login' && (
        <>
          <Navigation currentPath={currentPath} navigateTo={navigateTo} />
          <Login />
        </>
      )}

      {/* Page Not Found */}
      {currentPath !== '/chat' && currentPath !== '/dashboard' && currentPath !== '/login' && (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <h2>Page Not Found</h2>
          <button className="btn-primary" onClick={() => navigateTo('/chat')}>
            Back to Chat
          </button>
        </div>
      )}
    </div>
  );
}

// App component for the chat route
function App({ currentPath, navigateTo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Navigation currentPath={currentPath} navigateTo={navigateTo} />
      <main style={{ flex: 1, padding: '1rem' }}>
        <h2>Chat</h2>
        <p>Welcome to the chat area.</p>
      </main>
    </div>
  );
}

// Placeholder components (replace with actual implementations)
function HomeChat() {
  return <div>Hey there! What's up?</div>;
}
function LoginPage() {
  return <div>Login Page</div>;
}
function Dashboard() {
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Dashboard</h2>
      <p>Hey there! This is the new dashboard page.</p>
    </div>
  );
}

// Render the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Main />
    </StrictMode>
  );
}
