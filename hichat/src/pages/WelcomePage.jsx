import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Zap, Key, ArrowRight, MessageSquare, Sparkles } from "lucide-react";

export default function WelcomePage() {
  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#070913] text-white flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden font-sans">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-purple-600/20 via-indigo-600/20 to-cyan-500/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* Hero Content */}
      <div className="max-w-3xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-xs font-semibold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero-Knowledge Architecture</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Welcome to <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">hichat Enterprise</span>
        </h1>

        <p className="text-lg text-gray-300 max-w-xl mx-auto font-light leading-relaxed">
          High-performance, military-grade end-to-end encrypted messaging designed for modern distributed teams.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link
            to="/chat"
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-sm shadow-xl shadow-purple-600/30 transition flex items-center gap-2 group"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Chat Stream</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/login"
            className="px-8 py-3.5 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-200 font-semibold text-sm transition"
          >
            Unlock Key Vault
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-12 text-left">
          <div className="p-5 rounded-2xl bg-gray-900/60 border border-white/5 backdrop-blur-md">
            <Key className="w-6 h-6 text-purple-400 mb-2" />
            <h4 className="font-bold text-white text-sm mb-1">Local Key Vaults</h4>
            <p className="text-xs text-gray-400 font-light leading-relaxed">ECDH Curve P-256 keys derived in browser memory.</p>
          </div>
          <div className="p-5 rounded-2xl bg-gray-900/60 border border-white/5 backdrop-blur-md">
            <Lock className="w-6 h-6 text-cyan-400 mb-2" />
            <h4 className="font-bold text-white text-sm mb-1">AES-GCM-256</h4>
            <p className="text-xs text-gray-400 font-light leading-relaxed">Authenticated encryption with unique random IVs.</p>
          </div>
          <div className="p-5 rounded-2xl bg-gray-900/60 border border-white/5 backdrop-blur-md">
            <Zap className="w-6 h-6 text-emerald-400 mb-2" />
            <h4 className="font-bold text-white text-sm mb-1">Zero-Trust Relays</h4>
            <p className="text-xs text-gray-400 font-light leading-relaxed">Fast Socket.io stream blinded to message content.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
