import React, { useState, useRef } from 'react';
import { Languages, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface AuthPageProps {
  readonly onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  readonly onRegister: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin, onRegister }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await (isRegistering
        ? onRegister(username, password)
        : onLogin(username, password));

      if (!result.success) {
        setError(result.error ?? 'An error occurred.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setIsRegistering(prev => !prev);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      {/* Background decorations */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-200/30 rounded-full blur-3xl" />
        <div className="absolute top-[30%] -right-[10%] w-[40%] h-[60%] bg-indigo-200/20 rounded-full blur-3xl opacity-60" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Languages size={28} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Lingua<span className="text-blue-600">Lens</span>
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            AI-powered Chinese learning platform
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            {isRegistering ? 'Create Account' : 'Welcome Back'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your username"
                autoComplete="username"
                required
                minLength={3}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your password"
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                required
                minLength={isRegistering ? 8 : 1}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isSubmitting}
            >
              {isRegistering ? (
                <>
                  <UserPlus size={16} className="mr-2" />
                  Create Account
                </>
              ) : (
                <>
                  <LogIn size={16} className="mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={switchMode}
              disabled={isSubmitting}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              {isRegistering
                ? 'Already have an account? Sign in'
                : "Don't have an account? Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
