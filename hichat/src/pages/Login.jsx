import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Key, ShieldCheck, User, Mail, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { useSignalKeys } from '../hooks/useSignalKeys';

export default function Login() {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const navigate = useNavigate();
  const { login, register, loading, error, clearError, isAuthenticated } = useAuthStore();
  const { initializeAndUploadKeys } = useSignalKeys();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (isRegisterMode) {
        await register({ username, email, password });
        // After successful registration, initialize signal keys via hook
        try {
          await initializeAndUploadKeys(username);
        } catch (keyErr) {
          console.error('Signal key initialization failed, but user was registered', keyErr);
        }
      } else {
        await login({ username, password });
      }
    } catch (err) {
      console.error('Authentication failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#070913] text-white flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
      
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-gradient-to-tr from-purple-600/20 via-indigo-600/20 to-cyan-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Main Glass Vault Card */}
      <div className="bg-gray-900/70 border border-purple-500/30 p-8 md:p-10 rounded-3xl shadow-2xl backdrop-blur-2xl w-full max-w-md relative overflow-hidden">
        
        {/* Shimmer effect bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400" />

        {/* Lock Icon */}
        <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mx-auto mb-6 shadow-lg shadow-purple-600/20">
          <Key className="w-7 h-7" />
        </div>

        <h2 className="text-3xl font-extrabold text-center bg-gradient-to-r from-purple-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent mb-2">
          {isRegisterMode ? 'Create Security Vault' : 'Unlock Key Vault'}
        </h2>
        <p className="text-xs text-gray-400 text-center mb-8">
          {isRegisterMode 
            ? 'Generate E2EE keys for zero-knowledge chat' 
            : 'Enter credentials to authorize session stream'}
        </p>

        {/* Tab Selector */}
        <div className="flex bg-gray-950/80 p-1 rounded-xl border border-white/5 mb-6">
          <button
            type="button"
            onClick={() => { setIsRegisterMode(false); clearError(); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              !isRegisterMode 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegisterMode(true); clearError(); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              isRegisterMode 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Create Vault
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none transition font-sans placeholder-gray-600"
                placeholder="e.g. alex_developer"
              />
              <User className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
            </div>
          </div>

          {isRegisterMode && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none transition font-sans placeholder-gray-600"
                  placeholder="alex@enterprise.com"
                />
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Master Security Passcode
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none transition font-sans placeholder-gray-600"
                placeholder="••••••••••••"
              />
              <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-sm rounded-xl shadow-xl shadow-purple-600/30 transition flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing Vault...
              </span>
            ) : (
              <>
                <span>{isRegisterMode ? 'Generate Keys & Register' : 'Authorize & Unlock Vault'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Unlock Option */}
        <div className="mt-6 pt-6 border-t border-white/10 text-center">
          <button
            type="button"
            onClick={() => {
              setUsername('demo_enterprise_user');
              setPassword('demo1234');
              login({ username: 'demo_enterprise_user', password: 'demo1234' });
            }}
            className="text-xs text-purple-400 hover:text-purple-300 transition flex items-center justify-center gap-1.5 mx-auto font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Instant Demo Vault Login</span>
          </button>
        </div>

        <p className="mt-6 text-xs text-center text-gray-500">
          Back to <Link to="/" className="text-gray-300 hover:text-white underline transition">Home Overview</Link>
        </p>

      </div>
    </div>
  );
}
