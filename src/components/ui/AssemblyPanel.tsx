'use client';
import { useState } from 'react';
import { useGameStore } from '@/store/game-store';
import { ASSEMBLY_RESOLUTIONS, type AssemblyResolutionKey } from '@/lib/game/world';

const RESOLUTION_KEYS = Object.keys(ASSEMBLY_RESOLUTIONS) as AssemblyResolutionKey[];

export default function AssemblyPanel() {
  const { currentGame, myEmpire, empires, setPanel, proposeAssemblyVote, castAssemblyVote } = useGameStore();
  const [proposing, setProposing] = useState(false);
  const [resKey, setResKey] = useState<AssemblyResolutionKey>('research_grant');

  const votes = currentGame?.assembly ?? [];
  const tick  = currentGame?.tick ?? 0;

  const submit = async () => {
    const res = ASSEMBLY_RESOLUTIONS[resKey];
    await proposeAssemblyVote(res.label, res.description, resKey);
    setProposing(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>GALACTIC ASSEMBLY</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      <div className="flex-1 scrollable p-3 flex flex-col gap-3">
        <div className="font-mono text-[10px] text-[#3a5a6a]">
          {empires.length} empires in session
        </div>

        <button onClick={() => setProposing(p => !p)} className="btn-gold text-[9px]">
          {proposing ? 'CANCEL' : '+ PROPOSE RESOLUTION'}
        </button>

        {proposing && (
          <div className="flex flex-col gap-2 bg-[#050510] border border-[#1a2a1a] p-3">
            <div className="font-pixel text-[8px] text-[#3a5a6a]">CHOOSE RESOLUTION</div>
            <div className="flex flex-col gap-1">
              {RESOLUTION_KEYS.map(k => {
                const r = ASSEMBLY_RESOLUTIONS[k];
                const sel = resKey === k;
                return (
                  <button
                    key={k}
                    onClick={() => setResKey(k)}
                    className="text-left px-2 py-1.5 border font-mono text-[9px]"
                    style={{
                      borderColor: sel ? '#44ff88' : '#1a2a1a',
                      background: sel ? '#08210f' : '#030308',
                    }}
                  >
                    <div className="font-pixel text-[8px]" style={{ color: sel ? '#44ff88' : '#c0d0e0' }}>{r.label}</div>
                    <div className="text-[8px] text-[#5a7a6a]">{r.description}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={submit} className="btn-green text-[9px]">
              SUBMIT FOR VOTE
            </button>
          </div>
        )}

        {votes.length === 0 && (
          <div className="font-mono text-[10px] text-[#1a2a3a] text-center py-8">
            No active resolutions
          </div>
        )}

        {votes.map(vote => {
          const yesCount = Object.values(vote.votes).filter(Boolean).length;
          const noCount  = Object.values(vote.votes).filter(v => !v).length;
          const total    = empires.length;
          const myVote   = myEmpire ? vote.votes[myEmpire.id] : undefined;
          const open     = tick <= vote.closesAtTick;
          const pct      = total > 0 ? Math.round(yesCount / total * 100) : 0;

          return (
            <div key={vote.id} className="pixel-panel p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-pixel text-[9px] text-[#c0d0e0]">{vote.title}</div>
                <div className={`font-pixel text-[8px] ${open ? 'text-[#44ff88]' : 'text-[#5a6a7a]'}`}>
                  {open ? 'OPEN' : 'CLOSED'}
                </div>
              </div>
              <div className="font-mono text-[10px] text-[#4a6a7a]">{vote.description}</div>
              {vote.effect && ASSEMBLY_RESOLUTIONS[vote.effect as AssemblyResolutionKey] && (
                <div className="font-mono text-[9px] text-[#ffaa00]">
                  Effect: {ASSEMBLY_RESOLUTIONS[vote.effect as AssemblyResolutionKey].description}
                </div>
              )}
              {vote.resolved && (
                <div className="font-pixel text-[8px]" style={{ color: vote.passed ? '#44ff88' : '#ff4455' }}>
                  {vote.passed ? '✓ PASSED & APPLIED' : '✗ REJECTED'}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[#050510]">
                  <div className="h-full bg-[#44ff88]" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-[9px] text-[#44ff88]">{yesCount}Y</span>
                <span className="font-mono text-[9px] text-[#ff4455]">{noCount}N</span>
              </div>
              {open && myEmpire && myVote === undefined && (
                <div className="flex gap-2">
                  <button onClick={() => castAssemblyVote(vote.id, true)}  className="btn-green text-[8px] flex-1 py-1">AYE</button>
                  <button onClick={() => castAssemblyVote(vote.id, false)} className="btn-red text-[8px] flex-1 py-1">NAY</button>
                </div>
              )}
              {myVote !== undefined && (
                <div className="font-pixel text-[8px] text-center" style={{ color: myVote ? '#44ff88' : '#ff4455' }}>
                  YOU VOTED {myVote ? 'AYE' : 'NAY'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
