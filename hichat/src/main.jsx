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
      {currentPath === '/chat' && <App />}
      
      {currentPath === '/dashboard' && (
        <>
          <Navigation currentPath={currentPath} navigateTo={navigateTo} />
          <Dashboard />
        </>
      )}

      {currentPath !== '/chat' && currentPath !== '/dashboard' && (
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

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Main />
    </StrictMode>
  );
}


