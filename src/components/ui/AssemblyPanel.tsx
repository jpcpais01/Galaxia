'use client';
import { useState } from 'react';
import { useGameStore } from '@/store/game-store';

export default function AssemblyPanel() {
  const { currentGame, myEmpire, empires, setPanel, proposeAssemblyVote, castAssemblyVote } = useGameStore();
  const [proposing, setProposing] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc]  = useState('');
  const [effect, setEffect] = useState('');

  const votes = currentGame?.assembly ?? [];
  const tick  = currentGame?.tick ?? 0;

  const submit = async () => {
    await proposeAssemblyVote(title, desc, effect);
    setProposing(false);
    setTitle(''); setDesc(''); setEffect('');
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
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Resolution title"
              className="bg-[#030308] border border-[#1a1a2a] text-[#c0d0e0] font-mono text-sm px-2 py-1 focus:outline-none"
            />
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Description"
              rows={2}
              className="bg-[#030308] border border-[#1a1a2a] text-[#c0d0e0] font-mono text-xs px-2 py-1 focus:outline-none resize-none"
            />
            <input
              value={effect}
              onChange={e => setEffect(e.target.value)}
              placeholder="Effect (e.g. +10% resource rates for all)"
              className="bg-[#030308] border border-[#1a1a2a] text-[#c0d0e0] font-mono text-xs px-2 py-1 focus:outline-none"
            />
            <button onClick={submit} disabled={!title} className="btn-green text-[9px]">
              SUBMIT
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
              {vote.effect && (
                <div className="font-mono text-[9px] text-[#ffaa00]">Effect: {vote.effect}</div>
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
