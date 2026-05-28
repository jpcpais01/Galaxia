'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { useGameStore } from '@/store/game-store';
import type { GameMeta, Civilization } from '@/types/game';
import { EMPIRE_COLORS } from '@/lib/game/constants';
import CivilizationCreator, { EmblemCanvas } from './CivilizationCreator';

// ── Create game modal ─────────────────────────────────────────────────────────

function CreateGameModal({ onClose, civilization }: { onClose: () => void; civilization?: Civilization }) {
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
    const id = await createGame(name, maxP, bots, player.id, player.username, stars, civilization);
    router.push(`/game/${id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="pixel-panel w-full max-w-sm p-6 flex flex-col gap-4 fade-in">
        <div className="panel-header">Create New Galaxy</div>

        {/* Selected civ banner */}
        {civilization && (
          <div className="flex items-center gap-2 px-3 py-2 border border-[#1a2a3a] bg-[#050510]">
            <EmblemCanvas emblemId={civilization.emblem} color={civilization.primaryColor} size={24} />
            <div>
              <div className="font-pixel text-[8px]" style={{ color: civilization.primaryColor }}>
                {civilization.speciesName}
              </div>
              <div className="font-mono text-[8px] text-[#3a5a6a]">{civilization.speciesType}</div>
            </div>
          </div>
        )}

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

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ game, civilization }: { game: GameMeta; civilization?: Civilization }) {
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
    const color = civilization?.primaryColor ?? EMPIRE_COLORS[game.currentPlayers % EMPIRE_COLORS.length];
    await joinGame(game.id, player.id, player.username, color, civilization);
    router.push(`/game/${game.id}`);
  };

  const enter = async () => {
    if (!player) return;
    setJoining(true);
    const color = civilization?.primaryColor ?? EMPIRE_COLORS[game.currentPlayers % EMPIRE_COLORS.length];
    await joinGame(game.id, player.id, player.username, color, civilization);
    router.push(`/game/${game.id}`);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await deleteGame(game.id);
  };

  const statusColor = game.status === 'lobby' ? '#ffaa00' : game.status === 'playing' ? '#00ff88' : '#5a6a7a';

  return (
    <div className="pixel-panel p-4 flex flex-col gap-3 hover:border-[#2a2a5a] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-pixel text-[10px] text-[#c0d0e0]">{game.name}</div>
          <div className="font-mono text-[11px] text-[#3a5a6a] mt-1">by {game.createdByUsername}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="font-pixel text-[9px]" style={{ color: statusColor }}>
            {game.status.toUpperCase()}
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

// ── Civ card (sidebar) ────────────────────────────────────────────────────────

const POS_TRAITS = new Set([
  'resilient','industrious','intelligent','entrepreneurial',
  'populous','swift','adaptive','psychic',
]);

function CivCard({
  civ, isSelected, onSelect, onEdit, onDelete,
}: {
  civ: Civilization;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left border p-3 flex flex-col gap-2 transition-all"
      style={{
        borderColor: isSelected ? civ.primaryColor : civ.primaryColor + '44',
        background:  isSelected ? civ.primaryColor + '14' : civ.primaryColor + '07',
        boxShadow:   isSelected ? `0 0 10px ${civ.primaryColor}33` : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <EmblemCanvas emblemId={civ.emblem} color={civ.primaryColor} size={32} />
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[10px] truncate" style={{ color: civ.primaryColor }}>
            {civ.speciesName}
          </div>
          <div className="font-mono text-[9px] text-[#4a6a7a]">
            {civ.speciesType} · {civ.government.replace(/_/g,' ')}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="font-pixel text-[7px] px-1.5 py-1 border border-[#2a3a4a] text-[#3a5a6a] hover:text-[#6a8aa0] hover:border-[#3a5a6a]"
          >
            EDIT
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="font-pixel text-[7px] px-1.5 py-1 border border-[#2a1a1a] text-[#5a3a3a] hover:text-[#ff4455] hover:border-[#ff4455]"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {civ.traits.map(id => {
          const pos = POS_TRAITS.has(id);
          return (
            <span key={id} className="font-pixel text-[7px] px-1 py-0.5 border"
              style={{ color: pos ? '#44cc88' : '#ff6666', borderColor: pos ? '#1a3a2a' : '#3a1a1a' }}>
              {id.replace(/_/g,' ')}
            </span>
          );
        })}
      </div>

      {isSelected && (
        <div className="font-pixel text-[7px] text-center mt-0.5" style={{ color: civ.primaryColor + 'aa' }}>
          ✓ SELECTED
        </div>
      )}

      {civ.motto && (
        <p className="font-mono text-[8px] italic" style={{ color: civ.primaryColor + '88' }}>
          "{civ.motto}"
        </p>
      )}
    </button>
  );
}

// ── Main lobby ────────────────────────────────────────────────────────────────

export default function LobbyScreen() {
  const { player, saveCivilization, deleteCivilization } = useAuthStore();
  const { games, loadGames } = useGameStore();

  const [showCreate, setShowCreate]     = useState(false);
  const [showCivCreator, setShowCivCreator] = useState(false);
  const [editCivIdx, setEditCivIdx]     = useState<number | undefined>(undefined);
  const [selectedCivIdx, setSelectedCivIdx] = useState(0);
  const [loading, setLoading]           = useState(false);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const civs: Civilization[] = player?.civilizations
    ?? (player?.civilization ? [player.civilization] : []);

  const selectedCiv: Civilization | undefined = civs[selectedCivIdx];

  // Keep selection in bounds when list shrinks
  useEffect(() => {
    if (selectedCivIdx >= civs.length && civs.length > 0) {
      setSelectedCivIdx(civs.length - 1);
    }
  }, [civs.length]);

  // Auto-select newest after creation
  const prevCivsLen = civs.length;

  const refresh = async () => {
    setLoading(true);
    await loadGames();
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const openGames = games.filter(g => g.status === 'lobby');
  const liveGames = games.filter(g => g.status === 'playing');

  const handleCivComplete = async (civ: Civilization) => {
    await saveCivilization(civ, editCivIdx);
    // Select the newly created/edited civ
    const isNew = editCivIdx === undefined;
    if (isNew) {
      // new civ will be appended → select last
      setSelectedCivIdx(Math.max(0, civs.length)); // civs hasn't refreshed yet, will be civs.length after update
    } else {
      setSelectedCivIdx(editCivIdx);
    }
    setShowCivCreator(false);
    setEditCivIdx(undefined);
  };

  const handleEditCiv = (idx: number) => {
    setEditCivIdx(idx);
    setShowCivCreator(true);
  };

  const handleDeleteCiv = async (idx: number) => {
    if (confirmDeleteIdx !== idx) {
      setConfirmDeleteIdx(idx);
      return;
    }
    await deleteCivilization(idx);
    setConfirmDeleteIdx(null);
    if (selectedCivIdx >= idx && selectedCivIdx > 0) {
      setSelectedCivIdx(selectedCivIdx - 1);
    }
  };

  const handleNewCiv = () => {
    setEditCivIdx(undefined);
    setShowCivCreator(true);
  };

  return (
    <div className="flex flex-col h-screen bg-space-900 scanlines">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a3a] bg-[#050510]">
        <div className="font-pixel text-[14px] text-accent-cyan glow-text-cyan">GALAXIA</div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-[#5a8aa0]">
            CDR. <span className="text-[#c0d0e0]">{player?.username}</span>
          </span>
          {/* No logout — exit button just goes to home */}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: civilizations */}
        <div className="w-72 flex-shrink-0 border-r border-[#1a1a2a] bg-[#030308] flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a1a2a] flex items-center justify-between flex-shrink-0">
            <div className="font-pixel text-[9px] text-[#3a5a6a]">YOUR CIVILIZATIONS</div>
            <div className="font-mono text-[8px] text-[#2a3a4a]">{civs.length} saved</div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 scrollable flex flex-col gap-2">
            {civs.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="font-pixel text-[9px] text-[#2a3a4a] leading-relaxed">
                  No civilizations yet.<br />
                  <span className="text-[#1a2a3a]">Forge one before entering the stars.</span>
                </div>
              </div>
            )}

            {civs.map((civ, i) => (
              <div key={i} className="relative">
                <CivCard
                  civ={civ}
                  isSelected={i === selectedCivIdx}
                  onSelect={() => { setSelectedCivIdx(i); setConfirmDeleteIdx(null); }}
                  onEdit={() => handleEditCiv(i)}
                  onDelete={() => handleDeleteCiv(i)}
                />
                {confirmDeleteIdx === i && (
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => handleDeleteCiv(i)}
                      className="flex-1 font-pixel text-[8px] py-1 border border-[#ff4455] text-[#ff4455] bg-[#1a0005]"
                    >
                      CONFIRM DELETE
                    </button>
                    <button
                      onClick={() => setConfirmDeleteIdx(null)}
                      className="flex-1 font-pixel text-[8px] py-1 border border-[#2a3a4a] text-[#4a6a7a]"
                    >
                      CANCEL
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-[#1a1a2a] flex-shrink-0">
            <button
              onClick={handleNewCiv}
              className="font-pixel text-[9px] px-4 py-2 border-2 w-full transition-all"
              style={{
                borderColor: '#4488ff',
                color: '#4488ff',
                background: '#4488ff18',
                boxShadow: '0 0 12px #4488ff22',
              }}
            >
              ✦ NEW CIVILIZATION
            </button>
          </div>
        </div>

        {/* RIGHT: games list */}
        <div className="flex-1 overflow-y-auto scrollable p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-pixel text-[11px] text-[#8899aa]">GALACTIC COMMAND</h2>
                {selectedCiv ? (
                  <div className="flex items-center gap-2 mt-1">
                    <EmblemCanvas emblemId={selectedCiv.emblem} color={selectedCiv.primaryColor} size={16} />
                    <span className="font-mono text-[9px]" style={{ color: selectedCiv.primaryColor + 'aa' }}>
                      Playing as {selectedCiv.speciesName}
                    </span>
                  </div>
                ) : (
                  <div className="font-mono text-[9px] text-[#3a4a5a] mt-1">
                    ⚠ Create a civilization to enter the stars
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={refresh} disabled={loading} className="btn-gray text-[9px]">
                  {loading ? '...' : '↻ REFRESH'}
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  disabled={!selectedCiv}
                  className="btn-cyan text-[9px] disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!selectedCiv ? 'Create a civilization first' : undefined}
                >
                  + NEW GAME
                </button>
              </div>
            </div>

            {openGames.length > 0 && (
              <section className="mb-6">
                <div className="font-pixel text-[9px] text-[#ffaa00] mb-3 tracking-wider">◈ OPEN LOBBIES</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {openGames.map(g => <GameCard key={g.id} game={g} civilization={selectedCiv} />)}
                </div>
              </section>
            )}

            {liveGames.length > 0 && (
              <section className="mb-6">
                <div className="font-pixel text-[9px] text-[#00ff88] mb-3 tracking-wider">◈ LIVE BATTLES</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {liveGames.map(g => <GameCard key={g.id} game={g} civilization={selectedCiv} />)}
                </div>
              </section>
            )}

            {games.length === 0 && !loading && (
              <div className="text-center py-20">
                <div className="font-pixel text-[10px] text-[#1a2a3a] mb-4">NO ACTIVE GAMES</div>
                {selectedCiv ? (
                  <button onClick={() => setShowCreate(true)} className="btn-cyan">
                    CREATE THE FIRST GAME
                  </button>
                ) : (
                  <button onClick={handleNewCiv} className="btn-gray">
                    CREATE A CIVILIZATION FIRST
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && selectedCiv && (
        <CreateGameModal onClose={() => setShowCreate(false)} civilization={selectedCiv} />
      )}
      {showCivCreator && (
        <CivilizationCreator
          onComplete={handleCivComplete}
          onCancel={() => { setShowCivCreator(false); setEditCivIdx(undefined); }}
          initialCiv={editCivIdx !== undefined ? civs[editCivIdx] : undefined}
        />
      )}
    </div>
  );
}
