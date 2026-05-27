'use client';
import { useGameStore } from '@/store/game-store';
import { INFRA_CONFIG } from '@/lib/game/constants';
import { canAfford, countUsedSlots } from '@/lib/game/economy';
import type { InfraType } from '@/types/game';

export default function BuildMenu() {
  const { currentGame, myEmpire, ui, buildInfra, setPanel } = useGameStore();

  const planet = currentGame?.galaxy.systems
    .find(s => s.id === ui.selectedSystemId)?.planets
    .find(p => p.id === ui.selectedPlanetId);

  const colonized = myEmpire?.colonizedPlanets.includes(ui.selectedPlanetId ?? '') ?? false;

  if (!colonized || !planet) {
    return (
      <div className="p-4 font-mono text-[11px] text-[#2a3a4a] text-center">
        Select a colonized planet first
      </div>
    );
  }

  const usedSlots = countUsedSlots(planet.id, myEmpire?.infrastructure ?? []);
  const resources = myEmpire?.resources ?? { energy: 0, food: 0, minerals: 0, research: 0, compute: 0, credits: 0, population: 0 };

  const buildTypes = Object.entries(INFRA_CONFIG) as [InfraType, typeof INFRA_CONFIG[InfraType]][];

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>BUILD — {planet.name}</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      <div className="px-3 pt-2 pb-1 font-mono text-[10px] text-[#5a8a6a]">
        Slots: {usedSlots}/{planet.infraSlots} used
      </div>

      <div className="flex-1 scrollable p-2 flex flex-col gap-1">
        {buildTypes.map(([type, cfg]) => {
          const affordable = canAfford(resources, cfg);
          const fits = usedSlots + cfg.slots <= planet.infraSlots;
          const blocked = !affordable || !fits;

          return (
            <button
              key={type}
              onClick={() => { if (!blocked) buildInfra(ui.selectedSystemId!, planet.id, type); }}
              disabled={blocked}
              className={`
                flex items-start gap-3 p-3 text-left border transition-colors
                ${blocked
                  ? 'border-[#0a1020] bg-[#030308] opacity-50 cursor-not-allowed'
                  : 'border-[#1a1a2a] bg-[#05050f] hover:border-[#2a3a4a] hover:bg-[#080818] cursor-pointer'
                }
              `}
            >
              <span className="text-lg mt-0.5">{cfg.icon}</span>
              <div className="flex-1">
                <div className="font-pixel text-[9px] text-[#c0d0e0]">{cfg.label}</div>
                <div className="font-mono text-[9px] text-[#3a5a6a] mt-1">
                  {Object.entries(cfg.output).map(([k, v]) => `+${v} ${k}`).join(' • ') || 'Defense structure'}
                  {' '}• {cfg.buildTicks} ticks
                </div>
                <div className="font-mono text-[9px] mt-1">
                  {cfg.mineralCost > 0 && <span className={resources.minerals < cfg.mineralCost ? 'text-[#ff4455]' : 'text-[#5a7a5a]'}>{cfg.mineralCost}min </span>}
                  {cfg.energyCost  > 0 && <span className={resources.energy < cfg.energyCost   ? 'text-[#ff4455]' : 'text-[#5a7a5a]'}>{cfg.energyCost}nrg </span>}
                  {cfg.creditCost  > 0 && <span className={resources.credits < cfg.creditCost  ? 'text-[#ff4455]' : 'text-[#5a7a5a]'}>{cfg.creditCost}crd</span>}
                  <span className="text-[#2a3a4a]"> • {cfg.slots} slots</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
