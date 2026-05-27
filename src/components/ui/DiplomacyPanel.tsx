'use client';
import { useGameStore } from '@/store/game-store';

export default function DiplomacyPanel() {
  const { empires, myEmpire, setPanel, proposeDiplomacy, acceptDiplomacy } = useGameStore();
  if (!myEmpire) return null;

  const others = empires.filter(e => e.id !== myEmpire.id);

  const getRelation = (empireId: string) =>
    myEmpire.diplomacy.find(d => d.empireId === empireId);

  const getPendingProposal = (empireId: string) => {
    const rel = getRelation(empireId);
    return rel?.proposalPending;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>DIPLOMACY</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      <div className="flex-1 scrollable p-3 flex flex-col gap-2">
        {others.length === 0 && (
          <div className="font-mono text-[11px] text-[#2a3a4a] text-center py-8">
            No other empires in the galaxy yet.
          </div>
        )}

        {others.map(empire => {
          const rel = getRelation(empire.id);
          const pending = getPendingProposal(empire.id);

          const statusColors: Record<string, string> = {
            neutral: '#5a7a8a', allied: '#00ff88',
            at_war: '#ff4455', trade_partner: '#ffd700', non_aggression: '#88aaff',
          };

          return (
            <div key={empire.id} className="pixel-panel p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: empire.color }} />
                <span className="font-pixel text-[9px] text-[#c0d0e0]">
                  {empire.username}
                </span>
                {empire.isBot && <span className="font-pixel text-[7px] text-[#3a4a5a]">AI</span>}
                <span className="ml-auto font-pixel text-[8px]"
                  style={{ color: statusColors[rel?.status ?? 'neutral'] }}>
                  {(rel?.status ?? 'NEUTRAL').toUpperCase()}
                </span>
              </div>

              <div className="font-mono text-[10px] text-[#3a5a6a]">
                Score: {empire.score} • Systems: {empire.controlledSystems.length}
              </div>

              {/* Incoming proposal */}
              {pending && (
                <div className="bg-[#0a1a0a] border border-[#1a3a1a] p-2 flex flex-col gap-2">
                  <div className="font-pixel text-[8px] text-[#44aa44]">
                    PROPOSAL: {pending.type.toUpperCase()}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => acceptDiplomacy(empire.id)} className="btn-green text-[9px] flex-1 py-1">
                      ACCEPT
                    </button>
                    <button className="btn-red text-[9px] flex-1 py-1">
                      DECLINE
                    </button>
                  </div>
                </div>
              )}

              {/* Propose actions */}
              {!pending && rel?.status === 'neutral' && (
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => proposeDiplomacy(empire.id, 'non_aggression')} className="btn-gray text-[8px] py-1 px-2">
                    NAP
                  </button>
                  <button onClick={() => proposeDiplomacy(empire.id, 'trade_partner')} className="btn-gold text-[8px] py-1 px-2">
                    TRADE
                  </button>
                  <button onClick={() => proposeDiplomacy(empire.id, 'allied')} className="btn-green text-[8px] py-1 px-2">
                    ALLY
                  </button>
                  <button onClick={() => proposeDiplomacy(empire.id, 'at_war')} className="btn-red text-[8px] py-1 px-2">
                    WAR
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
