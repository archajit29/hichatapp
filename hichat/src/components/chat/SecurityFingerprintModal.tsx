import React from 'react';
import { ShieldCheck, CheckCheck } from 'lucide-react';

interface SecurityFingerprintModalProps {
  user: { username: string; fingerprint: string } | null;
  onClose: () => void;
}

export function SecurityFingerprintModal({ user, onClose }: SecurityFingerprintModalProps) {
  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-500/40 p-7 rounded-3xl w-full max-w-md shadow-2xl text-center animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mx-auto mb-4 shadow-lg shadow-purple-600/20">
          <ShieldCheck size={32} />
        </div>

        <h2 className="text-xl font-bold text-white mb-1">Cryptographic Fingerprint</h2>
        <p className="text-xs text-gray-400 mb-5">
          Public Key verification for <strong className="text-purple-300">@{user.username}</strong>
        </p>

        <div className="bg-gray-950 p-4 rounded-2xl border border-purple-900/60 font-mono text-xs text-purple-300 break-all my-4 shadow-inner">
          {user.fingerprint}
        </div>

        <div className="text-[11px] text-gray-400 text-left bg-white/5 p-3 rounded-xl mb-5 space-y-1">
          <div>
            • Algorithm: <strong>ECDH P-256 (NIST Curve)</strong>
          </div>
          <div>
            • Cipher: <strong>AES-GCM-256 Authenticated Encryption</strong>
          </div>
          <div>
            • Key Exchange: <strong>Zero-Trust Client Derived</strong>
          </div>
        </div>

        <button
          type="button"
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
          onClick={onClose}
        >
          <CheckCheck size={16} /> Verified & Authentic
        </button>
      </div>
    </div>
  );
}
