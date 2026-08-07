import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { io } from 'socket.io-client';

// Initialize socket connection to the backend
// Use environment variable for flexibility; fallback to localhost
const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
  auth: {
    // Assuming you store a JWT or other auth token in localStorage
    token: localStorage.getItem('access_token') || '',
  },
});

// Log connection status
socket.on('connect', () => {
  console.log('🔌 Socket connected');
});

socket.on('disconnect', () => {
  console.log('❌ Socket disconnected');
});

socket.on('connect_error', (err) => {
  console.error('❗ Socket connection error:', err);
});

// Auto‑join a default room with a sample user (replace with real user data)
// This is sent after the socket is confirmed connected
socket.on('connect', () => {
  socket.emit('join', {
    username: 'DemoUser',
    publicKey: 'demoPublicKey', // replace with actual public key if needed
    room: 'general',
    status: 'online',
  });
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
