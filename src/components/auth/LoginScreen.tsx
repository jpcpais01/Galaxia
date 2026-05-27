'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth-store';

function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5,
      speed: Math.random() * 0.3 + 0.05,
      a: Math.random() * 0.8 + 0.2,
    }));

    let anim = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00000f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const s of stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.max(1, Math.round(s.r)), Math.max(1, Math.round(s.r)));
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
      }
      ctx.globalAlpha = 1;
      anim = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(anim); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" />;
}

export default function LoginScreen() {
  const { login, register, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (mode === 'login') await login(username, password);
    else await register(username, password);
  };

  const toggle = () => { setMode(m => m === 'login' ? 'register' : 'login'); clearError(); };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden">
      <StarField />

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm px-4">
        {/* Logo */}
        <div className="text-center">
          <h1 className="font-pixel text-3xl text-accent-cyan glow-text-cyan tracking-wider mb-2 flicker">
            GALAXIA
          </h1>
          <p className="font-mono text-[11px] text-[#5a8aa0] tracking-widest uppercase">
            Space Conquest
          </p>
          <div className="mt-1 h-px w-32 mx-auto bg-gradient-to-r from-transparent via-accent-cyan to-transparent opacity-50" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full pixel-panel-glow p-6 flex flex-col gap-4">
          <div className="panel-header text-center">
            {mode === 'login' ? '— LOGIN —' : '— REGISTER —'}
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[9px] text-[#5a8aa0] uppercase tracking-wider">
              Commander Name
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="enter username"
              maxLength={20}
              autoComplete="username"
              className="
                bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0]
                font-mono text-sm px-3 py-2
                focus:outline-none focus:border-accent-cyan focus:shadow-glow-cyan
                placeholder-[#2a3a4a] transition-all
              "
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[9px] text-[#5a8aa0] uppercase tracking-wider">
              Access Code
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="enter password"
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="
                bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0]
                font-mono text-sm px-3 py-2
                focus:outline-none focus:border-accent-cyan focus:shadow-glow-cyan
                placeholder-[#2a3a4a] transition-all
              "
              required
            />
          </div>

          {error && (
            <div className="font-mono text-[11px] text-[#ff4455] bg-[#ff445511] border border-[#ff445533] px-3 py-2 fade-in">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-cyan w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] py-3"
          >
            {loading
              ? '[ PROCESSING... ]'
              : mode === 'login' ? '[ ENGAGE ]' : '[ ENLIST ]'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-2">
          <button onClick={toggle} className="font-mono text-[11px] text-[#3a5a6a] hover:text-[#6a9ab0] transition-colors">
            {mode === 'login' ? 'No account? Register →' : '← Back to login'}
          </button>
          <p className="font-mono text-[10px] text-[#1a2a3a] text-center">
            Build your empire. Conquer the stars.
          </p>
        </div>
      </div>
    </div>
  );
}
