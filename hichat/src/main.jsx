import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { io } from 'socket.io-client';

// Initialize socket connection to the backend
// Use environment variable for flexibility; fallback to localhost
let socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
  auth: {
    // Assuming you store a JWT or other auth token in localStorage
    token: localStorage.getItem('access_token') || '',
  },
});

// Function to (re)initialize the socket with the current token
function initSocket() {
  const token = localStorage.getItem('access_token');
  socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
    auth: {
      token,
    },
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('❗ Socket connection error:', err);
  });

  // Auto‑join a default room after connection
  socket.on('connect', () => {
    socket.emit('join', {
      username: 'DemoUser',
      publicKey: 'demoPublicKey', // replace with actual public key if needed
      room: 'general',
      status: 'online',
    });
  });

  // Handle join acknowledgment
  socket.on('joined', (data) => {
    console.log('✅ Joined room:', data);
  });

  // Handle messages
  socket.on('message', (payload) => {
    console.log('📨 Received message:', payload);
    // TODO: display message in UI
  });

  return socket;
}

// Initialize socket on page load if a token is already present
if (localStorage.getItem('access_token')) {
  initSocket();
}

// Handle login form submission
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.token);
        // Re‑initialize socket with the new token
        initSocket();
        console.log('✅ Logged in');
    } else {
      const err = await response.json();
      alert(err.error || 'Login failed');
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
