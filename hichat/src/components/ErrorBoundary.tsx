import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#070913] text-white flex items-center justify-center p-6 font-sans">
          <div className="bg-gray-900/90 border border-rose-500/30 p-8 rounded-3xl max-w-md w-full shadow-2xl backdrop-blur-2xl text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto mb-5 shadow-lg shadow-rose-600/20">
              <ShieldAlert size={32} />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Vault Render Protection</h2>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              An unexpected render anomaly was safely isolated by the HiChat Error Boundary.
              {this.state.error?.message && (
                <span className="block mt-2 font-mono text-[11px] text-rose-300 bg-rose-950/50 p-2.5 rounded-xl border border-rose-500/20 break-all text-left">
                  {this.state.error.message}
                </span>
              )}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Home size={14} />
                <span>Return Home</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-purple-600/25 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Reload Vault</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
