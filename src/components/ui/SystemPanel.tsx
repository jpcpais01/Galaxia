'use client';
import { useGameStore } from '@/store/game-store';
import { PLANET_CONFIG, STAR_CONFIG, GROUND_OP_CONFIG } from '@/lib/game/constants';
import type { GroundOpType } from '@/types/game';

const GROUND_OPS: { type: GroundOpType; label: string; icon: string }[] = [
  { type: 'mineral_extractor',     label: 'Mineral Extractor',  icon: '⛏' },
  { type: 'atmospheric_processor', label: 'Atmo Processor',     icon: '🌫' },
  { type: 'deep_scanner',          label: 'Deep Scanner',       icon: '📡' },
];

export default function SystemPanel() {
  const {
    currentGame, myEmpire, empires, ui,
    setView, surveySystem, buildStation, buildGroundOp, destroyGroundOp, selectPlanet,
  } = useGameStore();

  const system = currentGame?.galaxy.systems.find(s => s.id === ui.selectedSystemId);
  if (!system) return (
    <div className="p-4 font-mono text-[11px] text-[#2a3a4a] text-center">
      Click a system on the galaxy map
    </div>
  );

  const tick  = currentGame?.tick ?? 0;
  const state = currentGame?.systemStates[system.id];
  const owner = state?.ownerId ? empires.find(e => e.id === state.ownerId) : null;
  const isMine = owner?.id === myEmpire?.id;
  const surveyed = myEmpire?.surveyedSystems.includes(system.id) ?? false;

  // Pending survey
  const pendingSurvey = (myEmpire?.pendingSurveys ?? []).find(s => s.systemId === system.id);
  const isSurveyPending = !!pendingSurvey;

  // Adjacency check: target must be connected to an already-surveyed system
  const hasAdjacentSurveyed = system.connections.some(
    id => myEmpire?.surveyedSystems.includes(id) ?? false
  );

  const canSurvey      = !!(myEmpire && !surveyed && !isSurveyPending && hasAdjacentSurveyed);
  const surveyBlocked  = !!(myEmpire && !surveyed && !isSurveyPending && !hasAdjacentSurveyed);
  const canClaim       = !!(myEmpire && surveyed && !state?.ownerId);
  const canAffordStn   = (myEmpire?.resources.minerals ?? 0) >= 300 &&
                         (myEmpire?.resources.credits  ?? 0) >= 200;

  // Ground ops on planets/moons in this system (only if controlled)
  const myGroundOps = (myEmpire?.groundOps ?? []).filter(g => g.systemId === system.id);

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        {system.name}
        {system.isBlackHole && (
          <span className="ml-2 font-pixel text-[8px] text-[#ff3300]">◉ BLACK HOLE</span>
        )}
      </div>

      <div className="flex-1 scrollable p-3 flex flex-col gap-3">
        {/* Stars */}
        <div>
          <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">STARS ({system.stars.length})</div>
          <div className="flex flex-col gap-1">
            {system.stars.map(star => {
              const cfg = STAR_CONFIG[star.type] ?? STAR_CONFIG['yellow'];
              return (
                <div key={star.id} className="flex items-center gap-2 font-mono text-[11px]">
                  <div className="w-4 h-4 rounded-full border" style={{
                    background: cfg.color,
                    boxShadow: `0 0 6px ${cfg.glowColor}`,
                    borderColor: cfg.glowColor,
                  }} />
                  <span style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="text-[#3a5a6a]">sz {star.size}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div className="font-mono text-[11px] flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-[#3a5a6a]">Status</span>
            <span style={{ color: owner ? owner.color : surveyed ? '#ffaa00' : '#334455' }}>
              {owner ? owner.username : surveyed ? 'UNCLAIMED' : 'UNKNOWN'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#3a5a6a]">Surveyed</span>
            <span className={surveyed ? 'text-[#00ff88]' : isSurveyPending ? 'text-[#ffaa00]' : 'text-[#334455]'}>
              {surveyed ? 'YES' : isSurveyPending ? 'IN PROGRESS' : 'NO'}
            </span>
          </div>
          {isSurveyPending && (
            <div className="flex justify-between">
              <span className="text-[#3a5a6a]">ETA</span>
              <span className="text-[#ffaa00]">
                {Math.max(0, pendingSurvey!.completesAtTick - tick)} ticks
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#3a5a6a]">Planets</span>
            <span className="text-[#8aa0b0]">{system.planets.length}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {canSurvey && !system.isBlackHole && (
            <button onClick={() => surveySystem(system.id)} className="btn-gold text-[9px] w-full py-2">
              SURVEY SYSTEM
              <span className="block text-[8px] text-[#6a5000]">Takes 20 ticks</span>
            </button>
          )}
          {surveyBlocked && !surveyed && !isSurveyPending && (
            <div className="font-mono text-[9px] text-[#44556a] bg-[#050510] border border-[#1a1a2a] px-2 py-2 text-center">
              🔒 Must survey an adjacent system first
            </div>
          )}
          {canClaim && (
            <button
              onClick={() => buildStation(system.id, 'space_station')}
              disabled={!canAffordStn}
              className="btn-cyan text-[9px] w-full py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              BUILD STATION
              <span className="block text-[8px] text-[#3a6a8a]">300 min • 200 crd • 50 ticks</span>
            </button>
          )}
          {(surveyed || isMine) && ui.view !== 'system' && !system.isBlackHole && (
            <button
              onClick={() => setView('system')}
              className="btn-green text-[9px] w-full py-2"
            >
              ENTER SYSTEM →
            </button>
          )}
        </div>

        {/* Planets */}
        {surveyed && system.planets.length > 0 && !system.isBlackHole && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">PLANETS</div>
            <div className="flex flex-col gap-1">
              {system.planets.map(planet => {
                const cfg = PLANET_CONFIG[planet.type];
                const colonized = myEmpire?.colonizedPlanets.includes(planet.id);
                const pendingCol = (myEmpire?.pendingColonizations ?? []).some(c => c.planetId === planet.id);
                return (
                  <button
                    key={planet.id}
                    onClick={() => { setView('system'); selectPlanet(planet.id); }}
                    className="flex items-center gap-2 p-2 bg-[#05050f] border border-[#1a1a2a] hover:border-[#2a2a4a] text-left transition-colors"
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cfg.groundColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-[#8aa0b0] truncate">{planet.name}</div>
                      <div className="font-pixel text-[7px]" style={{ color: cfg.colonizable ? '#44aa44' : '#446666' }}>
                        {cfg.label}
                        {planet.moons.length > 0 && ` • ${planet.moons.length}m`}
                        {planet.hasAnomaly && ' ★'}
                        {colonized && ' ●'}
                        {pendingCol && ' ◐'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Ground Operations (controlled systems only, on resource planets) */}
        {isMine && surveyed && !system.isBlackHole && (() => {
          const resourcePlanets = system.planets.filter(p => p.hasResources);
          const resourceMoons   = system.planets.flatMap(p => p.moons.filter(m => m.hasResources));
          const hasAnyResource  = resourcePlanets.length > 0 || resourceMoons.length > 0;
          if (!hasAnyResource) return null;
          return (
            <div>
              <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">GROUND OPERATIONS</div>

              {/* Active/building ops with destroy button */}
              {myGroundOps.length > 0 && (
                <div className="mb-2 flex flex-col gap-1">
                  {myGroundOps.map(op => {
                    const cfg = GROUND_OP_CONFIG[op.type];
                    return (
                      <div key={op.id} className="flex items-center justify-between py-1 border-b border-[#0a1020] font-mono text-[10px]">
                        <span className="text-[#6a8a6a]">{cfg.icon} {cfg.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={op.active ? 'text-[#44aa44]' : 'text-[#aa8800]'}>
                            {op.active ? 'ACTIVE' : `${Math.max(0, op.buildCompletedTick - (currentGame?.tick ?? 0))}t`}
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
                </div>
              )}

              {/* Build ops on each resource planet */}
              {resourcePlanets.map(planet => (
                <div key={planet.id} className="mb-2">
                  <div className="font-pixel text-[7px] text-[#2a4a5a] mb-1">{planet.name}</div>
                  {GROUND_OPS.map(({ type, icon }) => {
                    const cfg = GROUND_OP_CONFIG[type];
                    const already = myGroundOps.some(g => g.targetId === planet.id && g.type === type);
                    const affordable = (myEmpire?.resources.minerals ?? 0) >= cfg.mineralCost &&
                                       (myEmpire?.resources.credits  ?? 0) >= cfg.creditCost;
                    return (
                      <button
                        key={type}
                        onClick={() => buildGroundOp(system.id, planet.id, type)}
                        disabled={already || !affordable}
                        className="w-full flex items-center justify-between px-2 py-1 border border-[#1a1a2a] bg-[#05050f] hover:border-[#2a3a3a] disabled:opacity-40 disabled:cursor-not-allowed mb-0.5 font-mono text-[9px]"
                      >
                        <span className="text-[#6a8a8a]">{icon} {cfg.label}</span>
                        <span className="text-[#3a5a4a]">{cfg.mineralCost}m {cfg.creditCost}c</span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Build ops on resource moons */}
              {resourceMoons.map(moon => (
                <div key={moon.id} className="mb-2">
                  <div className="font-pixel text-[7px] text-[#2a4a5a] mb-1">{moon.name} ◉</div>
                  {GROUND_OPS.map(({ type, icon }) => {
                    const cfg = GROUND_OP_CONFIG[type];
                    const already = myGroundOps.some(g => g.targetId === moon.id && g.type === type);
                    const affordable = (myEmpire?.resources.minerals ?? 0) >= cfg.mineralCost &&
                                       (myEmpire?.resources.credits  ?? 0) >= cfg.creditCost;
                    return (
                      <button
                        key={type}
                        onClick={() => buildGroundOp(system.id, moon.id, type)}
                        disabled={already || !affordable}
                        className="w-full flex items-center justify-between px-2 py-1 border border-[#1a1a2a] bg-[#05050f] hover:border-[#2a3a3a] disabled:opacity-40 disabled:cursor-not-allowed mb-0.5 font-mono text-[9px]"
                      >
                        <span className="text-[#6a8a8a]">{icon} {cfg.label}</span>
                        <span className="text-[#3a5a4a]">{cfg.mineralCost}m {cfg.creditCost}c</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
