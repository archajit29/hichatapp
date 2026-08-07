import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

// Navigation bar with clickable Home Chat and Login links
function Navigation() {
  return (
    <nav style={{ display: 'flex', gap: '1rem', padding: '0.5rem', backgroundColor: '#f0f0f0' }}>
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>Home Chat</Link>
      <Link to="/login" style={{ textDecoration: 'none', color: 'inherit' }}>Login</Link>
    </nav>
  );
}

// Main application component
function App() {
  return (
    <Router>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Navigation />
        <main style={{ flex: 1, padding: '1rem' }}>
          <Routes>
            <Route path="/" element={<HomeChat />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

// Placeholder components (replace with actual implementations)
function HomeChat() {
  return <div>Welcome to the Home Chat!</div>;
}
function Login() {
  return <div>Login Page</div>;
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
