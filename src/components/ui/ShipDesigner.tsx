'use client';
import { useState } from 'react';
import { useGameStore } from '@/store/game-store';
import {
  GRID_SIZE, emptyGrid, setTile, clearTile, finalizeDesign,
  calcDesignStats, STARTER_DESIGNS,
} from '@/lib/game/ship-designer';
import { TILE_CONFIG } from '@/lib/game/constants';
import type { ShipTileType, ShipTile } from '@/types/game';

const TILE_GROUPS = [
  { label: 'HULL',    tiles: ['cockpit', 'crew_quarters', 'cargo_hold'] as ShipTileType[] },
  { label: 'WEAPONS', tiles: ['laser_cannon', 'missile_launcher', 'railgun'] as ShipTileType[] },
  { label: 'DEFENSE', tiles: ['shield_generator', 'armor_plate'] as ShipTileType[] },
  { label: 'PROPULSION', tiles: ['thruster', 'hyperdrive'] as ShipTileType[] },
  { label: 'SUPPORT', tiles: ['sensor_array', 'ecm', 'repair_bay'] as ShipTileType[] },
];

export default function ShipDesigner() {
  const { myEmpire, setPanel, saveShipDesign } = useGameStore();
  const [grid, setGrid]         = useState<ShipTile[]>(emptyGrid());
  const [selected, setSelected] = useState<ShipTileType>('cockpit');
  const [name, setName]         = useState('New Design');
  const [saved, setSaved]       = useState(false);

  const stats = calcDesignStats(grid);

  const place = (x: number, y: number) => {
    const tile = grid.find(t => t.x === x && t.y === y);
    if (tile?.type === selected) {
      setGrid(clearTile(grid, x, y));
    } else {
      setGrid(setTile(grid, x, y, selected));
    }
    setSaved(false);
  };

  const save = async () => {
    if (!stats.valid) return;
    const design = finalizeDesign(name, grid);
    await saveShipDesign(design);
    setSaved(true);
  };

  const loadStarter = (idx: number) => {
    const d = STARTER_DESIGNS[idx];
    const base = emptyGrid();
    let g = base;
    for (const t of d.tiles) g = setTile(g, t.x, t.y, t.type);
    setGrid(g);
    setName(d.name);
    setSaved(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>SHIP DESIGNER</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      <div className="flex-1 scrollable p-2 flex flex-col gap-2">
        {/* Name + save */}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-2 py-1 focus:outline-none focus:border-accent-cyan"
          />
          <button
            onClick={save}
            disabled={!stats.valid}
            className="btn-cyan text-[9px] px-3 disabled:opacity-40"
          >
            {saved ? '✓ SAVED' : 'SAVE'}
          </button>
        </div>

        {/* Templates */}
        <div className="flex gap-1">
          <span className="font-pixel text-[8px] text-[#3a5a6a] self-center">LOAD:</span>
          {STARTER_DESIGNS.map((d, i) => (
            <button key={i} onClick={() => loadStarter(i)} className="btn-gray text-[8px] py-0.5 px-2">
              {d.name}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div
          className="border border-[#1a1a3a] bg-[#030308] p-1"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: '1px' }}
        >
          {grid.map(tile => {
            const cfg = TILE_CONFIG[tile.type];
            const isEmpty = tile.type === 'empty';
            return (
              <button
                key={`${tile.x}-${tile.y}`}
                onClick={() => place(tile.x, tile.y)}
                className="aspect-square hover:brightness-125 transition-all"
                style={{
                  background: isEmpty ? '#030308' : cfg.color + '88',
                  border: `1px solid ${isEmpty ? '#0a0a18' : cfg.color + 'aa'}`,
                  minWidth: '24px',
                }}
                title={isEmpty ? 'Empty' : cfg.label}
              >
                {!isEmpty && (
                  <span className="text-[7px] leading-none" style={{ color: cfg.color }}>
                    {cfg.label.slice(0, 2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: 'ATK', value: stats.attack,  color: '#ff4455' },
            { label: 'DEF', value: stats.defense, color: '#4488ff' },
            { label: 'SPD', value: stats.speed,   color: '#44ff88' },
          ].map(s => (
            <div key={s.label} className="bg-[#050510] border border-[#1a1a2a] p-1 text-center">
              <div className="font-pixel text-[7px] text-[#3a5a6a]">{s.label}</div>
              <div className="font-pixel text-[10px]" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="font-mono text-[9px] text-[#3a5a6a]">
          Cost: {stats.mineralCost}min · {stats.energyCost}nrg · {stats.creditCost}crd · {stats.buildTicks} ticks
          {!stats.valid && <span className="text-[#ff4455] ml-2">⚠ Needs cockpit + thruster</span>}
        </div>

        {/* Tile palette */}
        <div className="flex flex-col gap-1">
          {TILE_GROUPS.map(group => (
            <div key={group.label}>
              <div className="font-pixel text-[7px] text-[#2a3a4a] mb-0.5">{group.label}</div>
              <div className="flex flex-wrap gap-1">
                {group.tiles.map(type => {
                  const cfg = TILE_CONFIG[type];
                  return (
                    <button
                      key={type}
                      onClick={() => setSelected(type)}
                      className="px-2 py-1 font-pixel text-[7px] border transition-all"
                      style={{
                        background: selected === type ? cfg.color + '33' : '#030308',
                        borderColor: selected === type ? cfg.color : '#1a1a2a',
                        color: cfg.color,
                        boxShadow: selected === type ? `0 0 6px ${cfg.color}44` : 'none',
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Existing designs */}
        {(myEmpire?.shipDesigns.length ?? 0) > 0 && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-1">SAVED DESIGNS</div>
            {myEmpire?.shipDesigns.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1 border-b border-[#0a0a18] font-mono text-[10px]">
                <span className="text-[#8aa0b0]">{d.name}</span>
                <span className="text-[#3a5a6a]">{d.attack}atk · {d.defense}def</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
