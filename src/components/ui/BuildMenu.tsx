'use client';
import { useGameStore } from '@/store/game-store';
import { INFRA_CONFIG } from '@/lib/game/constants';
import { canAfford, countUsedSlots } from '@/lib/game/economy';
import { PixelIcon } from '@/components/ui/PixelIcon';
import type { InfraType } from '@/types/game';

const OUTPUT_COLORS: Record<string, string> = {
  energy: '#ffee44', food: '#44ff88', minerals: '#aabb88',
  research: '#8888ff', compute: '#aa44ff', credits: '#ffd700', population: '#ff8844',
};

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
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0] transition-colors">✕</button>
      </div>

      {/* Slot meter */}
      <div className="px-3 py-2 border-b border-[#0f0f28] flex-shrink-0">
        <div className="flex justify-between font-mono text-[9px] mb-1.5">
          <span className="text-[#3a5a6a]">BUILD SLOTS</span>
          <span style={{ color: usedSlots >= planet.infraSlots ? '#ff4455' : '#5a8a6a' }}>
            {usedSlots} / {planet.infraSlots}
          </span>
        </div>
        <div className="flex gap-0.5 h-1.5">
          {Array.from({ length: planet.infraSlots }).map((_, i) => (
            <div
              key={i}
              className="flex-1 transition-colors"
              style={{
                background: i < usedSlots
                  ? (usedSlots >= planet.infraSlots ? '#aa2233' : '#2a6a4a')
                  : '#0c0c1e',
                border: '1px solid #1a1a2a',
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 scrollable p-2 flex flex-col gap-1">
        {buildTypes.map(([type, cfg]) => {
          const affordable = canAfford(resources, cfg);
          const fits = usedSlots + cfg.slots <= planet.infraSlots;
          const blocked = !affordable || !fits;
          const outputEntries = Object.entries(cfg.output) as [string, number][];

          return (
            <button
              key={type}
              onClick={() => { if (!blocked) buildInfra(ui.selectedSystemId!, planet.id, type); }}
              disabled={blocked}
              className={`flex items-start gap-3 p-2.5 text-left border transition-all ${
                blocked
                  ? 'border-[#0e0e1e] bg-[#050508] opacity-40 cursor-not-allowed'
                  : 'border-[#1a1a2e] bg-[#07070f] hover:border-[#2a3a50] hover:bg-[#0a0a1a] cursor-pointer'
              }`}
            >
              {/* Icon */}
              <div className="pt-0.5 flex-shrink-0">
                <PixelIcon id={cfg.icon} color={blocked ? '#2a3a4a' : '#7a9aaa'} size={18} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="font-pixel text-[8px] text-[#b0c8d8]">{cfg.label}</span>
                  <span className="font-mono text-[8px] text-[#2a4a5a] flex-shrink-0">
                    {cfg.slots}sl · {cfg.buildTicks}t
                  </span>
                </div>

                {/* Output pills */}
                {outputEntries.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {outputEntries.map(([k, v]) => (
                      <span
                        key={k}
                        className="font-pixel text-[7px] px-1 py-0.5 border"
                        style={{
                          color: OUTPUT_COLORS[k] ?? '#88aabb',
                          borderColor: (OUTPUT_COLORS[k] ?? '#88aabb') + '44',
                          background: (OUTPUT_COLORS[k] ?? '#88aabb') + '0e',
                        }}
                      >
                        +{v} {k.slice(0, 3).toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
                {outputEntries.length === 0 && (
                  <div className="font-mono text-[8px] text-[#2a4a5a] mb-1">Defensive structure</div>
                )}

                {/* Costs */}
                <div className="flex gap-2 font-mono text-[8px]">
                  {cfg.mineralCost > 0 && (
                    <span style={{ color: resources.minerals < cfg.mineralCost ? '#ff4455' : '#4a6a4a' }}>
                      {cfg.mineralCost}m
                    </span>
                  )}
                  {cfg.energyCost > 0 && (
                    <span style={{ color: resources.energy < cfg.energyCost ? '#ff4455' : '#4a6a4a' }}>
                      {cfg.energyCost}e
                    </span>
                  )}
                  {cfg.creditCost > 0 && (
                    <span style={{ color: resources.credits < cfg.creditCost ? '#ff4455' : '#4a6a4a' }}>
                      {cfg.creditCost}c
                    </span>
                  )}
                  {!fits && (
                    <span className="text-[#884444]">no slots</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
