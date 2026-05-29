'use client';
import { useGameStore } from '@/store/game-store';
import { PLANET_CONFIG, INFRA_CONFIG } from '@/lib/game/constants';
import type { Planet, StarSystem } from '@/types/game';

export default function ColoniesPanel() {
  const { currentGame, myEmpire, setPanel, setView, selectPlanet, selectSystem } = useGameStore();

  if (!myEmpire) return null;

  const galaxy  = currentGame?.galaxy;
  const tick    = currentGame?.tick ?? 0;
  const planets = myEmpire.colonizedPlanets;

  // Build: { planet, system } for each colonized planet
  type PlanetEntry = { planet: Planet; system: StarSystem };
  const entries: PlanetEntry[] = [];

  if (galaxy) {
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        if (planets.includes(p.id)) {
          entries.push({ planet: p, system: sys });
        }
      }
    }
  }

  // Group by system
  const bySystem = new Map<string, PlanetEntry[]>();
  for (const e of entries) {
    const arr = bySystem.get(e.system.id) ?? [];
    arr.push(e);
    bySystem.set(e.system.id, arr);
  }

  // Planets you could still colonize — colonizable, in a system you control,
  // not already colonized and not already en route.
  const pendingIds = new Set((myEmpire.pendingColonizations ?? []).map(c => c.planetId));
  const colonizable: PlanetEntry[] = [];
  if (galaxy) {
    for (const sysId of myEmpire.controlledSystems) {
      const sys = galaxy.systems.find(s => s.id === sysId);
      if (!sys) continue;
      for (const p of sys.planets) {
        if (p.colonizable && !planets.includes(p.id) && !pendingIds.has(p.id)) {
          colonizable.push({ planet: p, system: sys });
        }
      }
    }
  }
  const canAffordCol = (myEmpire.resources.credits ?? 0) >= 150;

  const goToPlanet = (systemId: string, planetId: string) => {
    selectSystem(systemId);
    selectPlanet(planetId);
    setView('system');
    setPanel('none');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>PLANETS — {planets.length} colonized</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      <div className="flex-1 scrollable p-3 flex flex-col gap-4">
        {entries.length === 0 && colonizable.length === 0 && (
          <div className="font-mono text-[10px] text-[#2a3a4a] text-center py-6">
            No colonies or colonizable planets.<br />
            <span className="text-[#1a2a3a]">Claim a system to find worlds to colonize.</span>
          </div>
        )}

        {entries.length > 0 && (
          <div className="font-pixel text-[8px] text-[#3a8a6a]">YOUR COLONIES</div>
        )}

        {Array.from(bySystem.entries()).map(([sysId, list]) => {
          const sys = list[0].system;
          return (
            <div key={sysId}>
              {/* System header */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="font-pixel text-[8px] text-[#3a8a6a]">{sys.name}</div>
                <div className="flex-1 h-px bg-[#0a1a1a]" />
                <div className="font-mono text-[8px] text-[#2a4a3a]">{list.length} planet{list.length !== 1 ? 's' : ''}</div>
              </div>

              {/* Planets in this system */}
              <div className="flex flex-col gap-1.5 pl-2">
                {list.map(({ planet }: PlanetEntry) => {
                  const cfg = PLANET_CONFIG[planet.type as keyof typeof PLANET_CONFIG];
                  const infras = myEmpire.infrastructure.filter(i => i.planetId === planet.id);
                  const active  = infras.filter(i => i.active).length;
                  const building = infras.filter(i => !i.active).length;
                  const slotsUsed = infras.reduce((s, i) => s + INFRA_CONFIG[i.type].slots, 0);
                  const slotsTotal = planet.infraSlots;

                  return (
                    <button
                      key={planet.id}
                      onClick={() => goToPlanet(sys.id, planet.id)}
                      className="flex items-start gap-2 p-2 bg-[#05050f] border border-[#1a1a2a] hover:border-[#2a3a4a] transition-colors text-left w-full"
                    >
                      {/* Planet color dot */}
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 border"
                        style={{ background: cfg.groundColor, borderColor: cfg.waterColor }}
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-[10px] text-[#c0d0e0] truncate">{planet.name}</span>
                          <span className="font-pixel text-[7px] text-[#2a5a3a] ml-1 flex-shrink-0">
                            {slotsUsed}/{slotsTotal} slots
                          </span>
                        </div>
                        <div className="font-pixel text-[7px] mt-0.5" style={{ color: cfg.colonizable ? '#44aa88' : '#446666' }}>
                          {cfg.label}
                          {planet.size > 0 && ` · sz ${planet.size}`}
                          {planet.moons.length > 0 && ` · ${planet.moons.length}m`}
                        </div>

                        {/* Infra summary */}
                        {infras.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {infras.map(inf => {
                              const ic = INFRA_CONFIG[inf.type];
                              const eta = inf.active ? null : Math.max(0, inf.buildCompletedTick - tick);
                              return (
                                <span
                                  key={inf.id}
                                  className="font-mono text-[8px] px-1 border"
                                  style={{
                                    color: inf.active ? '#44aa66' : '#aa8800',
                                    borderColor: inf.active ? '#1a3a2a' : '#2a2a0a',
                                    background: inf.active ? '#051005' : '#0a0a00',
                                  }}
                                  title={inf.active ? ic.label : `${ic.label} — ${eta}t left`}
                                >
                                  {ic.icon}{eta !== null ? ` ${eta}t` : ''}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="font-mono text-[8px] text-[#2a3a3a] mt-1">No infrastructure</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Available to colonize — colonizable worlds in systems you control */}
        {colonizable.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="font-pixel text-[8px] text-[#3a6a8a]">AVAILABLE TO COLONIZE</div>
              <div className="flex-1 h-px bg-[#0a1a2a]" />
              <div className="font-mono text-[8px] text-[#2a4a5a]">{colonizable.length}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {colonizable.map(({ planet, system }: PlanetEntry) => {
                const cfg = PLANET_CONFIG[planet.type as keyof typeof PLANET_CONFIG];
                return (
                  <button
                    key={planet.id}
                    onClick={() => goToPlanet(system.id, planet.id)}
                    className="flex items-center gap-2 p-2 bg-[#05050f] border border-[#16263a] hover:border-[#2a4a6a] transition-colors text-left w-full"
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 border"
                      style={{ background: cfg.groundColor, borderColor: cfg.waterColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] text-[#c0d0e0] truncate">{planet.name}</span>
                        <span className="font-pixel text-[7px] text-[#3a6a8a] ml-1 flex-shrink-0">{system.name}</span>
                      </div>
                      <div className="font-pixel text-[7px] mt-0.5 text-[#44aa88]">
                        {cfg.label} · sz {planet.size} · {planet.similarity}% · {planet.infraSlots} slots
                      </div>
                    </div>
                    <span
                      className="font-pixel text-[7px] px-1.5 py-1 border flex-shrink-0"
                      style={{
                        color: canAffordCol ? '#ffd700' : '#5a4a20',
                        borderColor: canAffordCol ? '#3a3010' : '#1a1a0a',
                      }}
                    >
                      150c
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending colonizations */}
        {(myEmpire.pendingColonizations?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="font-pixel text-[8px] text-[#8a6a30]">COLONIZING</div>
              <div className="flex-1 h-px bg-[#1a1a0a]" />
            </div>
            {myEmpire.pendingColonizations.map(pc => {
              const sys    = galaxy?.systems.find(s => s.id === pc.systemId);
              const planet = sys?.planets.find(p => p.id === pc.planetId);
              const cfg    = planet ? PLANET_CONFIG[planet.type] : null;
              const eta    = Math.max(0, pc.completesAtTick - tick);
              return (
                <div key={pc.planetId} className="flex items-center gap-2 px-2 py-1.5 bg-[#050500] border border-[#1a1a0a] font-mono text-[9px]">
                  {cfg && (
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cfg.groundColor }} />
                  )}
                  <span className="text-[#8a7030] flex-1 truncate">{planet?.name ?? pc.planetId}</span>
                  <span className="text-[#6a5020]">{eta}t left</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
