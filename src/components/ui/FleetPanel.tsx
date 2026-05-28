'use client';
import { useState } from 'react';
import { useGameStore } from '@/store/game-store';
import { PixelIcon } from './PixelIcon';
import type { FleetTask } from '@/types/game';

type Tab = 'fleets' | 'ships';

export default function FleetPanel() {
  const {
    currentGame, myEmpire, empires, ui,
    setPanel, selectFleet, selectSystem, setView,
    createFleet, disbandFleet, removeShipFromFleet, moveFleet, setFleetTask,
  } = useGameStore();
  const [tab, setTab] = useState<Tab>('fleets');
  const [selectedShips, setSelectedShips] = useState<Set<string>>(new Set());
  const [newFleetName, setNewFleetName] = useState('Task Force');

  if (!myEmpire || !currentGame) return null;

  const ships = myEmpire.ships ?? [];
  const fleets = myEmpire.fleets ?? [];
  const tick = currentGame.tick;

  const selectedFleet = fleets.find(f => f.id === ui.selectedFleetId);

  const shipFleetMap = new Map<string, string>();
  for (const f of fleets) for (const sid of f.shipIds) shipFleetMap.set(sid, f.id);

  const toggleShip = (id: string) => {
    setSelectedShips(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createFleetClick = async () => {
    if (selectedShips.size === 0) return;
    await createFleet(newFleetName || 'Task Force', Array.from(selectedShips));
    setSelectedShips(new Set());
  };

  const goToFleetSystem = (systemId: string) => {
    selectSystem(systemId);
    setView('system');
  };

  // Find hostile fleets nearby for attack options
  const hostileTargets = selectedFleet ? (() => {
    const enemies: { fleetId: string; empireId: string; empireName: string; fleetName: string }[] = [];
    for (const e of empires) {
      if (e.id === myEmpire.id) continue;
      const rel = (myEmpire.diplomacy ?? []).find(d => d.empireId === e.id);
      if (rel?.status !== 'at_war') continue;
      for (const f of (e.fleets ?? [])) {
        if (f.systemId === selectedFleet.systemId) {
          enemies.push({ fleetId: f.id, empireId: e.id, empireName: e.username, fleetName: f.name });
        }
      }
    }
    return enemies;
  })() : [];

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>FLEETS — {fleets.length}</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1a1a3a]">
        {(['fleets', 'ships'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1.5 font-pixel text-[9px] border-r border-[#1a1a3a] last:border-r-0"
            style={{
              color: tab === t ? '#44aaff' : '#3a5a6a',
              background: tab === t ? '#0a1a2a' : 'transparent',
            }}
          >
            {t === 'fleets' ? 'FLEETS' : 'SHIPS'}
          </button>
        ))}
      </div>

      <div className="flex-1 scrollable p-2 flex flex-col gap-2">
        {tab === 'ships' && (
          <>
            {ships.length === 0 && (
              <div className="font-mono text-[10px] text-[#2a3a4a] text-center py-4">No ships built</div>
            )}
            {ships.map(ship => {
              const inFleetId = shipFleetMap.get(ship.id);
              const inFleet = inFleetId ? fleets.find(f => f.id === inFleetId) : null;
              const isSelected = selectedShips.has(ship.id);
              const building = (ship.buildCompletedTick ?? 0) > tick;
              return (
                <button
                  key={ship.id}
                  onClick={() => !building && !inFleet && toggleShip(ship.id)}
                  disabled={building || !!inFleet}
                  className="pixel-panel p-2 flex flex-col gap-1 text-left disabled:opacity-50"
                  style={{
                    borderColor: isSelected ? '#44aaff' : undefined,
                    background: isSelected ? '#0a1a2a' : undefined,
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-pixel text-[9px] text-[#c0d0e0] flex items-center gap-1.5">
                      <PixelIcon id="fleet_ship" color={myEmpire.color} size={12} />
                      {ship.name}
                    </span>
                    <span className="font-mono text-[9px]" style={{
                      color: ship.hp / ship.maxHp > 0.6 ? '#44ff88' : ship.hp / ship.maxHp > 0.3 ? '#ffaa00' : '#ff4455',
                    }}>
                      {ship.hp}/{ship.maxHp} HP
                    </span>
                  </div>
                  <div className="font-mono text-[9px] text-[#3a5a6a]">
                    ATK {ship.attack} · DEF {ship.defense} · SPD {ship.speed}
                  </div>
                  <div className="font-mono text-[9px] text-[#2a3a4a] flex justify-between">
                    <span>@ {ship.systemId}</span>
                    {building && <span className="text-[#aa8800]">BUILDING {ship.buildCompletedTick! - tick}t</span>}
                    {inFleet && <span className="text-[#44aaff]">in {inFleet.name}</span>}
                  </div>
                </button>
              );
            })}

            {selectedShips.size > 0 && (
              <div className="pixel-panel p-2 flex flex-col gap-1">
                <div className="font-pixel text-[8px] text-[#3a5a6a]">CREATE FLEET FROM {selectedShips.size} SHIP(S)</div>
                <input
                  value={newFleetName}
                  onChange={e => setNewFleetName(e.target.value)}
                  className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-[10px] px-2 py-1 focus:outline-none focus:border-accent-cyan"
                />
                <button onClick={createFleetClick} className="btn-cyan text-[9px] py-1">
                  CREATE FLEET
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'fleets' && (
          <>
            {fleets.length === 0 && (
              <div className="font-mono text-[10px] text-[#2a3a4a] text-center py-4">No fleets — switch to SHIPS tab</div>
            )}
            {fleets.map(fleet => {
              const isSelected = ui.selectedFleetId === fleet.id;
              const fShips = ships.filter(s => fleet.shipIds.includes(s.id));
              const totalHp = fShips.reduce((s, sh) => s + sh.hp, 0);
              const totalMaxHp = fShips.reduce((s, sh) => s + sh.maxHp, 0);
              return (
                <div
                  key={fleet.id}
                  className="pixel-panel p-2 flex flex-col gap-1 cursor-pointer"
                  style={{
                    borderColor: isSelected ? '#44aaff' : undefined,
                    background: isSelected ? '#0a1a2a' : undefined,
                  }}
                  onClick={() => selectFleet(isSelected ? null : fleet.id)}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-pixel text-[9px] text-[#c0d0e0] flex items-center gap-1.5">
                      <PixelIcon id="fleet_ship" color={myEmpire.color} size={12} />
                      {fleet.name}
                    </span>
                    <span className="font-mono text-[9px] text-[#44aaff]">
                      {fleet.shipIds.length} ship{fleet.shipIds.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="font-mono text-[9px] text-[#3a5a6a]">
                    {totalHp}/{totalMaxHp} HP · {fleet.state.toUpperCase()}
                  </div>
                  <div className="font-mono text-[9px] text-[#2a4a4a] flex justify-between items-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); goToFleetSystem(fleet.systemId); }}
                      className="text-[#44aaff] hover:underline"
                    >
                      @ {fleet.systemId}
                    </button>
                    {fleet.state === 'in_transit' && (
                      <span className="text-[#aa8800]">→ {fleet.transitToSystemId} ({Math.round((fleet.transitProgress ?? 0) * 100)}%)</span>
                    )}
                  </div>
                </div>
              );
            })}

            {selectedFleet && (
              <div className="pixel-panel p-2 flex flex-col gap-2 border-2" style={{ borderColor: '#44aaff' }}>
                <div className="font-pixel text-[9px] text-accent-cyan">{selectedFleet.name} — ORDERS</div>

                <div className="flex flex-col gap-1">
                  {selectedFleet.shipIds.map(sid => {
                    const ship = ships.find(s => s.id === sid);
                    if (!ship) return null;
                    return (
                      <div key={sid} className="flex justify-between items-center font-mono text-[9px] py-0.5 border-b border-[#0a0a18]">
                        <span className="text-[#8aa0b0]">{ship.name}</span>
                        <div className="flex gap-2 items-center">
                          <span className="text-[#3a5a6a]">{ship.hp}/{ship.maxHp}</span>
                          <button
                            onClick={() => removeShipFromFleet(selectedFleet.id, sid)}
                            className="text-[#6a2a2a] hover:text-[#ff4455] text-[8px] px-1"
                          >✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Task buttons */}
                <div className="flex flex-col gap-1">
                  <div className="font-pixel text-[7px] text-[#3a5a6a]">MOVE TO SURVEYED SYSTEM</div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {(myEmpire.surveyedSystems ?? [])
                      .filter(sid => sid !== selectedFleet.systemId)
                      .slice(0, 12)
                      .map(sid => (
                        <button
                          key={sid}
                          onClick={() => moveFleet(selectedFleet.id, sid)}
                          className="btn-gray text-[8px] py-0.5 px-1.5"
                        >
                          → {sid.slice(0, 8)}
                        </button>
                      ))}
                  </div>
                </div>

                {hostileTargets.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="font-pixel text-[7px] text-[#ff4455]">ATTACK HOSTILE FLEET</div>
                    {hostileTargets.map(t => (
                      <button
                        key={t.fleetId}
                        onClick={() => setFleetTask(selectedFleet.id, {
                          type: 'attack_fleet',
                          targetFleetId: t.fleetId,
                          targetEmpireId: t.empireId,
                        } as FleetTask)}
                        className="text-[8px] py-1 px-2 border border-[#3a1a1a] text-[#ff8888] hover:border-[#ff4455]"
                      >
                        {t.empireName}: {t.fleetName}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => { disbandFleet(selectedFleet.id); selectFleet(null); }}
                  className="text-[8px] py-1 border border-[#3a1a1a] text-[#aa3a3a] hover:border-[#ff4455] hover:text-[#ff4455]"
                >
                  DISBAND FLEET
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
