'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/game-store';
import { useAuthStore } from '@/store/auth-store';
import { useGameLoop } from '@/hooks/useGameLoop';
import HUD from '@/components/ui/HUD';
import GalaxyCanvas from '@/components/canvas/GalaxyCanvas';
import SystemCanvas from '@/components/canvas/SystemCanvas';

function LobbyWaiting() {
  const { currentGame, startGame } = useGameStore();
  const { player } = useAuthStore();
  if (!currentGame) return null;

  const isHost = currentGame.createdBy === player?.id;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="font-pixel text-[14px] text-accent-cyan glow-text-cyan">
        {currentGame.name}
      </div>
      <div className="pixel-panel p-6 flex flex-col gap-4 w-72">
        <div className="font-pixel text-[9px] text-[#ffaa00] text-center">WAITING FOR PLAYERS</div>
        <div className="font-mono text-[11px] text-[#5a7a8a] text-center">
          {currentGame.currentPlayers} / {currentGame.maxPlayers} players joined
          <br />
          {currentGame.botCount} bots ready
        </div>
        {isHost && (
          <button onClick={() => startGame(currentGame.id)} className="btn-cyan w-full py-2">
            LAUNCH GAME ({currentGame.botCount} BOTS)
          </button>
        )}
        {!isHost && (
          <div className="font-pixel text-[8px] text-[#2a4a5a] text-center">
            Waiting for host to start...
          </div>
        )}
      </div>
    </div>
  );
}

function VictoryOverlay() {
  const { currentGame, empires } = useGameStore();
  const router = useRouter();
  if (!currentGame || currentGame.status !== 'finished') return null;

  const winner = empires.find(e => e.id === currentGame.winnerId);
  const standings = [...empires].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const vtype = (currentGame.victoryType ?? 'domination').toUpperCase();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#01010acc] backdrop-blur-sm">
      <div className="pixel-panel p-6 w-96 flex flex-col gap-4" style={{ borderColor: winner?.color ?? '#ffd700' }}>
        <div className="font-pixel text-[16px] text-center glow-text-cyan" style={{ color: winner?.color ?? '#ffd700' }}>
          {vtype} VICTORY
        </div>
        <div className="font-pixel text-[11px] text-center text-[#c0d0e0]">
          {currentGame.winnerName ?? winner?.username ?? 'Unknown'} wins the galaxy
        </div>
        <div className="flex flex-col gap-1 mt-2">
          <div className="font-pixel text-[8px] text-[#3a5a6a] mb-1">FINAL STANDINGS</div>
          {standings.map((e, i) => (
            <div key={e.id} className="flex items-center justify-between font-mono text-[10px] py-0.5 border-b border-[#0a1020]">
              <span className="flex items-center gap-2">
                <span className="text-[#3a5a6a]">{i + 1}.</span>
                <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                <span className={e.id === currentGame.winnerId ? 'text-[#ffd700]' : 'text-[#8aa0b0]'}>{e.username}</span>
                {e.isBot && <span className="text-[7px] text-[#3a4a5a]">AI</span>}
              </span>
              <span className="text-[#5a7a8a]">{e.score ?? 0} pts · {e.controlledSystems.length} sys</span>
            </div>
          ))}
        </div>
        <button onClick={() => router.push('/lobby')} className="btn-cyan w-full py-2 text-[10px] mt-2">
          RETURN TO LOBBY
        </button>
      </div>
    </div>
  );
}

export default function GameScreen() {
  const { currentGame, ui } = useGameStore();
  useGameLoop();

  if (!currentGame) {
    return (
      <div className="flex h-screen items-center justify-center bg-space-900">
        <div className="font-pixel text-accent-cyan text-sm glow-text-cyan animate-pulse">
          CONNECTING...
        </div>
      </div>
    );
  }

  if (currentGame.status === 'lobby') {
    return (
      <div className="flex h-screen flex-col bg-space-900 scanlines">
        <div className="px-4 py-2 border-b border-[#1a1a3a] bg-[#050510]">
          <span className="font-pixel text-[10px] text-accent-cyan">GALAXIA</span>
        </div>
        <LobbyWaiting />
      </div>
    );
  }

  const canvas = ui.view === 'system' || ui.selectedSystemId
    ? (ui.view === 'system' ? <SystemCanvas /> : <GalaxyCanvas />)
    : <GalaxyCanvas />;

  return (
    <>
      <HUD>
        {ui.view === 'system' ? <SystemCanvas /> : <GalaxyCanvas />}
      </HUD>
      <VictoryOverlay />
    </>
  );
}
