'use client';
import { useGameStore } from '@/store/game-store';
import { useAuthStore } from '@/store/auth-store';
import ResourceBar from './ResourceBar';
import SystemPanel from './SystemPanel';
import PlanetPanel from './PlanetPanel';
import BuildMenu from './BuildMenu';
import ResearchPanel from './ResearchPanel';
import DiplomacyPanel from './DiplomacyPanel';
import ShipDesigner from './ShipDesigner';
import AssemblyPanel from './AssemblyPanel';
import ColoniesPanel from './ColoniesPanel';

import { useRouter } from 'next/navigation';

function TopBar() {
  const { currentGame, myEmpire, ui, setView, setPanel } = useGameStore();
  const router = useRouter();

  const leave = () => { router.push('/lobby'); };

  const activePanel = ui.activePanel;

  const navBtn = (panel: typeof ui.activePanel, label: string, color: string) => (
    <button
      onClick={() => setPanel(activePanel === panel ? 'none' : panel)}
      className="btn-pixel text-[8px] px-2 py-1"
      style={{
        color,
        borderColor: activePanel === panel ? color : '#1a2a3a',
        background: activePanel === panel ? color + '22' : 'transparent',
        boxShadow: activePanel === panel ? `0 0 8px ${color}44` : 'none',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a3a] bg-[#050510] gap-2 flex-shrink-0">
      {/* Left: empire + tick */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="font-pixel text-[10px] glow-text-cyan text-accent-cyan">
          {myEmpire?.username ?? 'GALAXIA'}
        </div>
        {myEmpire && (
          <div className="w-3 h-3 rounded-full border border-[#1a1a3a]" style={{ background: myEmpire.color }} />
        )}
        <div className="font-mono text-[10px] text-[#2a4a5a]">
          T{currentGame?.tick ?? 0}
        </div>
      </div>

      {/* Center: resources */}
      <div className="flex-1 min-w-0">
        <ResourceBar />
      </div>

      {/* Right: nav buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {navBtn('colonies',   'COLONY', '#44ffaa')}
        {navBtn('research',   'LAB',    '#8888ff')}
        {navBtn('ships',      'SHIPS',  '#44aaff')}
        {navBtn('designer',   'DESIGN', '#ff8844')}
        {navBtn('diplomacy',  'DIPL',   '#ffaa00')}
        {navBtn('assembly',   'ASMBL',  '#00ff88')}
        <button onClick={leave} className="btn-gray text-[8px] px-2 py-1 ml-1">EXIT</button>
      </div>
    </div>
  );
}

function ShipFleetPanel() {
  const { myEmpire, currentGame, buildShip, setPanel } = useGameStore();
  if (!myEmpire) return null;

  const ships = myEmpire.ships;
  const designs = myEmpire.shipDesigns;

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>FLEET — {ships.length} ships</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>
      <div className="flex-1 scrollable p-3 flex flex-col gap-3">
        {/* Active ships */}
        {ships.length === 0 && (
          <div className="font-mono text-[10px] text-[#2a3a4a] text-center py-4">No ships built</div>
        )}
        {ships.map(ship => (
          <div key={ship.id} className="pixel-panel p-2 flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-pixel text-[9px] text-[#c0d0e0]">{ship.name}</span>
              <span className="font-mono text-[9px]" style={{
                color: ship.hp / ship.maxHp > 0.6 ? '#44ff88' : ship.hp / ship.maxHp > 0.3 ? '#ffaa00' : '#ff4455'
              }}>
                {ship.hp}/{ship.maxHp} HP
              </span>
            </div>
            <div className="font-mono text-[9px] text-[#3a5a6a]">
              ATK {ship.attack} · DEF {ship.defense} · SPD {ship.speed}
            </div>
            <div className="font-mono text-[9px] text-[#2a3a4a]">@ {ship.systemId}</div>
          </div>
        ))}

        {/* Build from design */}
        {designs.length > 0 && myEmpire.controlledSystems.length > 0 && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">BUILD NEW SHIP</div>
            {designs.map(d => {
              const hasShipyard = myEmpire.infrastructure.some(
                i => i.type === 'shipyard' && i.active &&
                  myEmpire.controlledSystems.includes(i.systemId)
              );
              const affordable = (myEmpire.resources.minerals ?? 0) >= d.mineralCost &&
                (myEmpire.resources.credits ?? 0) >= d.creditCost;

              return (
                <button
                  key={d.id}
                  onClick={() => {
                    const sys = myEmpire.infrastructure.find(i => i.type === 'shipyard' && i.active);
                    if (sys) buildShip(d.id, sys.systemId);
                  }}
                  disabled={!hasShipyard || !affordable}
                  className="w-full flex items-center justify-between p-2 border border-[#1a1a2a] bg-[#05050f] hover:border-[#2a2a4a] disabled:opacity-40 disabled:cursor-not-allowed mb-1"
                >
                  <div className="text-left">
                    <div className="font-pixel text-[9px] text-[#c0d0e0]">{d.name}</div>
                    <div className="font-mono text-[9px] text-[#3a5a6a]">
                      {d.mineralCost}min · {d.creditCost}crd · {d.buildTicks}t
                    </div>
                  </div>
                  <span className="font-pixel text-[8px] text-[#44aaff]">BUILD</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HUD({ children }: { children: React.ReactNode }) {
  const { ui } = useGameStore();

  const rightPanel = () => {
    switch (ui.activePanel) {
      case 'colonies':  return <ColoniesPanel />;
      case 'research':  return <ResearchPanel />;
      case 'ships':     return <ShipFleetPanel />;
      case 'designer':  return <ShipDesigner />;
      case 'diplomacy': return <DiplomacyPanel />;
      case 'assembly':  return <AssemblyPanel />;
      case 'build':     return <BuildMenu />;
      case 'none':
      default:          return ui.selectedPlanetId ? <PlanetPanel /> : <SystemPanel />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-space-900">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Main canvas */}
        <div className="flex-1 relative overflow-hidden">
          {children}
        </div>

        {/* Right sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-[#1a1a3a] bg-[#050510] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {rightPanel()}
          </div>
        </div>
      </div>

    </div>
  );
}
