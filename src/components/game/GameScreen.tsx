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
    <HUD>
      {ui.view === 'system' ? <SystemCanvas /> : <GalaxyCanvas />}
    </HUD>
  );
}
