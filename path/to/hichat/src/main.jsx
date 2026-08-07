import React from 'react';
import ReactDOM from 'react-dom/client';

// Navigation bar with clickable Home Chat, Login, and Dashboard links
function Navigation() {
  return (
    <nav style={{ display: 'flex', gap: '1rem', padding: '0.5rem', backgroundColor: '#f0f0f0' }}>
      <a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>Home Chat</a>
      <a href="/login" style={{ textDecoration: 'none', color: 'inherit' }}>Login</a>
      <a href="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>Dashboard</a>
    </nav>
  );
}

// Main application component
function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Navigation />
      <main style={{ flex: 1, padding: '1rem' }}>
        <h2>Dashboard</h2>
        <p>Hey there! This is the new dashboard page.</p>
      </main>
    </div>
  );
}

// Placeholder components (replace with actual implementations)
function HomeChat() {
  return <div>Hey there! What's up?</div>;
}
function Login() {
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
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
