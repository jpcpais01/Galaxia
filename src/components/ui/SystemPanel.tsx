'use client';
import { useGameStore } from '@/store/game-store';
import { PLANET_CONFIG, STAR_CONFIG } from '@/lib/game/constants';

export default function SystemPanel() {
  const { currentGame, myEmpire, empires, ui, setView, surveySystem, buildStation, selectPlanet } = useGameStore();

  const system = currentGame?.galaxy.systems.find(s => s.id === ui.selectedSystemId);
  if (!system) return (
    <div className="p-4 font-mono text-[11px] text-[#2a3a4a] text-center">
      Click a system on the galaxy map
    </div>
  );

  const state = currentGame?.systemStates[system.id];
  const owner = state?.ownerId ? empires.find(e => e.id === state.ownerId) : null;
  const isMine = owner?.id === myEmpire?.id;
  const surveyed = myEmpire?.surveyedSystems.includes(system.id) ?? false;
  const canSurvey = myEmpire && !surveyed;
  const canClaim = myEmpire && surveyed && !state?.ownerId;
  const canAffordStation = (myEmpire?.resources.minerals ?? 0) >= 300 && (myEmpire?.resources.credits ?? 0) >= 200;

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        {system.name}
      </div>

      <div className="flex-1 scrollable p-3 flex flex-col gap-3">
        {/* Stars */}
        <div>
          <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">STARS ({system.stars.length})</div>
          <div className="flex flex-col gap-1">
            {system.stars.map(star => {
              const cfg = STAR_CONFIG[star.type];
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
            <span className={surveyed ? 'text-[#00ff88]' : 'text-[#334455]'}>
              {surveyed ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#3a5a6a]">Planets</span>
            <span className="text-[#8aa0b0]">{system.planets.length}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {canSurvey && (
            <button onClick={() => surveySystem(system.id)} className="btn-gold text-[9px] w-full py-2">
              SURVEY SYSTEM
            </button>
          )}
          {canClaim && (
            <button
              onClick={() => buildStation(system.id, 'space_station')}
              disabled={!canAffordStation}
              className="btn-cyan text-[9px] w-full py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              BUILD STATION
              <span className="block text-[8px] text-[#3a6a8a]">300 min • 200 crd</span>
            </button>
          )}
          {(surveyed || isMine) && ui.view !== 'system' && (
            <button
              onClick={() => setView('system')}
              className="btn-green text-[9px] w-full py-2"
            >
              ENTER SYSTEM →
            </button>
          )}
        </div>

        {/* Planets */}
        {surveyed && system.planets.length > 0 && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">PLANETS</div>
            <div className="flex flex-col gap-1">
              {system.planets.map(planet => {
                const cfg = PLANET_CONFIG[planet.type];
                const colonized = myEmpire?.colonizedPlanets.includes(planet.id);
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
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
