'use client';
import { useState } from 'react';
import { useGameStore } from '@/store/game-store';
import {
  GRID_SIZE, emptyGrid, setTile, clearTile, finalizeDesign,
  calcDesignStats, STARTER_DESIGNS,
} from '@/lib/game/ship-designer';
import { TILE_CONFIG } from '@/lib/game/constants';
import { RESEARCH_BY_ID } from '@/lib/game/research-tree';
import { PixelIcon } from './PixelIcon';
import type { ShipTileType, ShipTile } from '@/types/game';

const TILE_GROUPS: { label: string; tiles: ShipTileType[] }[] = [
  { label: 'HULL',       tiles: ['cockpit', 'crew_quarters', 'cargo_hold'] },
  { label: 'WEAPONS',    tiles: ['laser_cannon', 'missile_launcher', 'railgun'] },
  { label: 'DEFENSE',    tiles: ['shield_generator', 'armor_plate'] },
  { label: 'PROPULSION', tiles: ['thruster', 'hyperdrive'] },
  { label: 'SUPPORT',    tiles: ['sensor_array', 'ecm', 'repair_bay'] },
];

export default function ShipDesigner() {
  const { myEmpire, setPanel, saveShipDesign } = useGameStore();
  const [grid, setGrid]         = useState<ShipTile[]>(emptyGrid());
  const [selected, setSelected] = useState<ShipTileType>('cockpit');
  const [name, setName]         = useState('New Design');
  const [saved, setSaved]       = useState(false);

  const stats = calcDesignStats(grid);
  const done = new Set(myEmpire?.completedResearch ?? []);
  const tileLocked = (type: ShipTileType) => {
    const req = TILE_CONFIG[type].requiresResearch;
    return !!req && !done.has(req);
  };
  const lockReason = (type: ShipTileType) => {
    const req = TILE_CONFIG[type].requiresResearch;
    return req ? (RESEARCH_BY_ID[req]?.name ?? req) : '';
  };

  const place = (x: number, y: number) => {
    const tile = grid.find(t => t.x === x && t.y === y);
    if (tile?.type === selected) {
      setGrid(clearTile(grid, x, y));
    } else {
      if (tileLocked(selected)) return; // can't place un-researched tech
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

  const selectedCfg = TILE_CONFIG[selected];

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
        <div className="flex flex-wrap gap-1">
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
          style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 32px)`, gap: '2px' }}
        >
          {grid.map(tile => {
            const cfg = TILE_CONFIG[tile.type];
            const isEmpty = tile.type === 'empty';
            return (
              <button
                key={`${tile.x}-${tile.y}`}
                onClick={() => place(tile.x, tile.y)}
                className="hover:brightness-125 transition-all flex items-center justify-center"
                style={{
                  width: 32, height: 32,
                  background: isEmpty ? '#030308' : cfg.color + '33',
                  border: `1px solid ${isEmpty ? '#0a0a18' : cfg.color + 'aa'}`,
                  boxShadow: isEmpty ? 'none' : `inset 0 0 6px ${cfg.color}44`,
                }}
                title={isEmpty ? 'Empty' : cfg.label}
              >
                {!isEmpty && cfg.icon && (
                  <PixelIcon id={cfg.icon} color={cfg.color} size={20} />
                )}
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'HP',  value: stats.hp,      color: '#ff8866' },
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
                  const locked = tileLocked(type);
                  const dmgInfo = cfg.damageType ? ` · ${cfg.damageType}` : cfg.resistType ? ` · resists ${cfg.resistType}` : '';
                  return (
                    <button
                      key={type}
                      onClick={() => { if (!locked) setSelected(type); }}
                      disabled={locked}
                      className="px-1.5 py-1 font-pixel text-[7px] border transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: selected === type ? cfg.color + '33' : '#030308',
                        borderColor: selected === type ? cfg.color : '#1a1a2a',
                        color: cfg.color,
                        boxShadow: selected === type ? `0 0 6px ${cfg.color}44` : 'none',
                      }}
                      title={locked
                        ? `🔒 Requires research: ${lockReason(type)}`
                        : `${cfg.label} — HP ${cfg.hp} · ATK ${cfg.attack} · DEF ${cfg.defense} · SPD ${cfg.speed}${dmgInfo}`}
                    >
                      <PixelIcon id={cfg.icon} color={cfg.color} size={12} />
                      <span>{locked ? '🔒' : ''}{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Selected tile details */}
        <div className="pixel-panel p-2 flex items-center gap-2">
          <PixelIcon id={selectedCfg.icon} color={selectedCfg.color} size={20} />
          <div className="flex-1">
            <div className="font-pixel text-[9px]" style={{ color: selectedCfg.color }}>
              {selectedCfg.label}
            </div>
            <div className="font-mono text-[9px] text-[#3a5a6a]">
              HP {selectedCfg.hp} · ATK {selectedCfg.attack} · DEF {selectedCfg.defense} · SPD {selectedCfg.speed}
            </div>
            {selectedCfg.damageType && (
              <div className="font-mono text-[8px] text-[#ff8866]">Deals {selectedCfg.damageType} damage</div>
            )}
            {selectedCfg.resistType && (
              <div className="font-mono text-[8px] text-[#44aaff]">Resists {selectedCfg.resistType} damage</div>
            )}
          </div>
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
