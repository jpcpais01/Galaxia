'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { useGameStore } from '@/store/game-store';
import type { GameMeta } from '@/types/game';
import { EMPIRE_COLORS } from '@/lib/game/constants';

function CreateGameModal({ onClose }: { onClose: () => void }) {
  const { player } = useAuthStore();
  const { createGame } = useGameStore();
  const router = useRouter();
  const [name, setName]       = useState(`${player?.username ?? 'Commander'}'s Galaxy`);
  const [maxP, setMaxP]       = useState(4);
  const [bots, setBots]       = useState(4);
  const [stars, setStars]     = useState(100);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!player) return;
    setLoading(true);
    const id = await createGame(name, maxP, bots, player.id, player.username, stars);
    router.push(`/game/${id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="pixel-panel w-full max-w-sm p-6 flex flex-col gap-4 fade-in">
        <div className="panel-header">Create New Galaxy</div>

        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[9px] text-[#5a7a8a]">GALAXY NAME</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent-cyan"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[9px] text-[#5a7a8a]">MAX PLAYERS</label>
            <select
              value={maxP}
              onChange={e => setMaxP(+e.target.value)}
              className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-2 py-2 focus:outline-none focus:border-accent-cyan"
            >
              {[2,3,4,6,8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[9px] text-[#5a7a8a]">BOTS (0–20)</label>
            <select
              value={bots}
              onChange={e => setBots(+e.target.value)}
              className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-2 py-2 focus:outline-none focus:border-accent-cyan"
            >
              {Array.from({ length: 21 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[9px] text-[#5a7a8a]">GALAXY SIZE</label>
            <select
              value={stars}
              onChange={e => setStars(+e.target.value)}
              className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-2 py-2 focus:outline-none focus:border-accent-cyan"
            >
              <option value={100}>100 stars</option>
              <option value={200}>200 stars</option>
            </select>
          </div>
        </div>

        <div className="font-mono text-[11px] text-[#5a7a8a] bg-[#050510] border border-[#1a1a2a] px-3 py-2">
          Galaxy: {stars} star systems • {maxP + bots} empires total
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-gray flex-1">CANCEL</button>
          <button onClick={create} disabled={loading} className="btn-cyan flex-1">
            {loading ? 'GENERATING...' : 'LAUNCH GAME'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GameCard({ game }: { game: GameMeta }) {
  const { player } = useAuthStore();
  const { joinGame, deleteGame } = useGameStore();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwner = player?.id === game.createdBy;

  const join = async () => {
    if (!player) return;
    setJoining(true);
    const color = EMPIRE_COLORS[game.currentPlayers % EMPIRE_COLORS.length];
    await joinGame(game.id, player.id, player.username, color);
    router.push(`/game/${game.id}`);
  };

  // Also ensures the player has an empire before entering a live game
  const enter = async () => {
    if (!player) return;
    setJoining(true);
    const color = EMPIRE_COLORS[game.currentPlayers % EMPIRE_COLORS.length];
    await joinGame(game.id, player.id, player.username, color);
    router.push(`/game/${game.id}`);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await deleteGame(game.id);
  };

  const statusColor = game.status === 'lobby' ? '#ffaa00' : game.status === 'playing' ? '#00ff88' : '#5a6a7a';
  const statusLabel = game.status.toUpperCase();

  return (
    <div className="pixel-panel p-4 flex flex-col gap-3 hover:border-[#2a2a5a] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-pixel text-[10px] text-[#c0d0e0]">{game.name}</div>
          <div className="font-mono text-[11px] text-[#3a5a6a] mt-1">
            by {game.createdByUsername}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="font-pixel text-[9px]" style={{ color: statusColor }}>
            {statusLabel}
          </div>
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              onBlur={() => setConfirmDelete(false)}
              className="font-pixel text-[8px] px-1.5 py-0.5 border transition-colors disabled:opacity-40"
              style={{
                color: confirmDelete ? '#ff4455' : '#3a4a5a',
                borderColor: confirmDelete ? '#ff4455' : '#1a2a3a',
                background: confirmDelete ? '#1a0005' : 'transparent',
              }}
            >
              {deleting ? '...' : confirmDelete ? 'CONFIRM' : '✕'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 font-mono text-[11px] text-[#3a5a6a]">
        <span>Players: <span className="text-[#8aa0b0]">{game.currentPlayers}/{game.maxPlayers}</span></span>
        <span>Bots: <span className="text-[#8aa0b0]">{game.botCount}</span></span>
        {game.status === 'playing' && <span>Tick: <span className="text-[#8aa0b0]">{game.tick}</span></span>}
      </div>

      {game.status === 'lobby' && (
        <button onClick={join} disabled={joining} className="btn-gold text-[9px] w-full py-2">
          {joining ? 'JOINING...' : 'JOIN GAME'}
        </button>
      )}
      {game.status === 'playing' && (
        <button onClick={enter} disabled={joining} className="btn-green text-[9px] w-full py-2">
          {joining ? 'ENTERING...' : 'ENTER GAME'}
        </button>
      )}
    </div>
  );
}

export default function LobbyScreen() {
  const { player, signOut } = useAuthStore();
  const { games, loadGames } = useGameStore();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    await loadGames();
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const openGames  = games.filter(g => g.status === 'lobby');
  const liveGames  = games.filter(g => g.status === 'playing');
  const doneGames  = games.filter(g => g.status === 'finished');

  return (
    <div className="flex flex-col h-screen bg-space-900 scanlines">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a3a] bg-[#050510]">
        <div className="font-pixel text-[14px] text-accent-cyan glow-text-cyan">GALAXIA</div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-[#5a8aa0]">
            CDR. <span className="text-[#c0d0e0]">{player?.username}</span>
          </span>
          <button onClick={signOut} className="btn-gray text-[9px] py-1">LOGOUT</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 scrollable p-6 max-w-4xl w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-pixel text-[11px] text-[#8899aa]">GALACTIC COMMAND</h2>
          <div className="flex gap-3">
            <button onClick={refresh} disabled={loading} className="btn-gray text-[9px]">
              {loading ? '...' : '↻ REFRESH'}
            </button>
            <button onClick={() => setShowCreate(true)} className="btn-cyan text-[9px]">
              + NEW GAME
            </button>
          </div>
        </div>

        {openGames.length > 0 && (
          <section className="mb-6">
            <div className="font-pixel text-[9px] text-[#ffaa00] mb-3 tracking-wider">
              ◈ OPEN LOBBIES
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openGames.map(g => <GameCard key={g.id} game={g} />)}
            </div>
          </section>
        )}

        {liveGames.length > 0 && (
          <section className="mb-6">
            <div className="font-pixel text-[9px] text-[#00ff88] mb-3 tracking-wider">
              ◈ LIVE BATTLES
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {liveGames.map(g => <GameCard key={g.id} game={g} />)}
            </div>
          </section>
        )}

        {games.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="font-pixel text-[10px] text-[#1a2a3a] mb-4">NO ACTIVE GAMES</div>
            <button onClick={() => setShowCreate(true)} className="btn-cyan">
              CREATE THE FIRST GAME
            </button>
          </div>
        )}
      </div>

      {showCreate && <CreateGameModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
