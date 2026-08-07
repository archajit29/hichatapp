import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { io } from 'socket.io-client';

// Initialize socket connection to the backend
const socket = io('http://localhost:3001'); // adjust if using a different URL

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
socket.emit('join', {
  username: 'DemoUser',
  publicKey: 'demoPublicKey', // replace with actual public key if needed
  room: 'general',
  status: 'online',
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
