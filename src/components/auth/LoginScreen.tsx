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

    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5,
      speed: Math.random() * 0.25 + 0.04,
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
  const { enter, loading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [pin, setPin]           = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await enter(username, pin);
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden">
      <StarField />

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-xs px-4">
        {/* Logo */}
        <div className="text-center">
          <h1 className="font-pixel text-3xl text-accent-cyan glow-text-cyan tracking-wider mb-2 flicker">
            GALAXIA
          </h1>
          <p className="font-mono text-[11px] text-[#3a6a80] tracking-widest uppercase">
            Space Conquest
          </p>
          <div className="mt-2 h-px w-32 mx-auto bg-gradient-to-r from-transparent via-accent-cyan to-transparent opacity-40" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full pixel-panel-glow p-6 flex flex-col gap-5">
          <div className="panel-header text-center">WELCOME COMMANDER</div>

          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); clearError(); }}
              placeholder="commander name..."
              maxLength={20}
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className="
                bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0]
                font-mono text-base px-4 py-3 text-center tracking-wider
                focus:outline-none focus:border-accent-cyan focus:shadow-glow-cyan
                placeholder-[#1a2a3a] transition-all
              "
              required
            />
            <p className="font-mono text-[9px] text-[#1a3a4a] text-center">
              letters, numbers, - and _ · 3–20 chars
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <input
              type="password"
              value={pin}
              onChange={e => { setPin(e.target.value); clearError(); }}
              placeholder="access code..."
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              className="
                bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0]
                font-mono text-base px-4 py-3 text-center tracking-widest
                focus:outline-none focus:border-accent-cyan focus:shadow-glow-cyan
                placeholder-[#1a2a3a] transition-all
              "
              required
            />
            <p className="font-mono text-[9px] text-[#1a3a4a] text-center">
              new commander: this becomes your PIN · min 4 chars
            </p>
          </div>

          {error && (
            <div className="font-mono text-[11px] text-[#ff4455] bg-[#ff445511] border border-[#ff445533] px-3 py-2 text-center fade-in">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || username.trim().length < 3 || pin.length < 4}
            className="btn-cyan w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed text-[11px]"
          >
            {loading ? '[ CONNECTING... ]' : '[ ENTER GALAXY ]'}
          </button>
        </form>

        <p className="font-mono text-[9px] text-[#1a2a3a] text-center leading-relaxed">
          New name = new account · Same name + PIN = your account
        </p>
      </div>
    </div>
  );
}
