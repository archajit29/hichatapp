import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

// Navigation bar with clickable Home Chat, Login, and Dashboard links
function Navigation() {
  return (
    <nav style={{ display: 'flex', gap: '1rem', padding: '0.5rem', backgroundColor: '#f0f0f0' }}>
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>Home Chat</Link>
      <Link to="/login" style={{ textDecoration: 'none', color: 'inherit' }}>Login</Link>
      <Link to="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>Dashboard</Link>
    </nav>
  );
}

// Main application component
function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Navigation />
        <main style={{ flex: 1, padding: '1rem' }}>
          <Routes>
            <Route path="/" element={<HomeChat />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

// Placeholder components (replace with actual implementations)
function HomeChat() {
  return <div>Yo! What's up?</div>;
}
function Login() {
  return <div>Login Page</div>;
}
function Dashboard() {
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Dashboard</h2>
      <p>This is the new dashboard page.</p>
    </div>
  );
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
