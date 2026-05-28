'use client';
import { useRef, useEffect, useState } from 'react';
import { useGameStore } from '@/store/game-store';
import { PLANET_CONFIG, INFRA_CONFIG, GROUND_OP_CONFIG } from '@/lib/game/constants';
import { renderPlanetSync, getPlanetBitmap } from '@/lib/game/planet-renderer';
import { countUsedSlots } from '@/lib/game/economy';
import type { InfraType, GroundOpType } from '@/types/game';

const GROUND_OP_LIST: { type: GroundOpType; label: string; icon: string }[] = [
  { type: 'mineral_extractor',     label: 'Mineral Extractor',  icon: '⛏' },
  { type: 'atmospheric_processor', label: 'Atmo Processor',     icon: '🌫' },
  { type: 'deep_scanner',          label: 'Deep Scanner',       icon: '📡' },
];

function PlanetDisplay({ type, seed, size }: { type: string; seed: number; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getPlanetBitmap(type as any, seed).then(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const S = canvas.width;
      ctx.clearRect(0, 0, S, S);
      renderPlanetSync(ctx, type as any, seed, S / 2, S / 2, S / 2 - 4);
    });
  }, [type, seed]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={80}
      className="rounded-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export default function PlanetPanel() {
  const { currentGame, myEmpire, ui, colonizePlanet, buildGroundOp, destroyInfra, destroyGroundOp, setPanel } = useGameStore();
  const [expandedMoon, setExpandedMoon] = useState<string | null>(null);

  const system = currentGame?.galaxy.systems.find(s => s.id === ui.selectedSystemId);
  const planet = system?.planets.find(p => p.id === ui.selectedPlanetId);
  if (!planet) return (
    <div className="p-4 font-mono text-[11px] text-[#2a3a4a] text-center">
      Click a planet in the system view
    </div>
  );

  const tick   = currentGame?.tick ?? 0;
  const cfg    = PLANET_CONFIG[planet.type];
  const colonized    = myEmpire?.colonizedPlanets.includes(planet.id) ?? false;
  const pendingCol   = (myEmpire?.pendingColonizations ?? []).find(c => c.planetId === planet.id);
  const controlled   = myEmpire?.controlledSystems.includes(ui.selectedSystemId ?? '') ?? false;
  const canColonize  = controlled && planet.colonizable && !colonized && !pendingCol;
  const canAffordCol = (myEmpire?.resources.credits ?? 0) >= 150;

  const usedSlots = countUsedSlots(planet.id, myEmpire?.infrastructure ?? []);
  const myInfra   = (myEmpire?.infrastructure ?? []).filter(i => i.planetId === planet.id);

  // Ground ops on this planet
  const myGroundOps = (myEmpire?.groundOps ?? []).filter(g => g.targetId === planet.id);

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">{planet.name}</div>

      <div className="flex-1 scrollable p-3 flex flex-col gap-3">
        {/* Visual + quick stats */}
        <div className="flex gap-3 items-center">
          <PlanetDisplay type={planet.type} seed={planet.seed} size={planet.size} />
          <div className="flex flex-col gap-1 font-mono text-[11px]">
            <div className="font-pixel text-[9px]" style={{ color: cfg.colonizable ? '#44cc44' : '#cc4444' }}>
              {cfg.label.toUpperCase()}
            </div>
            <div className="text-[#5a7a8a]">Size: <span className="text-[#8aa0b0]">{planet.size}</span></div>
            <div className="text-[#5a7a8a]">Moons: <span className="text-[#8aa0b0]">{planet.moons.length}</span></div>
            <div className="text-[#5a7a8a]">Sim: <span className="text-[#8aa0b0]">{planet.similarity}%</span></div>
            {planet.hasResources && <div className="text-[#ffaa00] text-[9px]">⛏ NATURAL RESOURCES</div>}
            {planet.hasAnomaly && (
              <div className="text-[#ff8800] text-[9px]">
                {planet.anomalyRevealed ? `★ ${planet.anomalyType?.replace('_', ' ').toUpperCase()}` : '★ ANOMALY DETECTED'}
              </div>
            )}
          </div>
        </div>

        {/* Pending colonization */}
        {pendingCol && (
          <div className="font-mono text-[9px] text-center bg-[#0a0a10] border border-[#2a2a1a] px-2 py-2">
            <div className="text-[#ffaa00]">◐ COLONY SHIPS EN ROUTE</div>
            <div className="text-[#6a5a00] mt-0.5">
              ETA: {Math.max(0, pendingCol.completesAtTick - tick)} ticks
            </div>
          </div>
        )}

        {/* Colonize button */}
        {canColonize && (
          <button
            onClick={() => colonizePlanet(ui.selectedSystemId!, planet.id)}
            disabled={!canAffordCol}
            className="btn-gold w-full py-2 text-[9px] disabled:opacity-40"
          >
            COLONIZE PLANET
            <span className="block text-[8px] text-[#6a5000]">150 credits • 50 ticks • {planet.infraSlots} build slots</span>
          </button>
        )}

        {/* Infrastructure */}
        {colonized && (
          <>
            <div>
              <div className="flex justify-between font-pixel text-[8px] text-[#3a5a6a] mb-2">
                <span>INFRASTRUCTURE</span>
                <span className="text-[#5a8a6a]">{usedSlots}/{planet.infraSlots} slots</span>
              </div>
              {/* Slot bar */}
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: planet.infraSlots }).map((_, i) => (
                  <div
                    key={i}
                    className="h-2 flex-1"
                    style={{
                      background: i < usedSlots ? '#2a5a3a' : '#0a1a0a',
                      border: '1px solid #1a2a1a',
                    }}
                  />
                ))}
              </div>
              {/* Built infra */}
              {myInfra.map(infra => {
                const icfg = INFRA_CONFIG[infra.type];
                return (
                  <div key={infra.id} className="flex items-center justify-between py-1 border-b border-[#0a1020] font-mono text-[10px]">
                    <span className="text-[#6a8a6a]">{icfg.icon} {icfg.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={infra.active ? 'text-[#44aa44]' : 'text-[#aa8800]'}>
                        {infra.active ? 'ACTIVE' : `${Math.max(0, infra.buildCompletedTick - tick)}t`}
                      </span>
                      <button
                        onClick={() => destroyInfra(infra.id)}
                        className="font-pixel text-[7px] px-1 py-0.5 border border-[#3a1a1a] text-[#6a2a2a] hover:text-[#ff4455] hover:border-[#ff4455] transition-colors"
                        title="Demolish"
                      >✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setPanel('build')}
              className="btn-green w-full py-2 text-[9px]"
            >
              BUILD INFRASTRUCTURE →
            </button>
          </>
        )}

        {/* Ground Operations — only on planets with natural resources */}
        {controlled && planet.hasResources && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">GROUND OPERATIONS</div>

            {/* Active / building ops */}
            {myGroundOps.map(op => {
              const gcfg = GROUND_OP_CONFIG[op.type];
              return (
                <div key={op.id} className="flex items-center justify-between py-1 border-b border-[#0a1020] font-mono text-[10px]">
                  <span className="text-[#6a8a8a]">{gcfg.icon} {gcfg.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={op.active ? 'text-[#44aaaa]' : 'text-[#aa8800]'}>
                      {op.active ? 'ACTIVE' : `${Math.max(0, op.buildCompletedTick - tick)}t`}
                    </span>
                    <button
                      onClick={() => destroyGroundOp(op.id)}
                      className="font-pixel text-[7px] px-1 py-0.5 border border-[#3a1a1a] text-[#6a2a2a] hover:text-[#ff4455] hover:border-[#ff4455] transition-colors"
                      title="Dismantle"
                    >✕</button>
                  </div>
                </div>
              );
            })}

            {/* Build new ops */}
            <div className="mt-1 flex flex-col gap-1">
              {GROUND_OP_LIST.map(({ type, icon }) => {
                const gcfg    = GROUND_OP_CONFIG[type];
                const already = myGroundOps.some(g => g.type === type);
                const canAfford = (myEmpire?.resources.minerals ?? 0) >= gcfg.mineralCost &&
                                  (myEmpire?.resources.credits  ?? 0) >= gcfg.creditCost;
                return (
                  <button
                    key={type}
                    onClick={() => buildGroundOp(ui.selectedSystemId!, planet.id, type)}
                    disabled={already || !canAfford}
                    className="flex items-center justify-between px-2 py-1.5 border border-[#1a1a2a] bg-[#05050f] hover:border-[#2a3a3a] disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[9px]"
                  >
                    <div className="text-left">
                      <span className="text-[#6a8a8a]">{icon} {gcfg.label}</span>
                      <div className="text-[#3a5a5a] text-[8px]">{gcfg.description}</div>
                    </div>
                    <div className="text-right text-[#3a5a4a] flex-shrink-0 ml-2">
                      <div>{gcfg.mineralCost}m</div>
                      <div>{gcfg.creditCost}c</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Moons */}
        {planet.moons.length > 0 && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-1">MOONS ({planet.moons.length})</div>
            {planet.moons.map(moon => {
              const moonCfg = PLANET_CONFIG[moon.type];
              const expanded = expandedMoon === moon.id;
              // Ground ops on this moon
              const moonOps = (myEmpire?.groundOps ?? []).filter(g => g.targetId === moon.id);
              return (
                <div key={moon.id}>
                  <button
                    onClick={() => setExpandedMoon(expanded ? null : moon.id)}
                    className="flex items-center gap-2 py-1.5 px-2 w-full font-mono text-[10px] text-[#4a6a7a] hover:bg-[#0a1020] hover:text-[#6a8a9a] transition-colors text-left"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: moonCfg.groundColor }} />
                    <span className="flex-1">{moon.name}</span>
                    {moon.hasResources && <span className="text-[#ffaa00] text-[9px]">⛏</span>}
                    {moonOps.length > 0 && <span className="text-[#44aaaa] text-[9px]">●</span>}
                    <span className="text-[#2a3a4a] text-[9px]">{expanded ? '▲' : '▼'}</span>
                  </button>
                  {expanded && (
                    <div className="ml-4 mb-1 px-2 py-2 bg-[#050510] border border-[#1a1a2a] font-mono text-[10px] flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-[#3a5a6a]">Type</span>
                        <span style={{ color: moonCfg.colonizable ? '#44cc44' : '#6a8a9a' }}>{moonCfg.label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#3a5a6a]">Resources</span>
                        <span className={moon.hasResources ? 'text-[#ffaa00]' : 'text-[#2a3a4a]'}>
                          {moon.hasResources ? 'PRESENT' : 'NONE'}
                        </span>
                      </div>
                      {/* Ground ops on moon — only if has resources */}
                      {controlled && moon.hasResources && (
                        <div className="mt-1 border-t border-[#0a0a1a] pt-1">
                          <div className="font-pixel text-[7px] text-[#3a5a6a] mb-1">GROUND OPS</div>
                          {GROUND_OP_LIST.map(({ type, icon }) => {
                            const gcfg    = GROUND_OP_CONFIG[type];
                            const existing = moonOps.find(g => g.type === type);
                            const canAfford = (myEmpire?.resources.minerals ?? 0) >= gcfg.mineralCost &&
                                              (myEmpire?.resources.credits  ?? 0) >= gcfg.creditCost;
                            if (existing) {
                              return (
                                <div key={type} className="flex justify-between items-center py-0.5">
                                  <span className="text-[#4a6a6a]">{icon} {gcfg.label}</span>
                                  <div className="flex items-center gap-1">
                                    <span className={existing.active ? 'text-[#44aaaa]' : 'text-[#aa8800]'}>
                                      {existing.active ? 'ACTIVE' : `${Math.max(0, existing.buildCompletedTick - tick)}t`}
                                    </span>
                                    <button
                                      onClick={() => destroyGroundOp(existing.id)}
                                      className="font-pixel text-[7px] px-1 py-0.5 border border-[#3a1a1a] text-[#6a2a2a] hover:text-[#ff4455] hover:border-[#ff4455] transition-colors"
                                    >✕</button>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={type}
                                onClick={() => buildGroundOp(ui.selectedSystemId!, moon.id, type)}
                                disabled={!canAfford}
                                className="w-full flex justify-between py-0.5 disabled:opacity-40 disabled:cursor-not-allowed hover:text-[#6a9a9a]"
                              >
                                <span className="text-[#3a5a5a]">{icon} {gcfg.label}</span>
                                <span className="text-[#2a4a4a]">{gcfg.mineralCost}m {gcfg.creditCost}c</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
