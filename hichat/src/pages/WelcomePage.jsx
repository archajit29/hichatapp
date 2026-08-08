import React from "react";
import { Link } from "react-router-dom";

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Premium gradient navbar */}
      <nav className="flex justify-between items-center px-8 py-4 bg-gradient-to-r from-purple-900 to-indigo-900">
        <Link to="/welcome" className="text-2xl font-extrabold tracking-tighter text-white">
          hichat
        </Link>
        <div className="flex gap-6">
          <Link to="/" className="text-white/80 hover:text-white transition">
            Home
          </Link>
          <Link to="/chat" className="text-white/80 hover:text-white transition">
            Chat
          </Link>
          <Link to="/login" className="text-white/80 hover:text-white font-semibold transition">
            Login
          </Link>
        </div>
      </nav>

      {/* Hero section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-5xl font-bold mb-4">Welcome to hichat Enterprise</h1>
        <p className="text-lg mb-8">
          Secure, fast, and premium messaging for your team.
        </p>
        <Link
          to="/chat"
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded"
        >
          Get Started
        </Link>
      </section>
    </div>
  );
}
