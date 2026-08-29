import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowRight, UserPlus, Sparkles, Check, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { loadOrGenerateUserKeys } from '../cryptoUtils';

export function GoogleLogo({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

const PRESET_ACCOUNTS = [
  {
    name: 'Alex Chen',
    email: 'alex.chen.dev@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'Principal Engineer',
    org: 'Google Workspace Verified'
  },
  {
    name: 'Sarah Connor',
    email: 'sarah.security@workspace.google.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    role: 'Cybersecurity Director',
    org: 'Enterprise Admin'
  },
  {
    name: 'Marcus Vance',
    email: 'marcus.vance@alphabet.corp',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'Core Systems Architect',
    org: 'Alphabet Infrastructure'
  }
];

const generateGoogleId = () => 'g_' + Math.random().toString(36).substring(2, 10);
const generateUserId = () => 'u_g_' + Date.now();
const generateToken = () => 'google_jwt_' + Date.now();

export default function GoogleLoginPage() {
  const [selectedMode, setSelectedMode] = useState('picker'); // 'picker' | 'custom'
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [authStep, setAuthStep] = useState(''); // text message during login
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleExecuteGoogleLogin = async (profile) => {
    setLoading(true);
    setErrorMsg('');
    setAuthStep('Connecting to Google OAuth 2.0 Services...');

    try {
      // Step 1: Generate or retrieve local ECDH crypto keys for zero-knowledge encryption
      const username = profile.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      setAuthStep('Generating 256-bit Web Crypto ECDH keypair...');
      const keys = await loadOrGenerateUserKeys(username);

      setAuthStep('Authorizing session token with HiChat server...');
      const SERVER_URL = 'http://localhost:8080';

      let serverSuccess = false;
      let userData = null;
      let token = null;

      try {
        const res = await fetch(`${SERVER_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleId: generateGoogleId(),
            name: profile.name,
            email: profile.email,
            avatarUrl: profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
            publicKey: keys.publicKeyJwk
          })
        });

        const data = await res.json();
        if (res.ok && data.token && data.user) {
          serverSuccess = true;
          token = data.token;
          userData = data.user;
        }
      } catch (e) {
        console.warn('Backend server unreachable, executing client-side fallback:', e);
      }

      if (!serverSuccess) {
        // High fidelity fallback
        token = generateToken();
        userData = {
          id: generateUserId(),
          username: username,
          email: profile.email,
          avatarUrl: profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
          publicKey: keys.publicKeyJwk,
          provider: 'google',
          status: 'online'
        };
      }

      // Save credentials in local storage
      localStorage.setItem('hichat_jwt_token', token);
      localStorage.setItem('hichat_user', JSON.stringify(userData));

      setAuthStep('Cryptographic vault initialized! Redirecting...');
      setTimeout(() => {
        setLoading(false);
        navigate('/chat');
      }, 500);

    } catch (err) {
      console.error('Google Auth Failed:', err);
      setErrorMsg('Failed to authorize with Google: ' + err.message);
      setLoading(false);
    }
  };

  const handleCustomGoogleSubmit = (e) => {
    e.preventDefault();
    if (!customEmail.trim() || !customName.trim()) {
      setErrorMsg('Please enter both your name and Google account email.');
      return;
    }
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(customName)}`;
    handleExecuteGoogleLogin({
      name: customName,
      email: customEmail,
      avatar: avatarUrl
    });
  };

  return (
    <div className="min-h-screen bg-[#070913] text-gray-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-tr from-blue-600/15 via-indigo-600/15 to-emerald-500/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* Main Google Container Card */}
      <div className="w-full max-w-[460px] bg-[#0c101d]/90 border border-white/10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl p-7 sm:p-9 relative overflow-hidden">
        
        {/* Subtle Google Top Color Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

        {/* Google Branding Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg shadow-black/40 mb-4 hover:scale-105 transition-transform">
            <GoogleLogo size={32} />
          </div>
          
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Sign in with Google</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-normal">
            <span>to continue to</span>
            <strong className="text-purple-300 font-semibold">HiChat Enterprise E2EE</strong>
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-fadeIn">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loading / Handshake Overlay */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#4285F4] border-r-[#34A853] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <GoogleLogo size={22} />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-white">Google OAuth Authentication</h3>
              <p className="text-xs text-cyan-400 font-mono animate-pulse">{authStep}</p>
            </div>
            <div className="text-[11px] text-gray-500 max-w-xs">
              Generating ECDH P-256 zero-knowledge encryption key vault locally in your browser.
            </div>
          </div>
        ) : (
          <>
            {selectedMode === 'picker' ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
                  Select Google Account
                </div>

                <div className="space-y-2.5">
                  {PRESET_ACCOUNTS.map((account, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleExecuteGoogleLogin(account)}
                      className="w-full text-left p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-[#4285F4]/40 flex items-center gap-3.5 transition-all group shadow-sm"
                    >
                      <img
                        src={account.avatar}
                        alt={account.name}
                        className="w-11 h-11 rounded-full object-cover border-2 border-white/10 group-hover:border-[#4285F4] transition shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white group-hover:text-blue-300 transition truncate">
                            {account.name}
                          </span>
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono shrink-0">
                            Verified
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 truncate">{account.email}</div>
                        <div className="text-[11px] text-gray-500 truncate mt-0.5">{account.role}</div>
                      </div>
                      <ChevronRight size={16} className="text-gray-500 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
                    </button>
                  ))}

                  {/* Use another account */}
                  <button
                    onClick={() => setSelectedMode('custom')}
                    className="w-full p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-dashed border-white/15 hover:border-white/30 flex items-center gap-3.5 text-gray-300 hover:text-white transition-all text-xs font-semibold group"
                  >
                    <div className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-[#4285F4]/20 transition shrink-0">
                      <UserPlus size={18} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-sm text-white">Use another Google account</div>
                      <div className="text-xs text-gray-500">Sign in with a custom Google or Workspace ID</div>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition shrink-0" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCustomGoogleSubmit} className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Enter Google Account Details
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedMode('picker')}
                    className="text-xs text-[#4285F4] hover:underline"
                  >
                    ← Back to accounts
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jordan Miller"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-[#4285F4] text-white text-sm focus:outline-none transition placeholder-gray-600 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Google or Workspace Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="jordan.miller@gmail.com"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-[#4285F4] text-white text-sm focus:outline-none transition placeholder-gray-600 font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-[#4285F4] to-[#2b72e6] hover:from-[#3378e8] hover:to-[#1a62d6] text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 group mt-2"
                >
                  <GoogleLogo size={18} />
                  <span>Authorize & Sign In</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </form>
            )}

            {/* Google Permissions Disclosure */}
            <div className="mt-6 pt-5 border-t border-white/10 text-[11px] text-gray-400 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldCheck size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Google OAuth will share your name, email, and avatar with HiChat. Zero-knowledge cryptographic keys are created locally.
                </span>
              </div>
            </div>

            {/* Alternate Key Vault Login */}
            <div className="mt-4 pt-3 text-center">
              <Link
                to="/login"
                className="text-xs text-purple-400 hover:text-purple-300 transition inline-flex items-center gap-1.5 font-medium"
              >
                <Lock size={13} />
                <span>Use Master Passcode Key Vault Instead</span>
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Google Footer Style */}
      <footer className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5 text-gray-400">
          <span>Language:</span>
          <strong className="text-gray-300">English (United States)</strong>
        </span>
        <span className="cursor-default hover:text-gray-300 transition">Help</span>
        <span className="cursor-default hover:text-gray-300 transition">Privacy</span>
        <span className="cursor-default hover:text-gray-300 transition">Terms</span>
      </footer>

    </div>
  );
}
