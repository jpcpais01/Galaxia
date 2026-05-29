import type { ShipDesign, ShipTile, ShipTileType, Empire, Ship } from '@/types/game';
import { TILE_CONFIG } from './constants';
import { getResearchBonuses, buildTicksFor } from './economy';

export const GRID_SIZE = 8;

/**
 * Build a concrete Ship from a design for a given empire, applying both
 * research (ship_stat) and civilization stat modifiers. Shared by the player
 * build action and the bot AI so every ship is created consistently.
 */
export function instantiateShip(
  empire: Empire, design: ShipDesign, systemId: string, tick: number, index: number,
): Ship {
  const baseHp = design.tiles.reduce((s, t) => s + t.hp, 0);
  let hpMult = 1, atkMult = 1, defMult = 1, spdMult = 1;

  // Research ship_stat bonuses (treated as percentages)
  const rs = getResearchBonuses(empire, 'ship_stat');
  atkMult += (rs['attack']  ?? 0) / 100;
  defMult += (rs['defense'] ?? 0) / 100;
  spdMult += (rs['speed']   ?? 0) / 100;
  hpMult  += (rs['hp']      ?? 0) / 100;

  // Civilization bonuses
  const civ = empire.civilization;
  if (civ) {
    if (civ.traits.includes('resilient'))      hpMult  *= 1.20;
    if (civ.traits.includes('fragile'))        hpMult  *= 0.80;
    if (civ.traits.includes('swift'))          spdMult *= 1.20;
    if (civ.traits.includes('sluggish'))       spdMult *= 0.80;
    if (civ.culturalFocus === 'militaristic')  { hpMult *= 1.15; atkMult *= 1.15; }
    if (civ.culturalFocus === 'isolationist')  defMult *= 1.35;
    if (civ.government   === 'military_junta')  atkMult *= 1.25;
    if (civ.origin       === 'warrior_clans')   atkMult *= 1.25;
    if (civ.speciesType  === 'fungal')          spdMult *= 0.85;
    if (civ.speciesType  === 'crystalline')     hpMult  *= 0.85;
  }

  const hp = Math.max(1, Math.round(baseHp * hpMult));
  return {
    id: `ship_${tick}_${Math.floor(Math.random() * 1_000_000)}`,
    designId: design.id,
    designName: design.name,
    name: `${design.name} ${index}`,
    ownerId: empire.id,
    systemId,
    hp, maxHp: hp,
    attack:  Math.round(design.attack  * atkMult),
    defense: Math.round(design.defense * defMult),
    speed:   Math.max(1, Math.round(design.speed * spdMult)),
    tiles: design.tiles.map(t => ({ ...t })),
    buildCompletedTick: tick + buildTicksFor(empire, 'ship', design.buildTicks),
  };
}

export function calcDesignStats(tiles: ShipTile[]): {
  attack: number; defense: number; speed: number;
  mineralCost: number; energyCost: number; creditCost: number;
  buildTicks: number; hp: number; valid: boolean;
} {
  let attack = 0, defense = 0, speed = 0, hp = 0;
  let hasCockpit = false;
  let hasThrust = false;

  for (const tile of tiles) {
    if (tile.type === 'empty') continue;
    const cfg = TILE_CONFIG[tile.type];
    attack  += cfg.attack;
    defense += cfg.defense;
    speed   += cfg.speed;
    hp      += cfg.hp;
    if (tile.type === 'cockpit')  hasCockpit = true;
    if (tile.type === 'thruster' || tile.type === 'hyperdrive') hasThrust = true;
  }

  // Costs and build time are ×6 the original (1-second ticks; tile hp is also ×6
  // in TILE_CONFIG, so the summed hp above is already scaled).
  const activeTiles = tiles.filter(t => t.type !== 'empty').length;
  const mineralCost = activeTiles * 150 + attack * 30 + defense * 18;
  const energyCost  = activeTiles * 30  + speed * 12;
  const creditCost  = activeTiles * 60  + attack * 18;
  const buildTicks  = Math.max(30, Math.floor(activeTiles * 15));

  return {
    attack, defense, speed, hp,
    mineralCost, energyCost, creditCost, buildTicks,
    valid: hasCockpit && hasThrust && activeTiles >= 3,
  };
}

export function emptyGrid(): ShipTile[] {
  const tiles: ShipTile[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      tiles.push({ type: 'empty', x, y, hp: 0, maxHp: 0 });
    }
  }
  return tiles;
}

export function setTile(grid: ShipTile[], x: number, y: number, type: ShipTileType): ShipTile[] {
  const cfg = TILE_CONFIG[type];
  return grid.map(t =>
    t.x === x && t.y === y
      ? { ...t, type, hp: cfg.hp, maxHp: cfg.hp }
      : t
  );
}

export function clearTile(grid: ShipTile[], x: number, y: number): ShipTile[] {
  return grid.map(t =>
    t.x === x && t.y === y
      ? { ...t, type: 'empty', hp: 0, maxHp: 0 }
      : t
  );
}

export function finalizeDesign(name: string, tiles: ShipTile[], id?: string): ShipDesign {
  const stats = calcDesignStats(tiles);
  return {
    id: id ?? `design_${Date.now()}`,
    name,
    tiles: tiles.filter(t => t.type !== 'empty'),
    attack:      stats.attack,
    defense:     stats.defense,
    speed:       stats.speed,
    mineralCost: stats.mineralCost,
    energyCost:  stats.energyCost,
    creditCost:  stats.creditCost,
    buildTicks:  stats.buildTicks,
  };
}

export const STARTER_DESIGNS: Omit<ShipDesign, 'id'>[] = [
  {
    name: 'Scout',
    tiles: [
      { type: 'cockpit',      x: 1, y: 0, hp: 240, maxHp: 240 },
      { type: 'sensor_array', x: 0, y: 1, hp: 120, maxHp: 120 },
      { type: 'thruster',     x: 1, y: 1, hp: 150, maxHp: 150 },
      { type: 'thruster',     x: 2, y: 1, hp: 150, maxHp: 150 },
    ],
    attack: 2, defense: 0, speed: 18, mineralCost: 480, energyCost: 90, creditCost: 240, buildTicks: 60,
  },
  {
    name: 'Fighter',
    tiles: [
      { type: 'cockpit',          x: 1, y: 0, hp: 240, maxHp: 240 },
      { type: 'laser_cannon',     x: 0, y: 1, hp: 120, maxHp: 120 },
      { type: 'crew_quarters',    x: 1, y: 1, hp: 180, maxHp: 180 },
      { type: 'laser_cannon',     x: 2, y: 1, hp: 120, maxHp: 120 },
      { type: 'thruster',         x: 0, y: 2, hp: 150, maxHp: 150 },
      { type: 'shield_generator', x: 1, y: 2, hp: 180, maxHp: 180 },
      { type: 'thruster',         x: 2, y: 2, hp: 150, maxHp: 150 },
    ],
    attack: 24, defense: 20, speed: 16, mineralCost: 1200, energyCost: 180, creditCost: 480, buildTicks: 108,
  },
  {
    name: 'Cruiser',
    tiles: [
      { type: 'cockpit',          x: 2, y: 0, hp: 240, maxHp: 240 },
      { type: 'missile_launcher', x: 1, y: 1, hp: 120, maxHp: 120 },
      { type: 'crew_quarters',    x: 2, y: 1, hp: 180, maxHp: 180 },
      { type: 'missile_launcher', x: 3, y: 1, hp: 120, maxHp: 120 },
      { type: 'armor_plate',      x: 0, y: 2, hp: 300, maxHp: 300 },
      { type: 'shield_generator', x: 1, y: 2, hp: 180, maxHp: 180 },
      { type: 'repair_bay',       x: 2, y: 2, hp: 150, maxHp: 150 },
      { type: 'shield_generator', x: 3, y: 2, hp: 180, maxHp: 180 },
      { type: 'armor_plate',      x: 4, y: 2, hp: 300, maxHp: 300 },
      { type: 'thruster',         x: 1, y: 3, hp: 150, maxHp: 150 },
      { type: 'hyperdrive',       x: 2, y: 3, hp: 120, maxHp: 120 },
      { type: 'thruster',         x: 3, y: 3, hp: 150, maxHp: 150 },
    ],
    attack: 36, defense: 60, speed: 23, mineralCost: 2700, energyCost: 420, creditCost: 1080, buildTicks: 180,
  },
];
